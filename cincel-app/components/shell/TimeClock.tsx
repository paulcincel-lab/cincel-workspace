"use client";

import { useQuery } from "@tanstack/react-query";
import { Clock } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";

import { IMPLEMENTED } from "@/lib/actions/time-tracking-actions.flags";
import { cachedDateTimeFormat } from "@/lib/dates/zoned-formatters";
import { actionErrorCode } from "@/lib/errors";
import { meTodayOptions, ME_TODAY_REFETCH_MS } from "@/lib/query/options/me";
import { mutationErrorText } from "@/lib/query/mutation";
import { formatDayMonthYear } from "@/lib/time-tracking/horario-copy";
import { localDate, TIME_TRACKING_TIME_ZONE } from "@/lib/time-tracking/local-time";
import type { TodayStatus } from "@/lib/types/redesign";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { Card, CardContent } from "@/components/ui/shadcn/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/shadcn/popover";
import { Progress } from "@/components/ui/shadcn/progress";

import { useClockMutation, workedSecondsAt, type ClockAction } from "./use-clock-mutation";

export { workedSecondsAt } from "./use-clock-mutation";

/**
 * Sidebar time clock (redesign FE §3.13, §16): state pill, live time, progress
 * and the buttons per state, all from one `TodayStatus`. The `compact` variant
 * is the mobile top-bar pill that opens a popover with the same controls.
 *
 * The status is `useQuery(qk.me.today())` (hydrated by the `(staff)` layout,
 * refetched every 5 min and on window focus by the query itself), so the
 * sidebar card and the mobile pill share one cache entry and one poll. The
 * clock buttons write the result into that entry (`useClockMutation`).
 */
export type TimeClockProps = { variant?: "card" | "compact" };

/** Every action the clock calls; the clock stays hidden until all of them are real. */
export function timeClockReady(): boolean {
  return (
    IMPLEMENTED.fetchMyTodayAction &&
    IMPLEMENTED.clockInAction &&
    IMPLEMENTED.pauseWorkAction &&
    IMPLEMENTED.resumeWorkAction &&
    IMPLEMENTED.clockOutAction
  );
}

/** How often `me.today` re-reads `TodayStatus` while mounted (FE §6). */
export const TIME_CLOCK_RESYNC_MS = ME_TODAY_REFETCH_MS;

type ClockState = TodayStatus["state"];
type BadgeVariant = "success" | "warning" | "secondary" | "default";

const STATE_LABEL: Record<ClockState, string> = {
  on: "En curso",
  pausa: "En pausa",
  off: "Sin iniciar",
  done: "Cerrada",
};

/** Pill tones (FE §3.13): success / warning / muted / primary, as plain Badge variants. */
const STATE_BADGE: Record<ClockState, BadgeVariant> = {
  on: "success",
  pausa: "warning",
  off: "secondary",
  done: "default",
};

/** `HH:MM:SS` for a number of seconds. */
export function formatClockTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return [hh, mm, ss].map((n) => String(n).padStart(2, "0")).join(":");
}

const ENTRY_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  hour: "numeric",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: TIME_TRACKING_TIME_ZONE,
};

/** "9:02" in the org time zone. */
export function formatEntryTime(iso: string): string {
  const parts = cachedDateTimeFormat("es-MX", ENTRY_TIME_OPTIONS).formatToParts(new Date(iso));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "0";
  // Some ICU builds pad h23 hours to two digits; the spec shows "9:02".
  return `${Number(part("hour"))}:${part("minute").padStart(2, "0")}`;
}

/** Today's local date (`YYYY-MM-DD`) in the org time zone. */
export function localToday(now: Date = new Date()): string {
  return localDate(now);
}

/** "4 ene 2027" for a `YYYY-MM-DD` date (frame `Sidebar`, same copy as the login prompt). */
export function formatRequiredFrom(date: string): string {
  return formatDayMonthYear(date);
}

const HOURS_FORMAT = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 1 });

function formatHours(hours: number): string {
  return HOURS_FORMAT.format(hours);
}

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener?.("change", onChange);
  return () => query.removeEventListener?.("change", onChange);
}

function readReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, readReducedMotion, () => false);
}

export function TimeClock({ variant = "card" }: TimeClockProps) {
  const ready = timeClockReady();
  const { data: status, dataUpdatedAt } = useQuery({ ...meTodayOptions(), enabled: ready });
  // Null until the first tick: the first render counts from the sync instant, as the server did.
  const [tickedAt, setNow] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const reducedMotion = useReducedMotion();
  const clock = useClockMutation({ source: "sidebar", optimistic: true });
  const pending = clock.isPending;
  const state = status?.state;

  // Tick every second while the day is running (client-side, no server calls).
  useEffect(() => {
    if (state !== "on") return;
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [state]);

  function run(action: ClockAction) {
    if (pending) return;
    clock.mutate(action, {
      onSuccess: (result) => {
        const done = Date.now();
        setNow(done);
        const time = formatEntryTime(new Date(done).toISOString());
        if (action === "clockIn") {
          const entry = result.startedAt ? formatEntryTime(result.startedAt) : time;
          setAnnouncement(`Entrada registrada a las ${entry}`);
          toast.success(`Entrada registrada ${entry}`);
        } else if (action === "pause") {
          setAnnouncement(`Jornada en pausa a las ${time}`);
        } else if (action === "resume") {
          setAnnouncement(`Jornada reanudada a las ${time}`);
        } else {
          setAnnouncement(`Salida registrada a las ${time}`);
        }
      },
      onError: (err) => {
        setNow(Date.now());
        // ALREADY_ON means the server is ahead of this tab: `me.today` refetches quietly, no toast.
        if (actionErrorCode(err) !== "ALREADY_ON") toast.error(mutationErrorText(err));
      },
    });
  }

  if (!ready || !status || !status.enabled) return null;

  // Set whenever `status` is (hydration and `setQueryData` both stamp it).
  const syncedAt = dataUpdatedAt;
  const now = tickedAt ?? syncedAt;
  const snapshot = { status, syncedAt };

  const worked = workedSecondsAt(snapshot, now);
  const target = Math.max(1, status.hoursPerDay * 3600);
  const percent = Math.min(100, Math.round((worked / target) * 100));
  const subLine = [
    `de ${formatHours(status.hoursPerDay)} h`,
    status.startedAt ? `entrada ${formatEntryTime(status.startedAt)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const optionalUntil =
    status.requiredFrom && localToday(new Date(now)) < status.requiredFrom
      ? `Opcional hasta el ${formatRequiredFrom(status.requiredFrom)}`
      : null;
  const time = formatClockTime(worked);
  const idle = status.state === "off" || status.state === "done";

  const body = (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Clock aria-hidden="true" className="size-3.5" strokeWidth={2} />
        <span className="flex-1 text-xs font-medium">Jornada</span>
        <Badge variant={STATE_BADGE[status.state]}>{STATE_LABEL[status.state]}</Badge>
      </div>
      <div
        role="timer"
        aria-live="off"
        aria-label="Tiempo trabajado hoy"
        className="font-mono text-2xl font-medium tabular-nums"
      >
        {time}
      </div>
      <div className="flex flex-col gap-1">
        <Progress
          value={percent}
          aria-label="Avance de la jornada"
          indicatorClassName={reducedMotion ? "transition-none" : undefined}
        />
        <p className="text-[11.5px] text-muted-foreground">{subLine}</p>
      </div>
      <div className="flex gap-1.5">
        {idle ? (
          <Button className="flex-1" disabled={pending} onClick={() => run("clockIn")}>
            Registrar entrada
          </Button>
        ) : (
          <>
            {status.state === "on" ? (
              <Button variant="outline" className="flex-1" disabled={pending} onClick={() => run("pause")}>
                Pausa
              </Button>
            ) : (
              <Button className="flex-1" disabled={pending} onClick={() => run("resume")}>
                Reanudar
              </Button>
            )}
            <Button
              variant={status.state === "on" ? "default" : "outline"}
              className="flex-1"
              disabled={pending}
              onClick={() => run("clockOut")}
            >
              Salida
            </Button>
          </>
        )}
      </div>
      {optionalUntil ? <p className="text-[11px] text-muted-foreground">{optionalUntil}</p> : null}
      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </div>
  );

  if (variant === "compact") {
    return (
      <Popover>
        <PopoverTrigger
          render={<Button variant="outline" className="min-h-11 gap-2 rounded-full" />}
          aria-label={`Jornada: ${STATE_LABEL[status.state]}`}
        >
          <Clock aria-hidden="true" className="size-4" strokeWidth={1.8} />
          <span aria-hidden="true" className="font-mono tabular-nums">
            {time.slice(0, 5)}
          </span>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 p-4" aria-label="Jornada">
          {body}
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Card size="sm" role="region" aria-label="Jornada">
      <CardContent>{body}</CardContent>
    </Card>
  );
}
