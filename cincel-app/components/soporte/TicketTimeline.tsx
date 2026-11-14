"use client";

import { STATUS_LABEL, type TicketEvent, type TicketStatus } from "@/lib/types/soporte";

export type TicketTimelineProps = {
  events: TicketEvent[];
  /** Admins see internal notes, marked "Nota interna"; the author never gets them. */
  showInternal?: boolean;
  /** Marks replies written by the author. */
  authorId?: string;
};

/** Event types only admins care about (the author sees the outcome as a status change). */
const ADMIN_ONLY_TYPES: ReadonlySet<TicketEvent["type"]> = new Set(["priority", "assignee", "synced"]);

const dateFormat = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" });

function formatWhen(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : dateFormat.format(date);
}

function statusLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return STATUS_LABEL[value as TicketStatus] ?? value;
}

/** The events the viewer may see, oldest first. Internal events never reach the author. */
export function visibleTicketEvents(events: TicketEvent[], showInternal: boolean): TicketEvent[] {
  return events
    .filter((event) => showInternal || (event.visibility === "public" && !ADMIN_ONLY_TYPES.has(event.type)))
    .slice()
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
}

type Entry = { title: string; text?: string; internal?: boolean };

function describe(event: TicketEvent, authorId?: string): Entry {
  const actor = event.actor?.name ?? "Sistema";
  const { payload } = event;
  switch (event.type) {
    case "created":
      return { title: "Solicitud enviada" };
    case "status":
      return {
        title: `Estado: ${statusLabel(payload.from)} → ${statusLabel(payload.to)}`,
        text: payload.text,
      };
    case "reply":
      return {
        title: authorId && event.actor?.id === authorId ? `${actor} (autor)` : `${actor} respondió`,
        text: payload.text,
      };
    case "note":
      return { title: `${actor} dejó una nota`, text: payload.text, internal: true };
    case "published":
      return { title: "Publicada como propuesta" };
    case "synced":
      return { title: `Sincronizada con GitHub: ${statusLabel(payload.to)}` };
    case "duplicate":
      return {
        title: payload.duplicateOf ? `Duplicada de ${payload.duplicateOf.code}` : "Marcada como duplicada",
        text: payload.text,
      };
    case "priority":
      return { title: `Prioridad: ${payload.from ?? "—"} → ${payload.to ?? "—"}` };
    case "assignee":
      return { title: "Responsable actualizado" };
  }
}

/** The timeline shared by Mis solicitudes and Mejoras. */
export function TicketTimeline({ events, showInternal = false, authorId }: TicketTimelineProps) {
  const visible = visibleTicketEvents(events, showInternal);
  if (visible.length === 0) {
    return <p className="text-sm text-muted-foreground">Todavía no hay actividad.</p>;
  }
  return (
    <ol aria-label="Historial de la solicitud" className="flex flex-col gap-3">
      {visible.map((event) => {
        const entry = describe(event, authorId);
        const internal = entry.internal || event.visibility === "internal";
        return (
          <li key={event.id} className="flex flex-col gap-1 border-l border-border pl-3">
            <div className="flex flex-wrap items-center gap-x-2 text-sm">
              <span className="font-medium text-foreground">{entry.title}</span>
              {internal ? <span className="text-xs font-medium text-muted-foreground">Nota interna</span> : null}
            </div>
            <time dateTime={event.createdAt} className="text-xs text-muted-foreground">
              {formatWhen(event.createdAt)}
            </time>
            {entry.text ? <p className="text-sm whitespace-pre-wrap text-foreground">{entry.text}</p> : null}
          </li>
        );
      })}
    </ol>
  );
}
