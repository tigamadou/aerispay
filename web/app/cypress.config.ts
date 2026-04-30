import { defineConfig } from "cypress";

const adminEmail = process.env.CYPRESS_ADMIN_EMAIL ?? "admin@aerispay.com";
const adminPassword = process.env.CYPRESS_ADMIN_PASSWORD ?? "Admin@1234";

export default defineConfig({
  component: {
    devServer: {
      framework: "next",
      bundler: "webpack",
    },
  },

  e2e: {
    baseUrl: process.env.CYPRESS_BASE_URL ?? "http://aerispay.localhost",
    specPattern: "cypress/e2e/**/*.cy.{ts,tsx}",
    supportFile: "cypress/support/e2e.ts",
    defaultCommandTimeout: 15_000,
    pageLoadTimeout: 30_000,
    video: false,
    env: {
      ADMIN_EMAIL: adminEmail,
      ADMIN_PASSWORD: adminPassword,
    },
    setupNodeEvents(on, config) {
      return config;
    },
  },
});
