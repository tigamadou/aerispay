// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
  }),
}));

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

import { ProductForm } from "@/components/stock/ProductForm";

const categories = [
  { id: "cat-1", nom: "Boissons" },
  { id: "cat-2", nom: "Alimentaire" },
];

describe("ProductForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders in create mode with empty fields", () => {
    render(<ProductForm mode="create" categories={categories} />);
    expect(screen.getByLabelText(/nom/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/prix de vente/i)).toBeInTheDocument();
  });

  it("renders in edit mode with initialData", () => {
    const initialData = {
      id: "prod-1",
      nom: "Savon liquide",
      codeBarres: "123456789",
      categorieId: "cat-1",
      prixAchat: 800,
      prixVente: 1500,
      tva: 18,
      unite: "unite",
      stockMinimum: 5,
      stockMaximum: null,
      description: "Test",
      image: null,
      actif: true,
    };

    render(<ProductForm mode="edit" categories={categories} initialData={initialData} />);
    const nomInput = screen.getByLabelText(/nom/i) as HTMLInputElement;
    expect(nomInput.value).toBe("Savon liquide");
  });

  it("renders category selector with provided categories", () => {
    render(<ProductForm mode="create" categories={categories} />);
    expect(screen.getByLabelText(/cat/i)).toBeInTheDocument();
  });

  it("shows submit button", () => {
    render(<ProductForm mode="create" categories={categories} />);
    const button = screen.getByRole("button", { name: /cr[eé]er|enregistrer|ajouter/i });
    expect(button).toBeInTheDocument();
  });

  it("allows user to type in nom field", async () => {
    const user = userEvent.setup();
    render(<ProductForm mode="create" categories={categories} />);
    const nomInput = screen.getByLabelText(/nom/i) as HTMLInputElement;
    await user.clear(nomInput);
    await user.type(nomInput, "Nouveau produit");
    expect(nomInput.value).toBe("Nouveau produit");
  });
});
