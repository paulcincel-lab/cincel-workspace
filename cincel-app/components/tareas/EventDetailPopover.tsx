"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useId, useRef, useState, useTransition } from "react";
import { CalendarClock, ExternalLink, FolderOpen, ListChecks, MapPin, Pencil, Trash2, Users, X } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/shadcn/alert";
import { Avatar, AvatarFallback } from "@/components/ui/shadcn/avatar";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button, buttonVariants } from "@/components/ui/shadcn/button";
import { Popover, PopoverContent } from "@/components/ui/shadcn/popover";
import { Separator } from "@/components/ui/shadcn/separator";
import { TramoBadge } from "@/components/v2/status/TramoBadge";
import { deleteTaskAction } from "@/lib/actions/tasks-actions";
import { toDate } from "@/lib/calendar/calendar-service";
import { actionErrorText } from "@/lib/errors";
import type { WorkflowRef } from "@/lib/types/core";
import type { CalendarItem } from "@/lib/types/redesign";

export type EventDetailPopoverProps = { event: CalendarItem; anchor: HTMLElement; onClose(): void };

/** `CalendarEvent.tramo` for a task without a tramo. */
const NO_TRAMO_KEY = "sin-tramo";

/** The event's tramo as a `WorkflowRef` for `TramoBadge`; `null` reads "Sin tramo". */
export function eventTramoRef(event: Pick<CalendarItem, "tramo" | "tramoLabel">): WorkflowRef | null {
  if (!event.tramo || event.tramo === NO_TRAMO_KEY) return null;
  return { id: event.tramo, key: event.tramo, name: event.tramoLabel || event.tramo, sortOrder: 0 };
}

/** "viernes, 6 de noviembre" (FE §13: es-MX, lowercase). */
export function eventDateLabel(date: string): string {
  const parsed = toDate(date);
  if (!parsed) return date;
  return new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long" })
    .format(parsed)
    .toLowerCase();
}

/** Tasks only store dates, so the time is estimated ("≈", as in the calendar). */
export function eventTimeLabel(time: string): string {
  return time ? `≈${time}` : "todo el día";
}

/** People on the event: the stored attendees, else the responsable. */
export function eventAttendees(event: Pick<CalendarItem, "attendees" | "responsible">): string[] {
  const stored = (event.attendees ?? []).map((name) => name.trim()).filter(Boolean);
  if (stored.length > 0) return Array.from(new Set(stored));
  const responsible = event.responsible?.trim();
  return responsible ? [responsible] : [];
}

/** The stored Cutto URL when it is an http(s) link; anything else is not rendered. */
export function safeMeetingUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : (parts[0] ?? "").slice(0, 2);
  return letters.toUpperCase();
}

/** `/tareas?…&tarea=<id>`: keeps the calendar query so the view underneath stays mounted (FE §3.4). */
export function taskSheetHref(taskId: string, pathname: string | null, search: string): string {
  const params = new URLSearchParams(pathname === "/tareas" ? search : "");
  params.set("tarea", taskId);
  return `/tareas?${params.toString()}`;
}

/**
 * Calendar event detail (redesign FE §3.4, frame `EventoDetalle`): the
 * `UnifiedCalendar` event popover. Calendar events come from tasks, so
 * "Editar" opens the task in `TaskSheet` (`?tarea=<id>`, existing task
 * actions) and "Eliminar" calls the existing `deleteTaskAction`. "Abrir en
 * Cutto" renders only for a stored `meetingUrl` (Cutto is link-only, FE §4.9).
 *
 * Focus: moves into the popover when it opens, Escape or "Cerrar" closes it
 * and returns focus to `anchor`.
 */
export function EventDetailPopover({ event, anchor, onClose }: EventDetailPopoverProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const close = useCallback(() => {
    if (anchor.isConnected) anchor.focus();
    onClose();
  }, [anchor, onClose]);

  const tramo = eventTramoRef(event);
  const attendees = eventAttendees(event);
  const meetingUrl = safeMeetingUrl(event.meetingUrl);
  const location = event.location?.trim() || null;
  const editHref = taskSheetHref(event.taskId, pathname, searchParams?.toString() ?? "");

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      try {
        await deleteTaskAction(event.taskId);
        toast.success("Tarea eliminada");
        router.refresh();
        close();
      } catch (err) {
        setError(actionErrorText(err));
      }
    });
  }

  return (
    <Popover
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <PopoverContent
        anchor={anchor}
        side="right"
        align="start"
        sideOffset={8}
        aria-labelledby={titleId}
        initialFocus={closeRef}
        finalFocus={false}
        className="w-[min(22rem,calc(100vw-2rem))] p-0"
      >
        <header className="flex items-start gap-2 p-4 pb-3">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <TramoBadge tramo={tramo} />
              <Badge variant="secondary">{event.type}</Badge>
            </div>
            <h2 id={titleId} className="text-base font-semibold leading-snug text-foreground">
              {event.title}
            </h2>
          </div>
          <Button ref={closeRef} variant="ghost" size="icon-sm" aria-label="Cerrar" onClick={close}>
            <X aria-hidden />
          </Button>
        </header>

        <dl className="space-y-2.5 px-4 pb-3 text-sm">
          <div className="flex items-start gap-2">
            <dt className="sr-only">Fecha y hora</dt>
            <CalendarClock aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <dd className="text-foreground">
              {eventDateLabel(event.date)} · <span className="font-mono">{eventTimeLabel(event.time)}</span>
            </dd>
          </div>
          {location ? (
            <div className="flex items-start gap-2">
              <dt className="sr-only">Lugar</dt>
              <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <dd className="text-foreground">{location}</dd>
            </div>
          ) : null}
          {event.project ? (
            <div className="flex items-start gap-2">
              <dt className="sr-only">Proyecto</dt>
              <FolderOpen aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <dd>
                <Badge variant="outline">{event.project}</Badge>
              </dd>
            </div>
          ) : null}
          {event.phaseLabel ? (
            <div className="flex items-start gap-2">
              <dt className="sr-only">Fase</dt>
              <ListChecks aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <dd className="text-muted-foreground">{event.phaseLabel}</dd>
            </div>
          ) : null}
        </dl>

        {attendees.length > 0 ? (
          <section aria-labelledby={`${titleId}-asistentes`} className="space-y-2 px-4 pb-3">
            <h3 id={`${titleId}-asistentes`} className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Users aria-hidden className="size-3.5" />
              Asistentes · {attendees.length}
            </h3>
            <ul className="space-y-1.5">
              {attendees.map((name) => (
                <li key={name} className="flex items-center gap-2 text-sm text-foreground">
                  <Avatar size="sm" aria-hidden>
                    <AvatarFallback>{initials(name)}</AvatarFallback>
                  </Avatar>
                  <span className="truncate">{name}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section aria-labelledby={`${titleId}-tareas`} className="space-y-1.5 px-4 pb-4">
          <h3 id={`${titleId}-tareas`} className="text-xs font-medium text-muted-foreground">
            Tareas vinculadas
          </h3>
          <ul>
            <li>
              <Link href={editHref} className="text-sm text-foreground underline-offset-4 hover:underline" onClick={onClose}>
                {event.title}
              </Link>
            </li>
          </ul>
        </section>

        {error ? (
          <div className="px-4 pb-3">
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </div>
        ) : null}

        <Separator />

        {confirming ? (
          <footer className="flex flex-wrap items-center gap-2 p-3">
            <p className="flex-1 text-sm text-foreground">¿Eliminar esta tarea?</p>
            <Button variant="outline" size="sm" autoFocus onClick={() => setConfirming(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button variant="destructive" size="sm" onClick={handleDelete} disabled={pending}>
              {pending ? "Eliminando…" : "Eliminar"}
            </Button>
          </footer>
        ) : (
          <footer className="flex flex-wrap items-center gap-2 p-3">
            {meetingUrl ? (
              <a href={meetingUrl} target="_blank" rel="noopener" className={buttonVariants({ size: "sm" })}>
                <ExternalLink aria-hidden />
                Abrir en Cutto
              </a>
            ) : null}
            <span className="flex-1" />
            <Link href={editHref} onClick={onClose} className={buttonVariants({ variant: "outline", size: "sm" })}>
              <Pencil aria-hidden />
              Editar
            </Link>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                setError(null);
                setConfirming(true);
              }}
            >
              <Trash2 aria-hidden />
              Eliminar
            </Button>
          </footer>
        )}
      </PopoverContent>
    </Popover>
  );
}
