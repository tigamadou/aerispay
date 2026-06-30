import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TerminauxListe } from "@/components/terminaux/TerminauxListe";

const items = [
  {
    id: "t1", code: "P1", nom: "Terminal principal", active: true, createdAt: new Date(),
    sessionOuverte: { id: "s1", caissier: "Awa", ouvertureAt: new Date() }, soldeEspeces: 45000,
  },
  {
    id: "t2", code: "P2", nom: "Terminal 2", active: false, createdAt: new Date(),
    sessionOuverte: null, soldeEspeces: 0,
  },
];

describe("TerminauxListe", () => {
  it("affiche code, nom, statut session et solde", () => {
    render(<TerminauxListe items={items} canManage />);
    expect(screen.getByText("P1")).toBeInTheDocument();
    expect(screen.getByText(/Awa/)).toBeInTheDocument();
    expect(screen.getByText(/Inactif/i)).toBeInTheDocument();
    expect(screen.getByText(/45\s?000/)).toBeInTheDocument();
  });

  it("masque « Nouveau terminal » quand canManage=false (MANAGER)", () => {
    render(<TerminauxListe items={items} canManage={false} />);
    expect(screen.queryByRole("link", { name: /nouveau terminal/i })).not.toBeInTheDocument();
  });

  it("affiche le lien « Nouveau terminal » quand canManage=true (ADMIN)", () => {
    render(<TerminauxListe items={items} canManage />);
    expect(screen.getByRole("link", { name: /nouveau terminal/i })).toBeInTheDocument();
  });
});
