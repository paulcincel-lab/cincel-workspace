"use client";

import { CalendarDays } from "lucide-react";
import { useState } from "react";

import { FormDialog } from "@/components/patterns/FormDialog";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { RecordTable } from "@/components/widgets/RecordTable";
import { WidgetCard } from "@/components/widgets/WidgetCard";
import { cancelVacationRequestAction } from "@/lib/actions/vacations-actions";
import { IMPLEMENTED } from "@/lib/actions/vacations-actions.flags";
import { qk } from "@/lib/query/keys";
import { useActionMutation } from "@/lib/query/mutation";
import { VACATIONS_ABSENCES_PREFIX } from "@/lib/query/options/biblioteca";
import type { VacationRequest } from "@/lib/types/redesign";
import type { MyVacations } from "@/lib/vacations/reads";

import {
  VACATION_STATUS_BADGE,
  VACATION_STATUS_LABEL,
  canCancelRequest,
  formatRange,
  historyTable,
  todayIso,
} from "./vacation-format";

export type VacationHistoryProps = { requests: VacationRequest[] };

/**
 * Vacation history with status chips and cancel (redesign FE §3.7) on
 * `RecordTable`. "Cancelar" shows for a pending request or an approved one
 * that starts in the future, and only once `cancelVacationRequestAction` is
 * implemented; it asks for confirmation in a `FormDialog`, where `STARTED`,
 * `NOT_FOUND` and `FORBIDDEN` show through `actionErrorText`. A cancel marks
 * the row at once and refetches `me.vacations`, `vacations.absences` and
 * `vacations.pending`.
 */
export function VacationHistory({ requests }: VacationHistoryProps) {
  const [target, setTarget] = useState<VacationRequest | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cancel = useActionMutation(cancelVacationRequestAction, {
    setData: (client, _done, id: string) =>
      client.setQueryData<MyVacations | null>(qk.me.vacations(), (current) =>
        current
          ? { ...current, requests: current.requests.map((r) => (r.id === id ? { ...r, status: "cancelada" as const } : r)) }
          : current,
      ),
    invalidate: [qk.me.vacations(), VACATIONS_ABSENCES_PREFIX, qk.vacations.pending()],
    successToast: "Solicitud cancelada",
    onFormError: setError,
  });
  const pending = cancel.isPending;

  const cancelEnabled = IMPLEMENTED.cancelVacationRequestAction;
  const today = todayIso();
  const byId = new Map(requests.map((request) => [request.id, request]));
  const data = historyTable(requests, { withActions: cancelEnabled });

  function close(next: boolean) {
    if (next) return;
    setTarget(null);
    setError(null);
  }

  async function confirmCancel() {
    if (!target) return;
    setError(null);
    try {
      await cancel.mutateAsync(target.id);
    } catch {
      // The error shows in the dialog (onFormError).
      return;
    }
    setTarget(null);
  }

  return (
    <WidgetCard title="Historial" icon={CalendarDays}>
      <RecordTable
        data={data}
        emptyState={{ title: "Aún no tienes solicitudes", description: "Tus solicitudes de este año aparecen aquí." }}
        renderCell={(columnKey, row) => {
          const request = typeof row.id === "string" ? byId.get(row.id) : undefined;
          if (!request) return undefined;
          if (columnKey === "estado") {
            return <Badge variant={VACATION_STATUS_BADGE[request.status]}>{VACATION_STATUS_LABEL[request.status]}</Badge>;
          }
          if (columnKey === "acciones") {
            if (!canCancelRequest(request, today)) return "—";
            return (
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label={`Cancelar la solicitud del ${formatRange(request.from, request.to)}`}
                onClick={() => {
                  setError(null);
                  setTarget(request);
                }}
              >
                Cancelar
              </Button>
            );
          }
          return undefined;
        }}
      />
      {cancelEnabled ? (
        <FormDialog
          title="¿Cancelar esta solicitud?"
          description={target ? `${formatRange(target.from, target.to)} · ${VACATION_STATUS_LABEL[target.status]}` : undefined}
          open={target !== null}
          onOpenChange={close}
          onSubmit={confirmCancel}
          submitLabel="Cancelar solicitud"
          pending={pending}
          error={error}
        >
          <p className="text-sm text-muted-foreground">Los días vuelven a tu saldo.</p>
        </FormDialog>
      ) : null}
    </WidgetCard>
  );
}
