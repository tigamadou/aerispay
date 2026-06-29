// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock fetch globally to return proper promises
global.fetch = vi.fn().mockImplementation(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ data: [] }),
  }),
);

import { SessionManager } from "@/components/comptoir/SessionManager";

const mockSession = {
  id: "session-1",
  ouvertureAt: "2026-05-01T08:00:00.000Z",
  fermetureAt: null,
  montantOuvertureCash: "50000",
  montantOuvertureMobileMoney: "0",
  montantFermetureCash: null,
  montantFermetureMobileMoney: null,
  soldeTheoriqueCash: null,
  soldeTheoriqueMobileMoney: null,
  statut: "OUVERTE" as const,
  notes: null,
  userId: "user-1",
};

describe("SessionManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      }),
    );
  });

  it("renders with an open session", () => {
    render(<SessionManager initialSession={mockSession} />);
    // Should show session-related info (opening amount)
    expect(screen.getByText(/50\s?000/)).toBeInTheDocument();
  });

  it("renders without a session (no active session)", () => {
    render(<SessionManager initialSession={null} />);
    // Should show option to open a new session (button with data-testid)
    expect(screen.getByTestId("btn-ouvrir-session")).toBeInTheDocument();
  });

  it("displays session status OUVERTE", () => {
    render(<SessionManager initialSession={mockSession} />);
    expect(screen.getByText(/ouverte/i)).toBeInTheDocument();
  });

  it("fermeture appelle POST /closure avec declarations par mode", async () => {
    const user = userEvent.setup();
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;

    // 1st: modes-paiement, 2nd: session details, 3rd: POST closure
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [{ code: "ESPECES", label: "Cash" }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: {
            recapParMode: {},
            ventesParMode: {},
            fondOuverture: { cash: 50000, autres: 0 },
            montantAttenduCash: 50000,
            montantAttenduAutres: 0,
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: { id: "session-1", statut: "EN_ATTENTE_VALIDATION" },
        }),
      });

    render(<SessionManager initialSession={mockSession} />);

    // Open close form
    await user.click(screen.getByTestId("btn-show-close-form"));

    await waitFor(() => {
      expect(screen.getByTestId("input-montant-fermeture-especes")).toBeInTheDocument();
    });

    await user.type(screen.getByTestId("input-montant-fermeture-especes"), "50000");
    await user.click(screen.getByTestId("btn-fermer-session"));

    await waitFor(() => {
      const closureCall = fetchMock.mock.calls.find(
        (c: unknown[]) => typeof c[0] === "string" && c[0].includes("/closure"),
      );
      expect(closureCall).toBeDefined();
      expect(closureCall![1].method).toBe("POST");
      const body = JSON.parse(closureCall![1].body);
      expect(body.declarations).toBeDefined();
      expect(body.declarations.ESPECES).toBe(50000);
    });
  });
});
