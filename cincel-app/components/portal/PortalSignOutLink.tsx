"use client";

import type { ReactNode } from "react";

import { getBrowserQueryClient } from "@/lib/query/reset-client-state";

/**
 * **Salir** (BE §B.4.2): a plain anchor to the GET logout route, never next/link (a prefetch of the logout
 * route would sign the client out). Before the browser leaves, the whole query cache is cleared
 * (`queryClient.clear()`), so nothing of this client's projects survives into the next portal session in the
 * same tab.
 */
export default function PortalSignOutLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a href={href} className={className} onClick={() => getBrowserQueryClient()?.clear()}>
      {children}
    </a>
  );
}
