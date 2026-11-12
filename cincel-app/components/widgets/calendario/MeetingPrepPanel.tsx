"use client";

import { useId, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/shadcn/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/shadcn/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/shadcn/table";
import { Textarea } from "@/components/ui/shadcn/textarea";
import { KpiStrip, type KpiStripItem } from "@/components/widgets/KpiStrip";
import type { MeetingPrep } from "@/lib/types/calendario";
import { cn } from "@/lib/utils";

export type MeetingPrepRecipient = { name: string };

export type MeetingPrepPanelProps = {
  prep: MeetingPrep | null;
  eventId: string;
  variant?: "visual" | "esencial" | "analitico";
  /** People who receive the agenda; listed in the confirmation dialog. */
  recipients?: MeetingPrepRecipient[];
  /** Sends the agenda as edited (`send_agenda`). Resolves true when sent. */
  onSend?(items: string[]): Promise<boolean>;
  /** Asks for a new phrasing of the summary (`meeting_prep { phrasing: true }`). Resolves the new text or an error to show inline. */
  onRewrite?(): Promise<{ ok: true; text: string } | { ok: false; error: string }>;
  loading?: boolean;
};

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function shortDate(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split("-");
  const month = MONTHS[Number(m) - 1];
  return month ? `${Number(d)} ${month}` : iso;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function agendaToText(items: string[]): string {
  return items.map((item, index) => `${index + 1}. ${item}`).join("\n");
}

function buildKpis(prep: MeetingPrep): KpiStripItem[] {
  const { kpis } = prep;
  const delta = kpis.progressVsPlan;
  const last = kpis.lastMeeting;
  return [
    {
      key: "avance",
      label: "Avance",
      value: delta === null ? "Sin dato" : `${delta > 0 ? "+" : delta < 0 ? "−" : ""}${Math.abs(delta)}`,
      secondary: delta === null ? undefined : "vs plan",
      tone: delta !== null && delta < 0 ? "destructive" : "default",
    },
    { key: "tramo", label: "Tramo", value: kpis.tramo?.name ?? "Sin tramo", secondary: kpis.tramo?.phase ?? undefined },
    {
      key: "vencidas",
      label: "Vencidas",
      value: kpis.overdue,
      secondary: `de ${plural(kpis.open, "abierta", "abiertas")}`,
      tone: kpis.overdue > 0 ? "destructive" : "default",
    },
    {
      key: "ultima",
      label: "Última junta",
      value: last ? shortDate(last.date) : "Ninguna",
      secondary: last ? `${plural(last.decisions, "acuerdo", "acuerdos")}, ${plural(last.open, "abierto", "abiertos")}` : undefined,
    },
  ];
}

function Overdue({ prep, table }: { prep: MeetingPrep; table: boolean }) {
  if (prep.overdue.length === 0) return <p className="text-sm text-muted-foreground">No hay nada vencido.</p>;
  if (table) {
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tarea</TableHead>
            <TableHead>Responsable</TableHead>
            <TableHead>Fecha</TableHead>
            <TableHead>Retraso</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {prep.overdue.map((row) => (
            <TableRow key={row.taskId}>
              <TableCell>{row.title}</TableCell>
              <TableCell>{row.managerName ?? "Sin responsable"}</TableCell>
              <TableCell>{shortDate(row.date)}</TableCell>
              <TableCell className="text-destructive-ink">{row.daysLate} d</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }
  return (
    <ul className="flex flex-col divide-y rounded-lg border bg-card">
      {prep.overdue.map((row) => (
        <li key={row.taskId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm">
          <span className="min-w-0 truncate font-medium text-foreground">{row.title}</span>
          <span className="text-xs text-muted-foreground">
            {`${row.managerName ?? "Sin responsable"} · ${shortDate(row.date)} · `}
            <span className="text-destructive-ink">{`${row.daysLate} d`}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

type AgendaRow = { id: number; text: string };

export function MeetingPrepPanel({ prep, eventId, variant = "visual", recipients = [], onSend, onRewrite, loading = false }: MeetingPrepPanelProps) {
  const baseId = useId();
  const [rows, setRows] = useState<AgendaRow[]>([]);
  const [nextId, setNextId] = useState(0);
  const [summary, setSummary] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rewriting, setRewriting] = useState(false);
  const [rewriteError, setRewriteError] = useState<string | null>(null);
  const [previous, setPrevious] = useState<string | null>(null);

  // Agenda edits live until sent or the detail closes (not persisted); a different meeting or fresh prep resets them.
  const agendaKey = prep ? `${prep.eventId}\u0000${prep.agenda.join("\u0000")}` : "";
  const [seenAgendaKey, setSeenAgendaKey] = useState<string | null>(null);
  if (seenAgendaKey !== agendaKey) {
    const items = agendaKey ? (prep?.agenda ?? []) : [];
    setSeenAgendaKey(agendaKey);
    setRows(items.map((text, id) => ({ id, text })));
    setNextId(items.length);
  }
  const [seenSummary, setSeenSummary] = useState<string | null>(null);
  const prepSummary = prep?.summary ?? "";
  if (seenSummary !== prepSummary) {
    setSeenSummary(prepSummary);
    setSummary(prepSummary);
    setPrevious(null);
    setRewriteError(null);
  }

  if (loading) {
    return (
      <section aria-label="Antes de la reunión" aria-busy="true" data-slot="meeting-prep">
        <p className="text-sm text-muted-foreground">Preparando la reunión…</p>
      </section>
    );
  }
  if (!prep) {
    return (
      <section aria-label="Antes de la reunión" data-slot="meeting-prep">
        <p className="text-sm text-muted-foreground">No hay datos para preparar esta reunión.</p>
      </section>
    );
  }

  const items = rows.map((row) => row.text.trim()).filter((text) => text.length > 0);
  const move = (index: number, by: -1 | 1) =>
    setRows((current) => {
      const target = index + by;
      if (target < 0 || target >= current.length) return current;
      const copy = [...current];
      const [row] = copy.splice(index, 1);
      copy.splice(target, 0, row!);
      return copy;
    });
  const edit = (id: number, text: string) => setRows((current) => current.map((row) => (row.id === id ? { ...row, text } : row)));
  const remove = (id: number) => setRows((current) => current.filter((row) => row.id !== id));
  const add = () => {
    setRows((current) => [...current, { id: nextId, text: "" }]);
    setNextId((n) => n + 1);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(agendaToText(items));
      toast.success("Orden del día copiado.");
    } catch {
      toast.error("No pude copiar el orden del día.");
    }
  };
  const rewrite = async () => {
    if (!onRewrite || rewriting) return;
    setRewriting(true);
    setRewriteError(null);
    try {
      const result = await onRewrite();
      if (result.ok) {
        if (result.text.trim() !== "" && result.text !== summary) {
          setPrevious(summary);
          setSummary(result.text);
        }
      } else {
        setRewriteError(result.error);
      }
    } catch {
      setRewriteError("No pude reescribir el resumen.");
    } finally {
      setRewriting(false);
    }
  };
  const undoRewrite = () => {
    if (previous === null) return;
    setSummary(previous);
    setPrevious(null);
  };
  const send = async () => {
    if (!onSend) return;
    setBusy(true);
    try {
      const ok = await onSend(items);
      if (ok) setConfirming(false);
    } finally {
      setBusy(false);
    }
  };

  const esencial = variant === "esencial";
  const sendLabel = "Enviar orden del día a asistentes";
  const agendaId = `${baseId}-agenda`;

  return (
    <section aria-label="Antes de la reunión" data-slot="meeting-prep" data-variant={variant} data-event={eventId} className="flex flex-col gap-4">
      <KpiStrip items={buildKpis(prep)} />

      <div className="flex flex-col gap-2 rounded-lg border bg-card px-4 py-3">
        <p className="text-sm text-foreground">
          <span className="font-semibold">✦ Resumen: </span>
          {summary}
        </p>
        {onRewrite ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="ghost" size="sm" disabled={rewriting} onClick={() => void rewrite()}>
              {rewriting ? "Reescribiendo…" : "✦ Reescribir"}
            </Button>
            {previous !== null && !rewriting ? (
              <Button type="button" variant="ghost" size="sm" onClick={undoRewrite}>
                Deshacer
              </Button>
            ) : null}
            {rewriteError ? (
              <p role="alert" className="text-sm text-destructive-ink">
                {rewriteError}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="font-mono text-[11px] tracking-[.08em] text-muted-foreground uppercase">Lo vencido</h3>
        <Overdue prep={prep} table={variant === "analitico"} />
      </div>

      <div className="flex flex-col gap-2">
        <h3 id={agendaId} className="font-mono text-[11px] tracking-[.08em] text-muted-foreground uppercase">
          Orden del día propuesto
        </h3>
        <ol aria-labelledby={agendaId} className="flex flex-col gap-2">
          {rows.map((row, index) => (
            <li key={row.id} className="flex items-start gap-2">
              <span className="w-5 pt-2 text-right text-sm text-muted-foreground">{index + 1}.</span>
              <Textarea
                value={row.text}
                rows={1}
                aria-label={`Punto ${index + 1} del orden del día`}
                onChange={(event) => edit(row.id, event.target.value)}
                className="min-h-9 flex-1"
              />
              <div className={cn("flex gap-1", esencial && "flex-col")}>
                <Button type="button" variant="outline" size="sm" disabled={index === 0} aria-label={`Subir punto ${index + 1}`} onClick={() => move(index, -1)}>
                  Subir
                </Button>
                <Button type="button" variant="outline" size="sm" disabled={index === rows.length - 1} aria-label={`Bajar punto ${index + 1}`} onClick={() => move(index, 1)}>
                  Bajar
                </Button>
                <Button type="button" variant="ghost" size="sm" aria-label={`Quitar punto ${index + 1}`} onClick={() => remove(row.id)}>
                  Quitar
                </Button>
              </div>
            </li>
          ))}
        </ol>
        <div>
          <Button type="button" variant="ghost" size="sm" onClick={add}>
            Agregar punto
          </Button>
        </div>
      </div>

      <div className={cn("flex flex-wrap gap-2", esencial && "flex-col")}>
        {onSend ? (
          <Button type="button" size={esencial ? "lg" : "default"} className={esencial ? "h-[54px] w-full text-base" : undefined} disabled={items.length === 0 || busy} onClick={() => setConfirming(true)}>
            {esencial ? "Enviar orden del día" : sendLabel}
          </Button>
        ) : null}
        <Button type="button" variant="outline" size={esencial ? "lg" : "default"} disabled={items.length === 0} onClick={() => void copy()}>
          Copiar
        </Button>
      </div>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar orden del día</DialogTitle>
            <DialogDescription>{recipients.length === 0 ? "No hay asistentes con correo." : `Se enviará a ${plural(recipients.length, "persona", "personas")}.`}</DialogDescription>
          </DialogHeader>
          {recipients.length > 0 ? (
            <ul className="flex flex-col gap-1 text-sm">
              {recipients.map((person, index) => (
                <li key={`${index}:${person.name}`}>{person.name}</li>
              ))}
            </ul>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirming(false)}>
              Cancelar
            </Button>
            <Button type="button" disabled={busy || recipients.length === 0} onClick={() => void send()}>
              Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
