/// <reference types="cypress" />

describe("Activity Logs", () => {
  beforeEach(() => {
    cy.task("clearActivityLogs", null);
  });

  // ─── Access control ───────────────────────────────

  describe("Access control", () => {
    it("ADMIN can access /activity-logs page", () => {
      cy.loginAsAdmin();
      cy.visit("/activity-logs");
      cy.contains("Journal d'activité").should("be.visible");
    });

    it("MANAGER can access /activity-logs page", () => {
      cy.loginAsManager();
      cy.visit("/activity-logs");
      cy.contains("Journal d'activité").should("be.visible");
    });

    it("CAISSIER is redirected away from /activity-logs", () => {
      cy.loginAsCaissier();
      cy.visit("/activity-logs");
      cy.location("pathname").should("eq", "/");
    });

    it("CAISSIER gets 403 on API", () => {
      cy.loginAsCaissier();
      cy.request({
        url: "/api/activity-logs",
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.eq(403);
      });
    });
  });

  // ─── Logging verification ────────────────────────

  describe("Auth logging", () => {
    it("logs AUTH_LOGIN_SUCCESS on successful login", () => {
      // Login triggers AUTH_LOGIN_SUCCESS
      cy.loginAsAdmin();
      cy.visit("/");
      cy.task("getRecentActivityLogs", { action: "AUTH_LOGIN_SUCCESS" }).then(
        (logs) => {
          const typedLogs = logs as Array<{ action: string; actorId: string | null }>;
          expect(typedLogs.length).to.be.greaterThan(0);
          expect(typedLogs[0].action).to.eq("AUTH_LOGIN_SUCCESS");
          expect(typedLogs[0].actorId).to.not.be.null;
        }
      );
    });

    it("logs AUTH_LOGIN_FAILED on bad credentials", () => {
      cy.visit("/login");
      cy.get('[data-testid="login-email"]').clear().type("admin@aerispay.com");
      cy.get('[data-testid="login-password"]').clear().type("WrongPassword123");
      cy.get('[data-testid="login-submit"]').click();
      // Wait for login attempt to complete
      cy.contains("Identifiants invalides", { timeout: 10_000 }).should("be.visible");
      cy.task("getRecentActivityLogs", { action: "AUTH_LOGIN_FAILED" }).then(
        (logs) => {
          const typedLogs = logs as Array<{ action: string; metadata: Record<string, unknown> | null }>;
          expect(typedLogs.length).to.be.greaterThan(0);
          expect(typedLogs[0].action).to.eq("AUTH_LOGIN_FAILED");
          // Must not contain password in metadata
          if (typedLogs[0].metadata) {
            expect(JSON.stringify(typedLogs[0].metadata)).to.not.contain("WrongPassword");
          }
        }
      );
    });
  });

  describe("Product logging", () => {
    it("logs PRODUCT_CREATED when admin creates a product", () => {
      cy.loginAsAdmin();
      cy.request({
        method: "POST",
        url: "/api/produits",
        body: {
          nom: "Produit Test Log",
          categorieId: "",  // will be filled below
          prixAchat: 100,
          prixVente: 200,
          tva: 0,
          unite: "unité",
          stockMinimum: 5,
        },
        failOnStatusCode: false,
      }).then((res) => {
        // Get a valid category first
        cy.request("/api/categories").then((catRes) => {
          const cats = catRes.body.data;
          if (cats.length === 0) return;
          cy.request({
            method: "POST",
            url: "/api/produits",
            body: {
              nom: "Produit Test Log",
              categorieId: cats[0].id,
              prixAchat: 100,
              prixVente: 200,
              tva: 0,
              unite: "unité",
              stockMinimum: 5,
            },
          }).then((createRes) => {
            expect(createRes.status).to.eq(201);
            cy.task("getRecentActivityLogs", { action: "PRODUCT_CREATED" }).then(
              (logs) => {
                const typedLogs = logs as Array<{ action: string; entityType: string | null; entityId: string | null }>;
                expect(typedLogs.length).to.be.greaterThan(0);
                expect(typedLogs[0].entityType).to.eq("Product");
                expect(typedLogs[0].entityId).to.eq(createRes.body.data.id);
              }
            );
          });
        });
      });
    });
  });

  describe("Stock movement logging", () => {
    it("logs STOCK_MOVEMENT_CREATED on stock entry", () => {
      cy.loginAsAdmin();
      // Get a product
      cy.request("/api/produits?pageSize=1").then((res) => {
        const produit = res.body.data[0];
        if (!produit) return;
        cy.request({
          method: "POST",
          url: "/api/stock/mouvements",
          body: {
            produitId: produit.id,
            type: "ENTREE",
            quantite: 5,
            reference: "TEST-LOG",
          },
        }).then((mvtRes) => {
          expect(mvtRes.status).to.eq(201);
          cy.task("getRecentActivityLogs", { action: "STOCK_MOVEMENT_CREATED" }).then(
            (logs) => {
              const typedLogs = logs as Array<{ action: string; entityType: string | null }>;
              expect(typedLogs.length).to.be.greaterThan(0);
              expect(typedLogs[0].entityType).to.eq("StockMovement");
            }
          );
        });
      });
    });
  });

  // ─── Page filters & display ──────────────────────

  describe("Activity logs page display", () => {
    it("shows logs in the table after actions", () => {
      cy.loginAsAdmin();
      // Trigger an action first (create a category)
      cy.request({
        method: "POST",
        url: "/api/categories",
        body: { nom: `CatLog-${Date.now()}`, couleur: "#ff0000" },
      }).then((res) => {
        expect(res.status).to.eq(201);
      });
      // Visit the logs page
      cy.visit("/activity-logs");
      cy.contains("Journal d'activité").should("be.visible");
      // Should see at least the category creation + login
      cy.get("table tbody tr").should("have.length.at.least", 1);
    });

    it("filters by action type", () => {
      cy.loginAsAdmin();
      // Create something to have a log
      cy.request({
        method: "POST",
        url: "/api/categories",
        body: { nom: `CatFilter-${Date.now()}`, couleur: "#00ff00" },
      });
      cy.visit("/activity-logs");
      // Select CATEGORY_CREATED filter
      cy.get('select[name="action"]').select("CATEGORY_CREATED");
      cy.get('button[type="submit"]').click();
      // All visible rows should be CATEGORY_CREATED
      cy.get("table tbody tr").each(($row) => {
        cy.wrap($row).should("contain.text", "Catégorie créée");
      });
    });

    it("ADMIN sees IP column, MANAGER does not", () => {
      // ADMIN
      cy.loginAsAdmin();
      cy.visit("/activity-logs");
      cy.get("table thead").should("contain.text", "IP");

      // MANAGER
      cy.loginAsManager();
      cy.visit("/activity-logs");
      cy.get("table thead").should("not.contain.text", "IP");
    });

    it("no secrets in displayed metadata", () => {
      cy.loginAsAdmin();
      cy.visit("/activity-logs");
      cy.get("table tbody").then(($body) => {
        const text = $body.text();
        expect(text).to.not.contain("motDePasse");
        expect(text).to.not.contain("password");
        expect(text).to.not.contain("NEXTAUTH_SECRET");
      });
    });
  });
});
