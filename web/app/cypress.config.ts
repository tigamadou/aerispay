import { defineConfig } from "cypress";
import { PrismaClient } from "@prisma/client";

const adminEmail = process.env.CYPRESS_ADMIN_EMAIL ?? "admin@aerispay.com";
const adminPassword = process.env.CYPRESS_ADMIN_PASSWORD ?? "Admin@1234";

let prismaPlugin: PrismaClient | null = null;

function getPrismaPlugin(): PrismaClient {
  if (!prismaPlugin) {
    // Use CYPRESS_DB_URL for test DB, fallback to DATABASE_URL
    const url = process.env.CYPRESS_DB_URL ?? process.env.DATABASE_URL;
    prismaPlugin = url
      ? new PrismaClient({ datasources: { db: { url } } })
      : new PrismaClient();
  }
  return prismaPlugin;
}

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
      on("task", {
        async getProduitIdByReference(reference: string) {
          const p = await getPrismaPlugin().produit.findFirst({ where: { reference } });
          if (!p) {
            throw new Error(
              `Produit "${reference}" introuvable. Exécuter \`npx prisma db seed\` avant les e2e.`
            );
          }
          return p.id;
        },
        async cleanVentesForUser(email: string) {
          const prisma = getPrismaPlugin();
          const user = await prisma.user.findFirst({ where: { email } });
          if (!user) return null;
          const sessions = await prisma.caisseSession.findMany({
            where: { userId: user.id },
            select: { id: true },
          });
          const sessionIds = sessions.map((s) => s.id);
          if (sessionIds.length > 0) {
            await prisma.paiement.deleteMany({ where: { vente: { sessionId: { in: sessionIds } } } });
            await prisma.ligneVente.deleteMany({ where: { vente: { sessionId: { in: sessionIds } } } });
            await prisma.vente.deleteMany({ where: { sessionId: { in: sessionIds } } });
          }
          return null;
        },
        async getRecentActivityLogs(params: { action?: string; limit?: number }) {
          const prisma = getPrismaPlugin();
          const logs = await prisma.activityLog.findMany({
            where: params.action ? { action: params.action } : undefined,
            orderBy: { createdAt: "desc" },
            take: params.limit ?? 5,
            include: { actor: { select: { id: true, nom: true, email: true } } },
          });
          return logs.map((l) => ({
            id: l.id,
            action: l.action,
            entityType: l.entityType,
            entityId: l.entityId,
            actorId: l.actorId,
            actorEmail: l.actor?.email ?? null,
            metadata: l.metadata,
            createdAt: l.createdAt.toISOString(),
          }));
        },
        async clearActivityLogs(_: null) {
          await getPrismaPlugin().activityLog.deleteMany({});
          return null;
        },
        async closeOpenSessions(email: string) {
          const prisma = getPrismaPlugin();
          const user = await prisma.user.findFirst({ where: { email } });
          if (!user) return null;
          await prisma.caisseSession.updateMany({
            where: { userId: user.id, statut: "OUVERTE" },
            data: { statut: "FERMEE", fermetureAt: new Date(), montantFermeture: 0 },
          });
          return null;
        },
      });
      on("after:run", async () => {
        if (prismaPlugin) {
          await prismaPlugin.$disconnect();
          prismaPlugin = null;
        }
      });
      return config;
    },
  },
});
