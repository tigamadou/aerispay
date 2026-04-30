import { SignOutButton } from "@/components/dashboard/SignOutButton";
import { auth } from "@/auth";
import Link from "next/link";
import type { ReactNode } from "react";

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

  return (
    <div className="min-h-svh flex flex-col">
      <header className="border-b border-zinc-200 bg-zinc-50/80 dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              AerisPay
            </Link>
            <nav className="flex items-center gap-3 text-sm text-zinc-600 dark:text-zinc-400" aria-label="Navigation principale">
              <span className="text-zinc-500">Stock</span>
              <span className="text-zinc-500">Caisse</span>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden sm:inline text-zinc-600 dark:text-zinc-400">
              {session.user.name ?? session.user.email}
              {session.user.role
                ? ` — ${roleLabel[session.user.role] ?? session.user.role}`
                : null}
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 p-4">{children}</main>
    </div>
  );
}
