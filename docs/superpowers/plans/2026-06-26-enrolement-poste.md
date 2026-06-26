# Enrôlement du poste au premier lancement — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Au premier lancement d'un poste sans config, afficher un formulaire d'enrôlement (URL + code + nom), échanger un code à usage unique contre un token de magasin, le persister au trousseau OS, puis charger l'UI du nœud.

**Architecture:** Nœud (`web/app`) : nouveau modèle `EnrollmentToken` (single-use), `POST /api/enrollment` émet un code d'enrôlement, `POST /api/enrollment/exchange` le consomme → renomme la caisse → émet un token de magasin. Client (`desktop`) : modules purs/testables (config, config-store via safeStorage, enrollment-client) + orchestration `main.ts` à deux fenêtres (enrôlement local / kiosque distant) avec preloads isolés.

**Tech Stack:** Next.js 16 · Prisma · MySQL · Zod · Vitest (nœud) ; Electron 31 · safeStorage · Vitest (desktop).

## Global Constraints

- TypeScript strict : pas de `any`, pas de `as unknown`. (`CLAUDE.md` §5.2)
- API : valider en **Zod** avant Prisma ; `try/catch` ; erreurs `{ error, code? }`, succès `{ data, message? }`. (`CLAUDE.md` §5.3)
- TDD obligatoire : test d'abord, le voir échouer, code minimal. (`CLAUDE.md` §5.8)
- Commits **sans** mention `Co-Authored-By`. (`CLAUDE.md` §8.2)
- Ne jamais journaliser de secret (token en clair). (`CLAUDE.md` §5.7)
- Tests nœud : `cd web/app && npx vitest run <chemin>`. Tests desktop : `cd desktop && npx vitest run <chemin>`.
- Le secret (token de magasin) ne vit jamais en clair sur disque : `safeStorage` (trousseau OS).

---

## Task 1: Modèle Prisma `EnrollmentToken` + migration

**Files:**
- Modify: `web/app/prisma/schema.prisma` (modèle `Caisse` ~l.113-126 ; nouveau modèle après `StoreToken` ~l.145)

**Interfaces:**
- Produces: table `enrollment_tokens` ; modèle Prisma `EnrollmentToken { id, tokenHash, caisseId, label?, expiresAt, consumedAt?, createdAt }` ; relation `Caisse.enrollmentTokens`.

- [ ] **Step 1: Ajouter la back-relation sur `Caisse`**

Dans `web/app/prisma/schema.prisma`, modèle `Caisse`, après `storeTokens StoreToken[]` :

```prisma
  storeTokens StoreToken[]
  enrollmentTokens EnrollmentToken[]
```

- [ ] **Step 2: Ajouter le modèle `EnrollmentToken`**

Juste après le modèle `StoreToken` (avant `// ─── MODULE COMPTOIR`) :

```prisma
model EnrollmentToken {
  id         String    @id @default(cuid())
  tokenHash  String    @unique @db.VarChar(64)
  label      String?
  expiresAt  DateTime
  consumedAt DateTime?
  createdAt  DateTime  @default(now())

  caisseId String
  caisse   Caisse @relation(fields: [caisseId], references: [id])

  @@index([caisseId])
  @@map("enrollment_tokens")
}
```

- [ ] **Step 3: Générer la migration**

Run (DB up : `docker compose up -d` depuis la racine si besoin) : `cd web/app && npx prisma migrate dev --name add_enrollment_token`
Expected: migration créée sous `prisma/migrations/*_add_enrollment_token/`, client Prisma régénéré, `EnrollmentToken` disponible.

- [ ] **Step 4: Commit**

```bash
git add web/app/prisma/schema.prisma web/app/prisma/migrations
git commit -m "feat(enrollment): modèle EnrollmentToken (token d'enrôlement single-use)"
```

---

## Task 2: Service `enrollment-token.ts`

**Files:**
- Create: `web/app/src/lib/services/enrollment-token.ts`
- Test: `web/app/src/__tests__/security/enrollment-token.test.ts`

**Interfaces:**
- Consumes: `prisma.enrollmentToken` (Task 1) ; `hashToken` de `@/lib/services/store-token`.
- Produces:
  - `issueEnrollmentToken(params: { caisseId: string; label?: string; ttlMinutes?: number }): Promise<{ token: string; id: string; expiresAt: Date }>`
  - `consumeEnrollmentToken(token: string): Promise<{ valid: boolean; caisseId: string | null; tokenId: string | null }>`

- [ ] **Step 1: Écrire les tests (échec attendu)**

`web/app/src/__tests__/security/enrollment-token.test.ts` :

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    enrollmentToken: { create: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/db";
import { issueEnrollmentToken, consumeEnrollmentToken } from "@/lib/services/enrollment-token";
import { hashToken } from "@/lib/services/store-token";

const create = prisma.enrollmentToken.create as ReturnType<typeof vi.fn>;
const findUnique = prisma.enrollmentToken.findUnique as ReturnType<typeof vi.fn>;
const updateMany = prisma.enrollmentToken.updateMany as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe("issueEnrollmentToken", () => {
  it("émet un token clair de 64 hex et ne persiste que le hash", async () => {
    create.mockImplementation(async ({ data }) => ({ id: "et-1", ...data }));
    const res = await issueEnrollmentToken({ caisseId: "c1", ttlMinutes: 60 });
    expect(res.token).toMatch(/^[0-9a-f]{64}$/);
    expect(res.id).toBe("et-1");
    expect(res.expiresAt).toBeInstanceOf(Date);
    const arg = create.mock.calls[0][0].data;
    expect(arg.tokenHash).toBe(hashToken(res.token));
    expect(arg.caisseId).toBe("c1");
  });
});

describe("consumeEnrollmentToken", () => {
  it("token valide non consommé non expiré → consommé (updateMany 1) + caisseId", async () => {
    const token = "a".repeat(64);
    findUnique.mockResolvedValue({
      id: "et-1", caisseId: "c1", consumedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    updateMany.mockResolvedValue({ count: 1 });
    const res = await consumeEnrollmentToken(token);
    expect(res).toEqual({ valid: true, caisseId: "c1", tokenId: "et-1" });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "et-1", consumedAt: null },
      data: { consumedAt: expect.any(Date) },
    });
  });

  it("token inconnu → invalide", async () => {
    findUnique.mockResolvedValue(null);
    expect(await consumeEnrollmentToken("b".repeat(64))).toEqual({ valid: false, caisseId: null, tokenId: null });
  });

  it("token déjà consommé → invalide", async () => {
    findUnique.mockResolvedValue({ id: "et-1", caisseId: "c1", consumedAt: new Date(), expiresAt: new Date(Date.now() + 60_000) });
    expect((await consumeEnrollmentToken("a".repeat(64))).valid).toBe(false);
  });

  it("token expiré → invalide", async () => {
    findUnique.mockResolvedValue({ id: "et-1", caisseId: "c1", consumedAt: null, expiresAt: new Date(Date.now() - 1) });
    expect((await consumeEnrollmentToken("a".repeat(64))).valid).toBe(false);
  });

  it("course : updateMany count 0 (consommé entre-temps) → invalide", async () => {
    findUnique.mockResolvedValue({ id: "et-1", caisseId: "c1", consumedAt: null, expiresAt: new Date(Date.now() + 60_000) });
    updateMany.mockResolvedValue({ count: 0 });
    expect((await consumeEnrollmentToken("a".repeat(64))).valid).toBe(false);
  });
});
```

- [ ] **Step 2: Lancer les tests (échec attendu)**

Run: `cd web/app && npx vitest run src/__tests__/security/enrollment-token.test.ts`
Expected: FAIL (`enrollment-token` introuvable).

- [ ] **Step 3: Implémenter le service**

`web/app/src/lib/services/enrollment-token.ts` :

```ts
import { randomBytes } from "crypto";

import { prisma } from "@/lib/db";
import { hashToken } from "@/lib/services/store-token";

/**
 * Token d'enrôlement à usage unique (ADR-007). Remis par l'admin, échangé une seule
 * fois par le poste contre un token de magasin (cf. exchange). Seul le hash est persisté.
 */
export interface IssueEnrollmentParams {
  caisseId: string;
  label?: string;
  ttlMinutes?: number;
}

export async function issueEnrollmentToken(
  params: IssueEnrollmentParams,
): Promise<{ token: string; id: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + (params.ttlMinutes ?? 60) * 60_000);
  const created = await prisma.enrollmentToken.create({
    data: { tokenHash: hashToken(token), caisseId: params.caisseId, label: params.label ?? null, expiresAt },
  });
  return { token, id: created.id, expiresAt };
}

export interface ConsumeResult {
  valid: boolean;
  caisseId: string | null;
  tokenId: string | null;
}

export async function consumeEnrollmentToken(token: string): Promise<ConsumeResult> {
  const record = await prisma.enrollmentToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!record || record.consumedAt || record.expiresAt.getTime() <= Date.now()) {
    return { valid: false, caisseId: null, tokenId: null };
  }
  // Consommation atomique : garde anti-course (un seul updateMany réussit).
  const updated = await prisma.enrollmentToken.updateMany({
    where: { id: record.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (updated.count !== 1) return { valid: false, caisseId: null, tokenId: null };
  return { valid: true, caisseId: record.caisseId, tokenId: record.id };
}
```

- [ ] **Step 4: Lancer les tests (succès attendu)**

Run: `cd web/app && npx vitest run src/__tests__/security/enrollment-token.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add web/app/src/lib/services/enrollment-token.ts web/app/src/__tests__/security/enrollment-token.test.ts
git commit -m "feat(enrollment): service enrollment-token (issue + consume single-use)"
```

---

## Task 3: `POST /api/enrollment` émet un code d'enrôlement

**Files:**
- Modify: `web/app/src/app/api/enrollment/route.ts`
- Modify: `web/app/src/__tests__/security/enrollment-api.test.ts`

**Interfaces:**
- Consumes: `issueEnrollmentToken` (Task 2).
- Produces: `POST /api/enrollment` (ADMIN) body `{ caisseId, label?, ttlMinutes? }` → `201 { data: { enrollmentToken, caisseId, codePoste, expiresAt } }`.

- [ ] **Step 1: Adapter les tests (échec attendu)**

Dans `web/app/src/__tests__/security/enrollment-api.test.ts`, remplacer le mock et les attentes du store-token par l'enrollment-token :

```ts
// Remplacer le bloc vi.mock("@/lib/services/store-token", ...) par :
const issueEnrollmentToken = vi.fn();
vi.mock("@/lib/services/enrollment-token", () => ({
  issueEnrollmentToken: (...a: unknown[]) => issueEnrollmentToken(...a),
}));
```

Remplacer le test « ADMIN enrôle… » par :

```ts
  it("ADMIN génère un code d'enrôlement pour une caisse active → 201", async () => {
    mockUser("ADMIN");
    (prisma.caisse.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "caisse-1", active: true, code: "P1" });
    const expiresAt = new Date(Date.now() + 3_600_000);
    issueEnrollmentToken.mockResolvedValue({ token: "a".repeat(64), id: "et-1", expiresAt });

    const res = await POST(req({ caisseId: "caisse-1", label: "Poste 1" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.enrollmentToken).toBe("a".repeat(64));
    expect(body.data.caisseId).toBe("caisse-1");
    expect(body.data.codePoste).toBe("P1");
    expect(issueEnrollmentToken).toHaveBeenCalledWith({ caisseId: "caisse-1", label: "Poste 1", ttlMinutes: undefined });
  });
```

Dans les 2 autres tests, remplacer `issueStoreToken` par `issueEnrollmentToken` (référence + assertion `not.toHaveBeenCalled`).

- [ ] **Step 2: Lancer les tests (échec attendu)**

Run: `cd web/app && npx vitest run src/__tests__/security/enrollment-api.test.ts`
Expected: FAIL (la route appelle encore `issueStoreToken`).

- [ ] **Step 3: Modifier la route**

`web/app/src/app/api/enrollment/route.ts` — remplacer l'import et le corps :

```ts
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/permissions";
import { issueEnrollmentToken } from "@/lib/services/enrollment-token";
import { logActivity, ACTIONS, getClientIp, getClientUserAgent } from "@/lib/activity-log";

const enrollSchema = z.object({
  caisseId: z.string().min(1),
  label: z.string().max(100).optional(),
  ttlMinutes: z.number().int().positive().max(1440).optional(),
});

/**
 * Émission d'un code d'enrôlement (ADR-007, single-use) par un ADMIN, pour une caisse
 * pré-créée. Le poste l'échange ensuite (POST /api/enrollment/exchange) contre un token
 * de magasin. Le code en clair n'est renvoyé qu'une fois.
 */
export async function POST(req: Request): Promise<Response> {
  const result = await requireRole("ADMIN");
  if (!result.authenticated) return result.response;

  try {
    const parsed = enrollSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json({ error: "Données invalides", details: parsed.error.flatten() }, { status: 400 });
    }

    const caisse = await prisma.caisse.findUnique({
      where: { id: parsed.data.caisseId },
      select: { id: true, active: true, code: true },
    });
    if (!caisse || !caisse.active) {
      return Response.json({ error: "Caisse introuvable ou inactive" }, { status: 422 });
    }

    const { token, id, expiresAt } = await issueEnrollmentToken({
      caisseId: caisse.id,
      label: parsed.data.label,
      ttlMinutes: parsed.data.ttlMinutes,
    });

    await logActivity({
      action: ACTIONS.POSTE_ENROLLED,
      actorId: result.user.id,
      entityType: "Caisse",
      entityId: caisse.id,
      metadata: { enrollmentTokenId: id, codePoste: caisse.code, label: parsed.data.label },
      ipAddress: getClientIp(req),
      userAgent: getClientUserAgent(req),
    });

    return Response.json(
      { data: { enrollmentToken: token, caisseId: caisse.id, codePoste: caisse.code, expiresAt } },
      { status: 201 },
    );
  } catch (error) {
    console.error("[POST /api/enrollment]", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Lancer les tests (succès attendu)**

Run: `cd web/app && npx vitest run src/__tests__/security/enrollment-api.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/app/src/app/api/enrollment/route.ts web/app/src/__tests__/security/enrollment-api.test.ts
git commit -m "feat(enrollment): POST /api/enrollment émet un code d'enrôlement single-use"
```

---

## Task 4: `POST /api/enrollment/exchange`

**Files:**
- Create: `web/app/src/app/api/enrollment/exchange/route.ts`
- Test: `web/app/src/__tests__/security/enrollment-exchange-api.test.ts`

**Interfaces:**
- Consumes: `consumeEnrollmentToken` (Task 2) ; `issueStoreToken` (`@/lib/services/store-token`) ; `prisma.caisse`.
- Produces: `POST /api/enrollment/exchange` body `{ token, nom? }` → `200 { data: { storeToken, caisseId, codePoste, nom } }` | 401 | 422.

- [ ] **Step 1: Écrire les tests (échec attendu)**

`web/app/src/__tests__/security/enrollment-exchange-api.test.ts` :

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: { caisse: { findUnique: vi.fn(), update: vi.fn() } },
}));
const consumeEnrollmentToken = vi.fn();
vi.mock("@/lib/services/enrollment-token", () => ({
  consumeEnrollmentToken: (...a: unknown[]) => consumeEnrollmentToken(...a),
}));
const issueStoreToken = vi.fn();
vi.mock("@/lib/services/store-token", () => ({
  issueStoreToken: (...a: unknown[]) => issueStoreToken(...a),
}));
vi.mock("@/lib/activity-log", () => ({
  logActivity: vi.fn(), ACTIONS: { POSTE_ENROLLED: "POSTE_ENROLLED" }, getClientIp: vi.fn(), getClientUserAgent: vi.fn(),
}));

import { prisma } from "@/lib/db";

function req(body: unknown) {
  return new Request("http://localhost/api/enrollment/exchange", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

describe("POST /api/enrollment/exchange", () => {
  let POST: (req: Request) => Promise<Response>;
  beforeEach(async () => {
    vi.clearAllMocks();
    POST = (await import("@/app/api/enrollment/exchange/route")).POST;
  });

  it("code valide + nom → 200, consomme, renomme, émet store token", async () => {
    consumeEnrollmentToken.mockResolvedValue({ valid: true, caisseId: "c1", tokenId: "et-1" });
    (prisma.caisse.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "c1", active: true, code: "P1", nom: "Ancien" });
    (prisma.caisse.update as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "c1", code: "P1", nom: "Caisse Entrée" });
    issueStoreToken.mockResolvedValue({ token: "s".repeat(64), id: "st-1" });

    const res = await POST(req({ token: "a".repeat(64), nom: "Caisse Entrée" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.storeToken).toBe("s".repeat(64));
    expect(body.data.caisseId).toBe("c1");
    expect(body.data.codePoste).toBe("P1");
    expect(body.data.nom).toBe("Caisse Entrée");
    expect(prisma.caisse.update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { nom: "Caisse Entrée" }, select: { id: true, code: true, nom: true } });
  });

  it("nom vide → ne renomme pas, garde le nom existant", async () => {
    consumeEnrollmentToken.mockResolvedValue({ valid: true, caisseId: "c1", tokenId: "et-1" });
    (prisma.caisse.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "c1", active: true, code: "P1", nom: "Existant" });
    issueStoreToken.mockResolvedValue({ token: "s".repeat(64), id: "st-1" });

    const res = await POST(req({ token: "a".repeat(64) }));
    expect(res.status).toBe(200);
    expect((await res.json()).data.nom).toBe("Existant");
    expect(prisma.caisse.update).not.toHaveBeenCalled();
  });

  it("code invalide/expiré/consommé → 401, pas de store token", async () => {
    consumeEnrollmentToken.mockResolvedValue({ valid: false, caisseId: null, tokenId: null });
    const res = await POST(req({ token: "a".repeat(64) }));
    expect(res.status).toBe(401);
    expect(issueStoreToken).not.toHaveBeenCalled();
  });

  it("caisse inactive → 422", async () => {
    consumeEnrollmentToken.mockResolvedValue({ valid: true, caisseId: "c1", tokenId: "et-1" });
    (prisma.caisse.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "c1", active: false, code: "P1", nom: "X" });
    const res = await POST(req({ token: "a".repeat(64) }));
    expect(res.status).toBe(422);
    expect(issueStoreToken).not.toHaveBeenCalled();
  });

  it("token manquant → 400", async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Lancer les tests (échec attendu)**

Run: `cd web/app && npx vitest run src/__tests__/security/enrollment-exchange-api.test.ts`
Expected: FAIL (route introuvable).

- [ ] **Step 3: Implémenter la route**

`web/app/src/app/api/enrollment/exchange/route.ts` :

```ts
import { z } from "zod";
import { prisma } from "@/lib/db";
import { consumeEnrollmentToken } from "@/lib/services/enrollment-token";
import { issueStoreToken } from "@/lib/services/store-token";
import { logActivity, ACTIONS, getClientIp, getClientUserAgent } from "@/lib/activity-log";

const exchangeSchema = z.object({
  token: z.string().min(1),
  nom: z.string().max(100).optional(),
});

/**
 * Échange d'un code d'enrôlement (single-use) contre un token de magasin (ADR-007).
 * Appelé par le poste à l'install. Auth = le code lui-même. Consomme le code, (re)nomme
 * la caisse pré-créée, émet le token de magasin longue durée.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    const parsed = exchangeSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json({ error: "Données invalides", details: parsed.error.flatten() }, { status: 400 });
    }

    const consumed = await consumeEnrollmentToken(parsed.data.token);
    if (!consumed.valid || !consumed.caisseId) {
      return Response.json({ error: "Code d'enrôlement invalide ou expiré" }, { status: 401 });
    }

    const caisse = await prisma.caisse.findUnique({
      where: { id: consumed.caisseId },
      select: { id: true, active: true, code: true, nom: true },
    });
    if (!caisse || !caisse.active) {
      return Response.json({ error: "Caisse inactive — contactez l'administrateur" }, { status: 422 });
    }

    let nom = caisse.nom;
    const nouveauNom = parsed.data.nom?.trim();
    if (nouveauNom) {
      const updated = await prisma.caisse.update({
        where: { id: caisse.id },
        data: { nom: nouveauNom },
        select: { id: true, code: true, nom: true },
      });
      nom = updated.nom;
    }

    const { token, id } = await issueStoreToken({ caisseId: caisse.id, label: nom });

    await logActivity({
      action: ACTIONS.POSTE_ENROLLED,
      actorId: null,
      entityType: "Caisse",
      entityId: caisse.id,
      metadata: { storeTokenId: id, codePoste: caisse.code, enrollmentTokenId: consumed.tokenId },
      ipAddress: getClientIp(req),
      userAgent: getClientUserAgent(req),
    });

    return Response.json(
      { data: { storeToken: token, caisseId: caisse.id, codePoste: caisse.code, nom } },
      { status: 200 },
    );
  } catch (error) {
    console.error("[POST /api/enrollment/exchange]", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
```

> Note : si `logActivity` impose un `actorId` non-null, adapter sa signature (champ optionnel) — vérifier `web/app/src/lib/activity-log.ts` et ajuster le type si nécessaire dans cette étape.

- [ ] **Step 4: Lancer les tests (succès attendu)**

Run: `cd web/app && npx vitest run src/__tests__/security/enrollment-exchange-api.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add web/app/src/app/api/enrollment/exchange/route.ts web/app/src/__tests__/security/enrollment-exchange-api.test.ts
git commit -m "feat(enrollment): POST /api/enrollment/exchange (code → token de magasin)"
```

---

## Task 5: UI admin — bouton « Générer un code d'enrôlement »

**Files:**
- Create: `web/app/src/components/caisse/EnrollmentCodeButton.tsx`
- Modify: `web/app/src/app/(dashboard)/caisse/page.tsx` (passer `caisse.id` + afficher le bouton, ADMIN)

**Interfaces:**
- Consumes: `POST /api/enrollment` (Task 3).
- Produces: composant client `EnrollmentCodeButton({ caisseId }: { caisseId: string })`.

- [ ] **Step 1: Écrire le composant client**

`web/app/src/components/caisse/EnrollmentCodeButton.tsx` :

```tsx
"use client";

import { useState } from "react";

interface Props {
  caisseId: string;
}

export function EnrollmentCodeButton({ caisseId }: Props) {
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function generate() {
    setLoading(true);
    setError(null);
    setCode(null);
    try {
      const res = await fetch("/api/enrollment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caisseId }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Erreur");
        return;
      }
      setCode(body.data.enrollmentToken);
      setExpiresAt(body.data.expiresAt);
    } catch {
      setError("Erreur réseau");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">Enrôler un poste</h3>
      <p className="text-xs text-zinc-500">Génère un code à usage unique à saisir sur le poste de caisse.</p>
      <button
        onClick={generate}
        disabled={loading}
        className="mt-3 rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {loading ? "Génération…" : "Générer un code d'enrôlement"}
      </button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {code && (
        <div className="mt-3 space-y-1">
          <p className="text-xs text-zinc-500">Code (copiez-le, affiché une seule fois) :</p>
          <code className="block break-all rounded bg-zinc-100 p-2 font-mono text-sm dark:bg-zinc-800">{code}</code>
          {expiresAt && (
            <p className="text-xs text-zinc-500">Expire le {new Date(expiresAt).toLocaleString("fr-FR")}</p>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Câbler dans la page caisse (ADMIN uniquement)**

Dans `web/app/src/app/(dashboard)/caisse/page.tsx` :
- Ajouter l'import en tête : `import { EnrollmentCodeButton } from "@/components/caisse/EnrollmentCodeButton";`
- Dans le bloc `{caisse && (...)}`, après la grille « Lien mouvements » (avant la fermeture du `</div>` racine), insérer :

```tsx
      {caisse && role === "ADMIN" && <EnrollmentCodeButton caisseId={caisse.id} />}
```

(Le `caisse` chargé sélectionne déjà `id` — vérifier que `select` inclut `id: true`, c'est le cas.)

- [ ] **Step 3: Vérifier la compilation/typage**

Run: `cd web/app && npx tsc --noEmit`
Expected: aucune erreur de type.

- [ ] **Step 4: Commit**

```bash
git add web/app/src/components/caisse/EnrollmentCodeButton.tsx "web/app/src/app/(dashboard)/caisse/page.tsx"
git commit -m "feat(enrollment): UI admin pour générer un code d'enrôlement"
```

---

## Task 6: `desktop/src/config.ts` — validation & en-têtes

**Files:**
- Modify: `desktop/src/config.ts`
- Test: `desktop/src/__tests__/config.test.ts`

**Interfaces:**
- Produces:
  - `interface PosteConfig { nodeUrl: string; caisseId: string; codePoste?: string; nom?: string }`
  - `validateEnrollInput(input: { nodeUrl?: string; token?: string; nom?: string }): { ok: boolean; errors: string[]; value?: { nodeUrl: string; token: string; nom?: string } }`
  - `authHeaders(nodeUrl: string, storeToken: string, caisseId: string): Record<string, string>` (inchangé sémantiquement ; signature explicite)

- [ ] **Step 1: Écrire les tests (échec attendu)**

`desktop/src/__tests__/config.test.ts` :

```ts
import { describe, it, expect } from "vitest";
import { validateEnrollInput, authHeaders } from "../config";

describe("validateEnrollInput", () => {
  it("URL + token valides → ok, URL normalisée (sans slash final)", () => {
    const r = validateEnrollInput({ nodeUrl: "https://magasin.local:3000/", token: "a".repeat(64), nom: " Entrée " });
    expect(r.ok).toBe(true);
    expect(r.value).toEqual({ nodeUrl: "https://magasin.local:3000", token: "a".repeat(64), nom: "Entrée" });
  });

  it("URL manquante → erreur", () => {
    const r = validateEnrollInput({ token: "a".repeat(64) });
    expect(r.ok).toBe(false);
    expect(r.errors).toContain("URL du nœud magasin requise");
  });

  it("protocole non http(s) → erreur", () => {
    const r = validateEnrollInput({ nodeUrl: "ftp://x", token: "a" });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes("http"))).toBe(true);
  });

  it("token manquant → erreur", () => {
    const r = validateEnrollInput({ nodeUrl: "https://x" });
    expect(r.ok).toBe(false);
    expect(r.errors).toContain("Code d'enrôlement requis");
  });
});

describe("authHeaders", () => {
  it("compose Authorization + X-Aeris-Caisse", () => {
    expect(authHeaders("https://x", "tok", "c1")).toEqual({
      Authorization: "Bearer tok",
      "X-Aeris-Caisse": "c1",
    });
  });
});
```

- [ ] **Step 2: Lancer les tests (échec attendu)**

Run: `cd desktop && npx vitest run src/__tests__/config.test.ts`
Expected: FAIL (`validateEnrollInput` introuvable).

- [ ] **Step 3: Réécrire `config.ts`**

`desktop/src/config.ts` :

```ts
/**
 * Configuration d'enrôlement du poste (logique pure, testable).
 * Le premier lancement capture l'URL du nœud et un code d'enrôlement (échangé contre un
 * token de magasin). Le token de magasin va au trousseau OS (jamais ici).
 */

export interface PosteConfig {
  /** URL du nœud magasin sur le LAN (HTTPS recommandé). */
  nodeUrl: string;
  /** Identité de la caisse (poste), résolue à l'échange. */
  caisseId: string;
  /** Code poste (numérotation), retourné par l'échange. */
  codePoste?: string;
  /** Nom lisible de la caisse, retourné par l'échange. */
  nom?: string;
}

export interface EnrollInputResult {
  ok: boolean;
  errors: string[];
  value?: { nodeUrl: string; token: string; nom?: string };
}

/** Valide/normalise la saisie du formulaire d'enrôlement (URL + code + nom). */
export function validateEnrollInput(input: {
  nodeUrl?: string;
  token?: string;
  nom?: string;
}): EnrollInputResult {
  const errors: string[] = [];

  const nodeUrl = (input.nodeUrl ?? "").trim();
  if (!nodeUrl) {
    errors.push("URL du nœud magasin requise");
  } else {
    try {
      const u = new URL(nodeUrl);
      if (u.protocol !== "http:" && u.protocol !== "https:") {
        errors.push("URL invalide : protocole http(s) requis");
      }
    } catch {
      errors.push("URL du nœud magasin invalide");
    }
  }

  const token = (input.token ?? "").trim();
  if (!token) errors.push("Code d'enrôlement requis");

  if (errors.length > 0) return { ok: false, errors };

  const nom = (input.nom ?? "").trim();
  return {
    ok: true,
    errors: [],
    value: { nodeUrl: nodeUrl.replace(/\/+$/, ""), token, ...(nom ? { nom } : {}) },
  };
}

/** En-têtes d'authentification présentés au nœud magasin (token scopé poste). */
export function authHeaders(nodeUrl: string, storeToken: string, caisseId: string): Record<string, string> {
  void nodeUrl;
  return {
    Authorization: `Bearer ${storeToken}`,
    "X-Aeris-Caisse": caisseId,
  };
}
```

- [ ] **Step 4: Lancer les tests (succès attendu)**

Run: `cd desktop && npx vitest run src/__tests__/config.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/config.ts desktop/src/__tests__/config.test.ts
git commit -m "feat(desktop): validateEnrollInput + PosteConfig (enrôlement 2 champs + nom)"
```

---

## Task 7: `desktop/src/config-store.ts` — persistance (safeStorage)

**Files:**
- Create: `desktop/src/config-store.ts`
- Test: `desktop/src/__tests__/config-store.test.ts`

**Interfaces:**
- Consumes: `PosteConfig` (Task 6).
- Produces (purs, testés) :
  - `encodeConfigFile(config: PosteConfig, storeToken: string, encrypt: (s: string) => string): string`
  - `decodeConfigFile(raw: string, decrypt: (b64: string) => string): { config: PosteConfig; storeToken: string } | null`
- Produces (IO, non testés ici) : `loadConfig(): { config; storeToken } | null`, `saveConfig(config, storeToken): void`, `clearConfig(): void`.

- [ ] **Step 1: Écrire les tests (échec attendu)**

`desktop/src/__tests__/config-store.test.ts` :

```ts
import { describe, it, expect } from "vitest";
import { encodeConfigFile, decodeConfigFile } from "../config-store";
import type { PosteConfig } from "../config";

const config: PosteConfig = { nodeUrl: "https://x:3000", caisseId: "c1", codePoste: "P1", nom: "Entrée" };
// faux chiffrement réversible (base64) pour le test
const enc = (s: string) => Buffer.from(s, "utf8").toString("base64");
const dec = (b64: string) => Buffer.from(b64, "base64").toString("utf8");

describe("config-store (purs)", () => {
  it("round-trip encode→decode restitue config + token", () => {
    const raw = encodeConfigFile(config, "secret-token", enc);
    const out = decodeConfigFile(raw, dec);
    expect(out).toEqual({ config, storeToken: "secret-token" });
  });

  it("le token clair n'apparaît pas dans le JSON encodé", () => {
    const raw = encodeConfigFile(config, "secret-token", enc);
    expect(raw).not.toContain("secret-token");
  });

  it("JSON corrompu → null", () => {
    expect(decodeConfigFile("pas du json", dec)).toBeNull();
  });

  it("champ storeTokenEnc absent → null", () => {
    expect(decodeConfigFile(JSON.stringify({ nodeUrl: "x", caisseId: "c1" }), dec)).toBeNull();
  });
});
```

- [ ] **Step 2: Lancer les tests (échec attendu)**

Run: `cd desktop && npx vitest run src/__tests__/config-store.test.ts`
Expected: FAIL (`config-store` introuvable).

- [ ] **Step 3: Implémenter `config-store.ts`**

`desktop/src/config-store.ts` :

```ts
import { app, safeStorage } from "electron";
import { readFileSync, writeFileSync, rmSync, existsSync } from "fs";
import path from "path";

import type { PosteConfig } from "./config";

interface ConfigFile {
  nodeUrl: string;
  caisseId: string;
  codePoste?: string;
  nom?: string;
  /** Token de magasin chiffré (safeStorage) en base64. */
  storeTokenEnc: string;
}

/** Sérialise config + token chiffré (logique pure : fonction de chiffrement injectée). */
export function encodeConfigFile(config: PosteConfig, storeToken: string, encrypt: (s: string) => string): string {
  const file: ConfigFile = {
    nodeUrl: config.nodeUrl,
    caisseId: config.caisseId,
    codePoste: config.codePoste,
    nom: config.nom,
    storeTokenEnc: encrypt(storeToken),
  };
  return JSON.stringify(file, null, 2);
}

/** Désérialise (logique pure : fonction de déchiffrement injectée). null si invalide. */
export function decodeConfigFile(
  raw: string,
  decrypt: (b64: string) => string,
): { config: PosteConfig; storeToken: string } | null {
  let parsed: Partial<ConfigFile>;
  try {
    parsed = JSON.parse(raw) as Partial<ConfigFile>;
  } catch {
    return null;
  }
  if (!parsed.nodeUrl || !parsed.caisseId || !parsed.storeTokenEnc) return null;
  return {
    config: { nodeUrl: parsed.nodeUrl, caisseId: parsed.caisseId, codePoste: parsed.codePoste, nom: parsed.nom },
    storeToken: decrypt(parsed.storeTokenEnc),
  };
}

function configPath(): string {
  return path.join(app.getPath("userData"), "poste-config.json");
}

/** Indique si le chiffrement par trousseau OS est disponible (à vérifier AVANT l'échange). */
export function isSecureStorageAvailable(): boolean {
  return safeStorage.isEncryptionAvailable();
}

export function loadConfig(): { config: PosteConfig; storeToken: string } | null {
  const p = configPath();
  if (!existsSync(p)) return null;
  const raw = readFileSync(p, "utf8");
  return decodeConfigFile(raw, (b64) => safeStorage.decryptString(Buffer.from(b64, "base64")));
}

export function saveConfig(config: PosteConfig, storeToken: string): void {
  const raw = encodeConfigFile(config, storeToken, (s) => safeStorage.encryptString(s).toString("base64"));
  writeFileSync(configPath(), raw, { encoding: "utf8", mode: 0o600 });
}

export function clearConfig(): void {
  const p = configPath();
  if (existsSync(p)) rmSync(p);
}
```

- [ ] **Step 4: Lancer les tests (succès attendu)**

Run: `cd desktop && npx vitest run src/__tests__/config-store.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add desktop/src/config-store.ts desktop/src/__tests__/config-store.test.ts
git commit -m "feat(desktop): config-store (persistance config + token via safeStorage)"
```

---

## Task 8: `desktop/src/enrollment-client.ts` — échange

**Files:**
- Create: `desktop/src/enrollment-client.ts`
- Test: `desktop/src/__tests__/enrollment-client.test.ts`

**Interfaces:**
- Produces: `exchangeEnrollment(nodeUrl: string, token: string, nom: string | undefined, fetchFn?: typeof fetch): Promise<ExchangeResult>` où
  `ExchangeResult = { ok: true; storeToken: string; caisseId: string; codePoste: string; nom: string } | { ok: false; error: string }`.

- [ ] **Step 1: Écrire les tests (échec attendu)**

`desktop/src/__tests__/enrollment-client.test.ts` :

```ts
import { describe, it, expect, vi } from "vitest";
import { exchangeEnrollment } from "../enrollment-client";

function fakeFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as unknown as typeof fetch;
}

describe("exchangeEnrollment", () => {
  it("200 → ok avec storeToken + identité", async () => {
    const f = fakeFetch(200, { data: { storeToken: "s".repeat(64), caisseId: "c1", codePoste: "P1", nom: "Entrée" } });
    const r = await exchangeEnrollment("https://x:3000", "a".repeat(64), "Entrée", f);
    expect(r).toEqual({ ok: true, storeToken: "s".repeat(64), caisseId: "c1", codePoste: "P1", nom: "Entrée" });
    expect(f).toHaveBeenCalledWith("https://x:3000/api/enrollment/exchange", expect.objectContaining({ method: "POST" }));
  });

  it("401 → erreur invalide", async () => {
    const r = await exchangeEnrollment("https://x", "a", undefined, fakeFetch(401, { error: "Code d'enrôlement invalide ou expiré" }));
    expect(r).toEqual({ ok: false, error: "Code d'enrôlement invalide ou expiré" });
  });

  it("422 → erreur caisse", async () => {
    const r = await exchangeEnrollment("https://x", "a", undefined, fakeFetch(422, { error: "Caisse inactive — contactez l'administrateur" }));
    expect(r.ok).toBe(false);
  });

  it("réseau KO → erreur réseau", async () => {
    const f = vi.fn().mockRejectedValue(new Error("ECONNREFUSED")) as unknown as typeof fetch;
    const r = await exchangeEnrollment("https://x", "a", undefined, f);
    expect(r).toEqual({ ok: false, error: "Serveur injoignable à cette adresse" });
  });
});
```

- [ ] **Step 2: Lancer les tests (échec attendu)**

Run: `cd desktop && npx vitest run src/__tests__/enrollment-client.test.ts`
Expected: FAIL (introuvable).

- [ ] **Step 3: Implémenter `enrollment-client.ts`**

`desktop/src/enrollment-client.ts` :

```ts
/**
 * Échange du code d'enrôlement contre un token de magasin auprès du nœud.
 * fetch injectable pour les tests.
 */
export type ExchangeResult =
  | { ok: true; storeToken: string; caisseId: string; codePoste: string; nom: string }
  | { ok: false; error: string };

export async function exchangeEnrollment(
  nodeUrl: string,
  token: string,
  nom: string | undefined,
  fetchFn: typeof fetch = fetch,
): Promise<ExchangeResult> {
  let res: Response;
  try {
    res = await fetchFn(`${nodeUrl}/api/enrollment/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, ...(nom ? { nom } : {}) }),
    });
  } catch {
    return { ok: false, error: "Serveur injoignable à cette adresse" };
  }

  let body: { data?: { storeToken: string; caisseId: string; codePoste: string; nom: string }; error?: string };
  try {
    body = await res.json();
  } catch {
    return { ok: false, error: "Réponse invalide du serveur" };
  }

  if (!res.ok || !body.data) {
    return { ok: false, error: body.error ?? "Échec de l'enrôlement" };
  }
  const d = body.data;
  return { ok: true, storeToken: d.storeToken, caisseId: d.caisseId, codePoste: d.codePoste, nom: d.nom };
}
```

- [ ] **Step 4: Lancer les tests (succès attendu)**

Run: `cd desktop && npx vitest run src/__tests__/enrollment-client.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add desktop/src/enrollment-client.ts desktop/src/__tests__/enrollment-client.test.ts
git commit -m "feat(desktop): enrollment-client (échange code → token de magasin)"
```

---

## Task 9: Canal IPC d'enrôlement + preload

**Files:**
- Modify: `desktop/src/channels.ts`
- Create: `desktop/src/enroll-preload.ts`

**Interfaces:**
- Consumes: rien.
- Produces: `ENROLL_CHANNELS = { submit: "aeris:enroll-submit" }` ; `window.aerisEnroll.submit(input)` côté renderer d'enrôlement.

- [ ] **Step 1: Ajouter le canal**

Dans `desktop/src/channels.ts`, après `DEVICE_CHANNELS` :

```ts
export const ENROLL_CHANNELS = {
  submit: "aeris:enroll-submit",
} as const;
```

- [ ] **Step 2: Créer le preload d'enrôlement**

`desktop/src/enroll-preload.ts` :

```ts
/**
 * Preload de la fenêtre d'enrôlement (locale). Expose UNIQUEMENT aerisEnroll —
 * jamais exposé à l'UI distante du nœud (fenêtre kiosque = preload séparé).
 */
import { contextBridge, ipcRenderer } from "electron";

import { ENROLL_CHANNELS } from "./channels";

export interface EnrollInput {
  nodeUrl: string;
  token: string;
  nom?: string;
}

contextBridge.exposeInMainWorld("aerisEnroll", {
  submit: (input: EnrollInput) => ipcRenderer.invoke(ENROLL_CHANNELS.submit, input),
});
```

- [ ] **Step 3: Vérifier que la suite desktop reste verte**

Run: `cd desktop && npx vitest run`
Expected: PASS (tous les tests, dont `channels.test.ts`).

- [ ] **Step 4: Commit**

```bash
git add desktop/src/channels.ts desktop/src/enroll-preload.ts
git commit -m "feat(desktop): canal IPC d'enrôlement + preload aerisEnroll isolé"
```

---

## Task 10: Formulaire d'enrôlement (renderer)

**Files:**
- Modify: `desktop/renderer/config.html`
- Create: `desktop/renderer/config.js`

**Interfaces:**
- Consumes: `window.aerisEnroll.submit` (Task 9).

- [ ] **Step 1: Réécrire `config.html` (3 champs + zone d'état + script)**

`desktop/renderer/config.html` :

```html
<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self' 'unsafe-inline'" />
    <title>Enrôlement du poste</title>
    <style>
      body { font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc;
             display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
      form { width: 26rem; padding: 2rem; }
      h1 { font-size: 1.25rem; }
      label { display: block; margin: 1rem 0 .25rem; color: #cbd5e1; }
      input { width: 100%; padding: .5rem; border-radius: .375rem; border: 1px solid #334155;
              background: #1e293b; color: #f8fafc; }
      button { margin-top: 1.5rem; width: 100%; padding: .6rem; border: 0; border-radius: .375rem;
               background: #2563eb; color: white; font-weight: 600; cursor: pointer; }
      button[disabled] { opacity: .5; cursor: default; }
      .hint { color: #94a3b8; font-size: .85rem; margin-top: .5rem; }
      .error { color: #fca5a5; font-size: .9rem; margin-top: 1rem; }
      .ok { color: #86efac; font-size: .9rem; margin-top: 1rem; }
    </style>
  </head>
  <body>
    <form id="enroll-form">
      <h1>Enrôlement du poste</h1>
      <label for="nodeUrl">URL du nœud magasin (LAN)</label>
      <input id="nodeUrl" placeholder="https://magasin.local:3000" />
      <label for="token">Code d'enrôlement</label>
      <input id="token" type="password" placeholder="code fourni par l'administrateur" />
      <label for="nom">Nom de la caisse (optionnel)</label>
      <input id="nom" placeholder="ex. Caisse Entrée" />
      <button type="submit" id="submit-btn">Enrôler ce poste</button>
      <p class="hint">Le secret est stocké dans le trousseau de l'OS, jamais en clair.</p>
      <p id="status"></p>
    </form>
    <script src="config.js"></script>
  </body>
</html>
```

- [ ] **Step 2: Créer `config.js` (handler)**

`desktop/renderer/config.js` :

```js
const form = document.getElementById("enroll-form");
const btn = document.getElementById("submit-btn");
const status = document.getElementById("status");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  status.className = "";
  status.textContent = "";
  btn.disabled = true;

  const input = {
    nodeUrl: document.getElementById("nodeUrl").value,
    token: document.getElementById("token").value,
    nom: document.getElementById("nom").value,
  };

  const res = await window.aerisEnroll.submit(input);

  if (res && res.ok) {
    status.className = "ok";
    status.textContent = `Caisse « ${res.nom} » (${res.codePoste}) enrôlée. Démarrage…`;
    // Le main bascule en kiosque ; pas d'action supplémentaire ici.
  } else {
    status.className = "error";
    status.textContent = (res && res.error) || "Échec de l'enrôlement.";
    btn.disabled = false;
  }
});
```

- [ ] **Step 3: Vérifier la présence des fichiers au build**

Run: `cd desktop && ls renderer/config.html renderer/config.js`
Expected: les deux fichiers existent. (Vérifier que `electron-builder.yml` / le packaging inclut `renderer/**` — c'est déjà le cas pour `blocked.html`/`config.html`.)

- [ ] **Step 4: Commit**

```bash
git add desktop/renderer/config.html desktop/renderer/config.js
git commit -m "feat(desktop): formulaire d'enrôlement (URL + code + nom) + handler"
```

---

## Task 11: Orchestration `main.ts` (2 fenêtres, IPC, menu reset)

**Files:**
- Modify: `desktop/src/main.ts`

**Interfaces:**
- Consumes: `loadConfig/saveConfig/clearConfig/isSecureStorageAvailable` (Task 7), `validateEnrollInput` (Task 6), `exchangeEnrollment` (Task 8), `ENROLL_CHANNELS` (Task 9), `DEVICE_CHANNELS`, `printTicket/openDrawer`.

- [ ] **Step 1: Réécrire `main.ts`**

`desktop/src/main.ts` :

```ts
/**
 * Process principal Electron du client caisse AerisPay.
 * - Premier lancement sans config → fenêtre d'enrôlement (locale, preload aerisEnroll).
 * - Config présente → fenêtre kiosque (UI distante du nœud, preload aerisDevices).
 * - Health-check continu + écran de blocage (ADR-001 : pas de mode dégradé).
 * - Menu « Réinitialiser l'enrôlement ».
 */
import { app, BrowserWindow, ipcMain, session, shell, Menu } from "electron";
import { autoUpdater } from "electron-updater";
import path from "path";

import { secureWebPreferences, isAllowedNavigation, buildCsp } from "./security";
import { DEVICE_CHANNELS, ENROLL_CHANNELS } from "./channels";
import { printTicket, openDrawer } from "./devices";
import { loadConfig, saveConfig, clearConfig, isSecureStorageAvailable } from "./config-store";
import { validateEnrollInput } from "./config";
import { exchangeEnrollment, type ExchangeResult } from "./enrollment-client";
import type { EnrollInput } from "./enroll-preload";

const HEALTH_INTERVAL_MS = 15_000;

let mainWindow: BrowserWindow | null = null;
let nodeUrl = process.env.AERIS_NODE_URL ?? "";
let nodeAvailable = false;
let healthTimer: NodeJS.Timeout | null = null;

async function checkNodeHealth(): Promise<boolean> {
  if (!nodeUrl) return false;
  try {
    const res = await fetch(`${nodeUrl}/api/health`, { signal: AbortSignal.timeout(5_000) });
    return res.ok;
  } catch {
    return false;
  }
}

function applyCsp(win: BrowserWindow) {
  win.webContents.session.webRequest.onHeadersReceived((details, cb) => {
    cb({ responseHeaders: { ...details.responseHeaders, "Content-Security-Policy": [buildCsp(nodeUrl)] } });
  });
}

function restrictNavigation(win: BrowserWindow) {
  win.webContents.on("will-navigate", (event, url) => {
    if (!isAllowedNavigation(url, nodeUrl)) event.preventDefault();
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!isAllowedNavigation(url, nodeUrl)) void shell.openExternal(url);
    return { action: "deny" };
  });
}

function clearHealthTimer() {
  if (healthTimer) { clearInterval(healthTimer); healthTimer = null; }
}

/** Fenêtre d'enrôlement (locale, preload isolé). */
function createEnrollWindow() {
  clearHealthTimer();
  if (mainWindow) { mainWindow.destroy(); mainWindow = null; }
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    kiosk: process.env.AERIS_KIOSK === "true",
    webPreferences: { ...secureWebPreferences(), preload: path.join(__dirname, "enroll-preload.js") },
  });
  void mainWindow.loadFile(path.join(__dirname, "..", "renderer", "config.html"));
}

/** Fenêtre kiosque (UI distante du nœud). */
function createKioskWindow() {
  clearHealthTimer();
  if (mainWindow) { mainWindow.destroy(); mainWindow = null; }
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    kiosk: process.env.AERIS_KIOSK === "true",
    webPreferences: { ...secureWebPreferences(), preload: path.join(__dirname, "preload.js") },
  });
  applyCsp(mainWindow);
  restrictNavigation(mainWindow);
  void renderState(mainWindow);
  healthTimer = setInterval(async () => {
    if (!mainWindow) return;
    const ok = await checkNodeHealth();
    if (ok !== nodeAvailable) await renderState(mainWindow);
  }, HEALTH_INTERVAL_MS);
}

async function renderState(win: BrowserWindow) {
  nodeAvailable = await checkNodeHealth();
  if (nodeAvailable) {
    await win.loadURL(nodeUrl);
  } else {
    await win.loadFile(path.join(__dirname, "..", "renderer", "blocked.html"));
  }
}

/** Décide de l'écran de départ selon la présence d'une config. */
function bootstrap() {
  const stored = loadConfig();
  if (stored) {
    nodeUrl = process.env.AERIS_NODE_URL ?? stored.config.nodeUrl;
    createKioskWindow();
  } else {
    createEnrollWindow();
  }
}

/** Handler de soumission du formulaire d'enrôlement. */
async function handleEnrollSubmit(_e: unknown, input: EnrollInput): Promise<ExchangeResult> {
  const validated = validateEnrollInput(input);
  if (!validated.ok || !validated.value) {
    return { ok: false, error: validated.errors[0] ?? "Saisie invalide" };
  }
  // Ne pas brûler le code si l'on ne pourra pas stocker le résultat.
  if (!isSecureStorageAvailable()) {
    return { ok: false, error: "Trousseau OS indisponible — enrôlement impossible" };
  }
  const { nodeUrl: url, token, nom } = validated.value;
  const result = await exchangeEnrollment(url, token, nom);
  if (!result.ok) return result;

  saveConfig(
    { nodeUrl: url, caisseId: result.caisseId, codePoste: result.codePoste, nom: result.nom },
    result.storeToken,
  );
  nodeUrl = process.env.AERIS_NODE_URL ?? url;
  setImmediate(() => createKioskWindow());
  return result;
}

function buildMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: "AerisPay",
      submenu: [
        {
          label: "Réinitialiser l'enrôlement",
          click: () => {
            clearConfig();
            nodeUrl = process.env.AERIS_NODE_URL ?? "";
            createEnrollWindow();
          },
        },
        { type: "separator" },
        { role: "quit" },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function registerDeviceBridge() {
  ipcMain.handle(DEVICE_CHANNELS.printTicket, (_e, lines: string[]) => printTicket(lines));
  ipcMain.handle(DEVICE_CHANNELS.openDrawer, () => openDrawer());
  ipcMain.handle(DEVICE_CHANNELS.printerStatus, () => ({ nodeAvailable }));
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  registerDeviceBridge();
  ipcMain.handle(ENROLL_CHANNELS.submit, handleEnrollSubmit);
  buildMenu();
  bootstrap();

  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify().catch(() => undefined);
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) bootstrap();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
```

- [ ] **Step 2: Vérifier le typage + la suite desktop**

Run: `cd desktop && npx tsc --noEmit && npx vitest run`
Expected: aucune erreur de type ; tous les tests verts.

- [ ] **Step 3: Commit**

```bash
git add desktop/src/main.ts
git commit -m "feat(desktop): orchestration enrôlement→kiosque + menu réinitialiser"
```

---

## Task 12: Mettre à jour la doc pérenne

**Files:**
- Modify: `ARCHITECTURE_MVP.md` (§3 ADR, §6 enrôlement, §9.2 stack, §12 modèle de données)
- Modify: `docs/product/09-pages-api.md` (endpoints enrollment)
- Modify: `desktop/README.md` (tableau « Périmètre des fichiers »)

**Interfaces:** documentation seulement.

- [ ] **Step 1: §3 — ajouter ADR-007 (révise ADR-003)**

Dans `ARCHITECTURE_MVP.md` §3, après ADR-006, ajouter :

```markdown
### ADR-007 — Enrôlement par token à usage unique (révise ADR-003)

**Décision.** L'admin n'émet plus directement le token de magasin : il émet un **token
d'enrôlement à usage unique** (courte durée). Le poste l'**échange** une seule fois contre un
**token de magasin** longue durée (ADR-003), stocké au trousseau OS.

**Conséquences.** Un code pasté ne peut servir qu'une fois (consommé à l'échange) ; le credential
longue durée n'est jamais saisi à la main. Nouveau modèle `EnrollmentToken` (single-use) ;
`POST /api/enrollment` émet le code ; `POST /api/enrollment/exchange` le consomme, (re)nomme la
caisse et émet le token de magasin.
```

- [ ] **Step 2: §6 — refléter le flux d'échange**

Dans `ARCHITECTURE_MVP.md` §6.5, remplacer le point 2-3 par : « 2. Écran d'enrôlement : URL + **code d'enrôlement** (usage unique) + nom de la caisse. 3. Le poste **échange** le code (`POST /api/enrollment/exchange`) → le nœud le consomme, renomme la caisse, renvoie un **token de magasin** que le poste stocke au trousseau OS. »

- [ ] **Step 3: §12.1 — ajouter le modèle `EnrollmentToken`**

Dans le tableau §12.1, ajouter une ligne après `StoreToken` :

```markdown
| `EnrollmentToken` | Code d'enrôlement (single-use) | Scopé `caisseId` ; `expiresAt`, `consumedAt` ; échangé contre un `StoreToken` (ADR-007) |
```

- [ ] **Step 4: `docs/product/09-pages-api.md` — endpoints**

Ajouter/mettre à jour la famille enrollment : `POST /api/enrollment` (ADMIN — émet un code d'enrôlement) et `POST /api/enrollment/exchange` (public/token — échange contre un token de magasin, renomme la caisse).

- [ ] **Step 5: `desktop/README.md` — refléter les nouveaux fichiers**

Dans le tableau « Périmètre des fichiers » de `desktop/README.md`, ajouter/mettre à jour les lignes :

```markdown
| `src/config.ts` | Validation de la saisie d'enrôlement (URL + code + nom) ; en-têtes d'auth |
| `src/config-store.ts` | Persistance config + token de magasin (safeStorage / trousseau OS) |
| `src/enrollment-client.ts` | Échange du code contre un token de magasin (POST /api/enrollment/exchange) |
| `src/enroll-preload.ts` | Bridge `window.aerisEnroll` (fenêtre d'enrôlement, isolé du kiosque) |
| `renderer/config.html` + `renderer/config.js` | Formulaire d'enrôlement (URL + code + nom) + handler |
| `src/main.ts` | Orchestration : 1er lancement → enrôlement, sinon kiosque ; menu « Réinitialiser l'enrôlement » |
```

- [ ] **Step 6: §9.2 — mentionner safeStorage dans la stack client**

Dans `ARCHITECTURE_MVP.md` §9.2 (Client caisse), ajouter une ligne au tableau : `| Secrets | safeStorage (trousseau OS) | Token de magasin chiffré au repos (jamais en clair) |`.

- [ ] **Step 7: Commit**

```bash
git add ARCHITECTURE_MVP.md docs/product/09-pages-api.md desktop/README.md
git commit -m "docs: ADR-007 + flux d'enrôlement + fichiers desktop (doc pérenne)"
```

---

## Task 13: Vérification finale + suppression spec & plan (politique éphémère)

**Files:**
- Delete: `docs/superpowers/specs/2026-06-26-enrolement-poste-design.md`
- Delete: `docs/superpowers/plans/2026-06-26-enrolement-poste.md`

- [ ] **Step 1: Suite complète nœud**

Run: `cd web/app && npx vitest run`
Expected: PASS (baseline ≈ 899 + nouveaux tests enrollment).

- [ ] **Step 2: Suite complète desktop + typage**

Run: `cd desktop && npx tsc --noEmit && npx vitest run`
Expected: PASS (7 + config/config-store/enrollment-client).

- [ ] **Step 3: GARDE-FOU — la doc pérenne a bien absorbé la feature (BLOQUANT)**

Vérifier que la connaissance durable est présente AVANT de supprimer spec/plan. Si une seule
vérification échoue : **NE PAS supprimer** — retourner à la Task 12, compléter la doc, puis revenir.

```bash
set -e
grep -q "ADR-007" ARCHITECTURE_MVP.md
grep -q "EnrollmentToken" ARCHITECTURE_MVP.md
grep -q "enrollment/exchange" docs/product/09-pages-api.md
grep -q "config-store" desktop/README.md
echo "✓ Doc pérenne à jour — suppression spec/plan autorisée"
```

Expected: les 4 `grep` réussissent et la ligne `✓ ...` s'affiche. Sinon (`grep` code ≠ 0) :
arrêter, compléter la doc (Task 12), recommencer ce step.

- [ ] **Step 4: Supprimer la spec et le plan (CLAUDE.md §8.1)**

```bash
git rm docs/superpowers/specs/2026-06-26-enrolement-poste-design.md docs/superpowers/plans/2026-06-26-enrolement-poste.md
```

- [ ] **Step 5: Commit final**

```bash
git add -A
git commit -m "chore(enrollment): clôture — suppression spec & plan (implémentés)"
```

---

## Notes de revue (self-review)

- **Couverture spec** : modèle EnrollmentToken (T1), service single-use (T2), émission code (T3), échange+renommage (T4), UI admin (T5), formulaire 3 champs (T6/T10), persistance safeStorage + garde « ne pas brûler le code » (T7/T11), exchange client (T8), 2 fenêtres/preloads isolés (T9/T11), menu reset (T11), docs ADR-007 (T12), suppression spec/plan (T13). ✔
- **Non-objectifs** (injection du token à chaque requête, mTLS, mode « nœud ») : non couverts volontairement (cf. spec §11).
- **Cohérence des types** : `ExchangeResult` (T8) consommé tel quel par `handleEnrollSubmit` (T11) ; `PosteConfig` (T6) utilisé par config-store (T7) et main (T11) ; `EnrollInput` (T9) importé par main (T11).
- **Point d'attention** : `logActivity` avec `actorId: null` (T4) — si la signature impose un acteur, l'assouplir dans T4 step 3.
