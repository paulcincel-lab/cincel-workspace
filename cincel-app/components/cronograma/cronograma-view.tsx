"use client";

import { useCallback, useEffect, useMemo, useOptimistic, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";

import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";
import { fetchScheduleAction, setTaskStatusAction, toggleTaskFlagAction, type ScheduleViewData } from "@/lib/actions/schedule-actions";
import { computeProgress } from "@/lib/cronograma/metrics";
import type { ScheduleStatus, ScheduleTask } from "@/lib/types/schedule";

import { CronogramaHeader } from "./cronograma-header";
import { GanttChart } from "./gantt-chart";
import { ProgressDonut } from "./progress-donut";
import { SCurveChart } from "./s-curve-chart";
import { WeekBoards } from "./week-boards";
import { AlertasPanel } from "./alertas-panel";
import { ResumenCards } from "./resumen-cards";
import { AdicionalesPanel } from "./adicionales-panel";
import { ImprevistosPanel } from "./imprevistos-panel";

interface CronogramaViewProps {
  projectId: string;
  /** Pre-fetched server-side by the page. Null when the server render had no session (auth cookie not yet visible) — the client re-fetches once mounted. */
  initialView: ScheduleViewData | null;
}

type TaskOptimisticAction =
  | { type: "status"; taskId: string; status: ScheduleStatus }
  | { type: "flag"; taskId: string; flagged: boolean };

export default function CronogramaView({ projectId, initialView }: CronogramaViewProps) {
  const searchParams = useSearchParams();
  const weekOffset = Number.parseInt(searchParams.get("week") ?? "0", 10) || 0;

  const [view, setView] = useState<ScheduleViewData | null>(initialView);
  const [loading, setLoading] = useState(!initialView);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState("");
  const [, startTransition] = useTransition();

  const loadSchedule = useCallback(() => {
    setLoading(true);
    fetchScheduleAction(projectId)
      .then((result) => {
        if (!result) {
          setNotFound(true);
          return;
        }
        setNotFound(false);
        setView(result);
      })
      .finally(() => setLoading(false));
  }, [projectId]);

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

  const [optimisticTasks, applyOptimisticTask] = useOptimistic(
    view?.data.tasks ?? [],
    (state, action: TaskOptimisticAction) =>
      state.map((t) => {
        if (t.id !== action.taskId) return t;
        if (action.type === "status") return { ...t, status: action.status };
        return { ...t, flagged: action.flagged };
      })
  );

  const today = useMemo(() => (view ? new Date(`${view.today}T00:00:00`) : null), [view]);

  const metrics = useMemo(() => {
    if (!view || !today) return null;
    return computeProgress({ tasks: optimisticTasks, payments: view.data.payments }, today);
  }, [view, today, optimisticTasks]);

  const handleCycleStatus = useCallback(
    (task: ScheduleTask, next: ScheduleStatus) => {
      setError("");
      startTransition(async () => {
        applyOptimisticTask({ type: "status", taskId: task.id, status: next });
        const result = await setTaskStatusAction(task.id, next, task.status);
        if (!result.ok) {
          if (result.conflict) {
            setError(`Esta tarea ya cambió de estado (ahora: ${result.current}). Se actualizó la vista.`);
          } else {
            setError(result.error);
          }
          loadSchedule();
        }
      });
    },
    [applyOptimisticTask, loadSchedule]
  );

  const handleToggleFlag = useCallback(
    (task: ScheduleTask) => {
      setError("");
      startTransition(async () => {
        applyOptimisticTask({ type: "flag", taskId: task.id, flagged: !task.flagged });
        const result = await toggleTaskFlagAction(task.id);
        if (!result.ok) {
          setError(result.error);
          loadSchedule();
        }
      });
    },
    [applyOptimisticTask, loadSchedule]
  );

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
                projectId={projectId}
                scheduleId={view.data.schedule.id}
                projectName={view.data.project.name}
                address={view.data.project.address}
                today={today}
                weekOffset={weekOffset}
                onImported={loadSchedule}
              />

              {error ? (
                <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              ) : null}

              <GanttChart tasks={optimisticTasks} today={today} />
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <ProgressDonut metrics={metrics} />
                <SCurveChart tasks={optimisticTasks} payments={view.data.payments} today={today} />
              </div>
              <WeekBoards
                tasks={optimisticTasks}
                today={today}
                weekOffset={weekOffset}
                onCycleStatus={handleCycleStatus}
                onToggleFlag={handleToggleFlag}
              />
              <AlertasPanel
                tasks={optimisticTasks}
                today={today}
                onCycleStatus={handleCycleStatus}
                onToggleFlag={handleToggleFlag}
              />
              <ResumenCards metrics={metrics} />
              <ImprevistosPanel
                key={`${view.data.schedule.id}-v${view.data.schedule.version}`}
                scheduleId={view.data.schedule.id}
                imprevistos={view.data.imprevistos}
              />
              <AdicionalesPanel adicionales={view.data.adicionales} />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
