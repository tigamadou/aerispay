/**
 * e2e — Module caisse : mouvements de caisse, soldes, écarts.
 */

describe("Caisse — API mouvements", () => {
  let sessionId: string;

  before(() => {
    cy.closeOpenSessions("caissier@aerispay.com");
    cy.loginAsCaissier();
    cy.ensureCaisseFunded();
    cy.request("POST", "/api/comptoir/sessions", {
      montantOuvertureCash: 50_000,
    }).then((res) => {
      expect(res.status).to.eq(201);
      sessionId = res.body.data.id as string;
    });
  });

  it("POST /api/comptoir/movements crée un apport", () => {
    cy.loginAsCaissier();
    cy.request("POST", "/api/comptoir/movements", {
      type: "APPORT",
      mode: "ESPECES",
      montant: 5000,
      motif: "Apport test e2e",
    }).then((res) => {
      expect(res.status).to.eq(201);
      expect(res.body.data).to.have.property("id");
      expect(res.body.data.type).to.eq("APPORT");
    });
  });

  it("GET /api/comptoir/movements liste les mouvements", () => {
    cy.loginAsCaissier();
    cy.request("/api/comptoir/movements").then((res) => {
      expect(res.status).to.eq(200);
      expect(res.body.data).to.be.an("array");
    });
  });

  it("GET /api/comptoir/sessions/:id/movements liste les mouvements de session", () => {
    cy.loginAsCaissier();
    cy.request(`/api/comptoir/sessions/${sessionId}/movements`).then((res) => {
      expect(res.status).to.eq(200);
      expect(res.body.data).to.be.an("array");
    });
  });
});

describe("Caisse — API soldes", () => {
  it("GET /api/caisse/:id/soldes renvoie les soldes", () => {
    cy.loginAsCaissier();
    cy.request("/api/caisse").then((caisseRes) => {
      if (caisseRes.body.data && caisseRes.body.data.id) {
        const caisseId = caisseRes.body.data.id as string;
        cy.request(`/api/caisse/${caisseId}/soldes`).then((res) => {
          expect(res.status).to.eq(200);
          expect(res.body.data).to.exist;
        });
      }
    });
  });
});

describe("Caisse — Contrôle d'accès API", () => {
  it("POST /api/comptoir/movements renvoie 401 sans session", () => {
    cy.request({
      method: "POST",
      url: "/api/comptoir/movements",
      failOnStatusCode: false,
      headers: { cookie: "" },
      body: { type: "APPORT", mode: "ESPECES", montant: 1000 },
    })
      .its("status")
      .should("eq", 401);
  });

  it("GET /api/comptoir/discrepancies renvoie 403 pour un CAISSIER", () => {
    cy.loginAsCaissier();
    cy.request({
      url: "/api/comptoir/discrepancies",
      failOnStatusCode: false,
    })
      .its("status")
      .should("eq", 403);
  });

  it("GET /api/comptoir/discrepancies renvoie 200 pour un MANAGER", () => {
    cy.loginAsManager();
    cy.request("/api/comptoir/discrepancies").then((res) => {
      expect(res.status).to.eq(200);
      expect(res.body.data).to.be.an("array");
    });
  });
});
