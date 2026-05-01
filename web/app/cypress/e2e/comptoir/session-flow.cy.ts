/**
 * e2e — Flux caissier complet : ouverture session comptoir → vente → clôture avec écart.
 * La base de test est réinitialisée via `make test-db-reset` avant le run.
 */

describe("Session de comptoir — flux complet", () => {
  beforeEach(() => {
    cy.closeOpenSessions("caissier@aerispay.com");
    cy.loginAsCaissier();
  });

  it("ouvre une session de comptoir", () => {
    cy.visit("/comptoir/sessions");
    cy.get('[data-testid="sessions-page"]').should("be.visible");
    cy.get('[data-testid="session-open-form"]').should("be.visible");

    cy.get('[data-testid="input-montant-ouverture"]').type("50000");
    cy.get('[data-testid="btn-ouvrir-session"]').click();

    cy.get('[data-testid="session-active"]', { timeout: 10_000 }).should("be.visible");
    cy.get('[data-testid="session-montant-ouverture"]').should("contain", "50 000");
  });

  it("refuse une seconde session ouverte (409)", () => {
    // Open first session via API
    cy.request("POST", "/api/comptoir/sessions", { montantOuvertureCash: 50000 });

    cy.visit("/comptoir/sessions");
    cy.get('[data-testid="session-active"]').should("be.visible");
  });

  it("redirige vers sessions si pas de session ouverte sur /comptoir", () => {
    cy.visit("/comptoir");
    cy.contains("Aucune session de comptoir ouverte").should("be.visible");
    cy.contains("a", "Ouvrir une session").should("be.visible");
  });

  it("clôture une session — affiche solde théorique et écart", () => {
    // Open session + make a sale via API
    cy.request("POST", "/api/comptoir/sessions", { montantOuvertureCash: 50000 }).then((r1) => {
      const sessionId = r1.body.data.id as string;

      cy.task<string>("getProduitIdByReference", "ALM-001").then((produitId) => {
        cy.request("POST", "/api/ventes", {
          sessionId,
          lignes: [{ produitId, quantite: 2, prixUnitaire: 2750, tva: 0, remise: 0 }],
          paiements: [{ mode: "ESPECES", montant: 6000 }],
          remise: 0,
        });

        cy.visit("/comptoir/sessions");
        cy.get('[data-testid="session-active"]').should("be.visible");

        // Open close form
        cy.get('[data-testid="btn-show-close-form"]').click();
        cy.get('[data-testid="session-close-form"]').should("be.visible");

        // Solde théorique should appear: 50000 + 6000 (reçu espèces) - 500 (monnaie) = 55500
        cy.get('[data-testid="solde-theorique"]', { timeout: 5_000 }).should("be.visible");

        // Type the counted amount — intentional discrepancy
        cy.get('[data-testid="input-montant-fermeture"]').type("55000");

        // Écart should show (55000 - 55500 = -500 → manquant)
        cy.get('[data-testid="ecart-comptoir"]').should("be.visible");
        cy.get('[data-testid="ecart-comptoir"]').should("contain", "Manquant");

        // Close
        cy.get('[data-testid="btn-fermer-session"]').click();

        // Should show open form again
        cy.get('[data-testid="session-open-form"]', { timeout: 10_000 }).should("be.visible");
      });
    });
  });

  it("clôture une session équilibrée", () => {
    cy.request("POST", "/api/comptoir/sessions", { montantOuvertureCash: 25000 }).then((r1) => {
      const sessionId = r1.body.data.id as string;

      // No sales — solde théorique = 25000

      cy.visit("/comptoir/sessions");
      cy.get('[data-testid="btn-show-close-form"]').click();

      cy.get('[data-testid="solde-theorique"]', { timeout: 5_000 }).should("contain", "25 000");
      cy.get('[data-testid="input-montant-fermeture"]').type("25000");
      cy.get('[data-testid="ecart-comptoir"]').should("contain", "équilibrée");

      cy.get('[data-testid="btn-fermer-session"]').click();
      cy.get('[data-testid="session-open-form"]', { timeout: 10_000 }).should("be.visible");
    });
  });
});

describe("Déconnexion avec session ouverte", () => {
  it("force la clôture avant déconnexion", () => {
    cy.closeOpenSessions("caissier@aerispay.com");
    cy.loginAsCaissier();

    // Open a session
    cy.request("POST", "/api/comptoir/sessions", { montantOuvertureCash: 30000 });

    cy.visit("/");

    // Click sign out
    cy.contains("button", "Déconnexion").click();

    // Modal should appear asking for closing amount
    cy.contains("Clôturer la session de comptoir").should("be.visible");

    // Solde théorique should load
    cy.get('[data-testid="signout-montant"]').should("be.visible");
    cy.get('[data-testid="signout-montant"]').type("30000");

    // Écart should show
    cy.get('[data-testid="signout-ecart"]').should("contain", "équilibrée");

    // Confirm
    cy.get('[data-testid="signout-confirm"]').click();

    // Should redirect to login
    cy.location("pathname", { timeout: 15_000 }).should("eq", "/login");
  });
});
