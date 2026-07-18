/**
 * e2e — Tickets & PDF : page `/comptoir/tickets/[id]`, PDF API, taxes on ticket.
 */

/** Helper: create a sale via API and return { id, numero } */
function createSale(sessionId: string, produitId: string, prixUnitaire = 2750, montant = 2750) {
  return cy
    .request("POST", "/api/ventes", {
      sessionId,
      lignes: [{ produitId, quantite: 1, prixUnitaire, remise: 0 }],
      paiements: [{ mode: "ESPECES", montant }],
      remise: 0,
    })
    .then((res) => {
      expect(res.status).to.eq(201);
      return res.body.data as { id: string; numero: string };
    });
}

describe("Ticket page — display", () => {
  let venteId: string;
  let venteNumero: string;

  before(() => {
    cy.closeOpenSessions("caissier@aerispay.com");
    cy.loginAsCaissier();
    cy.ensureCaisseFunded();
    cy.request("POST", "/api/comptoir/sessions", { montantOuvertureCash: 50_000 }).then((r) => {
      const sessionId = r.body.data.id as string;
      cy.task<string>("getProduitIdByReference", "SEC-001").then((produitId) => {
        createSale(sessionId, produitId).then((vente) => {
          venteId = vente.id;
          venteNumero = vente.numero;
        });
      });
    });
  });

  it("displays ticket page with sale details", () => {
    cy.loginAsCaissier();
    cy.visit(`/comptoir/tickets/${venteId}`);

    cy.contains("Ticket N°:").should("be.visible");
    cy.contains(venteNumero).should("be.visible");
    cy.contains("Riz brise 5kg").should("be.visible");
    cy.contains("Caissier:").should("be.visible");
    cy.contains("TOTAL TTC").should("be.visible");
    cy.contains("Especes").should("be.visible");
  });

  it("displays business info from parametres", () => {
    cy.loginAsCaissier();
    cy.visit(`/comptoir/tickets/${venteId}`);

    // The commerce name from seed is "Super Marche AerisPay"
    cy.contains("Super Marche AerisPay").should("be.visible");
  });

  it("shows Retour aux ventes link", () => {
    cy.loginAsCaissier();
    cy.visit(`/comptoir/tickets/${venteId}`);

    cy.contains("a", "Retour aux ventes").should("be.visible").click();
    cy.location("pathname").should("eq", "/comptoir/ventes");
  });

  it("shows Telecharger PDF and Imprimer buttons", () => {
    cy.loginAsCaissier();
    cy.visit(`/comptoir/tickets/${venteId}`);

    cy.contains("button", "Telecharger PDF").should("be.visible");
    cy.contains("button", "Imprimer").should("be.visible");
  });

  it("returns 404 for non-existent ticket", () => {
    cy.loginAsCaissier();
    cy.request({
      url: "/comptoir/tickets/nonexistent-id-12345",
      failOnStatusCode: false,
    })
      .its("status")
      .should("eq", 404);
  });
});

describe("Ticket page — with taxes", () => {
  let venteId: string;
  let taxeId: string;

  before(() => {
    // Create a tax as admin
    cy.loginAsAdmin();
    cy.request("POST", "/api/taxes", {
      nom: "TVA Ticket Test",
      taux: 18,
      active: true,
      ordre: 0,
    }).then((res) => {
      taxeId = res.body.data.id;
    });

    // Create a sale as caissier (taxes should be applied)
    cy.closeOpenSessions("caissier@aerispay.com");
    cy.loginAsCaissier();
    cy.ensureCaisseFunded();
    cy.request("POST", "/api/comptoir/sessions", { montantOuvertureCash: 50_000 }).then((r) => {
      const sessionId = r.body.data.id as string;
      cy.task<string>("getProduitIdByReference", "SEC-001").then((produitId) => {
        createSale(sessionId, produitId, 2750, 5000).then((vente) => {
          venteId = vente.id;
        });
      });
    });
  });

  after(() => {
    // Cleanup tax
    cy.loginAsAdmin();
    cy.request("DELETE", `/api/taxes/${taxeId}`);
  });

  it("displays individual tax lines on the ticket", () => {
    cy.loginAsCaissier();
    cy.visit(`/comptoir/tickets/${venteId}`);

    cy.contains("TVA Ticket Test (18%)").should("be.visible");
    cy.contains("TOTAL TTC").should("be.visible");
  });
});

describe("PDF API — /api/tickets/[id]/pdf", () => {
  let venteId: string;

  before(() => {
    cy.closeOpenSessions("caissier@aerispay.com");
    cy.loginAsCaissier();
    cy.ensureCaisseFunded();
    cy.request("POST", "/api/comptoir/sessions", { montantOuvertureCash: 50_000 }).then((r) => {
      const sessionId = r.body.data.id as string;
      cy.task<string>("getProduitIdByReference", "SEC-001").then((produitId) => {
        createSale(sessionId, produitId).then((vente) => {
          venteId = vente.id;
        });
      });
    });
  });

  it("returns 401 without authentication", () => {
    cy.request({
      url: `/api/tickets/${venteId}/pdf`,
      failOnStatusCode: false,
      headers: { cookie: "" },
    })
      .its("status")
      .should("eq", 401);
  });

  it("returns 404 for non-existent sale", () => {
    cy.loginAsCaissier();
    cy.request({
      url: "/api/tickets/nonexistent-id-12345/pdf",
      failOnStatusCode: false,
    })
      .its("status")
      .should("eq", 404);
  });

  it("returns a PDF with correct content-type", () => {
    cy.loginAsCaissier();
    cy.request({
      url: `/api/tickets/${venteId}/pdf`,
      encoding: "binary",
    }).then((res) => {
      expect(res.status).to.eq(200);
      expect(res.headers["content-type"]).to.eq("application/pdf");
      expect(res.headers["content-disposition"]).to.include("attachment");
      expect(res.headers["content-disposition"]).to.include(".pdf");
      // PDF should have content
      expect(res.body.length).to.be.greaterThan(100);
    });
  });

  it("returns PDF for any authenticated role (MANAGER)", () => {
    cy.loginAsManager();
    cy.request({
      url: `/api/tickets/${venteId}/pdf`,
      encoding: "binary",
    }).then((res) => {
      expect(res.status).to.eq(200);
      expect(res.headers["content-type"]).to.eq("application/pdf");
    });
  });

  it("logs TICKET_PDF_DOWNLOADED activity", () => {
    cy.loginAsAdmin();
    cy.task("clearActivityLogs", null);

    cy.request({
      url: `/api/tickets/${venteId}/pdf`,
      encoding: "binary",
    }).then((res) => {
      expect(res.status).to.eq(200);

      cy.task("getRecentActivityLogs", { action: "TICKET_PDF_DOWNLOADED" }).then(
        (logs) => {
          const typedLogs = logs as Array<{
            action: string;
            entityType: string | null;
            entityId: string | null;
          }>;
          expect(typedLogs.length).to.be.greaterThan(0);
          expect(typedLogs[0].entityType).to.eq("Sale");
          expect(typedLogs[0].entityId).to.eq(venteId);
        }
      );
    });
  });
});

describe("PDF API — with taxes in PDF", () => {
  let venteId: string;
  let taxeId: string;

  before(() => {
    // Create a tax
    cy.loginAsAdmin();
    cy.request("POST", "/api/taxes", {
      nom: "AIB PDF Test",
      taux: 5,
      active: true,
      ordre: 0,
    }).then((res) => {
      taxeId = res.body.data.id;
    });

    // Create a sale with the tax active
    cy.closeOpenSessions("caissier@aerispay.com");
    cy.loginAsCaissier();
    cy.ensureCaisseFunded();
    cy.request("POST", "/api/comptoir/sessions", { montantOuvertureCash: 50_000 }).then((r) => {
      const sessionId = r.body.data.id as string;
      cy.task<string>("getProduitIdByReference", "SEC-001").then((produitId) => {
        createSale(sessionId, produitId, 2750, 5000).then((vente) => {
          venteId = vente.id;
        });
      });
    });
  });

  after(() => {
    cy.loginAsAdmin();
    cy.request("DELETE", `/api/taxes/${taxeId}`);
  });

  it("generates PDF successfully for a sale with taxes", () => {
    cy.loginAsCaissier();
    cy.request({
      url: `/api/tickets/${venteId}/pdf`,
      encoding: "binary",
    }).then((res) => {
      expect(res.status).to.eq(200);
      expect(res.headers["content-type"]).to.eq("application/pdf");
      expect(res.body.length).to.be.greaterThan(100);
    });
  });

  it("stores taxesDetail on the vente", () => {
    cy.loginAsCaissier();
    cy.request(`/api/ventes`).then((res) => {
      // Find the vente we created
      const ventes = res.body.data as Array<{ id: string }>;
      const found = ventes.find((v) => v.id === venteId);
      expect(found).to.exist;
    });

    // Check the vente detail via the ticket page
    cy.visit(`/comptoir/tickets/${venteId}`);
    cy.contains("AIB PDF Test (5%)").should("be.visible");
  });
});

describe("Thermal print API — /api/tickets/[id]/print", () => {
  let venteId: string;

  before(() => {
    cy.closeOpenSessions("caissier@aerispay.com");
    cy.loginAsCaissier();
    cy.ensureCaisseFunded();
    cy.request("POST", "/api/comptoir/sessions", { montantOuvertureCash: 50_000 }).then((r) => {
      const sessionId = r.body.data.id as string;
      cy.task<string>("getProduitIdByReference", "SEC-001").then((produitId) => {
        createSale(sessionId, produitId).then((vente) => {
          venteId = vente.id;
        });
      });
    });
  });

  it("returns 401 without authentication", () => {
    cy.request({
      method: "POST",
      url: `/api/tickets/${venteId}/print`,
      failOnStatusCode: false,
      headers: { cookie: "" },
    })
      .its("status")
      .should("eq", 401);
  });

  it("returns 404 for non-existent sale", () => {
    cy.loginAsCaissier();
    cy.request({
      method: "POST",
      url: "/api/tickets/nonexistent-id-12345/print",
      failOnStatusCode: false,
    })
      .its("status")
      .should("eq", 404);
  });

  it("responds (success or 503 if no printer) for valid sale", () => {
    cy.loginAsCaissier();
    cy.request({
      method: "POST",
      url: `/api/tickets/${venteId}/print`,
      failOnStatusCode: false,
    }).then((res) => {
      // 200 if printer connected, 503 if not — both are valid in e2e
      expect([200, 503]).to.include(res.status);
    });
  });
});
