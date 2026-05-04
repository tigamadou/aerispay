/**
 * e2e — Module stock : produits, catégories, mouvements.
 */

describe("Stock — Navigation & accès", () => {
  it("affiche le lien Stock dans la sidebar", () => {
    cy.loginAsAdmin();
    cy.visit("/");
    cy.contains("a", "Stock").should("be.visible");
  });

  it("CAISSIER peut accéder à la page stock", () => {
    cy.loginAsCaissier();
    cy.visit("/stock");
    cy.contains("h1", /produits|stock/i).should("be.visible");
  });
});

describe("Stock — Produits", () => {
  beforeEach(() => {
    cy.loginAsAdmin();
  });

  it("affiche la liste des produits", () => {
    cy.visit("/stock");
    cy.contains("h1", /produits|stock/i).should("be.visible");
    cy.get("table tbody tr").should("have.length.at.least", 1);
  });

  it("affiche le détail d'un produit", () => {
    cy.visit("/stock");
    cy.get("table tbody tr").first().find("a").first().click();
    cy.location("pathname").should("match", /\/stock\/[a-z0-9-]+/);
    cy.contains(/détail|produit/i).should("be.visible");
  });

  it("page création de produit est accessible", () => {
    cy.visit("/stock/nouveau");
    cy.contains(/nouveau|créer|ajouter/i).should("be.visible");
    cy.get("form").should("exist");
  });
});

describe("Stock — Catégories", () => {
  beforeEach(() => {
    cy.loginAsAdmin();
  });

  it("affiche la page des catégories", () => {
    cy.visit("/stock/categories");
    cy.contains(/catégorie/i).should("be.visible");
  });
});

describe("Stock — Mouvements", () => {
  beforeEach(() => {
    cy.loginAsAdmin();
  });

  it("affiche la page des mouvements de stock", () => {
    cy.visit("/stock/mouvements");
    cy.contains(/mouvement/i).should("be.visible");
  });
});

describe("Stock — API", () => {
  it("GET /api/produits renvoie 200 pour un utilisateur authentifié", () => {
    cy.loginAsAdmin();
    cy.request("/api/produits").its("status").should("eq", 200);
  });

  it("GET /api/produits renvoie 401 sans session", () => {
    cy.request({
      url: "/api/produits",
      failOnStatusCode: false,
      headers: { cookie: "" },
    })
      .its("status")
      .should("eq", 401);
  });

  it("GET /api/categories renvoie 200", () => {
    cy.loginAsAdmin();
    cy.request("/api/categories").its("status").should("eq", 200);
  });

  it("GET /api/stock/mouvements renvoie 200", () => {
    cy.loginAsAdmin();
    cy.request("/api/stock/mouvements").its("status").should("eq", 200);
  });

  it("GET /api/stock/alertes renvoie 200", () => {
    cy.loginAsAdmin();
    cy.request("/api/stock/alertes").its("status").should("eq", 200);
  });

  it("POST /api/produits crée un produit", () => {
    cy.loginAsAdmin();
    const ref = `TEST-${Date.now()}`;
    cy.request("POST", "/api/produits", {
      nom: "Produit Test E2E",
      reference: ref,
      prixAchat: 500,
      prixVente: 1000,
      quantiteStock: 10,
      seuilAlerte: 2,
      categorieId: null,
    }).then((res) => {
      expect(res.status).to.eq(201);
      expect(res.body.data).to.have.property("id");
      expect(res.body.data.reference).to.eq(ref);
    });
  });
});
