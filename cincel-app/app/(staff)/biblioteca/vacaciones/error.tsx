"use client";

import { ErrorState } from "@/components/shell/ErrorState";

/** Page-load error of Mis vacaciones (redesign FE §9): `ErrorState` with "Reintentar". */
export default function MisVacacionesError({ reset }: { error: Error & { digest?: string }; reset(): void }) {
  return <ErrorState onRetry={reset} />;
}
