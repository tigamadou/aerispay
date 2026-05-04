/**
 * e2e — Ecarts de caisse : ouverture → ventes → fermeture avec ecart → modale confirmation → dashboard admin → page ecarts.
 */

describe("Ecarts de caisse — flux complet", () => {
  const FOND_CASH = 50_000;
  const PRIX_PRODUIT = 2_750;
  const QTE = 2;
  const MONTANT_VENTE = PRIX_PRODUIT * QTE; // 5500
  const MONTANT_ATTENDU = FOND_CASH + MONTANT_VENTE; // 55500

  // Cashier declares less than expected → manquant
  const MONTANT_COMPTE_MANQUANT = 54_000;
  const ECART_MANQUANT = MONTANT_COMPTE_MANQUANT - MONTANT_ATTENDU; // -1500

  // Cashier declares more than expected → excedent
  const MONTANT_COMPTE_EXCEDENT = 56_500;
  const ECART_EXCEDENT = MONTANT_COMPTE_EXCEDENT - MONTANT_ATTENDU; // +1000

  /**
   * Helper: open a session, make a sale, and return the sessionId.
   */
  function openSessionAndSell(): Cypress.Chainable<string> {
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
                  quantite: QTE,
                  prixUnitaire: PRIX_PRODUIT,
                  tva: 0,
                  remise: 0,
                },
              ],
              paiements: [{ mode: "ESPECES", montant: MONTANT_VENTE }],
              remise: 0,
            })
            .then(() => sessionId);
        });
      });
  }

  describe("Fermeture avec ecart manquant — modale de confirmation", () => {
    beforeEach(() => {
      cy.closeOpenSessions("caissier@aerispay.com");
      cy.loginAsCaissier();
      cy.ensureCaisseFunded();
    });

    it("affiche le recap, detecte l'ecart, montre la modale et permet de confirmer", () => {
      openSessionAndSell().then(() => {
        cy.visit("/comptoir/sessions");
        cy.get('[data-testid="session-active"]').should("be.visible");

        // Open the close form
        cy.get('[data-testid="btn-show-close-form"]').click();
        cy.get('[data-testid="session-close-form"]').should("be.visible");

        // Recap table should display: fond de caisse + ventes + montant attendu
        cy.get('[data-testid="montant-attendu-especes"]', { timeout: 8_000 }).should("be.visible");
        cy.get('[data-testid="montant-attendu-especes"]').invoke("text").then((text) => {
          const cleaned = text.replace(/\s/g, "").replace("FCFA", "");
          expect(Number(cleaned)).to.eq(MONTANT_ATTENDU);
        });

        // Type a lower counted amount → manquant
        cy.get('[data-testid="input-montant-fermeture-especes"]').type(String(MONTANT_COMPTE_MANQUANT));

        // Ecart should display "Manquant"
        cy.get('[data-testid="ecart-especes"]').should("be.visible");
        cy.get('[data-testid="ecart-especes"]').should("contain", "Manquant");

        // Click close → discrepancy modal should appear (NOT direct close)
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
      openSessionAndSell().then(() => {
        cy.visit("/comptoir/sessions");
        cy.get('[data-testid="btn-show-close-form"]').click();

        // Wait for recap to load
        cy.get('[data-testid="montant-attendu-especes"]', { timeout: 8_000 }).should("be.visible");

        // Type exact expected amount
        cy.get('[data-testid="input-montant-fermeture-especes"]').type(String(MONTANT_ATTENDU));

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
      // Close any existing sessions, then create one with an ecart via API
      cy.closeOpenSessions("caissier@aerispay.com");
      cy.loginAsCaissier();
      cy.ensureCaisseFunded();

      openSessionAndSell().then((sessionId) => {
        // Close with a deficit via API
        cy.request("PUT", `/api/comptoir/sessions/${sessionId}`, {
          montantFermetureCash: MONTANT_COMPTE_MANQUANT,
          montantFermetureMobileMoney: 0,
        });
      });
    });

    it("affiche les ecarts sur le dashboard admin", () => {
      cy.loginAsAdmin();
      cy.visit("/");

      // The discrepancy section should be visible
      cy.contains("Ecarts de caisse du jour").should("be.visible");

      // Should show manquant
      cy.contains("Manquant total").should("be.visible");

      // Table should show the cashier name and ecart
      cy.contains("td", "caissier").should("be.visible");

      // Link to full history
      cy.contains("a", "Voir tout").should("be.visible");
    });
  });

  describe("Page ecarts detailles", () => {
    before(() => {
      // Create a session with an excedent ecart
      cy.closeOpenSessions("caissier@aerispay.com");
      cy.loginAsCaissier();
      cy.ensureCaisseFunded();

      openSessionAndSell().then((sessionId) => {
        cy.request("PUT", `/api/comptoir/sessions/${sessionId}`, {
          montantFermetureCash: MONTANT_COMPTE_EXCEDENT,
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

      // Should show ecart values in the table
      cy.get("table").should("contain", "FCFA");

      // Details link should point to a session page
      cy.contains("a", "Details").should("have.attr", "href").and("include", "/comptoir/sessions/");
    });

    it("filtre par caissier", () => {
      cy.loginAsAdmin();
      cy.visit("/comptoir/ecarts");

      // Select a cashier in the filter
      cy.get("#userId").select(1); // First real user
      cy.contains("button", "Filtrer").click();

      // Page should reload with results
      cy.contains("Ecarts de caisse").should("be.visible");
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
      cy.loginAsCaissier();
      cy.ensureCaisseFunded();
    });

    it("affiche un warning si le fond declare differe du solde caisse", () => {
      // Declare a very different amount than what the caisse has
      cy.visit("/comptoir/sessions");
      cy.get('[data-testid="session-open-form"]').should("be.visible");

      // Type an intentionally wrong amount (1 FCFA)
      cy.get('[data-testid="input-montant-ouverture-especes"]').type("1");
      cy.get('[data-testid="btn-ouvrir-session"]').click();

      // Session opens but warning should appear
      cy.get('[data-testid="session-active"]', { timeout: 10_000 }).should("be.visible");
      cy.get('[data-testid="session-opening-warning"]').should("be.visible");
      cy.get('[data-testid="session-opening-warning"]').should("contain", "differe du solde");
    });
  });
});
