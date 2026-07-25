"use client";

import { useEffect, useMemo, useState } from "react";

import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";
import UnifiedCalendar from "@/components/calendario/UnifiedCalendar";
import { getCurrentAuthenticatedUser } from "@/lib/auth/auth-service";
import { resolveCalendarCapabilities } from "@/lib/auth/permissions";
import { loadCalendarTasksFromSource, buildCalendarEvents } from "@/lib/calendar/calendar-service";

export default function CalendarWorkspace() {
  const [tasks, setTasks] = useState(() => loadCalendarTasksFromSource());
  const [authenticatedUser, setAuthenticatedUser] = useState(() => getCurrentAuthenticatedUser());

  useEffect(() => {
    const refresh = () => {
      setTasks(loadCalendarTasksFromSource());
      setAuthenticatedUser(getCurrentAuthenticatedUser());
    };

    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);

    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const events = useMemo(() => buildCalendarEvents(tasks), [tasks]);
  const capabilities = useMemo(() => resolveCalendarCapabilities(authenticatedUser), [authenticatedUser]);

  return (
    <main className="flex min-h-screen bg-slate-100">
      <Sidebar />

      <section className="flex-1 overflow-y-auto p-10">
        <Header />

        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h1 className="text-3xl font-bold text-slate-900">Calendario</h1>
            <p className="mt-2 text-slate-700">Vista integral de actividades, compromisos y agenda del equipo.</p>
          </section>

          {capabilities.canViewCalendar ? (
            <UnifiedCalendar
              events={events}
              mode="full"
              canViewDailyAgenda={capabilities.canViewDailyAgenda}
              canViewTeamCalendar={capabilities.canViewTeamCalendar}
              viewerName={authenticatedUser?.member.name || ""}
            />
          ) : (
            <section className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-700 shadow-sm">
              No tienes permiso para ver el calendario.
            </section>
          )}
        </div>
      </section>
    </main>
  );
}
