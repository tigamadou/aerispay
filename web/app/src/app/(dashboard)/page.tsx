import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">Tableau de bord</h1>
      <p className="text-zinc-600 dark:text-zinc-400">
        Bienvenue, {session.user.name ?? session.user.email}. Les indicateurs (KPI) seront
        affichés ici selon <code className="text-sm">SPECS/DASHBOARD.md</code>.
      </p>
    </div>
  );
}
