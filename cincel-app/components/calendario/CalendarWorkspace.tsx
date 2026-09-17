"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";
import UnifiedCalendar from "@/components/calendario/UnifiedCalendar";
import { getCurrentAuthenticatedUser } from "@/lib/auth/auth-service";
import { resolveCalendarCapabilities } from "@/lib/auth/permissions";
import { fetchCalendarAction } from "@/lib/actions/tasks-actions";
import { addDays, buildCalendarEvents, dateKey } from "@/lib/calendar/calendar-service";
import { RepositoryError, reportRepositoryError } from "@/lib/errors";
import type { CalendarEvent } from "@/lib/types/calendar";

type DateRange = { from: string; to: string };

/**
 * Extra days fetched beyond the visible month grid so month navigation and
 * the "Proximos eventos" list still have some lookahead/lookback without a
 * refetch on every render.
 */
const RANGE_BUFFER_DAYS = 45;

export default function CalendarWorkspace() {
  const [authenticatedUser, setAuthenticatedUser] = useState(() => getCurrentAuthenticatedUser());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [range, setRange] = useState<DateRange | null>(null);

  useEffect(() => {
    const refreshUser = () => setAuthenticatedUser(getCurrentAuthenticatedUser());
    window.addEventListener("focus", refreshUser);
    return () => window.removeEventListener("focus", refreshUser);
  }, []);

  const handleVisibleRangeChange = useCallback((fromKey: string, toKey: string) => {
    const bufferedFrom = dateKey(addDays(new Date(`${fromKey}T00:00:00`), -RANGE_BUFFER_DAYS));
    const bufferedTo = dateKey(addDays(new Date(`${toKey}T00:00:00`), RANGE_BUFFER_DAYS));

    setRange((current) => {
      if (current && current.from === bufferedFrom && current.to === bufferedTo) {
        return current;
      }

      return { from: bufferedFrom, to: bufferedTo };
    });
  }, []);

  useEffect(() => {
    if (!range) {
      return;
    }

    let cancelled = false;

    fetchCalendarAction(range.from, range.to)
      .then((rows) => {
        if (cancelled) return;
        setFetchError(null);
        setEvents(buildCalendarEvents(rows));
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof RepositoryError) reportRepositoryError(err);
        setFetchError("No se pudo sincronizar el calendario con el servidor. Los datos mostrados pueden estar desactualizados.");
      });

    return () => {
      cancelled = true;
    };
  }, [range]);

  const capabilities = useMemo(() => resolveCalendarCapabilities(authenticatedUser), [authenticatedUser]);

  return (
    <main className="flex min-h-screen bg-background text-foreground">
      <Sidebar />

      <section className="flex-1 overflow-y-auto p-10">
        <Header />

        <div className="space-y-6">
          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <h1 className="text-3xl font-bold text-foreground">Calendario</h1>
            <p className="mt-2 text-muted-foreground">Vista integral de actividades, compromisos y agenda del equipo.</p>
          </section>

          {fetchError ? (
            <section className="rounded-2xl border border-border bg-muted px-4 py-3 text-sm text-foreground">
              {fetchError}
            </section>
          ) : null}

          {capabilities.canViewCalendar ? (
            <UnifiedCalendar
              events={events}
              mode="full"
              canViewDailyAgenda={capabilities.canViewDailyAgenda}
              canViewTeamCalendar={capabilities.canViewTeamCalendar}
              viewerName={authenticatedUser?.member.name || ""}
              onVisibleRangeChange={handleVisibleRangeChange}
            />
          ) : (
            <section className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground shadow-sm">
              No tienes permiso para ver el calendario.
            </section>
          )}
        </div>
      </section>
    </main>
  );
}
