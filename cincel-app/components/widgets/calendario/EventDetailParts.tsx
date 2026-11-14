"use client";

import type { ReactNode } from "react";

import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { AddSubtaskInline, useCanCreateSubtask } from "@/components/tareas/AddSubtaskInline";
import { ResponsableAvatar } from "@/components/widgets/PeopleStack";
import { etapaColorClass } from "@/lib/etapas/etapa-color";
import type { TaskDetail } from "@/lib/types/core";
import type { CalItem, CalEtapaRef, DetailAction } from "@/lib/types/calendario";
import { cn } from "@/lib/utils";

import { DETAIL_COPY, kindChip, projectEtapaLine, responsableLine, taskNote, taskWhen } from "./event-detail-model";

/** An etapa's colour as the dot and band classes (tokens only). */
export function etapaBandClass(etapa: CalEtapaRef | null): string {
  return etapa ? etapaColorClass({ key: etapa.key ?? "", sortOrder: 0, colorSlot: etapa.colorSlot }) : etapaColorClass(null);
}

export function EtapaBand({ etapa, className }: { etapa: CalEtapaRef | null; className?: string }) {
  return <span aria-hidden data-slot="etapa-band" className={cn("block h-1 w-full rounded-full", etapaBandClass(etapa), className)} />;
}

export function KindChip({ item }: { item: CalItem }) {
  return <Badge variant="outline">{kindChip(item)}</Badge>;
}

/** The task facts every presentation shares: when, project · etapa, responsable · estatus, note. */
export function TaskFacts({ item, showNote = true }: { item: Extract<CalItem, { kind: "task" }>; showNote?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <p className={cn("font-medium", item.overdue ? "text-destructive" : "text-foreground")}>{taskWhen(item)}</p>
      <p className="text-muted-foreground">{projectEtapaLine(item)}</p>
      <p className="flex items-center gap-2 text-muted-foreground">
        <ResponsableAvatar person={item.manager} showName={false} />
        <span>{responsableLine(item)}</span>
      </p>
      {showNote ? <p className="text-muted-foreground">{taskNote(item)}</p> : null}
    </div>
  );
}

/**
 * The Subtareas value of a task detail (#1107): "2 de 5", or, when the task
 * has none, an inline "Agregar subtarea…" field for viewers who can create
 * tasks (plain "Sin subtareas" for the rest). "—" while the task loads.
 */
export function TaskSubtasksValue({ item, task }: { item: Extract<CalItem, { kind: "task" }>; task?: TaskDetail | null }) {
  const canCreate = useCanCreateSubtask();
  if (!task) return <>—</>;
  if (task.subtaskCount > 0) return <>{`${task.subtaskDoneCount} de ${task.subtaskCount}`}</>;
  if (!canCreate || item.parentTaskId || !item.project?.id) return <>{DETAIL_COPY.noSubtasks}</>;
  return <AddSubtaskInline parentId={item.taskId} projectId={item.project.id} />;
}

/** One action as a button; a `href` renders a link. */
export function DetailActionButton({
  action,
  variant,
  size = "default",
  label,
  className,
}: {
  action: DetailAction;
  variant: "default" | "outline" | "secondary" | "ghost";
  size?: "default" | "sm" | "lg";
  label?: ReactNode;
  className?: string;
}) {
  const content = label ?? action.label;
  if (action.href && !action.onSelect) {
    return (
      <Button nativeButton={false} variant={variant} size={size} className={className} render={<a href={action.href} />}>
        {content}
      </Button>
    );
  }
  return (
    <Button variant={variant} size={size} className={className} disabled={action.disabled} onClick={() => action.onSelect?.()}>
      {content}
    </Button>
  );
}

export { DETAIL_COPY };
