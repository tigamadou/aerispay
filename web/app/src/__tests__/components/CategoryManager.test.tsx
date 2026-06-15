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
global.fetch = vi.fn().mockImplementation(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ data: {} }),
  }),
);

import { CategoryManager } from "@/components/stock/CategoryManager";

const mockCategories = [
  { id: "cat-1", nom: "Boissons", description: "Toutes les boissons", couleur: "#2196F3", _count: { produits: 15 } },
  { id: "cat-2", nom: "Hygiene", description: null, couleur: "#4CAF50", _count: { produits: 8 } },
];

describe("CategoryManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the list of categories", () => {
    render(<CategoryManager categories={mockCategories} />);
    expect(screen.getByText("Boissons")).toBeInTheDocument();
    expect(screen.getByText("Hygiene")).toBeInTheDocument();
  });

  it("displays product count for each category", () => {
    render(<CategoryManager categories={mockCategories} />);
    expect(screen.getByText(/15/)).toBeInTheDocument();
    expect(screen.getByText(/8/)).toBeInTheDocument();
  });

  it("renders the create category form", () => {
    render(<CategoryManager categories={mockCategories} />);
    const nomInput = screen.getByPlaceholderText("Nom");
    expect(nomInput).toBeInTheDocument();
  });

  it("allows typing a new category name", async () => {
    const user = userEvent.setup();
    render(<CategoryManager categories={mockCategories} />);
    const nomInput = screen.getByPlaceholderText("Nom") as HTMLInputElement;
    await user.type(nomInput, "Electronique");
    expect(nomInput.value).toBe("Electronique");
  });

  it("renders with empty categories list", () => {
    render(<CategoryManager categories={[]} />);
    expect(screen.getByPlaceholderText("Nom")).toBeInTheDocument();
  });
});
