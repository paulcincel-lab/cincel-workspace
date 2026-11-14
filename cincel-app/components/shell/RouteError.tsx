"use client";

import { useEffect } from "react";

import { ErrorState } from "@/components/shell/ErrorState";
import { PermissionDenied } from "@/components/shell/PermissionDenied";
import { Button } from "@/components/ui/shadcn/button";
import { actionErrorCode } from "@/lib/errors";
import { SOPORTE_ENABLED } from "@/lib/soporte/flags";
import { errorPagePrefill } from "@/lib/soporte/reportar";
import { useSoporteDraft } from "@/lib/stores/soporte-draft";
import { ROUTE_ERROR_TITLE } from "@/lib/ui/route-states";

/**
 * Body of every staff route group's `error.tsx` (redesign FE §3, §4.2):
 * `ErrorState` ("No se pudo cargar esta página." + "Reintentar"). "Reintentar"
 * calls Next's `unstable_retry` when the boundary provides it (it re-fetches
 * the segment, which a failed server load needs) and `reset` otherwise. A
 * `FORBIDDEN` error renders the permission-denied state of `EstadosSistema`
 * instead. The digest is shown as the error code so support
 * can find the server log line.
 */
export type RouteErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
  unstable_retry?: () => void;
};

export function RouteError({ error, reset, unstable_retry }: RouteErrorProps) {
  useEffect(() => {
    console.error("[route-error]", error);
  }, [error]);

  if (actionErrorCode(error) === "FORBIDDEN") return <PermissionDenied />;

  return (
    <>
      <ErrorState title={ROUTE_ERROR_TITLE} onRetry={unstable_retry ?? reset} code={error.digest} />
      {SOPORTE_ENABLED ? (
        <div className="px-4">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => useSoporteDraft.getState().openReportar(errorPagePrefill(window.location.pathname, error.digest))}
          >
            Reportar este error
          </Button>
        </div>
      ) : null}
    </>
  );
}
