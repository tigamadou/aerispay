/**
 * e2e — Module ventes : pages `/comptoir/ventes`, détail, API, annulation.
 * La base de test est réinitialisée via `make test-db-reset` avant le run.
 */

describe("Ventes — UI & navigation", () => {
  it("affiche le lien Ventes dans la barre de navigation", () => {
    cy.loginAsCaissier();
    cy.visit("/");
    cy.contains("a", "Ventes").should("be.visible");
  });

  it("CAISSIER : page Mes ventes vide sans historique", () => {
    cy.task("cleanVentesForUser", "caissier@aerispay.com");
    cy.closeOpenSessions("caissier@aerispay.com");
    cy.loginAsCaissier();
    cy.visit("/comptoir/ventes");
    cy.contains("h1", "Mes ventes").should("be.visible");
    cy.contains("0 vente enregistrée").should("be.visible");
    cy.contains("Aucune vente enregistrée.").should("be.visible");
  });

  it("CAISSIER : affiche une vente créée et le détail", () => {
    cy.closeOpenSessions("caissier@aerispay.com");
    cy.loginAsCaissier();
    cy.request("POST", "/api/comptoir/sessions", { montantOuvertureCash: 50_000 }).then((r1) => {
      expect(r1.status).to.eq(201);
      const sessionId = r1.body.data.id as string;
      cy.task<string>("getProduitIdByReference", "ALM-001").then((produitId) => {
        cy.request("POST", "/api/ventes", {
          sessionId,
          lignes: [
            { produitId, quantite: 1, prixUnitaire: 2750, tva: 0, remise: 0 },
          ],
          paiements: [{ mode: "ESPECES", montant: 2750 }],
          remise: 0,
        }).then((r2) => {
          expect(r2.status).to.eq(201);
          const vente = r2.body.data as { id: string; numero: string };

          cy.visit("/comptoir/ventes");
          cy.contains("1 vente enregistrée").should("be.visible");
          cy.contains("a", vente.numero).click();

          cy.location("pathname", { timeout: 10_000 }).should("eq", `/comptoir/ventes/${vente.id}`);
          cy.contains("h1", vente.numero).should("be.visible");
          cy.contains("Riz brise 5kg").should("be.visible");
        });
      });
    });
  });

  it("MANAGER : titre Historique et filtre caissiers", () => {
    cy.loginAsManager();
    cy.visit("/comptoir/ventes");
    cy.contains("h1", "Historique des ventes").should("be.visible");
    cy.contains("label", "Caissier").should("be.visible");
    cy.contains("a", "Tous").should("be.visible");
  });
});

describe("Ventes — API", () => {
  it("GET /api/ventes renvoie 200 pour un MANAGER", () => {
    cy.loginAsManager();
    cy.request("/api/ventes").its("status").should("eq", 200);
  });

  it("GET /api/ventes renvoie 401 sans session", () => {
    cy.request({ url: "/api/ventes", failOnStatusCode: false, headers: { cookie: "" } }).its("status").should("eq", 401);
  });

  it("POST /api/ventes/:id/annuler renvoie 403 pour un CAISSIER", () => {
    cy.closeOpenSessions("caissier@aerispay.com");
    cy.loginAsCaissier();
    cy.request("POST", "/api/comptoir/sessions", { montantOuvertureCash: 50_000 }).then((r1) => {
      const sessionId = r1.body.data.id as string;
      cy.task<string>("getProduitIdByReference", "ALM-001").then((produitId) => {
        cy.request("POST", "/api/ventes", {
          sessionId,
          lignes: [
            { produitId, quantite: 1, prixUnitaire: 2750, tva: 0, remise: 0 },
          ],
          paiements: [{ mode: "ESPECES", montant: 2750 }],
          remise: 0,
        }).then((r2) => {
          const venteId = r2.body.data.id as string;
          cy.request({
            method: "POST",
            url: `/api/ventes/${venteId}/annuler`,
            failOnStatusCode: false,
          })
            .its("status")
            .should("eq", 403);
        });
      });
    });
  });
});

describe("Ventes — annulation (MANAGER)", () => {
  it("peut annuler une vente validée depuis la liste", () => {
    cy.closeOpenSessions("caissier@aerispay.com");
    cy.loginAsCaissier();
    cy.request("POST", "/api/comptoir/sessions", { montantOuvertureCash: 50_000 }).then((r1) => {
      const sessionId = r1.body.data.id as string;
      cy.task<string>("getProduitIdByReference", "ALM-001").then((produitId) => {
        cy.request("POST", "/api/ventes", {
          sessionId,
          lignes: [
            { produitId, quantite: 1, prixUnitaire: 2750, tva: 0, remise: 0 },
          ],
          paiements: [{ mode: "ESPECES", montant: 2750 }],
          remise: 0,
        }).then((r2) => {
          const numero = r2.body.data.numero as string;

          cy.loginAsManager();
          cy.visit("/comptoir/ventes");
          cy.contains("tr", numero).within(() => {
            cy.contains("button", "Annuler").click();
          });
          cy.contains("tr", numero).within(() => {
            cy.contains("Annulée").should("be.visible");
          });
        });
      });
    });
  });
});
