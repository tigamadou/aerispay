// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

// Mock fetch globally
global.fetch = vi.fn();

import { SessionDetailActions } from "@/components/caisse/SessionDetailActions";

const baseProps = {
  sessionId: "session-1",
  statut: "EN_ATTENTE_VALIDATION",
  userId: "caissier-1",
  currentUserId: "admin-1", // different from userId → can validate
  canValidate: true,
  canForceClose: true,
  canVerify: true,
  canCorrect: false,
  canViewZReport: true,
};

function mockFetchResponses(...responses: Array<{ ok: boolean; data?: unknown; error?: string; status?: number }>) {
  const fn = global.fetch as ReturnType<typeof vi.fn>;
  for (const res of responses) {
    fn.mockResolvedValueOnce({
      ok: res.ok,
      status: res.status ?? (res.ok ? 200 : 400),
      json: () => Promise.resolve(res.ok ? { data: res.data } : { error: res.error }),
    });
  }
}

describe("SessionDetailActions — Validation a l'aveugle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Visibility ──

  it("affiche le bouton Valider quand statut=EN_ATTENTE_VALIDATION, canValidate=true et !isOwner", () => {
    render(<SessionDetailActions {...baseProps} />);
    expect(screen.getByTestId("btn-blind-validate")).toBeInTheDocument();
  });

  it("masque le bouton Valider si canValidate=false", () => {
    render(<SessionDetailActions {...baseProps} canValidate={false} />);
    expect(screen.queryByTestId("btn-blind-validate")).not.toBeInTheDocument();
  });

  it("masque le bouton Valider si le statut n'est pas EN_ATTENTE_VALIDATION", () => {
    render(<SessionDetailActions {...baseProps} statut="OUVERTE" />);
    expect(screen.queryByTestId("btn-blind-validate")).not.toBeInTheDocument();
  });

  it("masque le bouton Valider si currentUserId === userId (propre session)", () => {
    render(<SessionDetailActions {...baseProps} currentUserId="caissier-1" />);
    expect(screen.queryByTestId("btn-blind-validate")).not.toBeInTheDocument();
  });

  // ── Modal opening ──

  it("ouvre le modal de validation au clic sur le bouton", async () => {
    const user = userEvent.setup();
    // Mock modes-paiement fetch
    mockFetchResponses({
      ok: true,
      data: [
        { code: "ESPECES", label: "Cash" },
        { code: "MOBILE_MONEY", label: "Mobile Money" },
      ],
    });

    render(<SessionDetailActions {...baseProps} />);
    await user.click(screen.getByTestId("btn-blind-validate"));

    await waitFor(() => {
      expect(screen.getByTestId("blind-validate-modal")).toBeInTheDocument();
    });
  });

  it("affiche un champ par mode de paiement dans le modal", async () => {
    const user = userEvent.setup();
    mockFetchResponses({
      ok: true,
      data: [
        { code: "ESPECES", label: "Cash" },
        { code: "MOBILE_MONEY", label: "Mobile Money" },
      ],
    });

    render(<SessionDetailActions {...baseProps} />);
    await user.click(screen.getByTestId("btn-blind-validate"));

    await waitFor(() => {
      expect(screen.getByTestId("input-validate-especes")).toBeInTheDocument();
      expect(screen.getByTestId("input-validate-mobile_money")).toBeInTheDocument();
    });
  });

  // ── Submission: VALIDATED ──

  it("soumet les declarations et affiche le succes quand VALIDATED", async () => {
    const user = userEvent.setup();

    // 1st call: modes-paiement, 2nd call: POST validate
    mockFetchResponses(
      {
        ok: true,
        data: [{ code: "ESPECES", label: "Cash" }],
      },
      {
        ok: true,
        data: {
          id: "session-1",
          statut: "VALIDEE",
          reconciliation: {
            outcome: "VALIDATED",
            modes: [{ mode: "ESPECES", ecartFinal: 0, categorie: null }],
          },
        },
      },
    );

    render(<SessionDetailActions {...baseProps} />);
    await user.click(screen.getByTestId("btn-blind-validate"));

    await waitFor(() => {
      expect(screen.getByTestId("input-validate-especes")).toBeInTheDocument();
    });

    await user.type(screen.getByTestId("input-validate-especes"), "50000");
    await user.click(screen.getByTestId("btn-submit-blind-validate"));

    await waitFor(() => {
      expect(screen.getByText(/session validee avec succes/i)).toBeInTheDocument();
    });

    // Check the POST call
    const fetchCalls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
    const validateCall = fetchCalls.find(
      (c: string[]) => typeof c[0] === "string" && c[0].includes("/validate"),
    );
    expect(validateCall).toBeDefined();
    const body = JSON.parse(validateCall![1].body);
    expect(body.declarations.ESPECES).toBe(50000);
  });

  // ── Submission: RECOUNT_NEEDED ──

  it("affiche un message de recomptage quand RECOUNT_NEEDED", async () => {
    const user = userEvent.setup();

    mockFetchResponses(
      {
        ok: true,
        data: [{ code: "ESPECES", label: "Cash" }],
      },
      {
        ok: false,
        status: 409,
        error: "Ecarts trop importants, recomptage necessaire",
      },
    );

    render(<SessionDetailActions {...baseProps} />);
    await user.click(screen.getByTestId("btn-blind-validate"));

    await waitFor(() => {
      expect(screen.getByTestId("input-validate-especes")).toBeInTheDocument();
    });

    await user.type(screen.getByTestId("input-validate-especes"), "40000");
    await user.click(screen.getByTestId("btn-submit-blind-validate"));

    await waitFor(() => {
      expect(screen.getByText(/recomptage/i)).toBeInTheDocument();
    });
  });

  // ── Submission: error ──

  it("affiche une erreur si l'API retourne une erreur 403", async () => {
    const user = userEvent.setup();

    mockFetchResponses(
      {
        ok: true,
        data: [{ code: "ESPECES", label: "Cash" }],
      },
      {
        ok: false,
        status: 403,
        error: "Un caissier ne peut pas valider sa propre session",
      },
    );

    render(<SessionDetailActions {...baseProps} />);
    await user.click(screen.getByTestId("btn-blind-validate"));

    await waitFor(() => {
      expect(screen.getByTestId("input-validate-especes")).toBeInTheDocument();
    });

    await user.type(screen.getByTestId("input-validate-especes"), "50000");
    await user.click(screen.getByTestId("btn-submit-blind-validate"));

    await waitFor(() => {
      expect(screen.getByText(/ne peut pas valider/i)).toBeInTheDocument();
    });
  });

  // ── Cancel modal ──

  it("ferme le modal au clic sur Annuler", async () => {
    const user = userEvent.setup();
    mockFetchResponses({
      ok: true,
      data: [{ code: "ESPECES", label: "Cash" }],
    });

    render(<SessionDetailActions {...baseProps} />);
    await user.click(screen.getByTestId("btn-blind-validate"));

    await waitFor(() => {
      expect(screen.getByTestId("blind-validate-modal")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("btn-cancel-blind-validate"));

    expect(screen.queryByTestId("blind-validate-modal")).not.toBeInTheDocument();
  });
});
