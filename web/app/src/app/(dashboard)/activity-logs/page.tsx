import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { ActivityLogTable } from "@/components/activity-logs/ActivityLogTable";
import { ACTIONS } from "@/lib/activity-log";
import type { Metadata } from "next";
import type { Role } from "@prisma/client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Journal d'activité",
};

interface ActivityLogsPageProps {
  searchParams: Promise<{
    page?: string;
    action?: string;
    actorId?: string;
    entityType?: string;
    dateDebut?: string;
    dateFin?: string;
  }>;
}

export default async function ActivityLogsPage({ searchParams }: ActivityLogsPageProps) {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role as Role, "activity_logs:consulter")) {
    redirect("/");
  }

  const isAdmin = session.user.role === "ADMIN";
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1"));
  const pageSize = 20;

  const where: Record<string, unknown> = {};
  if (params.action) where.action = params.action;
  if (params.actorId) where.actorId = params.actorId;
  if (params.entityType) where.entityType = params.entityType;
  if (params.dateDebut || params.dateFin) {
    const createdAt: Record<string, Date> = {};
    if (params.dateDebut) createdAt.gte = new Date(params.dateDebut);
    if (params.dateFin) createdAt.lte = new Date(params.dateFin);
    where.createdAt = createdAt;
  }

  const [logs, total, users] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      include: {
        actor: { select: { id: true, nom: true, email: true } },
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: "desc" },
    }),
    prisma.activityLog.count({ where }),
    prisma.user.findMany({
      select: { id: true, nom: true },
      orderBy: { nom: "asc" },
    }),
  ]);

  const serialized = logs.map((l) => ({
    id: l.id,
    action: l.action,
    entityType: l.entityType,
    entityId: l.entityId,
    metadata: l.metadata as Record<string, unknown> | null,
    ipAddress: l.ipAddress,
    createdAt: l.createdAt.toISOString(),
    actor: l.actor,
  }));

  const actionOptions = Object.values(ACTIONS);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
          Journal d{"'"}activité
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Historique des opérations effectuées sur le point de vente.
        </p>
      </div>

      {/* Filters */}
      <form className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">Action</label>
          <select
            name="action"
            defaultValue={params.action ?? ""}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            <option value="">Toutes</option>
            {actionOptions.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">Utilisateur</label>
          <select
            name="actorId"
            defaultValue={params.actorId ?? ""}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            <option value="">Tous</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.nom}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">Entité</label>
          <select
            name="entityType"
            defaultValue={params.entityType ?? ""}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            <option value="">Toutes</option>
            <option value="Product">Produit</option>
            <option value="Category">Catégorie</option>
            <option value="StockMovement">Mouvement stock</option>
            <option value="User">Utilisateur</option>
            <option value="Sale">Vente</option>
            <option value="ComptoirSession">Session comptoir</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">Date début</label>
          <input
            name="dateDebut"
            type="date"
            defaultValue={params.dateDebut ?? ""}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">Date fin</label>
          <input
            name="dateFin"
            type="date"
            defaultValue={params.dateFin ?? ""}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </div>
        <button
          type="submit"
          className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Filtrer
        </button>
      </form>

      <ActivityLogTable
        logs={serialized}
        total={total}
        page={page}
        pageSize={pageSize}
        showIp={isAdmin}
      />
    </div>
  );
}
