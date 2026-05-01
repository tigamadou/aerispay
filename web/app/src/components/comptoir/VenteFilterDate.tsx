"use client";

import { useRouter, useSearchParams } from "next/navigation";

interface VenteFilterDateClientProps {
  name: string;
  value?: string;
}

export function VenteFilterDateClient({ name, value }: VenteFilterDateClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  return (
    <input
      type="date"
      value={value ?? ""}
      onChange={(e) => {
        const params = new URLSearchParams(searchParams.toString());
        if (e.target.value) {
          params.set(name, e.target.value);
        } else {
          params.delete(name);
        }
        params.delete("page");
        const qs = params.toString();
        router.push(`/comptoir/ventes${qs ? `?${qs}` : ""}`);
      }}
      className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
    />
  );
}
