"use client";

import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider, isServer } from "@tanstack/react-query";

import { makeQueryClient } from "@/lib/query/client";
import { setBrowserQueryClient } from "@/lib/query/reset-client-state";

let browserQueryClient: QueryClient | undefined;

/** One client per server render; one for the whole browser session. */
function getQueryClient() {
  if (isServer) return makeQueryClient();
  if (!browserQueryClient) browserQueryClient = makeQueryClient();
  return browserQueryClient;
}

export default function QueryProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [queryClient] = useState(getQueryClient);

  // Lets the session store clear the cache on an identity change (`lib/query/reset-client-state.ts`).
  useEffect(() => {
    setBrowserQueryClient(queryClient);
    return () => setBrowserQueryClient(null);
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
