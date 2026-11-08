"use client";

import { useCallback, useMemo, useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";

import { CronogramaWidget } from "@/components/widgets/CronogramaWidget";
import { computeProgress } from "@/lib/cronograma/metrics";
import { buildScheduleTable, SCHEDULE_TABLE_COLUMNS } from "@/lib/cronograma/schedule-table";
import { proyectoCronogramaOptions } from "@/lib/query/options/proyectos";
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
import { useScheduleTaskMutations } from "./schedule-mutations";

interface CronogramaViewProps {
  projectId: string;
  /** Contract delivery date (ISO) for the "Entrega de obra" holgura. */
  contractEnd?: string | null;
}

const EMPTY_TABLE = { columns: SCHEDULE_TABLE_COLUMNS, rows: [] };

/**
 * The Cronograma tab (redesign FE §3.5): the schedule panels and state, rendered
 * through `CronogramaWidget`. The schedule is `qk.proyectos.cronograma(id)`,
 * prefetched by the page; status and flag changes patch that cache
 * optimistically, so the new value stays after the save settles (#947).
 * `?week=` is read from the URL and never refetches.
 */
export default function CronogramaView({ projectId, contractEnd = null }: CronogramaViewProps) {
  const searchParams = useSearchParams();
  const weekOffset = Number.parseInt(searchParams.get("week") ?? "0", 10) || 0;

  const { data: view } = useSuspenseQuery(proyectoCronogramaOptions(projectId));
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");

  const { setStatus, toggleFlag } = useScheduleTaskMutations(projectId, setError);
  const { mutate: mutateStatus } = setStatus;
  const { mutate: mutateFlag } = toggleFlag;

  const today = useMemo(() => (view ? new Date(`${view.today}T00:00:00`) : null), [view]);

  const metrics = useMemo(() => {
    if (!view || !today) return null;
    return computeProgress({ tasks: view.data.tasks, payments: view.data.payments }, today);
  }, [view, today]);

  const handleCycleStatus = useCallback(
    (task: ScheduleTask, next: ScheduleStatus) => {
      setError("");
      setAnnouncement(`${task.tarea}: ${STATUS_LABEL[next]}`);
      mutateStatus({ task, next });
    },
    [mutateStatus]
  );

  const handleToggleFlag = useCallback(
    (task: ScheduleTask) => {
      setError("");
      mutateFlag({ task });
    },
    [mutateFlag]
  );

  const scheduleTable = useMemo(
    () =>
      view && today
        ? buildScheduleTable({ tasks: view.data.tasks, payments: view.data.payments, today, contractEnd })
        : EMPTY_TABLE,
    [view, today, contractEnd]
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
        />

        <p className="sr-only" role="status" aria-live="polite">
          {announcement}
        </p>

        {error ? (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <GanttChart tasks={view.data.tasks} today={today} />
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <ProgressDonut metrics={metrics} />
          <SCurveChart tasks={view.data.tasks} payments={view.data.payments} today={today} />
        </div>
        <WeekBoards
          tasks={view.data.tasks}
          today={today}
          weekOffset={weekOffset}
          onCycleStatus={handleCycleStatus}
          onToggleFlag={handleToggleFlag}
        />
        <AlertasPanel
          tasks={view.data.tasks}
          today={today}
          onCycleStatus={handleCycleStatus}
          onToggleFlag={handleToggleFlag}
        />
        <ResumenCards metrics={metrics} />
        <ImprevistosPanel projectId={projectId} />
        <AdicionalesPanel adicionales={view.data.adicionales} />
      </div>
    );

  // `panels` is passed by spread: the widget wraps the existing panels for Visual.
  // A null schedule (none imported, or no access) shows the widget's empty state.
  const widgetProps = {
    projectId,
    table: view ? scheduleTable : EMPTY_TABLE,
    panels,
    loading: false,
  };
  return <CronogramaWidget {...widgetProps} />;
}
