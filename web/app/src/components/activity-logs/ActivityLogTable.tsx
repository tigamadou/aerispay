"use client";

import Link from "next/link";
import { formatDateTime } from "@/lib/utils";

interface LogRow {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
  actor: { id: string; nom: string; email: string } | null;
}

interface ActivityLogTableProps {
  logs: LogRow[];
  total: number;
  page: number;
  pageSize: number;
  showIp: boolean;
}

const actionLabels: Record<string, { label: string; classes: string }> = {
  AUTH_LOGIN_SUCCESS: { label: "Connexion", classes: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" },
  AUTH_LOGIN_FAILED: { label: "Échec connexion", classes: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
  AUTH_LOGOUT: { label: "Déconnexion", classes: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" },
  USER_CREATED: { label: "Utilisateur créé", classes: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  USER_UPDATED: { label: "Utilisateur modifié", classes: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  USER_DEACTIVATED: { label: "Utilisateur désactivé", classes: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
  PRODUCT_CREATED: { label: "Produit créé", classes: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
  PRODUCT_UPDATED: { label: "Produit modifié", classes: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
  PRODUCT_DEACTIVATED: { label: "Produit désactivé", classes: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300" },
  CATEGORY_CREATED: { label: "Catégorie créée", classes: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300" },
  CATEGORY_UPDATED: { label: "Catégorie modifiée", classes: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300" },
  CATEGORY_DELETED: { label: "Catégorie supprimée", classes: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
  STOCK_MOVEMENT_CREATED: { label: "Mouvement stock", classes: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300" },
  CASH_SESSION_OPENED: { label: "Session ouverte", classes: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" },
  CASH_SESSION_CLOSED: { label: "Session fermée", classes: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" },
  SALE_COMPLETED: { label: "Vente", classes: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" },
  SALE_CANCELLED: { label: "Vente annulée", classes: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
};

function summarize(log: LogRow): string {
  const meta = log.metadata;
  if (!meta) return "";
  const parts: string[] = [];
  if (meta.nom) parts.push(String(meta.nom));
  if (meta.reference) parts.push(String(meta.reference));
  if (meta.type) parts.push(String(meta.type));
  if (meta.quantite) parts.push(`qté: ${meta.quantite}`);
  if (meta.email) parts.push(String(meta.email));
  return parts.join(" — ");
}

function entityLink(log: LogRow): string | null {
  if (!log.entityType || !log.entityId) return null;
  switch (log.entityType) {
    case "Product": return `/stock/${log.entityId}`;
    case "Category": return "/stock/categories";
    case "StockMovement": return "/stock/mouvements";
    case "User": return `/users/${log.entityId}`;
    default: return null;
  }
}

export function ActivityLogTable({ logs, total, page, pageSize, showIp }: ActivityLogTableProps) {
  const totalPages = Math.ceil(total / pageSize);

  function paginationHref(p: number) {
    if (typeof window === "undefined") return `/activity-logs?page=${p}`;
    const params = new URLSearchParams(window.location.search);
    params.set("page", String(p));
    return `/activity-logs?${params.toString()}`;
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-900 text-left text-zinc-500 dark:text-zinc-400">
            <tr>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Acteur</th>
              <th className="px-4 py-3 font-medium">Action</th>
              <th className="px-4 py-3 font-medium">Entité</th>
              <th className="px-4 py-3 font-medium">Résumé</th>
              {showIp && <th className="px-4 py-3 font-medium">IP</th>}
              <th className="px-4 py-3 font-medium sr-only">Detail</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {logs.map((log) => {
              const info = actionLabels[log.action] ?? { label: log.action, classes: "bg-zinc-100 text-zinc-700" };
              const link = entityLink(log);
              return (
                <tr key={log.id} className="text-zinc-700 dark:text-zinc-300">
                  <td className="px-4 py-3 whitespace-nowrap">{formatDateTime(log.createdAt)}</td>
                  <td className="px-4 py-3">
                    {log.actor ? (
                      <span title={log.actor.email}>{log.actor.nom}</span>
                    ) : (
                      <span className="text-zinc-400 italic">Système</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${info.classes}`}>
                      {info.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {log.entityType && (
                      link ? (
                        <Link href={link} className="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 text-xs">
                          {log.entityType}
                        </Link>
                      ) : (
                        <span className="text-xs text-zinc-400">{log.entityType}</span>
                      )
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-500 text-xs max-w-xs truncate" title={summarize(log)}>
                    {summarize(log)}
                  </td>
                  {showIp && (
                    <td className="px-4 py-3 font-mono text-xs text-zinc-400">
                      {log.ipAddress ?? "-"}
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <Link
                      href={`/activity-logs/${log.id}`}
                      className="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 text-xs font-medium"
                    >
                      Detail
                    </Link>
                  </td>
                </tr>
              );
            })}
            {logs.length === 0 && (
              <tr>
                <td colSpan={showIp ? 7 : 6} className="px-4 py-8 text-center text-zinc-400">
                  Aucune activité trouvée.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-zinc-500">
          <span>
            Page {page} sur {totalPages} ({total} entrée{total > 1 ? "s" : ""})
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={paginationHref(page - 1)}
                className="rounded border border-zinc-300 px-3 py-1 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                Précédent
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={paginationHref(page + 1)}
                className="rounded border border-zinc-300 px-3 py-1 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                Suivant
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
