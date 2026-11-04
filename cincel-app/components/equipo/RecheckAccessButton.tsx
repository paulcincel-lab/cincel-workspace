"use client";

import { useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/shadcn/alert";
import { Button } from "@/components/ui/shadcn/button";
import { recheckStaffAccessAction } from "@/lib/actions/workspace-access-actions";
import { recheckResultMessage, type RecheckMessage } from "@/lib/equipo/google-access";

interface RecheckAccessButtonProps {
  staffId: string;
  /** Called after a confirmed or revoked result so the list picks up the new state. */
  onChecked?: () => void | Promise<void>;
}

/**
 * **Revisar acceso ahora** (FE §2.6): re-checks one staff member against
 * Workspace now and shows the result inline. Rendered for Administrador only;
 * the action refuses everyone else anyway.
 */
export function RecheckAccessButton({ staffId, onChecked }: RecheckAccessButtonProps) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<RecheckMessage | null>(null);

  async function recheck() {
    setPending(true);
    setMessage(null);
    try {
      const result = await recheckStaffAccessAction(staffId);
      setMessage(recheckResultMessage(result));
      if (result.ok) await onChecked?.();
    } catch {
      setMessage(recheckResultMessage({ ok: false, error: "directory_error" }));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      <Button type="button" variant="outline" size="sm" onClick={() => void recheck()} disabled={pending}>
        {pending ? "Revisando…" : "Revisar acceso ahora"}
      </Button>
      {message ? (
        <Alert variant={message.tone === "ok" ? "default" : "destructive"}>
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
