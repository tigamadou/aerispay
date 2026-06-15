// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock the cartStore to avoid infinite re-render from setTaxes
vi.mock("@/store/cartStore", () => ({
  useCartStore: () => ({
    items: [],
    addItem: vi.fn(),
    updateQuantity: vi.fn(),
    removeItem: vi.fn(),
    remiseGlobale: 0,
    typeRemise: "POURCENTAGE",
    setRemise: vi.fn(),
    setTaxes: vi.fn(),
    clearCart: vi.fn(),
    sousTotal: () => 0,
    montantRemise: () => 0,
    detailTaxes: () => [],
    montantTaxes: () => 0,
    total: () => 0,
  }),
}));

// Mock fetch globally
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({ data: {} }),
});

import { POSInterface } from "@/components/comptoir/POSInterface";

const mockProduits = [
  {
    id: "prod-1",
    nom: "Savon liquide",
    reference: "REF001",
    codeBarres: "3456789012345",
    prixVente: 1500,
    stockActuel: 50,
    stockMinimum: 5,
    actif: true,
    categorie: { id: "cat-1", nom: "Hygiene", couleur: "#4CAF50" },
  },
  {
    id: "prod-2",
    nom: "Coca-Cola 33cl",
    reference: "REF002",
    codeBarres: "5449000000996",
    prixVente: 500,
    stockActuel: 100,
    stockMinimum: 10,
    actif: true,
    categorie: { id: "cat-2", nom: "Boissons", couleur: "#2196F3" },
  },
];

const mockCategories = [
  { id: "cat-1", nom: "Hygiene", couleur: "#4CAF50" },
  { id: "cat-2", nom: "Boissons", couleur: "#2196F3" },
];

describe("POSInterface", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders product grid with product names", () => {
    render(
      <POSInterface
        produits={mockProduits}
        categories={mockCategories}
        sessionId="session-1"
      />,
    );
    expect(screen.getByText("Savon liquide")).toBeInTheDocument();
    expect(screen.getByText("Coca-Cola 33cl")).toBeInTheDocument();
  });

  it("renders category filters", () => {
    render(
      <POSInterface
        produits={mockProduits}
        categories={mockCategories}
        sessionId="session-1"
      />,
    );
    expect(screen.getByText("Hygiene")).toBeInTheDocument();
    expect(screen.getByText("Boissons")).toBeInTheDocument();
  });

  it("renders search input", () => {
    render(
      <POSInterface
        produits={mockProduits}
        categories={mockCategories}
        sessionId="session-1"
      />,
    );
    const searchInput = screen.getByPlaceholderText(/recherch|scan|code/i);
    expect(searchInput).toBeInTheDocument();
  });

  it("filters products when typing in search", async () => {
    const user = userEvent.setup();
    render(
      <POSInterface
        produits={mockProduits}
        categories={mockCategories}
        sessionId="session-1"
      />,
    );
    const searchInput = screen.getByPlaceholderText(/recherch|scan|code/i);
    await user.type(searchInput, "Savon");
    expect(screen.getByText("Savon liquide")).toBeInTheDocument();
    expect(screen.queryByText("Coca-Cola 33cl")).not.toBeInTheDocument();
  });

  it("renders in readOnly mode without crashing", () => {
    render(
      <POSInterface
        produits={mockProduits}
        categories={mockCategories}
        sessionId="session-1"
        readOnly={true}
      />,
    );
    expect(screen.getByText("Savon liquide")).toBeInTheDocument();
  });
});
