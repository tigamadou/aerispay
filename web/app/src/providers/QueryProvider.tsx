"use client";

/**
 * TanStack Query Provider for AerisPay.
 *
 * PREREQUISITE: Install the package before using this provider:
 *   cd web/app && npm install @tanstack/react-query
 *
 * Then wrap the app layout with <QueryProvider>:
 *   import { QueryProvider } from "@/providers/QueryProvider";
 *   export default function RootLayout({ children }) {
 *     return <QueryProvider>{children}</QueryProvider>;
 *   }
 *
 * Stale time is set to 30s for dashboard-style data that refreshes
 * periodically but doesn't need real-time updates.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

interface QueryProviderProps {
  children: React.ReactNode;
}

export function QueryProvider({ children }: QueryProviderProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
