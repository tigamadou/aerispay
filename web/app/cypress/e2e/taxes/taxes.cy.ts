/**
 * e2e — Taxes : page `/taxes`, CRUD API, acces controle.
 */

describe("Taxes — Access control", () => {
  it("ADMIN can access /taxes page", () => {
    cy.loginAsAdmin();
    cy.visit("/taxes");
    cy.contains("h1", "Taxes").should("be.visible");
  });

  it("CAISSIER is redirected away from /taxes", () => {
    cy.loginAsCaissier();
    cy.visit("/taxes");
    cy.location("pathname").should("eq", "/");
  });

  it("MANAGER is redirected away from /taxes", () => {
    cy.loginAsManager();
    cy.visit("/taxes");
    cy.location("pathname").should("eq", "/");
  });
});

describe("Taxes — API access control", () => {
  it("GET /api/taxes returns 401 without session", () => {
    cy.request({
      url: "/api/taxes",
      failOnStatusCode: false,
      headers: { cookie: "" },
    })
      .its("status")
      .should("eq", 401);
  });

  it("GET /api/taxes returns 200 for any authenticated user", () => {
    cy.loginAsCaissier();
    cy.request("/api/taxes").its("status").should("eq", 200);
  });

  it("POST /api/taxes returns 403 for CAISSIER", () => {
    cy.loginAsCaissier();
    cy.request({
      method: "POST",
      url: "/api/taxes",
      body: { nom: "Test", taux: 10 },
      failOnStatusCode: false,
    })
      .its("status")
      .should("eq", 403);
  });

  it("POST /api/taxes returns 403 for MANAGER", () => {
    cy.loginAsManager();
    cy.request({
      method: "POST",
      url: "/api/taxes",
      body: { nom: "Test", taux: 10 },
      failOnStatusCode: false,
    })
      .its("status")
      .should("eq", 403);
  });
});

describe("Taxes — CRUD via API", () => {
  let taxeId: string;

  it("ADMIN creates a tax", () => {
    cy.loginAsAdmin();
    cy.request("POST", "/api/taxes", {
      nom: "TVA E2E",
      taux: 18,
      active: true,
      ordre: 0,
    }).then((res) => {
      expect(res.status).to.eq(201);
      expect(res.body.data.nom).to.eq("TVA E2E");
      expect(Number(res.body.data.taux)).to.eq(18);
      taxeId = res.body.data.id;
    });
  });

  it("ADMIN updates the tax", () => {
    cy.loginAsAdmin();
    cy.request("PUT", `/api/taxes/${taxeId}`, {
      nom: "TVA modifiee",
      taux: 20,
    }).then((res) => {
      expect(res.status).to.eq(200);
      expect(res.body.data.nom).to.eq("TVA modifiee");
      expect(Number(res.body.data.taux)).to.eq(20);
    });
  });

  it("ADMIN toggles the tax inactive", () => {
    cy.loginAsAdmin();
    cy.request("PUT", `/api/taxes/${taxeId}`, {
      active: false,
    }).then((res) => {
      expect(res.status).to.eq(200);
      expect(res.body.data.active).to.eq(false);
    });
  });

  it("ADMIN deletes the tax", () => {
    cy.loginAsAdmin();
    cy.request("DELETE", `/api/taxes/${taxeId}`).then((res) => {
      expect(res.status).to.eq(200);
    });
  });

  it("GET /api/taxes no longer contains deleted tax", () => {
    cy.loginAsAdmin();
    cy.request("/api/taxes").then((res) => {
      const ids = (res.body.data as { id: string }[]).map((t) => t.id);
      expect(ids).to.not.include(taxeId);
    });
  });
});

describe("Taxes — validation", () => {
  it("rejects empty nom", () => {
    cy.loginAsAdmin();
    cy.request({
      method: "POST",
      url: "/api/taxes",
      body: { nom: "", taux: 10 },
      failOnStatusCode: false,
    })
      .its("status")
      .should("eq", 400);
  });

  it("rejects taux > 100", () => {
    cy.loginAsAdmin();
    cy.request({
      method: "POST",
      url: "/api/taxes",
      body: { nom: "Invalid", taux: 150 },
      failOnStatusCode: false,
    })
      .its("status")
      .should("eq", 400);
  });

  it("rejects negative taux", () => {
    cy.loginAsAdmin();
    cy.request({
      method: "POST",
      url: "/api/taxes",
      body: { nom: "Invalid", taux: -5 },
      failOnStatusCode: false,
    })
      .its("status")
      .should("eq", 400);
  });
});

describe("Taxes — UI interactions", () => {
  before(() => {
    // Clean up any leftover test taxes
    cy.loginAsAdmin();
    cy.request("/api/taxes").then((res) => {
      const taxes = res.body.data as { id: string; nom: string }[];
      taxes
        .filter((t) => t.nom.startsWith("UI Test"))
        .forEach((t) => {
          cy.request("DELETE", `/api/taxes/${t.id}`);
        });
    });
  });

  it("adds a tax via the form", () => {
    cy.loginAsAdmin();
    cy.visit("/taxes");

    cy.contains("Ajouter une taxe").click();
    cy.get('input[placeholder*="TVA"]').type("UI Test TVA");
    cy.get('input[type="number"]').type("18");
    cy.contains("button", "Ajouter").click();

    cy.contains("Taxe ajoutee").should("be.visible");
    cy.contains("UI Test TVA").should("be.visible");
    cy.contains("18%").should("be.visible");
  });

  it("edits a tax via the form", () => {
    cy.loginAsAdmin();
    cy.visit("/taxes");

    cy.contains("UI Test TVA")
      .closest("div[class*='flex items-center justify-between']")
      .within(() => {
        cy.get('button[aria-label="Modifier"]').click();
      });

    cy.get('input[placeholder*="TVA"]').clear().type("UI Test TVA Modifiee");
    cy.contains("button", "Mettre a jour").click();

    cy.contains("Taxe mise a jour").should("be.visible");
    cy.contains("UI Test TVA Modifiee").should("be.visible");
  });

  it("deletes a tax via the UI", () => {
    cy.loginAsAdmin();
    cy.visit("/taxes");

    cy.contains("UI Test TVA Modifiee")
      .closest("div[class*='flex items-center justify-between']")
      .within(() => {
        cy.get('button[aria-label="Supprimer"]').click();
      });

    cy.contains("Taxe supprimee").should("be.visible");
    cy.contains("UI Test TVA Modifiee").should("not.exist");
  });
});

describe("Taxes — Activity log integration", () => {
  it("logs TAXE_CREATED when admin creates a tax", () => {
    cy.loginAsAdmin();
    cy.task("clearActivityLogs", null);

    cy.request("POST", "/api/taxes", {
      nom: "Log Test Tax",
      taux: 5,
      active: true,
    }).then((res) => {
      expect(res.status).to.eq(201);
      const taxeId = res.body.data.id;

      cy.task("getRecentActivityLogs", { action: "TAXE_CREATED" }).then(
        (logs) => {
          const typedLogs = logs as Array<{
            action: string;
            entityType: string | null;
            entityId: string | null;
          }>;
          expect(typedLogs.length).to.be.greaterThan(0);
          expect(typedLogs[0].entityType).to.eq("Taxe");
          expect(typedLogs[0].entityId).to.eq(taxeId);
        }
      );

      // Cleanup
      cy.request("DELETE", `/api/taxes/${taxeId}`);
    });
  });
});
