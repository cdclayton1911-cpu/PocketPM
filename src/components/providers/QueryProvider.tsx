"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

/**
 * TanStack Query provider.
 *
 * The client is created inside `useState` rather than at module scope: on the
 * server a module-level client would be shared across requests, leaking one
 * user's cached data into another's response. This keeps one client per browser
 * session and one per server render.
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Lists arrive from the server as initialData; treating them as
            // fresh briefly avoids an immediate duplicate fetch on mount.
            staleTime: 30_000,
            // Retrying a 401/404 just delays the error the user needs to see.
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
