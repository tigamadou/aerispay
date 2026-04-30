/// <reference types="cypress" />

function hasSessionCookie(cookies: Cypress.Cookie[]): boolean {
  return cookies.some(
    (c) =>
      /authjs|next-auth|session/i.test(c.name) &&
      !/csrf/i.test(c.name) &&
      Boolean(c.value?.length),
  );
}

function loginWith(role: string, email: string, password: string) {
  cy.session(
    ["aerispay", role, email],
    () => {
      cy.visit("/login");
      cy.get('[data-testid="login-email"]').clear().type(email);
      cy.get('[data-testid="login-password"]').clear().type(password, { log: false });
      cy.get('[data-testid="login-submit"]').click();
      cy.location("pathname", { timeout: 30_000 }).should("eq", "/");
      cy.getCookies().then((cookies) => {
        expect(hasSessionCookie(cookies), "cookie de session").to.be.true;
      });
    },
    {
      validate() {
        cy.getCookies().then((cookies) => {
          expect(hasSessionCookie(cookies), "cookie de session valide").to.be.true;
        });
      },
    },
  );
}

Cypress.Commands.add("loginAsAdmin", () => {
  const email = Cypress.env("ADMIN_EMAIL") as string;
  const password = Cypress.env("ADMIN_PASSWORD") as string;
  loginWith("admin", email, password);
});

Cypress.Commands.add("loginAsManager", () => {
  loginWith("manager", "gerant@aerispay.com", "Gerant@1234");
});

Cypress.Commands.add("loginAsCaissier", () => {
  loginWith("caissier", "caissier@aerispay.com", "Caissier@1234");
});

Cypress.Commands.add("closeOpenSessions", (email: string) => {
  cy.task("closeOpenSessions", email);
});

export {};

declare global {
  namespace Cypress {
    interface Chainable {
      loginAsAdmin(): Chainable<void>;
      loginAsManager(): Chainable<void>;
      loginAsCaissier(): Chainable<void>;
      closeOpenSessions(email: string): Chainable<void>;
    }
  }
}
