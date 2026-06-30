import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { NouveauTerminalForm } from "@/components/terminaux/NouveauTerminalForm";

describe("NouveauTerminalForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("exige code et nom", async () => {
    render(<NouveauTerminalForm />);
    await userEvent.click(screen.getByRole("button", { name: /créer/i }));
    expect(await screen.findByText(/code requis/i)).toBeInTheDocument();
    expect(screen.getByText(/nom requis/i)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("soumet et redirige vers la liste", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ data: { id: "t9" } }),
    });
    render(<NouveauTerminalForm />);
    await userEvent.type(screen.getByLabelText(/code/i), "P3");
    await userEvent.type(screen.getByLabelText(/nom/i), "Caisse expo");
    await userEvent.click(screen.getByRole("button", { name: /créer/i }));
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith("/api/terminaux", expect.objectContaining({ method: "POST" })),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith("/terminaux"));
  });

  it("affiche l'erreur de code dupliqué (409)", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: "Code déjà utilisé" }),
    });
    render(<NouveauTerminalForm />);
    await userEvent.type(screen.getByLabelText(/code/i), "P1");
    await userEvent.type(screen.getByLabelText(/nom/i), "Doublon");
    await userEvent.click(screen.getByRole("button", { name: /créer/i }));
    expect(await screen.findByText(/déjà utilisé/i)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
