/**
 * e2e — Gestion des utilisateurs (`/users`).
 * `cy.resetDb()` remet la base dans l'état seed (3 comptes)
 * avant et après chaque test. Aucune donnée de test ne persiste.
 */

const uniqueEmail = () => `test-${Date.now()}@aerispay.com`;

beforeEach(() => {
  cy.resetDb();
});

afterEach(() => {
  cy.resetDb();
});

describe("Gestion des utilisateurs — accès par rôle", () => {
  it("ADMIN voit le lien Utilisateurs dans la navigation", () => {
    cy.loginAsAdmin();
    cy.visit("/");
    cy.contains("a", "Utilisateurs").should("be.visible");
  });

  it("MANAGER ne voit pas le lien Utilisateurs", () => {
    cy.loginAsManager();
    cy.visit("/");
    cy.contains("a", "Utilisateurs").should("not.exist");
  });

  it("CAISSIER ne voit pas le lien Utilisateurs", () => {
    cy.loginAsCaissier();
    cy.visit("/");
    cy.contains("a", "Utilisateurs").should("not.exist");
  });

  it("MANAGER est redirigé s'il accède à /users directement", () => {
    cy.loginAsManager();
    cy.visit("/users");
    cy.location("pathname", { timeout: 10_000 }).should("eq", "/");
  });

  it("CAISSIER est redirigé s'il accède à /users directement", () => {
    cy.loginAsCaissier();
    cy.visit("/users");
    cy.location("pathname", { timeout: 10_000 }).should("eq", "/");
  });
});

describe("Gestion des utilisateurs — liste (ADMIN)", () => {
  beforeEach(() => {
    cy.loginAsAdmin();
  });

  it("affiche la page avec le titre et le bouton de création", () => {
    cy.visit("/users");
    cy.contains("h1", "Utilisateurs").should("be.visible");
    cy.contains("a", "Nouvel utilisateur").should("be.visible");
  });

  it("affiche les utilisateurs du seed dans le tableau", () => {
    cy.visit("/users");
    cy.contains("td", "admin@aerispay.com").should("be.visible");
    cy.contains("td", "gerant@aerispay.com").should("be.visible");
    cy.contains("td", "caissier@aerispay.com").should("be.visible");
  });

  it("affiche les rôles traduits", () => {
    cy.visit("/users");
    cy.contains("Administrateur").should("exist");
    cy.contains("Gérant").should("exist");
    cy.contains("Caissier").should("exist");
  });
});

describe("Gestion des utilisateurs — création (ADMIN)", () => {
  beforeEach(() => {
    cy.loginAsAdmin();
  });

  it("affiche le formulaire de création", () => {
    cy.visit("/users/nouveau");
    cy.contains("h1", "Nouvel utilisateur").should("be.visible");
    cy.get('[data-testid="user-form"]').should("be.visible");
    cy.get('[data-testid="user-nom"]').should("be.visible");
    cy.get('[data-testid="user-email"]').should("be.visible");
    cy.get('[data-testid="user-password"]').should("be.visible");
    cy.get('[data-testid="user-role"]').should("be.visible");
  });

  it("crée un nouvel utilisateur et redirige vers la liste", () => {
    const email = uniqueEmail();
    cy.visit("/users/nouveau");

    cy.get('[data-testid="user-nom"]').type("Test Cypress");
    cy.get('[data-testid="user-email"]').type(email);
    cy.get('[data-testid="user-password"]').type("TestPass@1234");
    cy.get('[data-testid="user-role"]').select("CAISSIER");
    cy.get('[data-testid="user-submit"]').click();

    cy.location("pathname", { timeout: 15_000 }).should("eq", "/users");
    cy.contains("td", email).should("be.visible");
  });

  it("affiche une erreur si l'email existe déjà", () => {
    cy.visit("/users/nouveau");

    cy.get('[data-testid="user-nom"]').type("Doublon");
    cy.get('[data-testid="user-email"]').type("admin@aerispay.com");
    cy.get('[data-testid="user-password"]').type("TestPass@1234");
    cy.get('[data-testid="user-role"]').select("CAISSIER");
    cy.get('[data-testid="user-submit"]').click();

    cy.get('[data-testid="user-form-error"]')
      .should("be.visible")
      .and("contain", "existe déjà");
  });
});

describe("Gestion des utilisateurs — désactivation (ADMIN)", () => {
  beforeEach(() => {
    cy.loginAsAdmin();
  });

  it("peut désactiver puis réactiver un utilisateur", () => {
    cy.visit("/users");

    cy.contains("tr", "caissier@aerispay.com").within(() => {
      cy.contains("Actif").should("be.visible");
      cy.contains("button", "Désactiver").click();
    });

    cy.contains("tr", "caissier@aerispay.com").within(() => {
      cy.contains("Inactif").should("be.visible");
      cy.contains("button", "Activer").click();
    });

    cy.contains("tr", "caissier@aerispay.com").within(() => {
      cy.contains("Actif").should("be.visible");
    });
  });
});

describe("Gestion des utilisateurs — API protection", () => {
  it("GET /api/users renvoie 403 pour un MANAGER", () => {
    cy.loginAsManager();
    cy.request({ url: "/api/users", failOnStatusCode: false }).then((res) => {
      expect(res.status).to.eq(403);
    });
  });

  it("POST /api/users renvoie 403 pour un CAISSIER", () => {
    cy.loginAsCaissier();
    cy.request({
      method: "POST",
      url: "/api/users",
      body: { nom: "Hack", email: "hack@test.com", motDePasse: "Password123", role: "ADMIN" },
      failOnStatusCode: false,
    }).then((res) => {
      expect(res.status).to.eq(403);
    });
  });
});
