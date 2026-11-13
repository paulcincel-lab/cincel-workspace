"use client";

import { HistoryEventList } from "@/components/ui/HistoryEventList";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/shadcn/sheet";
import { PeopleStack } from "@/components/widgets/PeopleStack";
import type { TaskDetail } from "@/lib/types/core";
import type { CalItem, CalTaskItem, DetailAction, MeetingDetail } from "@/lib/types/calendario";

import { DETAIL_COPY, TASK_ACTION, actionsFor, findAction, projectEtapaLine, taskNote, taskWhen } from "./event-detail-model";
import { DetailActionButton, KindChip, EtapaBand } from "./EventDetailParts";
import { MeetingDetailDrawer } from "./MeetingParts";

export type EventDetailDrawerProps = {
  item: CalItem;
  detail?: MeetingDetail;
  /** The task sheet (`taskSheetOptions`): subtareas and HISTORIAL come from it. */
  task?: TaskDetail | null;
  actions: DetailAction[];
  onClose(): void;
};

/** Task actions of the right drawer, in order (FE §5). */
const DRAWER_ORDER = [TASK_ACTION.complete, TASK_ACTION.reopen, TASK_ACTION.open, TASK_ACTION.propose];

const PRIORITY_LABEL: Record<CalTaskItem["priority"], string> = { alta: "Alta", media: "Media", baja: "Baja" };

/** The short code a task shows in the field list. */
export function taskCode(taskId: string): string {
  return `#${taskId.slice(0, 8).toUpperCase()}`;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] items-center gap-2 py-1.5 text-sm">
      <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className="min-w-0 text-foreground">{children}</dd>
    </div>
  );
}

function TaskFields({ item, task }: { item: CalTaskItem; task?: TaskDetail | null }) {
  const subtasks = task ? (task.subtaskCount > 0 ? `${task.subtaskDoneCount} de ${task.subtaskCount}` : DETAIL_COPY.noSubtasks) : "—";
  return (
    <dl className="divide-y divide-border">
      <Field label="Código">{taskCode(item.taskId)}</Field>
      <Field label="Estatus">{item.statusLabel}</Field>
      <Field label="Responsable">
        {item.manager ? (
          <span className="flex items-center gap-2">
            <PeopleStack people={[item.manager]} label="Responsable" />
            {item.manager.name}
          </span>
        ) : (
          DETAIL_COPY.unassigned
        )}
      </Field>
      <Field label="Fase">{item.phase?.name ?? "—"}</Field>
      <Field label="Prioridad">{PRIORITY_LABEL[item.priority]}</Field>
      <Field label="Subtareas">{subtasks}</Field>
    </dl>
  );
}

/** Detail of an item in the Analítico Estilo: a modal right drawer (420 px) with a field list and HISTORIAL. */
function TaskDetailDrawer({ item, task, actions, onClose }: EventDetailDrawerProps) {
  const shown = actionsFor(item, actions, DRAWER_ORDER);
  const done = findAction(shown, TASK_ACTION.complete, TASK_ACTION.reopen);
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" data-slot="event-detail-drawer" className="gap-0 overflow-y-auto sm:max-w-[420px] motion-reduce:transition-none">
        <div className="flex flex-col gap-3 p-4 pr-12">
          <EtapaBand etapa={item.etapa} />
          <KindChip item={item} />
          <SheetTitle tabIndex={-1} className="text-lg leading-snug font-semibold outline-none">
            {item.title}
          </SheetTitle>
          <SheetDescription>{item.kind === "task" ? `${taskWhen(item)} · ${projectEtapaLine(item)}` : projectEtapaLine(item)}</SheetDescription>
        </div>
        <div className="flex flex-col gap-4 px-4 pb-4">
          {item.kind === "task" ? (
            <>
              <TaskFields item={item} task={task} />
              <p className="text-sm text-muted-foreground">{taskNote(item)}</p>
              <section aria-label={DETAIL_COPY.history} className="flex flex-col gap-2">
                <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{DETAIL_COPY.history}</h3>
                <HistoryEventList
                  events={[...(task?.history ?? [])].sort((a, b) => b.eventAt.localeCompare(a.eventAt))}
                  empty={<p className="text-sm text-muted-foreground">{DETAIL_COPY.historyEmpty}</p>}
                />
              </section>
            </>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {shown.map((action) => (
              <DetailActionButton
                key={action.key}
                action={action}
                variant={action === done || action.primary ? "default" : action.key === TASK_ACTION.propose ? "secondary" : "outline"}
                label={action.key === TASK_ACTION.open && item.kind === "task" ? "Abrir ficha" : undefined}
              />
            ))}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Detail of a task or meeting (per-Estilo container): meetings render their own detail, tasks the task detail. */
export function EventDetailDrawer(props: EventDetailDrawerProps) {
  if (props.item.kind === "event") return <MeetingDetailDrawer item={props.item} detail={props.detail} onClose={props.onClose} />;
  return <TaskDetailDrawer {...props} />;
}
