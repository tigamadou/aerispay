"use client";

import { useState, useEffect } from "react";
import { SalesChart } from "./SalesChart";
import { TopProductsChart } from "./TopProductsChart";
import { formatMontant } from "@/lib/utils";

interface SalesDay {
  date: string;
  revenue: number;
}

interface TopProduct {
  productId: string;
  name: string;
  quantitySold: number;
  revenueTtc: number;
}

interface ChartData {
  salesLast7Days: SalesDay[];
  topProducts7Days: TopProduct[];
}

export function DashboardCharts() {
  const [data, setData] = useState<ChartData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCharts() {
      try {
        const res = await fetch("/api/dashboard/kpis?period=day");
        if (!res.ok) return;
        const body = await res.json();
        setData({
          salesLast7Days: body.data.salesLast7Days ?? [],
          topProducts7Days: body.data.topProducts7Days ?? [],
        });
      } catch {
        // silently fail — charts are non-critical
      } finally {
        setLoading(false);
      }
    }
    void fetchCharts();
  }, []);

  if (loading) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-80 animate-pulse rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900" />
        <div className="h-80 animate-pulse rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900" />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <SalesChart data={data.salesLast7Days} formatMontant={formatMontant} />
      <TopProductsChart data={data.topProducts7Days} formatMontant={formatMontant} />
    </div>
  );
}
