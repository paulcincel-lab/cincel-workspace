"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { CircleAlertIcon, LoaderCircleIcon } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/shadcn/alert";
import { Button } from "@/components/ui/shadcn/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/shadcn/dialog";
import { clockInAction, fetchMyTodayAction } from "@/lib/actions/time-tracking-actions";
import { IMPLEMENTED } from "@/lib/actions/time-tracking-actions.flags";
import { actionErrorCode, actionErrorText } from "@/lib/errors";
import { publishTodayStatus } from "@/lib/time-tracking/today-events";
import type { TodayStatus } from "@/lib/types/redesign";

/**
 * First-login-of-the-day clock-in dialog (redesign FE §3.10, canvas
 * `LoginJornada`), mounted once in the staff shell.
 *
 * - Shown at the first staff page of the day when `status.enabled`,
 *   `state === "off"` and `promptAtLogin` (the server sets `promptAtLogin`
 *   only on work days before `dayEnd`, BE §8.7), and only once the clock
 *   actions are implemented (nothing calls a write stub).
 * - Before `requiredFrom` it can be skipped (Escape, outside click, "Ahora
 *   no"); a skip is remembered for the rest of the local day. From
 *   `requiredFrom` on it cannot be dismissed, except after `clockInAction`
 *   fails with anything other than `ALREADY_ON`: then the error copy and
 *   "Cerrar" appear, so nobody is locked out.
 * - `ALREADY_ON` (or a re-sync showing the day already started, because
 *   production builds hide thrown Server Action messages) closes silently and
 *   publishes the fresh status to `TimeClock`.
 * - The same dialog shell as `FormDialog` (Base UI `Dialog`: focus trapped
 *   and returned, labelled by its title, described by its copy) with its own
 *   footer ("Ahora no" / "Cerrar"). Ignores the presentation style.
 */
export type ClockInPromptProps = {
  status: TodayStatus;
  requiredFrom: string | null;
  now: Date;
  /** The viewer's name for the greeting; the first word is used. */
  name?: string;
};

/** Time zone of every local-day comparison (BE §8.7). */
const TIME_ZONE = "America/Mexico_City";

/** `localStorage` key holding the local date (YYYY-MM-DD) the prompt was last skipped or answered. */
export const CLOCK_IN_PROMPT_SEEN_KEY = "cincel.clockInPrompt.seen";

/** The local (America/Mexico_City) calendar date of `now`, as YYYY-MM-DD. */
export function localDateKey(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** True when clock-in is mandatory today: the server says so, or today is on or after `requiredFrom`. */
export function isClockInRequired(status: TodayStatus, requiredFrom: string | null, now: Date): boolean {
  if (status.required) return true;
  return requiredFrom !== null && localDateKey(now) >= requiredFrom;
}

/** True when the prompt applies to this status (feature on, not exempt, not started, asked at login). */
export function shouldPromptClockIn(status: TodayStatus): boolean {
  return (
    IMPLEMENTED.clockInAction &&
    IMPLEMENTED.fetchMyTodayAction &&
    status.enabled &&
    status.state === "off" &&
    status.promptAtLogin
  );
}

/** "16 de noviembre" (es-MX, lowercase) for a YYYY-MM-DD date. */
export function formatPromptDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return isoDate;
  return new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, day, 12)))
    .toLowerCase();
}

/** "9:02" in the org time zone. */
export function formatPromptTime(now: Date): string {
  return new Intl.DateTimeFormat("es-MX", {
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
    timeZone: TIME_ZONE,
  }).format(now);
}

function readSeen(): string | null {
  try {
    return window.localStorage.getItem(CLOCK_IN_PROMPT_SEEN_KEY);
  } catch {
    return null;
  }
}

function writeSeen(date: string): void {
  try {
    window.localStorage.setItem(CLOCK_IN_PROMPT_SEEN_KEY, date);
  } catch {
    // Private windows and blocked storage: the prompt may show again on reload.
  }
}

/** The fresh status after a failed clock-in, or null when it can't be read. */
async function resync(): Promise<TodayStatus | null> {
  try {
    return await fetchMyTodayAction();
  } catch {
    return null;
  }
}

export function ClockInPrompt({ status, requiredFrom, now, name }: ClockInPromptProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clock, setClock] = useState(now);
  const decided = useRef(false);
  const mounted = useRef(true);

  const required = isClockInRequired(status, requiredFrom, clock);
  // After a failure other than ALREADY_ON the dialog can always be closed.
  const dismissible = !required || error !== null;

  // Decide once, after hydration (storage is client-only), whether to open.
  useEffect(() => {
    if (decided.current) return;
    decided.current = true;
    if (!shouldPromptClockIn(status)) return;
    if (!isClockInRequired(status, requiredFrom, now) && readSeen() === localDateKey(now)) return;
    // Opening depends on localStorage, which only exists after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(true);
  }, [status, requiredFrom, now]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // The shown time follows the wall clock while the dialog is open.
  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => setClock(new Date()), 15_000);
    return () => window.clearInterval(id);
  }, [open]);

  const today = localDateKey(clock);
  const close = useCallback(() => {
    writeSeen(today);
    setOpen(false);
  }, [today]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (next || !dismissible || pending) return;
      close();
    },
    [close, dismissible, pending],
  );

  const sync = useCallback(
    (fresh: TodayStatus) => {
      publishTodayStatus(fresh);
      router.refresh();
    },
    [router],
  );

  const handleClockIn = useCallback(async () => {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const next = await clockInAction({ source: "login" });
      if (!mounted.current) return;
      sync(next);
      close();
    } catch (err) {
      const fresh = await resync();
      if (!mounted.current) return;
      let code = actionErrorCode(err);
      if (fresh && fresh.enabled && fresh.state !== "off") code = "ALREADY_ON";
      else if (!code && fresh && !fresh.enabled) code = "DISABLED";
      if (code === "ALREADY_ON") {
        if (fresh) sync(fresh);
        close();
        return;
      }
      setError(actionErrorText(code ? new Error(code) : err));
    } finally {
      if (mounted.current) setPending(false);
    }
  }, [close, pending, sync]);

  const firstName = name?.trim().split(/\s+/)[0] ?? "";
  const greeting = firstName ? `Buenos días, ${firstName}` : "Buenos días";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange} disablePointerDismissal={!dismissible}>
      <DialogContent
        showCloseButton={false}
        data-clock-in-prompt=""
        data-required={required ? "true" : "false"}
        className="gap-0 p-0 sm:max-w-[420px] motion-reduce:animate-none"
      >
        <DialogHeader className="p-4 pb-2">
          <DialogTitle>{greeting}</DialogTitle>
          <DialogDescription>
            Registra tu entrada para empezar el día.
            {!required && requiredFrom ? ` Opcional hasta el ${formatPromptDate(requiredFrom)}.` : null}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 px-4 py-2">
          <p className="flex items-baseline justify-between gap-2 text-sm text-muted-foreground">
            <span>Hora actual</span>
            <time dateTime={clock.toISOString()} className="font-mono text-2xl font-semibold text-foreground tabular-nums">
              {formatPromptTime(clock)}
            </time>
          </p>
          {required && error === null ? (
            <p className="text-sm text-muted-foreground">El registro de entrada es obligatorio.</p>
          ) : null}
          {error ? (
            <Alert variant="destructive">
              <CircleAlertIcon aria-hidden="true" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </div>
        <DialogFooter className="m-0 mt-2 flex-row justify-end">
          {error !== null ? (
            <Button type="button" variant="outline" onClick={close}>
              Cerrar
            </Button>
          ) : !required ? (
            <Button type="button" variant="outline" onClick={close} disabled={pending}>
              Ahora no
            </Button>
          ) : null}
          <Button type="button" onClick={handleClockIn} disabled={pending} aria-busy={pending || undefined}>
            {pending ? (
              <LoaderCircleIcon aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
            ) : null}
            Registrar entrada
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
