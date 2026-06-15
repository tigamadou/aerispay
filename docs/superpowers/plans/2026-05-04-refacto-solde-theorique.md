# Refactorisation du solde theorique Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Le solde theorique de caisse doit etre calcule depuis le grand livre (`computeSoldeCaisseParMode`) au lieu du montant declare a l'ouverture. Les declarations d'ouverture passent d'un format scalaire (cash/mobileMoney) a un JSON dynamique par mode de paiement.

**Architecture:** L'API POST d'ouverture de session accepte un format `{ declarations: Record<string, number> }` et compare au grand livre par mode. Le GET session/[id] et le POST closure calculent le theorique depuis `computeSoldeCaisseParMode(caisseId)`. Deux nouveaux champs JSON (`declarationsOuverture`, `ecartsOuverture`) sont ajoutes au modele `ComptoirSession`. Les anciens champs scalaires sont alimentes pour retrocompatibilite mais ne sont plus lus.

**Tech Stack:** Next.js 14 (App Router), Prisma (MySQL), Zod, Vitest, TypeScript

**Spec:** `docs/superpowers/specs/2026-05-04-refacto-solde-theorique-design.md`

---

### Task 1: Migration Prisma — nouveaux champs JSON

**Files:**
- Modify: `web/app/prisma/schema.prisma:122-177`

- [ ] **Step 1: Ajouter les champs au schema Prisma**

Dans le modele `ComptoirSession`, ajouter apres le champ `demandeCloturAt` :

```prisma
  // Déclarations ouverture par mode — JSON { mode: montant }
  declarationsOuverture Json?
  // Écarts ouverture par mode — JSON [{ mode, theorique, declare, ecart, categorie }]
  ecartsOuverture       Json?
```

- [ ] **Step 2: Generer la migration**

Run: `cd web/app && npx prisma migrate dev --name add-declarations-ouverture-json`
Expected: Migration creee et appliquee, `prisma generate` execute.

- [ ] **Step 3: Verifier que le client Prisma est regenere**

Run: `cd web/app && npx prisma generate`
Expected: `Generated Prisma Client`

- [ ] **Step 4: Commit**

```bash
git add web/app/prisma/
git commit -m "db: add declarationsOuverture and ecartsOuverture JSON fields"
```

---

### Task 2: Schema de validation — nouveau format d'ouverture

**Files:**
- Modify: `web/app/src/lib/validations/session.ts`
- Test: `web/app/src/__tests__/comptoir/api.test.ts`

- [ ] **Step 1: Ecrire les tests de validation du nouveau schema**

Ajouter un describe dans `web/app/src/__tests__/comptoir/api.test.ts` au debut du fichier, apres les imports existants et avant le describe `POST /api/comptoir/sessions` :

```typescript
import { openSessionSchema } from "@/lib/validations/session";

describe("openSessionSchema validation", () => {
  it("accepts declarations as Record<string, number>", () => {
    const result = openSessionSchema.safeParse({
      declarations: { ESPECES: 50000, MOBILE_MONEY_MTN: 10000 },
    });
    expect(result.success).toBe(true);
  });

  it("accepts declarations with confirmeEcart", () => {
    const result = openSessionSchema.safeParse({
      declarations: { ESPECES: 50000 },
      confirmeEcart: true,
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty declarations", () => {
    const result = openSessionSchema.safeParse({
      declarations: {},
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative amounts", () => {
    const result = openSessionSchema.safeParse({
      declarations: { ESPECES: -100 },
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing declarations", () => {
    const result = openSessionSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Verifier que les tests echouent**

Run: `cd web/app && npx vitest run src/__tests__/comptoir/api.test.ts`
Expected: Les nouveaux tests echouent car le schema attend encore `montantOuvertureCash`.

- [ ] **Step 3: Modifier le schema de validation**

Remplacer le contenu de `web/app/src/lib/validations/session.ts` :

```typescript
import { z } from "zod";

export const openSessionSchema = z.object({
  declarations: z.record(
    z.string().min(1),
    z.number().min(0, "Le montant doit être positif ou nul"),
  ).refine(
    (obj) => Object.keys(obj).length > 0,
    "Au moins un mode de paiement doit être déclaré",
  ),
  confirmeEcart: z.boolean().optional(),
});

// Conservé pour rétrocompatibilité — la nouvelle clôture utilise
// declarationCloturSchema dans mouvement-caisse.ts
export const closeSessionSchema = z.object({
  montantFermetureCash: z
    .number()
    .min(0, "Le montant cash doit être positif ou nul"),
  montantFermetureMobileMoney: z
    .number()
    .min(0, "Le montant mobile money doit être positif ou nul"),
  notes: z.string().max(500).optional(),
});

export type OpenSessionInput = z.infer<typeof openSessionSchema>;
export type CloseSessionInput = z.infer<typeof closeSessionSchema>;
```

- [ ] **Step 4: Verifier que les tests du schema passent**

Run: `cd web/app && npx vitest run src/__tests__/comptoir/api.test.ts -t "openSessionSchema"`
Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add web/app/src/lib/validations/session.ts web/app/src/__tests__/comptoir/api.test.ts
git commit -m "feat: openSessionSchema uses declarations Record<string, number>"
```

---

### Task 3: API POST ouverture — declarations par mode + ecarts grand livre

**Files:**
- Modify: `web/app/src/app/api/comptoir/sessions/route.ts`
- Test: `web/app/src/__tests__/comptoir/api.test.ts`

- [ ] **Step 1: Ecrire les tests pour la nouvelle logique d'ouverture**

Remplacer les tests existants du describe `POST /api/comptoir/sessions` dans `web/app/src/__tests__/comptoir/api.test.ts`. Mettre a jour `mockOpenSession` pour inclure les nouveaux champs et adapter tous les tests pour envoyer `declarations` au lieu de `montantOuvertureCash` :

```typescript
const mockOpenSession = {
  id: "session-1",
  ouvertureAt: new Date("2026-04-30T08:00:00Z"),
  fermetureAt: null,
  montantOuvertureCash: 50000,
  montantOuvertureMobileMoney: 0,
  declarationsOuverture: { ESPECES: 50000 },
  ecartsOuverture: null,
  montantFermetureCash: null,
  montantFermetureMobileMoney: null,
  statut: "OUVERTE",
  notes: null,
  userId: "user-1",
};
```

Dans le describe `POST /api/comptoir/sessions`, remplacer tous les `body: JSON.stringify({ montantOuvertureCash: 50000 })` par `body: JSON.stringify({ declarations: { ESPECES: 50000 } })`.

Ajouter ces tests supplementaires dans le meme describe :

```typescript
  it("returns 409 with requiresConfirmation when declared < solde (deficit)", async () => {
    mockSession("CAISSIER");
    (prisma.caisse.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "caisse-1", active: true });

    const { computeSoldeCaisseParMode } = await import("@/lib/services/cash-movement");
    (computeSoldeCaisseParMode as ReturnType<typeof vi.fn>).mockResolvedValue([
      { mode: "ESPECES", solde: 80000 },
    ]);

    const res = await POST(
      new Request("http://localhost/api/comptoir/sessions", {
        method: "POST",
        body: JSON.stringify({ declarations: { ESPECES: 50000 } }),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.requiresConfirmation).toBe(true);
    expect(body.ecarts).toBeDefined();
    expect(body.ecarts.ESPECES.ecart).toBe(-30000);
  });

  it("returns 409 with requiresConfirmation when declared > solde (surplus)", async () => {
    mockSession("CAISSIER");
    (prisma.caisse.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "caisse-1", active: true });

    const { computeSoldeCaisseParMode } = await import("@/lib/services/cash-movement");
    (computeSoldeCaisseParMode as ReturnType<typeof vi.fn>).mockResolvedValue([
      { mode: "ESPECES", solde: 30000 },
    ]);

    const res = await POST(
      new Request("http://localhost/api/comptoir/sessions", {
        method: "POST",
        body: JSON.stringify({ declarations: { ESPECES: 50000 } }),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.requiresConfirmation).toBe(true);
  });

  it("creates session when confirmeEcart is true despite ecart", async () => {
    mockSession("CAISSIER");
    mockTransactionPassthrough();
    (prisma.comptoirSession.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.caisse.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "caisse-1", active: true });

    const { computeSoldeCaisseParMode } = await import("@/lib/services/cash-movement");
    (computeSoldeCaisseParMode as ReturnType<typeof vi.fn>).mockResolvedValue([
      { mode: "ESPECES", solde: 80000 },
    ]);

    (prisma.comptoirSession.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockOpenSession,
      declarationsOuverture: { ESPECES: 50000 },
      ecartsOuverture: [{ mode: "ESPECES", theorique: 80000, declare: 50000, ecart: -30000, categorie: "MAJEUR" }],
    });

    const res = await POST(
      new Request("http://localhost/api/comptoir/sessions", {
        method: "POST",
        body: JSON.stringify({ declarations: { ESPECES: 50000 }, confirmeEcart: true }),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.ecartsOuverture).toBeDefined();
  });

  it("creates session without ecarts when declared matches solde", async () => {
    mockSession("CAISSIER");
    mockTransactionPassthrough();
    (prisma.comptoirSession.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.caisse.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "caisse-1", active: true });

    const { computeSoldeCaisseParMode } = await import("@/lib/services/cash-movement");
    (computeSoldeCaisseParMode as ReturnType<typeof vi.fn>).mockResolvedValue([
      { mode: "ESPECES", solde: 50000 },
    ]);

    (prisma.comptoirSession.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockOpenSession,
      declarationsOuverture: { ESPECES: 50000 },
      ecartsOuverture: null,
    });

    const res = await POST(
      new Request("http://localhost/api/comptoir/sessions", {
        method: "POST",
        body: JSON.stringify({ declarations: { ESPECES: 50000 } }),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.ecartsOuverture).toBeNull();
  });
```

- [ ] **Step 2: Verifier que les nouveaux tests echouent**

Run: `cd web/app && npx vitest run src/__tests__/comptoir/api.test.ts`
Expected: Les tests d'ouverture echouent (l'API attend encore `montantOuvertureCash`).

- [ ] **Step 3: Recrire le POST de la route d'ouverture**

Remplacer la fonction `POST` dans `web/app/src/app/api/comptoir/sessions/route.ts` :

```typescript
import { prisma } from "@/lib/db";
import { requireAuth, hasPermission } from "@/lib/permissions";
import { openSessionSchema } from "@/lib/validations/session";
import { logActivity, ACTIONS, getClientIp, getClientUserAgent } from "@/lib/activity-log";
import { computeSoldeCaisseParMode } from "@/lib/services/cash-movement";

export async function GET() {
  const result = await requireAuth();
  if (!result.authenticated) return result.response;

  try {
    const where = result.user.role === "CAISSIER"
      ? { userId: result.user.id }
      : {};

    const sessions = await prisma.comptoirSession.findMany({
      where,
      orderBy: { ouvertureAt: "desc" },
      include: { user: { select: { id: true, nom: true, email: true } } },
    });

    return Response.json({ data: sessions });
  } catch (error) {
    console.error("[GET /api/comptoir/sessions]", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const result = await requireAuth();
  if (!result.authenticated) return result.response;
  if (!hasPermission(result.user.role, "comptoir:vendre")) {
    return Response.json({ error: "Acces refuse" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const parsed = openSessionSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Données invalides", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const declarations = parsed.data.declarations;

    // Resolve active caisse
    const caisse = await prisma.caisse.findFirst({ where: { active: true }, select: { id: true } });
    if (!caisse) {
      return Response.json(
        { error: "Aucune caisse active configuree" },
        { status: 422 },
      );
    }

    // Grand livre = source de verite
    const soldes = await computeSoldeCaisseParMode(caisse.id);
    const soldeTotal = soldes.reduce((sum, s) => sum + s.solde, 0);
    if (soldeTotal <= 0) {
      return Response.json(
        { error: "Impossible d'ouvrir une session : le solde de la caisse est a zero. Effectuez un apport de fonds d'abord." },
        { status: 422 },
      );
    }

    // Build soldes map from grand livre
    const soldesMap = new Map<string, number>();
    for (const s of soldes) {
      soldesMap.set(s.mode, s.solde);
    }

    // Compare declarations to grand livre par mode
    const allModes = new Set([...soldesMap.keys(), ...Object.keys(declarations)]);
    interface EcartOuverture {
      mode: string;
      theorique: number;
      declare: number;
      ecart: number;
      categorie: "MINEUR" | "MOYEN" | "MAJEUR" | null;
    }
    const ecarts: EcartOuverture[] = [];

    for (const mode of allModes) {
      const theorique = soldesMap.get(mode) ?? 0;
      const declare = declarations[mode] ?? 0;
      const ecart = declare - theorique;
      if (Math.abs(ecart) > 0.01) {
        ecarts.push({
          mode,
          theorique,
          declare,
          ecart,
          categorie: Math.abs(ecart) > 5000 ? "MAJEUR" : Math.abs(ecart) > 500 ? "MOYEN" : "MINEUR",
        });
      }
    }

    const hasEcart = ecarts.length > 0;

    // If ecart detected and not confirmed, require confirmation
    if (hasEcart && !parsed.data.confirmeEcart) {
      const ecartsObj: Record<string, { theorique: number; declare: number; ecart: number; categorie: string }> = {};
      for (const e of ecarts) {
        ecartsObj[e.mode] = { theorique: e.theorique, declare: e.declare, ecart: e.ecart, categorie: e.categorie ?? "MINEUR" };
      }
      return Response.json(
        {
          requiresConfirmation: true,
          message: "Le montant declare differe du solde de la caisse. Confirmez-vous l'ouverture ?",
          ecarts: ecartsObj,
        },
        { status: 409 },
      );
    }

    // Retrocompat: extract cash / mobileMoney from declarations
    const montantOuvertureCash = declarations.ESPECES ?? 0;
    const montantOuvertureMobileMoney = Object.entries(declarations)
      .filter(([k]) => k !== "ESPECES")
      .reduce((sum, [, v]) => sum + v, 0);

    // Atomically check for existing open session + create
    const session = await prisma.$transaction(async (tx) => {
      const existing = await tx.comptoirSession.findFirst({
        where: { userId: result.user.id, statut: "OUVERTE" },
      });
      if (existing) return null;

      return tx.comptoirSession.create({
        data: {
          montantOuvertureCash,
          montantOuvertureMobileMoney,
          declarationsOuverture: declarations,
          ecartsOuverture: hasEcart ? ecarts : undefined,
          userId: result.user.id,
        },
        include: { user: { select: { id: true, nom: true, email: true } } },
      });
    });

    if (!session) {
      return Response.json(
        { error: "Vous avez déjà une session de comptoir ouverte" },
        { status: 409 },
      );
    }

    const logMetadata: Record<string, unknown> = {
      declarations,
      ouvertureAt: session.ouvertureAt.toISOString(),
    };
    if (hasEcart) {
      logMetadata.ecartsOuverture = ecarts;
    }

    await logActivity({
      action: ACTIONS.COMPTOIR_SESSION_OPENED,
      actorId: result.user.id,
      entityType: "ComptoirSession",
      entityId: session.id,
      metadata: logMetadata,
      ipAddress: getClientIp(req),
      userAgent: getClientUserAgent(req),
    });

    return Response.json({ data: session }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/comptoir/sessions]", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Verifier que les tests passent**

Run: `cd web/app && npx vitest run src/__tests__/comptoir/api.test.ts`
Expected: Tous les tests PASS.

- [ ] **Step 5: Commit**

```bash
git add web/app/src/app/api/comptoir/sessions/route.ts web/app/src/__tests__/comptoir/api.test.ts
git commit -m "feat: POST sessions uses declarations par mode + ecarts from grand livre"
```

---

### Task 4: GET session/[id] — theorique depuis le grand livre

**Files:**
- Modify: `web/app/src/app/api/comptoir/sessions/[id]/route.ts`
- Test: `web/app/src/__tests__/comptoir/sessions-id-api.test.ts`

- [ ] **Step 1: Ecrire le test pour le nouveau calcul du theorique**

Modifier le test existant `returns open session with computed soldeTheoriqueCash` et ajouter un nouveau test dans `web/app/src/__tests__/comptoir/sessions-id-api.test.ts` :

Ajouter le mock manquant pour `computeSoldeCaisseParMode` dans le bloc de mocks `vi.mock("@/lib/services/cash-movement", ...)` :

```typescript
vi.mock("@/lib/services/cash-movement", () => ({
  computeSoldeTheoriqueLegacy: vi.fn().mockResolvedValue({ cash: 78000, mobileMoney: 0 }),
  computeSoldeTheoriqueParMode: vi.fn().mockResolvedValue([{ mode: "ESPECES", solde: 78000 }]),
  computeSoldeCaisseParMode: vi.fn().mockResolvedValue([{ mode: "ESPECES", solde: 128000 }]),
}));
```

Ajouter l'import de `computeSoldeCaisseParMode` :

```typescript
import { computeSoldeCaisseParMode } from "@/lib/services/cash-movement";
```

Ajouter dans `mockOpenSession` :

```typescript
const mockOpenSession = {
  id: "s-1", userId: "user-1", statut: "OUVERTE",
  montantOuvertureCash: new Decimal(50000), montantOuvertureMobileMoney: new Decimal(0),
  declarationsOuverture: { ESPECES: 50000 },
  ecartsOuverture: null,
  montantFermetureCash: null, montantFermetureMobileMoney: null,
  fermetureAt: null, ouvertureAt: new Date(), notes: null,
  soldeTheoriqueCash: null, soldeTheoriqueMobileMoney: null,
  ecartCash: null, ecartMobileMoney: null,
  user: { id: "user-1", nom: "Test", email: "t@t.com" },
  ventes: [],
};
```

Remplacer le test du theorique :

```typescript
  it("returns open session with theorique from grand livre (not from fond ouverture)", async () => {
    mockSession("CAISSIER");
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockOpenSession);
    (prisma.mouvementCaisse.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.paiement.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    // Grand livre dit 128000 pour ESPECES (includes opening fund + movements)
    (computeSoldeCaisseParMode as ReturnType<typeof vi.fn>).mockResolvedValue([
      { mode: "ESPECES", solde: 128000 },
    ]);

    const res = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: "s-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    // montantAttendu comes from grand livre, NOT from fond ouverture + movements
    expect(body.data.montantAttenduCash).toBe(128000);
  });
```

- [ ] **Step 2: Verifier que le test echoue**

Run: `cd web/app && npx vitest run src/__tests__/comptoir/sessions-id-api.test.ts -t "theorique from grand livre"`
Expected: FAIL — le GET calcule encore depuis `fondOuverture + mouvements`.

- [ ] **Step 3: Modifier le GET pour utiliser le grand livre**

Dans `web/app/src/app/api/comptoir/sessions/[id]/route.ts`, modifier la fonction GET :

Ajouter l'import de `computeSoldeCaisseParMode` :

```typescript
import {
  computeSoldeTheoriqueLegacy,
  computeSoldeTheoriqueParMode,
  computeSoldeCaisseParMode,
} from "@/lib/services/cash-movement";
```

Ajouter la resolution de la caisse active et remplacer le calcul de `montantAttendu` par le grand livre. Remplacer les lignes 39-100 du GET par :

```typescript
    // Compute theoretical balance from cash movements (session-level for recap)
    const soldesParMode = await computeSoldeTheoriqueParMode(id);

    let soldeTheoriqueCash: number | null = null;
    let soldeTheoriqueMobileMoney: number | null = null;

    if (session.statut === "OUVERTE" || session.statut === "EN_ATTENTE_CLOTURE" || session.statut === "EN_ATTENTE_VALIDATION") {
      const legacy = await computeSoldeTheoriqueLegacy(id);
      soldeTheoriqueCash = Number(session.montantOuvertureCash) + legacy.cash;
      soldeTheoriqueMobileMoney = Number(session.montantOuvertureMobileMoney) + legacy.mobileMoney;
    } else {
      soldeTheoriqueCash = session.soldeTheoriqueCash ? Number(session.soldeTheoriqueCash) : null;
      soldeTheoriqueMobileMoney = session.soldeTheoriqueMobileMoney ? Number(session.soldeTheoriqueMobileMoney) : null;
    }

    // Build detailed breakdown: session movements aggregated by type x mode
    const mouvements = await prisma.mouvementCaisse.findMany({
      where: { sessionId: id },
      select: { type: true, mode: true, montant: true },
    });

    const recapParMode: Record<string, Record<string, number>> = {};
    for (const m of mouvements) {
      if (!recapParMode[m.mode]) {
        recapParMode[m.mode] = {};
      }
      recapParMode[m.mode][m.type] = (recapParMode[m.mode][m.type] ?? 0) + Number(m.montant);
    }

    // Sales from Paiement table
    const paiements = await prisma.paiement.findMany({
      where: { vente: { sessionId: id, statut: "VALIDEE" } },
      select: { mode: true, montant: true },
    });

    const ventesParMode: Record<string, number> = {};
    for (const p of paiements) {
      ventesParMode[p.mode] = (ventesParMode[p.mode] ?? 0) + Number(p.montant);
    }

    // Opening fund (for display in recap table)
    const fondCash = Number(session.montantOuvertureCash);
    const fondAutres = Number(session.montantOuvertureMobileMoney);

    // Montant attendu: from grand livre (source of truth)
    const caisse = await prisma.caisse.findFirst({ where: { active: true }, select: { id: true } });
    let montantAttenduCash = 0;
    let montantAttenduAutres = 0;

    if (caisse && (session.statut === "OUVERTE" || session.statut === "EN_ATTENTE_CLOTURE" || session.statut === "EN_ATTENTE_VALIDATION")) {
      const soldeCaisse = await computeSoldeCaisseParMode(caisse.id);
      for (const s of soldeCaisse) {
        if (s.mode === "ESPECES") {
          montantAttenduCash = s.solde;
        } else {
          montantAttenduAutres += s.solde;
        }
      }
    }
```

- [ ] **Step 4: Verifier que les tests passent**

Run: `cd web/app && npx vitest run src/__tests__/comptoir/sessions-id-api.test.ts`
Expected: Tous les tests PASS.

- [ ] **Step 5: Commit**

```bash
git add web/app/src/app/api/comptoir/sessions/[id]/route.ts web/app/src/__tests__/comptoir/sessions-id-api.test.ts
git commit -m "feat: GET session/[id] computes montantAttendu from grand livre"
```

---

### Task 5: POST closure — theorique depuis le grand livre

**Files:**
- Modify: `web/app/src/app/api/comptoir/sessions/[id]/closure/route.ts`
- Modify: `web/app/src/__tests__/caisse/closure-fond-ouverture.test.ts`

- [ ] **Step 1: Recrire les tests de closure pour le grand livre**

Remplacer le contenu de `web/app/src/__tests__/caisse/closure-fond-ouverture.test.ts` :

```typescript
/**
 * Closure theoretical balance comes from grand livre (computeSoldeCaisseParMode),
 * not from montantOuvertureCash + session movements.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Role } from "@prisma/client";

vi.mock("@/lib/db", () => ({
  prisma: {
    comptoirSession: { findUnique: vi.fn(), update: vi.fn() },
    mouvementCaisse: { findMany: vi.fn() },
    caisse: { findFirst: vi.fn() },
  },
}));

vi.mock("@/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/activity-log", () => ({
  logActivity: vi.fn(),
  ACTIONS: { SESSION_CLOSURE_REQUESTED: "SESSION_CLOSURE_REQUESTED" },
  getClientIp: vi.fn(),
  getClientUserAgent: vi.fn(),
}));

vi.mock("@/lib/services/cash-movement", () => ({
  computeSoldeCaisseParMode: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { computeSoldeCaisseParMode } from "@/lib/services/cash-movement";

function mockUser(role: Role, id = "user-1") {
  (auth as ReturnType<typeof vi.fn>).mockResolvedValue({
    user: { id, email: "t@t.com", name: "T", role },
  });
}

function jsonReq(body: Record<string, unknown>): Request {
  return new Request("http://localhost", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Closure theoretical balance from grand livre", () => {
  let POST: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  const ctx = { params: Promise.resolve({ id: "s-1" }) };

  beforeEach(async () => {
    vi.clearAllMocks();
    POST = (await import("@/app/api/comptoir/sessions/[id]/closure/route")).POST;
  });

  it("theoretical balance comes from grand livre, not fond ouverture + movements", async () => {
    mockUser("CAISSIER");

    const openSession = {
      id: "s-1",
      statut: "OUVERTE",
      userId: "user-1",
      montantOuvertureCash: 100000,  // Cashier over-declared at opening
      montantOuvertureMobileMoney: 0,
    };

    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(openSession);
    (prisma.caisse.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "caisse-1", active: true });

    // Grand livre says 130000 total for ESPECES (real balance: 80000 opening + 50000 sales)
    (computeSoldeCaisseParMode as ReturnType<typeof vi.fn>).mockResolvedValue([
      { mode: "ESPECES", solde: 130000 },
    ]);

    (prisma.comptoirSession.update as ReturnType<typeof vi.fn>).mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        ...openSession,
        ...data,
        user: { id: "user-1", nom: "Test", email: "t@t.com" },
      }),
    );

    // Cashier declares 130000 — the correct physical amount
    const res = await POST(jsonReq({ declarations: { ESPECES: 130000 } }), ctx);

    expect(res.status).toBe(200);
    const body = await res.json();

    // Theoretical = 130000 from grand livre (NOT 100000 + movements)
    expect(body.data.ecartsParMode.ESPECES.theorique).toBe(130000);
    // Declared 130000, theoretical 130000 -> ecart = 0
    expect(body.data.ecartsParMode.ESPECES.ecart).toBe(0);
  });

  it("detects real deficit when grand livre shows more than declared", async () => {
    mockUser("CAISSIER");

    const openSession = {
      id: "s-1",
      statut: "OUVERTE",
      userId: "user-1",
      montantOuvertureCash: 50000,
      montantOuvertureMobileMoney: 0,
    };

    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(openSession);
    (prisma.caisse.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "caisse-1", active: true });

    // Grand livre: 128000
    (computeSoldeCaisseParMode as ReturnType<typeof vi.fn>).mockResolvedValue([
      { mode: "ESPECES", solde: 128000 },
    ]);

    (prisma.comptoirSession.update as ReturnType<typeof vi.fn>).mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        ...openSession,
        ...data,
        user: { id: "user-1", nom: "Test", email: "t@t.com" },
      }),
    );

    // Cashier declares 125000 — 3000 short
    const res = await POST(jsonReq({ declarations: { ESPECES: 125000 } }), ctx);

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.data.ecartsParMode.ESPECES.theorique).toBe(128000);
    expect(body.data.ecartsParMode.ESPECES.ecart).toBe(-3000);
  });
});
```

- [ ] **Step 2: Verifier que les tests echouent**

Run: `cd web/app && npx vitest run src/__tests__/caisse/closure-fond-ouverture.test.ts`
Expected: FAIL — la closure utilise encore `computeSoldeTheoriqueParMode(sessionId)` + fond ouverture.

- [ ] **Step 3: Modifier la closure pour utiliser le grand livre**

Remplacer le contenu de `web/app/src/app/api/comptoir/sessions/[id]/closure/route.ts` (fonction POST) :

```typescript
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAuth, hasRole } from "@/lib/permissions";
import { declarationCloturSchema } from "@/lib/validations/mouvement-caisse";
import { logActivity, ACTIONS, getClientIp, getClientUserAgent } from "@/lib/activity-log";
import { computeSoldeCaisseParMode } from "@/lib/services/cash-movement";

/**
 * POST — RULE-CLOSE-001 + RULE-CLOSE-002
 * Le caissier soumet ses declarations. Le serveur calcule le theorique depuis le grand livre.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requireAuth();
  if (!result.authenticated) return result.response;

  const { id } = await params;

  try {
    const session = await prisma.comptoirSession.findUnique({
      where: { id },
      select: { id: true, statut: true, userId: true, montantOuvertureCash: true, montantOuvertureMobileMoney: true },
    });

    if (!session) {
      return Response.json({ error: "Session introuvable" }, { status: 404 });
    }

    if (session.statut !== "OUVERTE") {
      return Response.json(
        { error: "La session doit être ouverte pour demander la clôture" },
        { status: 422 },
      );
    }

    if (session.userId !== result.user.id && !hasRole(result.user.role, ["ADMIN", "MANAGER"])) {
      return Response.json({ error: "Accès refusé" }, { status: 403 });
    }

    const body = await req.json();
    const parsed = declarationCloturSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Données invalides", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    // Resolve active caisse
    const caisse = await prisma.caisse.findFirst({ where: { active: true }, select: { id: true } });
    if (!caisse) {
      return Response.json({ error: "Aucune caisse active configuree" }, { status: 422 });
    }

    // Grand livre = source de verite
    const soldes = await computeSoldeCaisseParMode(caisse.id);
    const soldesMap = new Map<string, number>();
    for (const s of soldes) {
      soldesMap.set(s.mode, s.solde);
    }

    // Compute discrepancies
    const declarations = parsed.data.declarations as Record<string, number>;
    const allModes = new Set([...soldesMap.keys(), ...Object.keys(declarations)]);

    const ecartsParMode: Record<string, { theorique: number; declare: number; ecart: number }> = {};
    for (const mode of allModes) {
      const theorique = soldesMap.get(mode) ?? 0;
      const declare = declarations[mode] ?? 0;
      ecartsParMode[mode] = {
        theorique,
        declare,
        ecart: declare - theorique,
      };
    }

    // Legacy fields for backward compat
    let soldeTheoriqueCash = soldesMap.get("ESPECES") ?? 0;
    let soldeTheoriqueMobileMoney = 0;
    for (const [mode, solde] of soldesMap.entries()) {
      if (mode !== "ESPECES") {
        soldeTheoriqueMobileMoney += solde;
      }
    }

    const updated = await prisma.comptoirSession.update({
      where: { id },
      data: {
        statut: "EN_ATTENTE_VALIDATION",
        declarationsCaissier: declarations,
        demandeCloturAt: new Date(),
        ecartsParMode,
        soldeTheoriqueCash,
        soldeTheoriqueMobileMoney,
      },
      include: { user: { select: { id: true, nom: true, email: true } } },
    });

    await logActivity({
      action: ACTIONS.SESSION_CLOSURE_REQUESTED,
      actorId: result.user.id,
      entityType: "ComptoirSession",
      entityId: id,
      metadata: {
        declarations,
        soldesParMode: Object.fromEntries(soldesMap),
        ecartsParMode,
      },
      ipAddress: getClientIp(req),
      userAgent: getClientUserAgent(req),
    });

    return Response.json({
      data: {
        ...updated,
        soldesParMode: soldes.map((s) => ({ mode: s.mode, solde: s.solde })),
        ecartsParMode,
      },
    });
  } catch (error) {
    console.error(`[POST /api/comptoir/sessions/${id}/closure]`, error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
```

Garder la fonction `DELETE` existante telle quelle.

- [ ] **Step 4: Verifier que les tests passent**

Run: `cd web/app && npx vitest run src/__tests__/caisse/closure-fond-ouverture.test.ts`
Expected: Tous les tests PASS.

- [ ] **Step 5: Commit**

```bash
git add web/app/src/app/api/comptoir/sessions/[id]/closure/route.ts web/app/src/__tests__/caisse/closure-fond-ouverture.test.ts
git commit -m "feat: closure computes theoretical from grand livre instead of fond ouverture"
```

---

### Task 6: PUT legacy close — theorique depuis le grand livre

**Files:**
- Modify: `web/app/src/app/api/comptoir/sessions/[id]/route.ts` (PUT)
- Test: `web/app/src/__tests__/comptoir/sessions-id-api.test.ts`

- [ ] **Step 1: Ecrire un test pour le PUT legacy avec grand livre**

Ajouter dans le describe `PUT /api/comptoir/sessions/[id] (close)` :

```typescript
  it("computes ecart from grand livre, not fond ouverture", async () => {
    mockSession("CAISSIER", "user-1");

    // Session opened with over-declared 100000 but real balance was 80000
    const overDeclaredSession = {
      ...mockOpenSession,
      montantOuvertureCash: new Decimal(100000),
    };
    (prisma.comptoirSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(overDeclaredSession);
    mockVenteAggregateForClose();

    // Grand livre says 130000 (real: 80000 + 50000 sales)
    const { computeSoldeCaisseParMode } = await import("@/lib/services/cash-movement");
    (computeSoldeCaisseParMode as ReturnType<typeof vi.fn>).mockResolvedValue([
      { mode: "ESPECES", solde: 130000 },
    ]);

    (prisma.caisse.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "caisse-1", active: true });
    (prisma.comptoirSession.update as ReturnType<typeof vi.fn>).mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        ...overDeclaredSession,
        ...data,
        user: { id: "user-1", nom: "Test", email: "t@t.com" },
      }),
    );

    const res = await PUT(
      new Request("http://localhost", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ montantFermetureCash: 130000, montantFermetureMobileMoney: 0 }),
      }),
      { params: Promise.resolve({ id: "s-1" }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    // ecart should be 0 (130000 declared = 130000 grand livre)
    // NOT -20000 (which would happen with fond ouverture 100000 + legacy movements)
    expect(body.data.ecartCash).toBe(0);
  });
```

Ajouter les mocks necessaires. Ajouter dans le mock factory de `cash-movement` :

```typescript
vi.mock("@/lib/services/cash-movement", () => ({
  computeSoldeTheoriqueLegacy: vi.fn().mockResolvedValue({ cash: 78000, mobileMoney: 0 }),
  computeSoldeTheoriqueParMode: vi.fn().mockResolvedValue([{ mode: "ESPECES", solde: 78000 }]),
  computeSoldeCaisseParMode: vi.fn().mockResolvedValue([{ mode: "ESPECES", solde: 128000 }]),
}));
```

Ajouter le mock de `prisma.caisse` dans le mock factory de `@/lib/db` :

```typescript
caisse: { findFirst: vi.fn() },
```

- [ ] **Step 2: Verifier que le test echoue**

Run: `cd web/app && npx vitest run src/__tests__/comptoir/sessions-id-api.test.ts -t "grand livre"`
Expected: FAIL.

- [ ] **Step 3: Modifier le PUT pour utiliser le grand livre**

Dans `web/app/src/app/api/comptoir/sessions/[id]/route.ts`, modifier la fonction PUT. Remplacer les lignes 161-169 :

```typescript
    // Montant attendu = grand livre (source de verite)
    const caisse = await prisma.caisse.findFirst({ where: { active: true }, select: { id: true } });
    let attenduCash = 0;
    let attenduMM = 0;

    if (caisse) {
      const soldeCaisse = await computeSoldeCaisseParMode(caisse.id);
      for (const s of soldeCaisse) {
        if (s.mode === "ESPECES") attenduCash = s.solde;
        else attenduMM += s.solde;
      }
    } else {
      // Fallback: use legacy computation if no caisse found
      const solde = await computeSoldeTheoriqueLegacy(id);
      const fondCash = Number(session.montantOuvertureCash);
      const fondMM = Number(session.montantOuvertureMobileMoney);
      attenduCash = fondCash + solde.cash;
      attenduMM = fondMM + solde.mobileMoney;
    }
```

Ajouter l'import de `computeSoldeCaisseParMode` si pas deja present :

```typescript
import {
  computeSoldeTheoriqueLegacy,
  computeSoldeTheoriqueParMode,
  computeSoldeCaisseParMode,
} from "@/lib/services/cash-movement";
```

- [ ] **Step 4: Verifier que les tests passent**

Run: `cd web/app && npx vitest run src/__tests__/comptoir/sessions-id-api.test.ts`
Expected: Tous les tests PASS.

- [ ] **Step 5: Commit**

```bash
git add web/app/src/app/api/comptoir/sessions/[id]/route.ts web/app/src/__tests__/comptoir/sessions-id-api.test.ts
git commit -m "feat: PUT legacy close uses grand livre for theoretical balance"
```

---

### Task 7: Frontend SessionManager — declarations par mode

**Files:**
- Modify: `web/app/src/components/comptoir/SessionManager.tsx`
- Test: `web/app/src/__tests__/components/SessionManager.test.tsx`

- [ ] **Step 1: Mettre a jour le test du SessionManager**

Dans `web/app/src/__tests__/components/SessionManager.test.tsx`, mettre a jour le `mockSession` pour inclure les nouveaux champs et ajouter un test :

```typescript
const mockSession = {
  id: "session-1",
  ouvertureAt: "2026-05-01T08:00:00.000Z",
  fermetureAt: null,
  montantOuvertureCash: "50000",
  montantOuvertureMobileMoney: "0",
  declarationsOuverture: { ESPECES: 50000 },
  ecartsOuverture: null,
  montantFermetureCash: null,
  montantFermetureMobileMoney: null,
  soldeTheoriqueCash: null,
  soldeTheoriqueMobileMoney: null,
  statut: "OUVERTE" as const,
  notes: null,
  userId: "user-1",
};
```

- [ ] **Step 2: Modifier le handleOpen pour envoyer declarations**

Dans `web/app/src/components/comptoir/SessionManager.tsx`, modifier `submitOpen` pour envoyer `declarations` au lieu de `montantOuvertureCash`/`montantOuvertureMobileMoney` :

Dans la fonction `submitOpen`, remplacer la construction du body :

```typescript
    async (confirmeEcart = false) => {
      // Build declarations from mode inputs
      const declarations: Record<string, number> = {};
      for (const mode of modesPaiement) {
        const val = parseFloat(montantsOuverture[mode.code] || "0");
        if (val > 0 || mode.code === "ESPECES") {
          declarations[mode.code] = val;
        }
      }

      setLoading(true);
      try {
        const res = await fetch("/api/comptoir/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            declarations,
            ...(confirmeEcart ? { confirmeEcart: true } : {}),
          }),
        });
```

Modifier aussi la gestion de la reponse 409 pour lire le nouveau format `ecarts` (objet par mode) au lieu de `ecartCash`/`ecartAutres` :

```typescript
        if (!res.ok) {
          if (res.status === 409 && json.requiresConfirmation) {
            setOpeningEcartDetails({
              message: json.message,
              ecarts: json.ecarts,
            });
            setShowOpeningDiscrepancyModal(true);
            return;
          }
          setError(json.error ?? "Erreur lors de l'ouverture de la session.");
          return;
        }
```

Mettre a jour le type de `openingEcartDetails` :

```typescript
  const [openingEcartDetails, setOpeningEcartDetails] = useState<{
    message: string;
    ecarts: Record<string, { theorique: number; declare: number; ecart: number; categorie: string }>;
  } | null>(null);
```

- [ ] **Step 3: Mettre a jour la modal d'ecart a l'ouverture**

Remplacer le contenu de la modal pour iterer sur les ecarts par mode dynamiquement :

```tsx
              <div className="mb-4 space-y-2">
                {Object.entries(openingEcartDetails.ecarts).map(([mode, detail]) => (
                  <div
                    key={mode}
                    className={`flex items-center justify-between rounded-lg border px-4 py-3 ${
                      detail.ecart > 0
                        ? "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20"
                        : "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20"
                    }`}
                  >
                    <div>
                      <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{mode}</span>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        Solde caisse: {formatFCFA(detail.theorique)}
                      </p>
                    </div>
                    <span className={`text-sm font-bold ${
                      detail.ecart > 0
                        ? "text-blue-700 dark:text-blue-400"
                        : "text-red-700 dark:text-red-400"
                    }`}>
                      {detail.ecart > 0 ? "+" : ""}{formatFCFA(detail.ecart)}
                      <span className="ml-1 text-xs font-normal">
                        ({detail.ecart > 0 ? "excedent" : "manquant"})
                      </span>
                    </span>
                  </div>
                ))}
              </div>
```

Mettre a jour les conditions pour les avertissements deficit/surplus :

```tsx
              {Object.values(openingEcartDetails.ecarts).some((d) => d.ecart < -0.01) && (
                <div data-testid="opening-deficit-warning" className="mb-5 rounded-lg border border-red-300 bg-red-50 px-4 py-3 dark:border-red-700 dark:bg-red-900/20">
                  <p className="text-sm font-semibold text-red-800 dark:text-red-300">Attention — Deficit a l&apos;ouverture</p>
                  <p className="mt-1 text-xs text-red-700 dark:text-red-400">
                    Vous declarez un montant inferieur au solde enregistre dans la caisse. En confirmant l&apos;ouverture, cet ecart vous sera impute. Si vous pensez qu&apos;il y a une erreur, annulez et demandez une reconciliation a votre responsable.
                  </p>
                </div>
              )}

              {Object.values(openingEcartDetails.ecarts).some((d) => d.ecart > 0.01) && (
                <div data-testid="opening-surplus-warning" className="mb-5 rounded-lg border border-blue-300 bg-blue-50 px-4 py-3 dark:border-blue-700 dark:bg-blue-900/20">
                  <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">Attention — Excedent a l&apos;ouverture</p>
                  <p className="mt-1 text-xs text-blue-700 dark:text-blue-400">
                    Vous declarez un montant superieur au solde enregistre dans la caisse. En confirmant l&apos;ouverture, cet ecart sera enregistre sous votre responsabilite. Si vous pensez qu&apos;il y a une erreur, annulez et demandez une reconciliation a votre responsable.
                  </p>
                </div>
              )}
```

- [ ] **Step 4: Supprimer l'ancien state warning post-ouverture**

Retirer l'etat `warning` et le bloc de rendu correspondant (le banner amber affiche apres ouverture, lignes 365-400 du fichier original). Les ecarts sont maintenant geres avant ouverture via la modal.

- [ ] **Step 5: Verifier que les tests passent**

Run: `cd web/app && npx vitest run src/__tests__/components/SessionManager.test.tsx`
Expected: Tous les tests PASS.

- [ ] **Step 6: Commit**

```bash
git add web/app/src/components/comptoir/SessionManager.tsx web/app/src/__tests__/components/SessionManager.test.tsx
git commit -m "feat: SessionManager sends declarations per mode, dynamic ecart modal"
```

---

### Task 8: Verification globale

**Files:** Aucune modification — verification uniquement.

- [ ] **Step 1: Lancer tous les tests du projet**

Run: `cd web/app && npx vitest run`
Expected: Tous les tests PASS. Si certains tests echouent a cause du changement de format d'ouverture, les corriger (adapter les `JSON.stringify({ montantOuvertureCash: ... })` vers `JSON.stringify({ declarations: { ESPECES: ... } })`).

- [ ] **Step 2: Verifier la compilation TypeScript**

Run: `cd web/app && npx tsc --noEmit`
Expected: Pas de nouvelles erreurs (les erreurs pre-existantes sur `@tanstack/react-query` sont acceptees).

- [ ] **Step 3: Commit final si des corrections ont ete necessaires**

```bash
git add -A
git commit -m "fix: adapt remaining tests to new declarations format"
```
