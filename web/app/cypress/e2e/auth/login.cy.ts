/**
 * e2e — pages d’authentification (`/login`).
 * Pré-requis : `npm run dev` (ou stack équivalente) + base migrée/seed
 * (`admin@aerispay.com` / `Admin@1234` par défaut, overridable via CYPRESS_ADMIN_*).
 */
describe("Authentification — /login", () => {
  beforeEach(() => {
    cy.clearAllCookies();
    cy.clearAllLocalStorage();
  });

  it("affiche le formulaire (AerisPay, email, mot de passe, envoi)", () => {
    cy.visit("/login");
    cy.get('[data-testid="login-form"]').should("be.visible");
    cy.get("h1").contains("AerisPay");
    cy.contains("Connexion au comptoir");
    cy.get('[data-testid="login-email"]').should("be.visible");
    cy.get('[data-testid="login-password"]').should("be.visible");
    cy.get('[data-testid="login-submit"]').should("be.visible").and("contain", "Se connecter");
  });

  it("redirige la page d'accueil / vers /login quand on n'est pas connecté", () => {
    cy.visit("/");
    cy.location("pathname").should("eq", "/login");
  });

  it("affichage d'une erreur en cas d'identifiants invalides", () => {
    const email = Cypress.env("ADMIN_EMAIL") as string;
    cy.visit("/login");
    cy.get('[data-testid="login-email"]').type(email);
    cy.get('[data-testid="login-password"]').type("mauvais_mot_de_passe_invalide");
    cy.get('[data-testid="login-submit"]').click();
    cy.get('[data-testid="login-error"]')
      .should("be.visible")
      .and("contain", "Email ou mot de passe incorrect");
    cy.location("pathname").should("eq", "/login");
  });

  it("connexion admin (seed) puis accès au tableau de bord", () => {
    const email = Cypress.env("ADMIN_EMAIL") as string;
    const password = Cypress.env("ADMIN_PASSWORD") as string;
    expect(email, "ADMIN_EMAIL").to.be.a("string").and.not.empty;

    cy.visit("/login");
    cy.get('[data-testid="login-email"]').clear().type(email);
    cy.get('[data-testid="login-password"]').clear().type(password, { log: false });
    cy.get('[data-testid="login-submit"]').click();
    cy.location("pathname", { timeout: 25_000 }).should("eq", "/");
    cy.contains("h1", "Tableau de bord", { timeout: 20_000 }).should("be.visible");
  });

  it("redirige /login vers / lorsque la session est déjà active", () => {
    cy.loginAsAdmin();
    cy.visit("/login");
    cy.location("pathname", { timeout: 20_000 }).should("eq", "/");
  });
});
