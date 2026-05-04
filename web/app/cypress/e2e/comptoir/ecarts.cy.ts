/**
 * e2e — Ecarts de caisse : ouverture → ventes → fermeture avec ecart → modale confirmation → dashboard admin → page ecarts.
 */

const FOND_CASH = 50_000;

/**
 * Helper: open a session, make a sale, and return { sessionId, totalVente }.
 * The payment amount sent = 100_000 to cover any TTC price; the movement
 * recorded in the caisse is capped to the actual sale total by the API.
 */
function openSessionAndSell(): Cypress.Chainable<{ sessionId: string; totalVente: number }> {
  return cy
    .request("POST", "/api/comptoir/sessions", {
      montantOuvertureCash: FOND_CASH,
      montantOuvertureMobileMoney: 0,
    })
    .then((r) => {
      const sessionId = r.body.data.id as string;
      return cy.task<string>("getProduitIdByReference", "SEC-001").then((produitId) => {
        return cy
          .request("POST", "/api/ventes", {
            sessionId,
            lignes: [
              {
                produitId,
                quantite: 1,
                prixUnitaire: 2750,
                tva: 0,
                remise: 0,
              },
            ],
            // Pay with a large enough amount — change is returned to the customer
            paiements: [{ mode: "ESPECES", montant: 100_000 }],
            remise: 0,
          })
          .then((venteRes) => {
            const totalVente = Number(venteRes.body.data.total);
            return { sessionId, totalVente };
          });
      });
    });
}

describe("Ecarts de caisse — flux complet", () => {
  describe("Fermeture avec ecart manquant — modale de confirmation", () => {
    beforeEach(() => {
      cy.closeOpenSessions("caissier@aerispay.com");
      cy.restockProduct("SEC-001");
      cy.loginAsCaissier();
      cy.ensureCaisseFunded();
    });

    it("affiche le recap, detecte l'ecart, montre la modale et permet de confirmer", () => {
      openSessionAndSell().then(({ totalVente }) => {
        const montantAttendu = FOND_CASH + totalVente;
        const montantCompte = montantAttendu - 1500; // intentional deficit

        cy.visit("/comptoir/sessions");
        cy.get('[data-testid="session-active"]').should("be.visible");

        // Open the close form
        cy.get('[data-testid="btn-show-close-form"]').click();
        cy.get('[data-testid="session-close-form"]').should("be.visible");

        // Recap table should show montant attendu
        cy.get('[data-testid="montant-attendu-especes"]', { timeout: 8_000 }).should("be.visible");

        // Type a lower amount → manquant
        cy.get('[data-testid="input-montant-fermeture-especes"]').type(String(montantCompte));

        // Ecart should display "Manquant"
        cy.get('[data-testid="ecart-especes"]').should("be.visible");
        cy.get('[data-testid="ecart-especes"]').should("contain", "Manquant");

        // Click close → discrepancy modal should appear
        cy.get('[data-testid="btn-fermer-session"]').click();
        cy.get('[data-testid="discrepancy-modal"]').should("be.visible");
        cy.get('[data-testid="discrepancy-modal"]').should("contain", "Ecart detecte");
        cy.get('[data-testid="discrepancy-modal"]').should("contain", "manquant");

        // Cancel → go back to form
        cy.get('[data-testid="discrepancy-modal-cancel"]').click();
        cy.get('[data-testid="discrepancy-modal"]').should("not.exist");
        cy.get('[data-testid="session-close-form"]').should("be.visible");

        // Click close again → modal again → this time confirm
        cy.get('[data-testid="btn-fermer-session"]').click();
        cy.get('[data-testid="discrepancy-modal"]').should("be.visible");
        cy.get('[data-testid="discrepancy-modal-confirm"]').click();

        // Session should be closed — open form appears
        cy.get('[data-testid="session-open-form"]', { timeout: 10_000 }).should("be.visible");
      });
    });

    it("ferme directement sans modale si aucun ecart", () => {
      openSessionAndSell().then(({ totalVente }) => {
        const montantAttendu = FOND_CASH + totalVente;

        cy.visit("/comptoir/sessions");
        cy.get('[data-testid="btn-show-close-form"]').click();

        // Wait for recap to load
        cy.get('[data-testid="montant-attendu-especes"]', { timeout: 8_000 }).should("be.visible");

        // Type exact expected amount
        cy.get('[data-testid="input-montant-fermeture-especes"]').type(String(montantAttendu));

        // Ecart should show "Equilibre"
        cy.get('[data-testid="ecart-especes"]').should("contain", "Equilibre");

        // Close → NO modal → direct close
        cy.get('[data-testid="btn-fermer-session"]').click();
        cy.get('[data-testid="discrepancy-modal"]').should("not.exist");
        cy.get('[data-testid="session-open-form"]', { timeout: 10_000 }).should("be.visible");
      });
    });
  });

  describe("Ecarts visibles sur le dashboard admin", () => {
    before(() => {
      cy.closeOpenSessions("caissier@aerispay.com");
      cy.restockProduct("SEC-001");
      cy.loginAsCaissier();
      cy.ensureCaisseFunded();

      openSessionAndSell().then(({ sessionId }) => {
        // Close with a deficit via API
        cy.request("PUT", `/api/comptoir/sessions/${sessionId}`, {
          montantFermetureCash: FOND_CASH - 2000, // intentionally less than just the opening
          montantFermetureMobileMoney: 0,
        });
      });
    });

    it("affiche les ecarts sur le dashboard admin", () => {
      cy.loginAsAdmin();
      cy.visit("/");

      // The discrepancy section may be below the fold — scroll to it
      cy.contains("Ecarts de caisse du jour").scrollIntoView().should("be.visible");

      // Should show manquant section
      cy.contains("Manquant total").scrollIntoView().should("be.visible");

      // Link to full history
      cy.contains("a", "Voir tout").scrollIntoView().should("be.visible");
    });
  });

  describe("Page ecarts detailles", () => {
    before(() => {
      cy.closeOpenSessions("caissier@aerispay.com");
      cy.restockProduct("SEC-001");
      cy.loginAsCaissier();
      cy.ensureCaisseFunded();

      openSessionAndSell().then(({ sessionId }) => {
        // Close with a surplus via API
        cy.request("PUT", `/api/comptoir/sessions/${sessionId}`, {
          montantFermetureCash: FOND_CASH + 100_000, // intentionally more
          montantFermetureMobileMoney: 0,
        });
      });
    });

    it("affiche la liste des ecarts avec filtres", () => {
      cy.loginAsAdmin();
      cy.visit("/comptoir/ecarts");

      // Page header
      cy.contains("h1", "Ecarts de caisse").should("be.visible");

      // Summary cards
      cy.contains("Sessions avec ecart").should("be.visible");

      // Table should have at least one row
      cy.get("table tbody tr").should("have.length.gte", 1);

      // Should show FCFA values in the table
      cy.get("table").should("contain", "FCFA");

      // Details link should point to a session page
      cy.contains("a", "Details").should("have.attr", "href").and("include", "/comptoir/sessions/");
    });

    it("lien retour vers le dashboard", () => {
      cy.loginAsAdmin();
      cy.visit("/comptoir/ecarts");

      cy.contains("a", "Retour au tableau de bord").click();
      cy.location("pathname").should("eq", "/");
    });
  });

  describe("Avertissement a l'ouverture si ecart avec solde caisse", () => {
    beforeEach(() => {
      cy.closeOpenSessions("caissier@aerispay.com");
      cy.restockProduct("SEC-001");
      cy.loginAsCaissier();
      cy.ensureCaisseFunded();
    });

    it("affiche un warning si le fond declare differe du solde caisse", () => {
      cy.visit("/comptoir/sessions");
      cy.get('[data-testid="session-open-form"]').should("be.visible");

      // Type an intentionally wrong amount (1 FCFA — far from real balance)
      cy.get('[data-testid="input-montant-ouverture-especes"]').type("1");
      cy.get('[data-testid="btn-ouvrir-session"]').click();

      // Session opens but warning should appear
      cy.get('[data-testid="session-active"]', { timeout: 10_000 }).should("be.visible");
      cy.get('[data-testid="session-opening-warning"]').should("be.visible");
      cy.get('[data-testid="session-opening-warning"]').should("contain", "differe du solde");
    });
  });
});
