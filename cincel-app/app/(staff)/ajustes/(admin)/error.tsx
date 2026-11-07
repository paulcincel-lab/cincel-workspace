"use client";

import { RouteError, type RouteErrorProps } from "@/components/shell/RouteError";

/** Route-group error boundary (redesign FE §3, §4.2): `ErrorState` with "Reintentar" → `reset`. */
export default function RouteGroupError(props: RouteErrorProps) {
  return <RouteError {...props} />;
}
