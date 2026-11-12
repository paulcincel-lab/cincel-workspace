"use client";

import { ChevronDown, ChevronRight, GripVertical } from "lucide-react";
import { useId, useState, type DragEvent } from "react";

import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { Checkbox } from "@/components/ui/shadcn/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/shadcn/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";
import { useCalendarioUi } from "@/lib/stores/calendario-ui-store";
import type { DeferredItem, PlanWeekData, Proposal } from "@/lib/types/calendario";
import { cn } from "@/lib/utils";

import { backlogSummary, dayLong, dayShort, dayNumber, daysOf, hoursLabel, type PlanBacklogTask } from "./plan-week-model";

export const PLAN_SECTION_ID = "planear-mi-semana";
export const PLAN_DROP_ZONE_COPY = "✦ Arrastra tareas aquí para que el asistente las acomode";

/** What every Estilo of the board shares. */
export type PlanWeekCommon = {
  data: PlanWeekData;
  proposal?: Proposal | null;
  checked?: string[];
  busy?: boolean;
  onPlan?(): void;
  onMove?(taskId: string, staffId: string, date: string): void;
  onToggle?(changeId: string): void;
  onApply?(): void;
  onCancel?(): void;
  onUndo?(): void;
  /** True right after Aplicar while the undo is still valid. */
  canUndo?: boolean;
  /** The task picked with the keyboard, and its handler. */
  picked?: string | null;
  onPick?(taskId: string | null): void;
};

/** Collapsed header row: title, count and the plan button (FE §7.7). */
export function PlanWeekHeader({
  data,
  expanded,
  busy,
  subtitle,
  onToggle,
  onPlan,
  controlsId,
}: {
  data: PlanWeekData;
  expanded: boolean;
  busy?: boolean;
  subtitle?: string;
  onToggle?(next: boolean): void;
  onPlan?(): void;
  controlsId: string;
}) {
  const Icon = expanded ? ChevronDown : ChevronRight;
  return (
    <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <h2 className="text-base font-semibold">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-expanded={expanded}
          aria-controls={controlsId}
          onClick={() => onToggle?.(!expanded)}
        >
          <Icon aria-hidden />
          Planear la semana
        </Button>
      </h2>
      <p className="text-sm text-muted-foreground">{backlogSummary(data.backlog)}</p>
      {subtitle ? <p className="w-full text-sm text-muted-foreground sm:order-last">{subtitle}</p> : null}
      <Button type="button" className="ml-auto" disabled={busy} onClick={() => onPlan?.()}>
        ✦ Planear mi semana
      </Button>
    </header>
  );
}

/** "Mover a…": person + day selects, the same `onMove` the drop calls. */
export function MoveToPopover({
  task,
  data,
  onMove,
  lockedStaffId,
}: {
  task: PlanBacklogTask;
  data: PlanWeekData;
  onMove?(taskId: string, staffId: string, date: string): void;
  /** Esencial: the viewer's lane only. */
  lockedStaffId?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const people = lockedStaffId ? data.people.filter((p) => p.staffId === lockedStaffId) : data.people;
  const days = daysOf(data);
  const [staffId, setStaffId] = useState<string>(people[0]?.staffId ?? "");
  const [date, setDate] = useState<string>(days[0] ?? "");
  const personItems = Object.fromEntries(people.map((p) => [p.staffId, p.name]));
  const dayItems = Object.fromEntries(days.map((d) => [d, dayLong(d)]));
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button type="button" variant="outline" size="xs" aria-label={`Mover ${task.title} a…`} />}>
        Mover a…
      </PopoverTrigger>
      <PopoverContent className="grid w-64 gap-2 p-3">
        <Select items={personItems} value={staffId} onValueChange={(v) => setStaffId((v as string) ?? "")}>
          <SelectTrigger aria-label="Persona">
            <SelectValue placeholder="Persona" />
          </SelectTrigger>
          <SelectContent>
            {people.map((p) => (
              <SelectItem key={p.staffId} value={p.staffId}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select items={dayItems} value={date} onValueChange={(v) => setDate((v as string) ?? "")}>
          <SelectTrigger aria-label="Día">
            <SelectValue placeholder="Día" />
          </SelectTrigger>
          <SelectContent>
            {days.map((d) => (
              <SelectItem key={d} value={d}>
                {dayLong(d)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          size="sm"
          disabled={!staffId || !date}
          onClick={() => {
            onMove?.(task.taskId, staffId, date);
            setOpen(false);
          }}
        >
          Mover
        </Button>
      </PopoverContent>
    </Popover>
  );
}

/** The "Por planear" list and the drop zone for the next `plan_week` call. */
export function PlanWeekBacklog({
  data,
  picked,
  onPick,
  onMove,
  draggable = true,
  lockedStaffId,
}: {
  data: PlanWeekData;
  picked?: string | null;
  onPick?(taskId: string | null): void;
  onMove?(taskId: string, staffId: string, date: string): void;
  draggable?: boolean;
  lockedStaffId?: string | null;
}) {
  const planDrops = useCalendarioUi((s) => s.planDrops);
  const addPlanDrop = useCalendarioUi((s) => s.addPlanDrop);
  const setDragging = useCalendarioUi((s) => s.setDragging);
  const [over, setOver] = useState(false);
  const zoneId = useId();

  function startDrag(event: DragEvent, taskId: string) {
    event.dataTransfer.setData("text/plain", taskId);
    event.dataTransfer.effectAllowed = "move";
    setDragging({ itemId: taskId, overDate: null });
  }

  function dropInZone(event: DragEvent) {
    event.preventDefault();
    setOver(false);
    const id = event.dataTransfer.getData("text/plain");
    if (id && data.backlog.some((t) => t.taskId === id)) addPlanDrop(id);
    setDragging(null);
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Por planear</h3>
      {data.backlog.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">No tienes tareas por planear esta semana.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {data.backlog.map((task) => {
            const isPicked = picked === task.taskId;
            const dropped = planDrops.includes(task.taskId);
            return (
              <li
                key={task.taskId}
                draggable={draggable}
                onDragStart={draggable ? (e) => startDrag(e, task.taskId) : undefined}
                onDragEnd={() => setDragging(null)}
                className={cn(
                  "flex items-center gap-2 rounded-lg border border-border bg-card p-2 text-sm",
                  isPicked && "border-primary ring-1 ring-primary",
                )}
              >
                <Checkbox
                  aria-label={`Elegir ${task.title}`}
                  checked={dropped}
                  onCheckedChange={(v) => (v ? addPlanDrop(task.taskId) : useCalendarioUi.setState((s) => ({ planDrops: s.planDrops.filter((id) => id !== task.taskId) })))}
                />
                {draggable ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-roledescription="arrastrable"
                    aria-pressed={isPicked}
                    aria-label={`Tomar ${task.title}`}
                    onClick={() => onPick?.(isPicked ? null : task.taskId)}
                  >
                    <GripVertical aria-hidden />
                  </Button>
                ) : null}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{task.title}</span>
                  {task.projectName ? <span className="block truncate text-xs text-muted-foreground">{task.projectName}</span> : null}
                </span>
                <Badge variant="secondary">{hoursLabel(task.hours)}</Badge>
                <MoveToPopover task={task} data={data} onMove={onMove} lockedStaffId={lockedStaffId} />
              </li>
            );
          })}
        </ul>
      )}
      <div
        id={zoneId}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={dropInZone}
        className={cn(
          "rounded-lg border border-dashed border-border p-3 text-center text-sm text-muted-foreground",
          over && "border-primary bg-muted text-foreground",
        )}
      >
        {PLAN_DROP_ZONE_COPY}
        {planDrops.length > 0 ? <span className="mt-1 block text-xs">{planDrops.length} elegidas para el asistente</span> : null}
      </div>
    </div>
  );
}

/** Aplicar / Cancelar / Deshacer and the "No cupo" list. */
export function PlanWeekActions({
  proposal,
  busy,
  canUndo,
  onApply,
  onCancel,
  onUndo,
}: Pick<PlanWeekCommon, "proposal" | "busy" | "canUndo" | "onApply" | "onCancel" | "onUndo">) {
  if (!proposal && !canUndo) return null;
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Propuesta de la semana">
      {proposal ? (
        <>
          <p className="min-w-0 flex-1 text-sm">{proposal.line}</p>
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => onCancel?.()}>
            Cancelar
          </Button>
          <Button type="button" size="sm" disabled={busy} onClick={() => onApply?.()}>
            Aplicar
          </Button>
        </>
      ) : null}
      {canUndo ? (
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => onUndo?.()}>
          Deshacer
        </Button>
      ) : null}
    </div>
  );
}

export function PlanWeekDeferred({ deferred }: { deferred: readonly DeferredItem[] }) {
  if (deferred.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">No cupo</h3>
      <ul className="flex flex-col gap-1">
        {deferred.map((d) => (
          <li key={d.taskId} className="text-sm">
            <span className="font-medium">{d.title}</span>
            <span className="text-muted-foreground"> · {d.reason}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** "Lun 16" header cell text. */
export function dayHead(iso: string): string {
  return `${dayShort(iso)} ${dayNumber(iso)}`;
}
