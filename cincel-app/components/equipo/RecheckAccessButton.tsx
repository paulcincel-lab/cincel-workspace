"use client";

import { Alert, AlertDescription } from "@/components/ui/shadcn/alert";
import { Button } from "@/components/ui/shadcn/button";
import { recheckStaffAccessAction } from "@/lib/actions/workspace-access-actions";
import { recheckResultMessage, type RecheckMessage } from "@/lib/equipo/google-access";
import { qk } from "@/lib/query/keys";
import { useActionMutation } from "@/lib/query/mutation";
import type { RecheckStaffAccessResult } from "@/lib/types/workspace-access";

interface RecheckAccessButtonProps {
  staffId: string;
}

type RecheckError = Extract<RecheckStaffAccessResult, { ok: false }>["error"];
const RECHECK_ERRORS: ReadonlySet<string> = new Set<RecheckError>(["forbidden", "not_google_linked", "directory_error"]);

/** The inline copy for a failed re-check: its code, or the directory error for anything else. */
function errorMessage(err: Error): RecheckMessage {
  const error = (RECHECK_ERRORS.has(err.message) ? err.message : "directory_error") as RecheckError;
  return recheckResultMessage({ ok: false, error });
}

/**
 * **Revisar acceso ahora** (FE §2.6): re-checks one staff member against
 * Workspace now and shows the result inline. Rendered for Administrador only;
 * the action refuses everyone else anyway. A confirmed or revoked result
 * invalidates `personas.equipo` and `personas.detail(id)`.
 */
export function RecheckAccessButton({ staffId }: RecheckAccessButtonProps) {
  const recheck = useActionMutation(recheckStaffAccessAction, {
    invalidate: (id, data) => (data ? [qk.personas.equipo(), qk.personas.detail(id)] : []),
    // The result shows inline below, never as a toast.
    onFormError: () => undefined,
  });

  const message: RecheckMessage | null = recheck.isSuccess
    ? recheckResultMessage(recheck.data)
    : recheck.isError
      ? errorMessage(recheck.error)
      : null;

  return (
    <div className="space-y-3">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => recheck.mutate(staffId)}
        disabled={recheck.isPending}
      >
        {recheck.isPending ? "Revisando…" : "Revisar acceso ahora"}
      </Button>
      {message ? (
        <Alert variant={message.tone === "ok" ? "default" : "destructive"}>
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
