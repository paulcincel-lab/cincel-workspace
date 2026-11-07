"use client";

import { Clock } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";

import {
  clockInAction,
  clockOutAction,
  fetchMyTodayAction,
  pauseWorkAction,
  resumeWorkAction,
} from "@/lib/actions/time-tracking-actions";
import { IMPLEMENTED } from "@/lib/actions/time-tracking-actions.flags";
import { actionErrorCode, actionErrorText } from "@/lib/errors";
import { localDate, TIME_TRACKING_TIME_ZONE } from "@/lib/time-tracking/local-time";
import { subscribeTodayStatus } from "@/lib/time-tracking/today-events";
import type { TodayStatus } from "@/lib/types/redesign";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { Card, CardContent } from "@/components/ui/shadcn/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/shadcn/popover";
import { Progress } from "@/components/ui/shadcn/progress";

/**
 * Sidebar time clock (redesign FE §3.13, §16): state pill, live time, progress
 * and the buttons per state, all from one `TodayStatus`. The `compact` variant
 * is the mobile top-bar pill that opens a popover with the same controls.
 */
/** `requiredFrom` and `hoursPerDay` are on `TodayStatus`. */
export type TimeClockProps = { initial: TodayStatus; variant?: "card" | "compact" };

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

/** How often the clock re-reads `TodayStatus` while mounted (FE §6). */
export const TIME_CLOCK_RESYNC_MS = 5 * 60 * 1000;

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

type Snapshot = { status: TodayStatus; syncedAt: number };

type ClockAction = "clockIn" | "pause" | "resume" | "clockOut";

/** `HH:MM:SS` for a number of seconds. */
export function formatClockTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return [hh, mm, ss].map((n) => String(n).padStart(2, "0")).join(":");
}

/** "9:02" in the org time zone. */
export function formatEntryTime(iso: string): string {
  const parts = new Intl.DateTimeFormat("es-MX", {
    hour: "numeric",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: TIME_TRACKING_TIME_ZONE,
  }).formatToParts(new Date(iso));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "0";
  // Some ICU builds pad h23 hours to two digits; the spec shows "9:02".
  return `${Number(part("hour"))}:${part("minute").padStart(2, "0")}`;
}

/** Today's local date (`YYYY-MM-DD`) in the org time zone. */
export function localToday(now: Date = new Date()): string {
  return localDate(now);
}

/** "1 de diciembre" for a `YYYY-MM-DD` date. */
export function formatRequiredFrom(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1, 12)),
  );
}

/**
 * Seconds worked as of `now`: the synced `workedSeconds` plus, while the day is
 * running, the stretch since the later of the sync and `startedAt`.
 */
export function workedSecondsAt(snapshot: Snapshot, now: number): number {
  const { status, syncedAt } = snapshot;
  if (status.state !== "on") return status.workedSeconds;
  const started = status.startedAt ? Date.parse(status.startedAt) : Number.NaN;
  const anchor = Number.isFinite(started) ? Math.max(syncedAt, started) : syncedAt;
  return status.workedSeconds + Math.max(0, Math.floor((now - anchor) / 1000));
}

function formatHours(hours: number): string {
  return new Intl.NumberFormat("es-MX", { maximumFractionDigits: 1 }).format(hours);
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

export function TimeClock({ initial, variant = "card" }: TimeClockProps) {
  const ready = timeClockReady();
  const [snapshot, setSnapshot] = useState<Snapshot>(() => ({ status: initial, syncedAt: Date.now() }));
  const [now, setNow] = useState(() => Date.now());
  const [pending, setPending] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const pendingRef = useRef(false);
  const reducedMotion = useReducedMotion();

  const { status } = snapshot;

  // Tick every second while the day is running (client-side, no server calls).
  useEffect(() => {
    if (status.state !== "on") return;
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [status.state]);

  const resync = useCallback(async () => {
    if (pendingRef.current) return;
    try {
      const fresh = await fetchMyTodayAction();
      if (pendingRef.current) return;
      const at = Date.now();
      setSnapshot({ status: fresh, syncedAt: at });
      setNow(at);
    } catch {
      // A failed background re-sync keeps the last known status.
    }
  }, []);

  // A clock action elsewhere in the shell (login prompt) publishes its result.
  useEffect(
    () =>
      subscribeTodayStatus((fresh) => {
        if (pendingRef.current) return;
        const at = Date.now();
        setSnapshot({ status: fresh, syncedAt: at });
        setNow(at);
      }),
    [],
  );

  // Re-sync on window focus and every 5 minutes.
  useEffect(() => {
    if (!ready) return;
    const onFocus = () => void resync();
    window.addEventListener("focus", onFocus);
    const id = window.setInterval(() => void resync(), TIME_CLOCK_RESYNC_MS);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(id);
    };
  }, [ready, resync]);

  const run = useCallback(
    async (action: ClockAction) => {
      if (pendingRef.current) return;
      const previous = snapshot;
      const at = Date.now();
      const worked = workedSecondsAt(previous, at);
      const optimistic: TodayStatus =
        action === "clockIn"
          ? { ...previous.status, state: "on", startedAt: new Date(at).toISOString(), workedSeconds: worked }
          : action === "pause"
            ? { ...previous.status, state: "pausa", workedSeconds: worked }
            : action === "resume"
              ? { ...previous.status, state: "on", workedSeconds: worked }
              : { ...previous.status, state: "done", workedSeconds: worked };

      pendingRef.current = true;
      setPending(true);
      setSnapshot({ status: optimistic, syncedAt: at });
      setNow(at);
      try {
        const result =
          action === "clockIn"
            ? await clockInAction({ source: "sidebar" })
            : action === "pause"
              ? await pauseWorkAction()
              : action === "resume"
                ? await resumeWorkAction()
                : await clockOutAction();
        const done = Date.now();
        setSnapshot({ status: result, syncedAt: done });
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
        pendingRef.current = false;
        setPending(false);
      } catch (err) {
        setSnapshot(previous);
        setNow(Date.now());
        pendingRef.current = false;
        setPending(false);
        // ALREADY_ON means the server is ahead of this tab: re-sync quietly, no toast.
        if (actionErrorCode(err) !== "ALREADY_ON") toast.error(actionErrorText(err));
        await resync();
      }
    },
    [snapshot, resync],
  );

  if (!ready || !status.enabled) return null;

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
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Clock aria-hidden="true" className="size-4" strokeWidth={1.8} />
        <span className="text-sm font-medium">Jornada</span>
        <Badge variant={STATE_BADGE[status.state]} className="ml-auto">
          {STATE_LABEL[status.state]}
        </Badge>
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
        <p className="text-xs text-muted-foreground">{subLine}</p>
      </div>
      <div className="flex gap-2">
        {idle ? (
          <Button className="flex-1" disabled={pending} onClick={() => void run("clockIn")}>
            Registrar entrada
          </Button>
        ) : (
          <>
            {status.state === "on" ? (
              <Button variant="outline" className="flex-1" disabled={pending} onClick={() => void run("pause")}>
                Pausa
              </Button>
            ) : (
              <Button className="flex-1" disabled={pending} onClick={() => void run("resume")}>
                Reanudar
              </Button>
            )}
            <Button variant="outline" className="flex-1" disabled={pending} onClick={() => void run("clockOut")}>
              Salida
            </Button>
          </>
        )}
      </div>
      {optionalUntil ? <p className="text-xs text-muted-foreground">{optionalUntil}</p> : null}
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
