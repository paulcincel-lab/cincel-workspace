import { Card } from "@/components/ui/shadcn/card";
import { ScrollArea } from "@/components/ui/shadcn/scroll-area";
import { TaskCard } from "./task-card";
import { tasksInRange } from "@/lib/cronograma/metrics";
import { fmtRange, isoDate, mondayOf, weekBounds } from "@/lib/cronograma/week";
import { sortSections } from "@/lib/cronograma/sections";
import type { ScheduleStatus, ScheduleTask } from "@/lib/types/schedule";

function groupBySeccion(tasks: ScheduleTask[]): Map<string, ScheduleTask[]> {
  const map = new Map<string, ScheduleTask[]>();
  for (const t of tasks) {
    const list = map.get(t.seccion);
    if (list) list.push(t);
    else map.set(t.seccion, [t]);
  }
  return map;
}

interface BoardColumnProps {
  title: string;
  tasks: ScheduleTask[];
  start: Date;
  end: Date;
  isTodayWeek: boolean;
  readOnly: boolean;
  onCycleStatus?: (task: ScheduleTask, next: ScheduleStatus) => void;
  onToggleFlag?: (task: ScheduleTask) => void;
}

function BoardColumn({ title, tasks, start, end, isTodayWeek, readOnly, onCycleStatus, onToggleFlag }: BoardColumnProps) {
  const doneCount = tasks.filter((t) => t.status === "done").length;
  const progressCount = tasks.filter((t) => t.status === "progress").length;
  const countLabel = `${doneCount} / ${tasks.length} completadas${progressCount ? ` · ${progressCount} en proceso` : ""}`;
  const grouped = groupBySeccion(tasks);
  const seccionesOrdered = sortSections([...grouped.keys()]);

  return (
    <Card className={isTodayWeek ? "border-primary/40" : undefined}>
      <div className="space-y-1 border-b border-border p-4">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-foreground">{title}</h3>
          {isTodayWeek ? (
            <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-foreground">
              Hoy
            </span>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">{fmtRange(start, end)}</p>
        <p className="text-xs text-muted-foreground">{countLabel}</p>
      </div>
      <ScrollArea className="h-80 p-3">
        {tasks.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground">Sin tareas en esta semana.</p>
        ) : (
          <div className="space-y-3">
            {seccionesOrdered.map((seccion) => (
              <div key={seccion}>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {seccion} · {grouped.get(seccion)?.length}
                </p>
                <div className="space-y-1.5">
                  {grouped.get(seccion)?.map((t) => (
                    <TaskCard
                      key={t.id}
                      task={t}
                      readOnly={readOnly}
                      onCycleStatus={onCycleStatus}
                      onToggleFlag={onToggleFlag}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </Card>
  );
}

interface WeekBoardsProps {
  tasks: ScheduleTask[];
  today: Date;
  weekOffset: number;
  readOnly?: boolean;
  onCycleStatus?: (task: ScheduleTask, next: ScheduleStatus) => void;
  onToggleFlag?: (task: ScheduleTask) => void;
}

/** Semana anterior / esta semana / próxima semana, relative to `weekOffset` from the real current week. */
export function WeekBoards({ tasks, today, weekOffset, readOnly = false, onCycleStatus, onToggleFlag }: WeekBoardsProps) {
  const realTodayWeekStart = isoDate(mondayOf(today));
  const columns = [
    { title: "Semana anterior", offset: weekOffset - 1 },
    { title: "Esta semana", offset: weekOffset },
    { title: "Próxima semana", offset: weekOffset + 1 },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {columns.map((c) => {
        const { start, end } = weekBounds(today, c.offset);
        return (
          <BoardColumn
            key={c.title}
            title={c.title}
            tasks={tasksInRange(tasks, start, end)}
            start={start}
            end={end}
            isTodayWeek={isoDate(start) === realTodayWeekStart}
            readOnly={readOnly}
            onCycleStatus={onCycleStatus}
            onToggleFlag={onToggleFlag}
          />
        );
      })}
    </div>
  );
}
