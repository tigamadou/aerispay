// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

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
});
