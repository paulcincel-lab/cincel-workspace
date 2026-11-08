"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useMemo, useState } from "react";

import { formatDay, VACATION_KIND_LABEL } from "@/components/biblioteca/vacation-format";
import { FormDialog } from "@/components/patterns/FormDialog";
import { EmptyState } from "@/components/shell/EmptyState";
import { Button } from "@/components/ui/shadcn/button";
import { Label } from "@/components/ui/shadcn/label";
import { Textarea } from "@/components/ui/shadcn/textarea";
import { RecordTable } from "@/components/widgets/RecordTable";
import { decideVacationAction } from "@/lib/actions/vacations-actions";
import { IMPLEMENTED } from "@/lib/actions/vacations-actions.flags";
import { qk } from "@/lib/query/keys";
import { useActionMutation } from "@/lib/query/mutation";
import { VACATIONS_ABSENCES_PREFIX, pendingVacationsOptions } from "@/lib/query/options/biblioteca";
import type { PendingVacationRequest, VacationRequest } from "@/lib/types/redesign";
import type { RecordTableData } from "@/lib/types/widgets";

/** A pending request; `createdAt` ("Solicitada") is shown when the server sends it. */
export type TeamRequestRow = PendingVacationRequest & { createdAt?: string };

export type TeamRequestsProps = {
  /** "YYYY-MM" of the page (the strip month its refetch reads). */
  month: string;
  /** The viewer's staff id: their own requests are never listed here. */
  viewerStaffId: string;
  /** `canDecideVacations`; without it the section is not rendered at all. */
  canDecide: boolean;
};

type Decision = "aprobada" | "rechazada";

const NOTE_MAX = 1000;

const DECISION_COPY: Record<Decision, { title: string; submit: string; done: string }> = {
  aprobada: { title: "Aprobar solicitud", submit: "Aprobar", done: "Solicitud aprobada" },
  rechazada: { title: "Rechazar solicitud", submit: "Rechazar", done: "Solicitud rechazada" },
};

/** Codes after which the list on screen is stale and is reloaded from the server. */
const STALE_CODES = ["INVALID", "NOT_FOUND"] as const;

const NO_REQUESTS: TeamRequestRow[] = [];

type DecideVars = { request: TeamRequestRow; decision: Decision; note?: string };

/** The decide mutation's input as `decideVacationAction` takes it. */
function decide({ request, decision, note }: DecideVars) {
  return decideVacationAction(request.id, decision, note);
}

/**
 * The keys a decision changes besides the pending list: everyone's absences,
 * Personas (the team list and the requester's detail) and Inicio.
 */
export function decisionInvalidations(vars: DecideVars) {
  return [VACATIONS_ABSENCES_PREFIX, qk.personas.equipo(), qk.personas.detail(vars.request.staffId), qk.inicio()] as const;
}

function requestedOn(value: string | undefined): string {
  if (!value) return "—";
  return formatDay(value.slice(0, 10));
}

/** The pending requests as `RecordTable` data; `acciones` is rendered by the caller. */
export function teamRequestsTable(requests: TeamRequestRow[], options: { withActions: boolean }): RecordTableData {
  return {
    columns: [
      { key: "persona", label: "Persona" },
      { key: "desde", label: "Desde" },
      { key: "hasta", label: "Hasta" },
      { key: "dias", label: "Días", align: "right", mono: true, format: "count" },
      { key: "tipo", label: "Tipo" },
      { key: "comentario", label: "Comentario", hideOn: ["esencial"] },
      { key: "solicitada", label: "Solicitada", hideOn: ["esencial"] },
      ...(options.withActions ? [{ key: "acciones", label: "Acciones" }] : []),
    ],
    rows: requests.map((request) => ({
      id: request.id,
      persona: request.name,
      desde: formatDay(request.from),
      hasta: formatDay(request.to),
      dias: request.days,
      tipo: VACATION_KIND_LABEL[request.kind],
      comentario: request.comment || "—",
      solicitada: requestedOn(request.createdAt),
      acciones: "",
    })),
  };
}

/**
 * "Solicitudes del equipo" of Mis vacaciones (redesign FE §3.7): the pending
 * requests of the team with "Aprobar" / "Rechazar" (a `FormDialog` with an
 * optional note → `decideVacationAction`). Only for `canDecideVacations`;
 * the viewer's own requests are never listed. Reads `vacations.pending`; a
 * decision removes the row at once (rolled back on error), then refreshes the
 * absences, Personas and Inicio queries; a stale-list error refetches the
 * pending list.
 */
export function TeamRequests({ canDecide, ...props }: TeamRequestsProps) {
  if (!canDecide) return null;
  return <TeamRequestsSection {...props} />;
}

function TeamRequestsSection({ month, viewerStaffId }: Omit<TeamRequestsProps, "canDecide">) {
  const headingId = useId();
  const noteId = useId();
  const client = useQueryClient();
  const requests = useQuery(pendingVacationsOptions(month)).data ?? NO_REQUESTS;
  const [target, setTarget] = useState<{ request: TeamRequestRow; decision: Decision } | null>(null);
  const [note, setNote] = useState("");

  const decision = useActionMutation<DecideVars, VacationRequest, { previous: PendingVacationRequest[] | null | undefined }>(decide, {
    optimistic: {
      onMutate: async (client, { request }) => {
        await client.cancelQueries({ queryKey: qk.vacations.pending() });
        const previous = client.getQueryData<PendingVacationRequest[] | null>(qk.vacations.pending());
        client.setQueryData<PendingVacationRequest[] | null>(qk.vacations.pending(), (current) =>
          current ? current.filter((row) => row.id !== request.id) : current,
        );
        return { previous };
      },
      rollback: (client, { previous }) => {
        if (previous !== undefined) client.setQueryData(qk.vacations.pending(), previous);
      },
    },
    invalidate: (vars) => decisionInvalidations(vars),
    successToast: (decided) => DECISION_COPY[decided.status === "rechazada" ? "rechazada" : "aprobada"].done,
    staleCodes: STALE_CODES,
    // The list no longer matches the server: read it again.
    onStaleError: () => void client.invalidateQueries({ queryKey: qk.vacations.pending() }),
  });
  const pending = decision.isPending;

  const canWrite = IMPLEMENTED.decideVacationAction;
  const rows = useMemo(
    () => requests.filter((request) => request.staffId !== viewerStaffId),
    [requests, viewerStaffId],
  );
  const byId = useMemo(() => new Map(rows.map((request) => [request.id, request])), [rows]);
  const data = useMemo(() => teamRequestsTable(rows, { withActions: canWrite }), [rows, canWrite]);

  function open(request: TeamRequestRow, decision: Decision) {
    setNote("");
    setTarget({ request, decision });
  }

  function onOpenChange(next: boolean) {
    if (!next && !pending) setTarget(null);
  }

  async function submit() {
    if (!target) return;
    const trimmed = note.trim();
    try {
      await decision.mutateAsync({ request: target.request, decision: target.decision, ...(trimmed ? { note: trimmed } : {}) });
    } catch {
      // The error toast is shown by the mutation.
    } finally {
      setTarget(null);
    }
  }

  const copy = target ? DECISION_COPY[target.decision] : DECISION_COPY.aprobada;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id={headingId} className="text-base font-semibold text-foreground">
          Solicitudes del equipo
        </h2>
        <p className="text-sm text-muted-foreground">Las solicitudes pendientes, de la más antigua a la más reciente.</p>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No hay solicitudes pendientes" description="Cuando alguien pida días, aparecerá aquí." />
      ) : (
        <RecordTable
          data={data}
          renderCell={(key, row) => {
            if (key !== "acciones") return undefined;
            const request = byId.get(String(row.id));
            if (!request) return null;
            return (
              <div className="flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  aria-label={`Aprobar solicitud de ${request.name}`}
                  onClick={() => open(request, "aprobada")}
                >
                  Aprobar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Rechazar solicitud de ${request.name}`}
                  onClick={() => open(request, "rechazada")}
                >
                  Rechazar
                </Button>
              </div>
            );
          }}
        />
      )}

      {canWrite ? (
        <FormDialog
          title={copy.title}
          description={
            target
              ? `${target.request.name} · ${formatDay(target.request.from)} – ${formatDay(target.request.to)} · ${
                  target.request.days === 1 ? "1 día" : `${target.request.days} días`
                }`
              : undefined
          }
          open={target !== null}
          onOpenChange={onOpenChange}
          onSubmit={submit}
          submitLabel={copy.submit}
          pending={pending}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor={noteId}>Nota (opcional)</Label>
            <Textarea
              id={noteId}
              value={note}
              maxLength={NOTE_MAX}
              placeholder="La verá la persona que pidió los días."
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
        </FormDialog>
      ) : null}
    </section>
  );
}
