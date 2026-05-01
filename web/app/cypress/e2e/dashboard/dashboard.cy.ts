/**
 * e2e — Dashboard : page d'accueil, KPIs, accès par rôle.
 */

describe("Dashboard — Affichage", () => {
  it("ADMIN voit le dashboard avec les KPI", () => {
    cy.loginAsAdmin();
    cy.visit("/");
    cy.contains(/tableau de bord|dashboard/i).should("be.visible");
  });

  it("MANAGER voit le dashboard", () => {
    cy.loginAsManager();
    cy.visit("/");
    cy.contains(/tableau de bord|dashboard/i).should("be.visible");
  });

  it("CAISSIER voit le dashboard", () => {
    cy.loginAsCaissier();
    cy.visit("/");
    cy.location("pathname").should("eq", "/");
  });
});

describe("Dashboard — API KPIs", () => {
  it("GET /api/dashboard/kpis renvoie 200 pour un ADMIN", () => {
    cy.loginAsAdmin();
    cy.request("/api/dashboard/kpis").then((res) => {
      expect(res.status).to.eq(200);
      expect(res.body.data).to.exist;
    });
  });

  it("GET /api/dashboard/kpis renvoie 200 pour un MANAGER", () => {
    cy.loginAsManager();
    cy.request("/api/dashboard/kpis").then((res) => {
      expect(res.status).to.eq(200);
    });
  });

  it("GET /api/dashboard/kpis renvoie 401 sans session", () => {
    cy.request({
      url: "/api/dashboard/kpis",
      failOnStatusCode: false,
      headers: { cookie: "" },
    })
      .its("status")
      .should("eq", 401);
  });
});
