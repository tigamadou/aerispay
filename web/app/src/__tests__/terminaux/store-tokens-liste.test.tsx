import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { StoreTokensListe } from "@/components/terminaux/StoreTokensListe";

describe("StoreTokensListe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("charge puis affiche les jetons", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: "tok1", label: "poste-entrée", createdAt: new Date().toISOString(), lastUsedAt: null }] }),
    });
    render(<StoreTokensListe terminalId="t1" canManage />);
    expect(await screen.findByText("poste-entrée")).toBeInTheDocument();
  });

  it("révoque un jeton et le retire de la liste", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ id: "tok1", label: "poste-entrée", createdAt: new Date().toISOString(), lastUsedAt: null }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { id: "tok1" } }) });
    render(<StoreTokensListe terminalId="t1" canManage />);
    await screen.findByText("poste-entrée");
    await userEvent.click(screen.getByRole("button", { name: /révoquer/i }));
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith("/api/terminaux/t1/tokens/tok1", expect.objectContaining({ method: "DELETE" })),
    );
    await waitFor(() => expect(screen.queryByText("poste-entrée")).not.toBeInTheDocument());
    expect(refresh).toHaveBeenCalled();
  });
});
