"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/shadcn/badge";
import { shellBadgesOptions } from "@/lib/query/options/shell";

/** "99+" above 99. */
export function formatUnreadBadge(count: number): string {
  return count > 99 ? "99+" : String(count);
}

export type BandejaBadgeData = {
  unreadCount: number;
  /** `dueAt` of the open reminders still due today (absent = none). */
  dueReminders?: readonly string[];
  /** Server render instant (ms); reminders due after it count until their time passes. */
  renderedAt?: number;
};

/** Longest timer delay browsers accept. */
const MAX_TIMEOUT_MS = 2_147_483_647;

/**
 * How many of `dueAt` are still ahead. Starts from the server's `renderedAt`
 * (same count on server and client) and re-counts when the next one passes.
 */
export function useDueReminderCount(dueAt: readonly string[] | undefined, renderedAt: number | undefined): number {
  const times = useMemo(
    () => (dueAt ?? []).map((iso) => Date.parse(iso)).filter((t) => Number.isFinite(t)).sort((a, b) => a - b),
    [dueAt],
  );
  const [now, setNow] = useState(() => renderedAt ?? 0);

  useEffect(() => {
    const next = times.find((t) => t > now);
    if (next === undefined) return;
    const delay = Math.min(MAX_TIMEOUT_MS, Math.max(0, next - Date.now() + 50));
    const id = window.setTimeout(() => setNow(Date.now()), delay);
    return () => window.clearTimeout(id);
  }, [times, now]);

  return times.filter((t) => t > now).length;
}

/**
 * The Mi espacio badge (redesign FE §3.1, frame `Sidebar`): unread Bandeja
 * items plus the reminders still due today, from `useQuery(qk.shell.badges())`
 * (hydrated by the `(staff)` layout, polled every 60 s, patched by the
 * Bandeja). No server reads of its own. Mono, primary tint; hidden at zero.
 */
export function BandejaBadge() {
  const { data } = useQuery(shellBadgesOptions());
  const reminders = useDueReminderCount(data?.bandeja.dueReminders, data?.bandeja.renderedAt);
  const count = (data?.bandeja.unreadCount ?? 0) + reminders;
  if (count <= 0) return null;
  return (
    <Badge variant="count" data-slot="bandeja-badge">
      {formatUnreadBadge(count)}
      <span className="sr-only">{reminders > 0 ? (count === 1 ? " pendiente" : " pendientes") : " sin leer"}</span>
    </Badge>
  );
}
