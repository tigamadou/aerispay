import { SignOutButton } from "@/components/dashboard/SignOutButton";
import { auth } from "@/auth";
import Link from "next/link";
import type { ReactNode } from "react";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import type { Role } from "@prisma/client";

const roleLabel: Record<string, string> = {
  ADMIN: "Administrateur",
  MANAGER: "Gérant",
  CAISSIER: "Caissier",
};

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user) {
    return null;
  }

  const role = session.user.role as Role;
  const canManageUsers = hasPermission(role, "users:manage");
  const canViewLogs = hasPermission(role, "activity_logs:consulter");
  const canManageParametres = hasPermission(role, "parametres:manage");

  // Check if user has an open cash session (for sign-out flow)
  const openSession = await prisma.caisseSession.findFirst({
    where: { userId: session.user.id, statut: "OUVERTE" },
    select: { id: true },
  });

  return (
    <div className="h-svh flex flex-col overflow-hidden">
      <header className="border-b border-zinc-200 bg-zinc-50/80 dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="mx-auto flex h-14  items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              AerisPay
            </Link>
            <nav className="flex items-center gap-3 text-sm" aria-label="Navigation principale">
              <Link href="/stock" className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
                Stock
              </Link>
              <Link href="/caisse" className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
                Caisse
              </Link>
              <Link href="/caisse/ventes" className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
                Ventes
              </Link>
              {canManageUsers && (
                <Link href="/users" className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
                  Utilisateurs
                </Link>
              )}
              {canViewLogs && (
                <Link href="/activity-logs" className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
                  Journal
                </Link>
              )}
              {canManageParametres && (
                <Link href="/parametres" className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
                  Parametres
                </Link>
              )}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden sm:inline text-zinc-600 dark:text-zinc-400">
              {session.user.name ?? session.user.email}
              {session.user.role
                ? ` — ${roleLabel[session.user.role] ?? session.user.role}`
                : null}
            </span>
            <SignOutButton openSessionId={openSession?.id ?? null} />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full flex-1 min-h-0 flex flex-col overflow-auto p-4">{children}</main>
    </div>
  );
}
