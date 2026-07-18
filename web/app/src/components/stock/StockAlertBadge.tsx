"use client";

import { cn } from "@/lib/utils";

interface StockAlertBadgeProps {
  stockActuel: number;
  stockMinimum: number;
}

export function StockAlertBadge({ stockActuel, stockMinimum }: StockAlertBadgeProps) {
  let label: string;
  let classes: string;

  if (stockActuel === 0) {
    label = "Épuisé";
    classes = "bg-red-200 text-red-800 dark:bg-red-900/40 dark:text-red-300";
  } else if (stockActuel <= stockMinimum) {
    label = "Rupture";
    classes = "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300";
  } else if (stockActuel <= 2 * stockMinimum) {
    label = "Alerte";
    classes = "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300";
  } else {
    label = "Normal";
    classes = "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300";
  }

  return (
    <span
      className={cn(
        "inline-block rounded-full px-2.5 py-0.5 text-xs font-medium",
        classes
      )}
    >
      {label}
    </span>
  );
}
