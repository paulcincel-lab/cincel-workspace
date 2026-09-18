"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";
import { fetchScheduleAction, type ScheduleViewData } from "@/lib/actions/schedule-actions";
import { computeProgress } from "@/lib/cronograma/metrics";

import { CronogramaHeader } from "./cronograma-header";
import { GanttChart } from "./gantt-chart";
import { ProgressDonut } from "./progress-donut";
import { SCurveChart } from "./s-curve-chart";
import { WeekBoards } from "./week-boards";
import { AlertasPanel } from "./alertas-panel";
import { ResumenCards } from "./resumen-cards";
import { AdicionalesPanel } from "./adicionales-panel";

interface CronogramaViewProps {
  projectId: string;
  /** Pre-fetched server-side by the page. Null when the server render had no session (auth cookie not yet visible) — the client re-fetches once mounted. */
  initialView: ScheduleViewData | null;
}

export default function CronogramaView({ projectId, initialView }: CronogramaViewProps) {
  const searchParams = useSearchParams();
  const weekOffset = Number.parseInt(searchParams.get("week") ?? "0", 10) || 0;

  const [view, setView] = useState<ScheduleViewData | null>(initialView);
  const [loading, setLoading] = useState(!initialView);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (initialView) return;
    let cancelled = false;
    fetchScheduleAction(projectId)
      .then((result) => {
        if (cancelled) return;
        if (!result) {
          setNotFound(true);
        } else {
          setView(result);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // Only re-runs if the server-provided view was missing — projectId is stable per route.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const today = useMemo(() => (view ? new Date(`${view.today}T00:00:00`) : null), [view]);

  const metrics = useMemo(() => {
    if (!view || !today) return null;
    return computeProgress({ tasks: view.data.tasks, payments: view.data.payments }, today);
  }, [view, today]);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <p className="text-sm text-muted-foreground">Cargando cronograma…</p>
          ) : notFound || !view || !today || !metrics ? (
            <p className="text-sm text-muted-foreground">
              Este proyecto todavía no tiene un cronograma importado.
            </p>
          ) : (
            <div className="space-y-6">
              <CronogramaHeader
                projectName={view.data.project.name}
                address={view.data.project.address}
                today={today}
                weekOffset={weekOffset}
              />
              <GanttChart tasks={view.data.tasks} today={today} />
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <ProgressDonut metrics={metrics} />
                <SCurveChart tasks={view.data.tasks} payments={view.data.payments} today={today} />
              </div>
              <WeekBoards tasks={view.data.tasks} today={today} weekOffset={weekOffset} />
              <AlertasPanel tasks={view.data.tasks} today={today} />
              <ResumenCards metrics={metrics} />
              <AdicionalesPanel adicionales={view.data.adicionales} />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
