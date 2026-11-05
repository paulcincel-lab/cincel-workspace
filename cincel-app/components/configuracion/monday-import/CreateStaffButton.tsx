"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/shadcn/button";
import { createMondayStaffAction } from "@/lib/actions/monday-import-actions";
import type { CreatedStaff } from "@/scripts/monday/created-staff";

/**
 * "Crear integrante" (#689): creates the staff member of one monday person (name and email from monday, pending
 * until their first Google sign-in) and hands it back. Errors show inline under the button.
 */
export function CreateStaffButton({
  runId,
  user,
  onCreated,
}: {
  runId: string;
  user: { id: string; name: string };
  onCreated: (staff: CreatedStaff) => void;
}) {
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function create() {
    setError("");
    startTransition(async () => {
      const result = await createMondayStaffAction(runId, user.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onCreated(result.staff);
    });
  }

  return (
    <div className="space-y-1">
      <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={create}>
        {isPending ? "Creando integrante…" : "Crear integrante"}
      </Button>
      {error ? (
        <p role="alert" className="whitespace-normal text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
