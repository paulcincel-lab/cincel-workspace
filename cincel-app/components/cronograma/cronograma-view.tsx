"use client";

import { useCallback, useEffect, useMemo, useOptimistic, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";

import { fetchScheduleAction, setTaskStatusAction, toggleTaskFlagAction, type ScheduleViewData } from "@/lib/actions/schedule-actions";
import { CronogramaWidget } from "@/components/widgets/CronogramaWidget";
import { computeProgress } from "@/lib/cronograma/metrics";
import { buildScheduleTable, SCHEDULE_TABLE_COLUMNS } from "@/lib/cronograma/schedule-table";
import type { ScheduleStatus, ScheduleTask } from "@/lib/types/schedule";

import { CronogramaHeader } from "./cronograma-header";
import { GanttChart } from "./gantt-chart";
import { ProgressDonut } from "./progress-donut";
import { SCurveChart } from "./s-curve-chart";
import { WeekBoards } from "./week-boards";
import { STATUS_LABEL } from "./task-card";
import { AlertasPanel } from "./alertas-panel";
import { ResumenCards } from "./resumen-cards";
import { AdicionalesPanel } from "./adicionales-panel";
import { ImprevistosPanel } from "./imprevistos-panel";

interface CronogramaViewProps {
  projectId: string;
  /** Pre-fetched server-side by the page. Null when the server render had no session (auth cookie not yet visible) — the client re-fetches once mounted. */
  initialView: ScheduleViewData | null;
  /** Contract delivery date (ISO) for the "Entrega de obra" holgura. */
  contractEnd?: string | null;
}

type TaskOptimisticAction =
  | { type: "status"; taskId: string; status: ScheduleStatus }
  | { type: "flag"; taskId: string; flagged: boolean };

/**
 * The Cronograma tab (redesign FE §3.5): the schedule panels and state, rendered
 * through `CronogramaWidget`.
 */
export default function CronogramaView({ projectId, initialView, contractEnd = null }: CronogramaViewProps) {
  const searchParams = useSearchParams();
  const weekOffset = Number.parseInt(searchParams.get("week") ?? "0", 10) || 0;

  const [view, setView] = useState<ScheduleViewData | null>(initialView);
  const [loading, setLoading] = useState(!initialView);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");
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
      setAnnouncement(`${task.tarea}: ${STATUS_LABEL[next]}`);
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

  const scheduleTable = useMemo(
    () =>
      view && today
        ? buildScheduleTable({ tasks: optimisticTasks, payments: view.data.payments, today, contractEnd })
        : { columns: SCHEDULE_TABLE_COLUMNS, rows: [] },
    [view, today, optimisticTasks, contractEnd]
  );

  const panels =
    !view || !today || !metrics ? null : (
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

        <p className="sr-only" role="status" aria-live="polite">
          {announcement}
        </p>

        {error ? (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
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
    );

  const emptyTable = { columns: SCHEDULE_TABLE_COLUMNS, rows: [] };
  // `panels` is passed by spread: the widget wraps the existing panels for Visual.
  const widgetProps = {
    projectId,
    table: notFound ? emptyTable : scheduleTable,
    panels: notFound ? null : panels,
    loading,
  };
  return <CronogramaWidget {...widgetProps} />;
}
