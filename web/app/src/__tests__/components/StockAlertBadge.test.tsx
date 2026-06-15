// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StockAlertBadge } from "@/components/stock/StockAlertBadge";

describe("StockAlertBadge", () => {
  it("displays 'Normal' when stock is above 2x minimum", () => {
    render(<StockAlertBadge stockActuel={50} stockMinimum={5} />);
    expect(screen.getByText("Normal")).toBeInTheDocument();
  });

  it("displays 'Alerte' when stock is between minimum and 2x minimum", () => {
    render(<StockAlertBadge stockActuel={8} stockMinimum={5} />);
    expect(screen.getByText("Alerte")).toBeInTheDocument();
  });

  it("displays 'Rupture' when stock equals minimum", () => {
    render(<StockAlertBadge stockActuel={5} stockMinimum={5} />);
    expect(screen.getByText("Rupture")).toBeInTheDocument();
  });

  it("displays 'Rupture' when stock is below minimum but not zero", () => {
    render(<StockAlertBadge stockActuel={2} stockMinimum={5} />);
    expect(screen.getByText("Rupture")).toBeInTheDocument();
  });

  it("displays 'Epuise' when stock is zero", () => {
    render(<StockAlertBadge stockActuel={0} stockMinimum={5} />);
    expect(screen.getByText(/puisé/i)).toBeInTheDocument();
  });
});
