import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { EnrollmentCodeButton } from "@/components/terminaux/EnrollmentCodeButton";

describe("EnrollmentCodeButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("bouton actif quand le terminal n'est pas encore associé", () => {
    render(<EnrollmentCodeButton terminalId="t1" />);
    expect(screen.getByRole("button", { name: /générer un code d'enrôlement/i })).not.toBeDisabled();
    expect(screen.queryByText(/déjà associé/i)).not.toBeInTheDocument();
  });

  it("bouton désactivé + message quand déjà associé", () => {
    render(<EnrollmentCodeButton terminalId="t1" alreadyEnrolled />);
    expect(screen.getByRole("button", { name: /générer un code d'enrôlement/i })).toBeDisabled();
    expect(screen.getByText(/déjà associé à un poste/i)).toBeInTheDocument();
  });
});
