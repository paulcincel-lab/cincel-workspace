"use client";

import { RouteError, type RouteErrorProps } from "@/components/shell/RouteError";

/** /calendario error state (Calendario FE §2.1): "Reintentar" re-renders the route. */
export default function CalendarioError(props: RouteErrorProps) {
  return <RouteError {...props} />;
}
