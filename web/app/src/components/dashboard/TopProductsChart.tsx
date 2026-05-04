"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface TopProduct {
  productId: string;
  name: string;
  quantitySold: number;
  revenueTtc: number;
}

interface TopProductsChartProps {
  data: TopProduct[];
  formatMontant: (v: number) => string;
}

const COLORS = ["#6366f1", "#8b5cf6", "#a78bfa", "#c4b5fd", "#ddd6fe"];

export function TopProductsChart({ data, formatMontant }: TopProductsChartProps) {
  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h3 className="mb-4 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          Top 5 produits — 7 derniers jours
        </h3>
        <p className="py-8 text-center text-sm text-zinc-400">Aucune vente sur la periode</p>
      </div>
    );
  }

  const chartData = data.map((p) => ({
    name: p.name.length > 15 ? p.name.slice(0, 14) + "…" : p.name,
    fullName: p.name,
    quantite: p.quantitySold,
    ca: p.revenueTtc,
  }));

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <h3 className="mb-4 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
        Top 5 produits — 7 derniers jours
      </h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
          >
            <XAxis
              type="number"
              tick={{ fontSize: 11, fill: "#71717a" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fontSize: 12, fill: "#71717a" }}
              axisLine={false}
              tickLine={false}
              width={110}
            />
            <Tooltip
              formatter={(value, _name, props) => [
                `${value} vendus — CA: ${formatMontant(Number((props.payload as Record<string, unknown>).ca))}`,
                "Quantite",
              ]}
              labelFormatter={(_label, payload) => {
                const first = payload?.[0]?.payload as Record<string, unknown> | undefined;
                return (first?.fullName as string) ?? String(_label);
              }}
              contentStyle={{
                borderRadius: 8,
                border: "1px solid #e4e4e7",
                fontSize: 13,
              }}
            />
            <Bar dataKey="quantite" radius={[0, 4, 4, 0]} maxBarSize={32}>
              {chartData.map((_, index) => (
                <Cell key={index} fill={COLORS[index % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
