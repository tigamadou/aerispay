/**
 * Reusable KPI card extracted from the dashboard and ventes pages.
 * Use this component instead of defining local KpiCard functions.
 */

interface KPICardProps {
  label: string;
  value: string;
  sub?: string;
  small?: boolean;
}

export function KPICard({ label, value, sub, small }: KPICardProps) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className={`mt-1 font-bold text-zinc-900 dark:text-zinc-100 ${small ? "text-sm" : "text-2xl"}`}>
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-zinc-400">{sub}</p>}
    </div>
  );
}
