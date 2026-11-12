"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { useProposal } from "@/components/calendario/use-proposal";
import { Button } from "@/components/ui/shadcn/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/shadcn/card";
import { Checkbox } from "@/components/ui/shadcn/checkbox";
import { Label } from "@/components/ui/shadcn/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/shadcn/table";
import { Textarea } from "@/components/ui/shadcn/textarea";
import { StyleView } from "@/components/widgets/StyleView";
import {
  applyProposalAction,
  runProposingToolAction,
  saveMeetingNotesAction,
  sendMinutesAction,
  undoProposalAction,
} from "@/lib/actions/calendario-actions";
import { actionErrorText } from "@/lib/errors";
import { qk } from "@/lib/query/keys";
import { calendarioInvalidations } from "@/lib/query/options/calendario";
import { catalogStaffOptions } from "@/lib/query/options/catalog";
import { useCalendarioUi } from "@/lib/stores/calendario-ui-store";
import type { MeetingMinutes, Proposal, ProposalChange } from "@/lib/types/calendario";

export type MeetingMinutesPanelProps = {
  minutes: MeetingMinutes | null;
  eventId: string;
  projectId?: string | null;
  projectName?: string | null;
};

/** Autosave delay of the notes (FE §7.6). */
export const NOTES_DEBOUNCE_MS = 1000;

type SaveStatus = "idle" | "saving" | "saved" | "error";
type TaskChange = Extract<ProposalChange, { type: "task_create" }>;
type DecisionChange = Extract<ProposalChange, { type: "decision" }>;
type FollowUpChange = Extract<ProposalChange, { type: "event_create" }>;

const DATE_FORMAT = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", timeZone: "UTC" });

function dateLabel(date: string | null): string {
  const match = date?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return "Sin fecha";
  return DATE_FORMAT.format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))).replace(".", "");
}

/** The parts of a minutes proposal the panel draws. */
export function splitMinutesProposal(proposal: Proposal | null) {
  const changes = proposal?.kind === "crear_tareas_minuta" ? proposal.changes : [];
  return {
    decisions: changes.filter((c): c is DecisionChange => c.type === "decision"),
    tasks: changes.filter((c): c is TaskChange => c.type === "task_create"),
    followUp: changes.find((c): c is FollowUpChange => c.type === "event_create") ?? null,
  };
}

function SaveStatusText({ status }: { status: SaveStatus }) {
  const text = status === "saving" ? "Guardando…" : status === "saved" ? "Guardado" : status === "error" ? "No se pudo guardar." : "";
  return (
    <span role="status" aria-live="polite" className="text-xs text-muted-foreground">
      {text}
    </span>
  );
}

function Body({ minutes, eventId, projectId, projectName, layout }: MeetingMinutesPanelProps & { layout: "table" | "list" }) {
  const queryClient = useQueryClient();
  const notesId = useId();
  const { proposal, checked } = useProposal();
  const setProposal = useCalendarioUi((s) => s.setProposal);
  const toggleChange = useCalendarioUi((s) => s.toggleChange);
  const staff = useQuery(catalogStaffOptions());

  const [notes, setNotes] = useState(minutes?.notes ?? "");
  const [status, setStatus] = useState<SaveStatus>(minutes?.updatedAt ? "saved" : "idle");
  const [busy, setBusy] = useState<"extract" | "apply" | "send" | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<string | null>(null);

  const save = async (value: string): Promise<boolean> => {
    pending.current = null;
    setStatus("saving");
    const result = await saveMeetingNotesAction(eventId, value);
    setStatus(result.ok ? "saved" : "error");
    return result.ok;
  };

  const flush = async (): Promise<boolean> => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    return pending.current === null ? true : save(pending.current);
  };

  const flushRef = useRef(flush);
  useEffect(() => {
    flushRef.current = flush;
  });
  useEffect(
    () => () => {
      void flushRef.current();
    },
    [],
  );

  const onNotes = (value: string) => {
    setNotes(value);
    pending.current = value;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), NOTES_DEBOUNCE_MS);
  };

  const refresh = () => {
    for (const queryKey of calendarioInvalidations("minutes", projectId ?? undefined)) {
      void queryClient.invalidateQueries({ queryKey });
    }
  };

  const createMinutes = async () => {
    setBusy("extract");
    try {
      if (!(await flush())) {
        toast.error("No se pudo guardar las notas.");
        return;
      }
      const result = await runProposingToolAction("extract_minutes", { eventId });
      if (!result.ok) {
        toast.error(actionErrorText(result.error));
        return;
      }
      queryClient.setQueryData(qk.calendario.proposal(result.data.id), result.data);
      setProposal({ id: result.data.id, checked: result.data.changes.map((c) => c.changeId) });
    } finally {
      setBusy(null);
    }
  };

  const parts = splitMinutesProposal(proposal);
  const checkedTasks = parts.tasks.filter((t) => checked.includes(t.changeId));
  const isChecked = (changeId: string) => checked.includes(changeId);
  const ownerName = (id: string | null) => (id ? (staff.data?.find((s) => s.id === id)?.name ?? null) : null);

  const createTasks = async () => {
    if (!proposal) return;
    setBusy("apply");
    try {
      const result = await applyProposalAction(proposal.id, checked);
      if (!result.ok) {
        toast.error(actionErrorText(result.error));
        return;
      }
      const { toast: message, undoToken } = result.data;
      const token = undoToken;
      toast.success(
        message,
        token
          ? {
              action: {
                label: "Deshacer",
                onClick: () => {
                  void undoProposalAction(token).then((undone) => {
                    if (undone.ok) toast.success(undone.data.toast);
                    else toast.error(actionErrorText(undone.error));
                    refresh();
                  });
                },
              },
            }
          : undefined,
      );
      setProposal(null);
      refresh();
    } finally {
      setBusy(null);
    }
  };

  const sendMinutes = async () => {
    setBusy("send");
    try {
      const result = await sendMinutesAction(eventId);
      if (!result.ok) {
        toast.error(actionErrorText(result.error));
        return;
      }
      toast.success(result.data.sent === 1 ? "Envié la minuta a 1 persona." : `Envié la minuta a ${result.data.sent} personas.`);
      refresh();
    } finally {
      setBusy(null);
    }
  };

  const canSend = minutes?.status === "lista" || minutes?.status === "enviada";
  const project = projectName?.trim() ? projectName : "el proyecto";

  const owner = (task: TaskChange): ReactNode => {
    // Only a task without an owner is unresolved; a known owner shows once the staff catalog loads.
    if (!task.draft.managerId) return <span className="text-warning-ink">Sin responsable</span>;
    return ownerName(task.draft.managerId) ?? "";
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={notesId} className="text-xs tracking-wide text-muted-foreground uppercase">
            Notas de la reunión
          </Label>
          <SaveStatusText status={status} />
        </div>
        <Textarea
          id={notesId}
          value={notes}
          rows={layout === "table" ? 6 : 8}
          maxLength={20_000}
          placeholder="Escribe lo que se habló, lo que se decidió y quién hace qué."
          onChange={(event) => onNotes(event.target.value)}
        />
        <div>
          <Button type="button" variant="outline" disabled={busy !== null || notes.trim() === ""} onClick={() => void createMinutes()}>
            {busy === "extract" ? "Creando minuta…" : "✦ Crear minuta"}
          </Button>
        </div>
      </div>

      {proposal && proposal.kind === "crear_tareas_minuta" ? (
        <div className="flex flex-col gap-3" aria-label="Acuerdos de la minuta" role="group">
          <h3 className="text-xs tracking-wide text-muted-foreground uppercase">
            {`Acuerdos · ${parts.decisions.length} ${parts.decisions.length === 1 ? "decisión" : "decisiones"} · ${parts.tasks.length} ${parts.tasks.length === 1 ? "tarea" : "tareas"}`}
          </h3>
          {parts.decisions.length > 0 ? (
            <ul className="flex flex-col gap-1 text-sm">
              {parts.decisions.map((decision) => (
                <li key={decision.changeId} className="flex items-start gap-2">
                  <Checkbox
                    checked={isChecked(decision.changeId)}
                    onCheckedChange={() => toggleChange(decision.changeId)}
                    aria-label={`Incluir decisión: ${decision.text}`}
                  />
                  <span>{`Decisión: ${decision.text} (se guarda en el historial del proyecto).`}</span>
                </li>
              ))}
            </ul>
          ) : null}

          {layout === "table" ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Tarea</TableHead>
                  <TableHead>Responsable</TableHead>
                  <TableHead>Fecha</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parts.tasks.map((task) => (
                  <TableRow key={task.changeId}>
                    <TableCell>
                      <Checkbox
                        checked={isChecked(task.changeId)}
                        onCheckedChange={() => toggleChange(task.changeId)}
                        aria-label={`Incluir ${task.draft.title}`}
                      />
                    </TableCell>
                    <TableCell>{task.draft.title}</TableCell>
                    <TableCell>{owner(task)}</TableCell>
                    <TableCell className="tabular-nums">{dateLabel(task.draft.commitmentDate)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <ul className="flex flex-col gap-2">
              {parts.tasks.map((task) => (
                <li key={task.changeId} className="flex items-start gap-2 text-sm">
                  <Checkbox
                    checked={isChecked(task.changeId)}
                    onCheckedChange={() => toggleChange(task.changeId)}
                    aria-label={`Incluir ${task.draft.title}`}
                  />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-medium">{task.draft.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {owner(task)} · {dateLabel(task.draft.commitmentDate)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}

          {parts.followUp ? (
            <div className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={isChecked(parts.followUp.changeId)}
                onCheckedChange={() => toggleChange(parts.followUp!.changeId)}
                aria-label={`Incluir ${parts.followUp.draft.title}`}
              />
              <span>{`${parts.followUp.draft.title} · ${dateLabel(parts.followUp.draft.start)}`}</span>
            </div>
          ) : null}

          <div>
            <Button type="button" disabled={busy !== null || checked.length === 0} onClick={() => void createTasks()}>
              {busy === "apply" ? "Creando…" : `Crear ${checkedTasks.length} ${checkedTasks.length === 1 ? "tarea" : "tareas"} en ${project}`}
            </Button>
          </div>
        </div>
      ) : null}

      <div>
        <Button type="button" variant="secondary" disabled={busy !== null || !canSend} onClick={() => void sendMinutes()}>
          {busy === "send" ? "Enviando…" : "Enviar minuta por correo"}
        </Button>
      </div>
    </div>
  );
}

/** "Después · minuta" of a meeting: notes with autosave, the minutes proposal, create tasks and send. */
export function MeetingMinutesPanel(props: MeetingMinutesPanelProps) {
  return (
    <StyleView
      visual={() => (
        <section aria-label="Después de la reunión">
          <Card>
            <CardHeader>
              <CardTitle>Después · minuta</CardTitle>
            </CardHeader>
            <CardContent>
              <Body {...props} layout="list" />
            </CardContent>
          </Card>
        </section>
      )}
      esencial={() => (
        <section aria-label="Después de la reunión">
          <Body {...props} layout="list" />
        </section>
      )}
      analitico={() => (
        <section aria-label="Después de la reunión">
          <Body {...props} layout="table" />
        </section>
      )}
    />
  );
}
