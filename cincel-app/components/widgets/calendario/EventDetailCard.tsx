"use client";

import { XIcon } from "lucide-react";
import { useEffect, useMemo, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/shadcn/button";
import { Popover, PopoverContent } from "@/components/ui/shadcn/popover";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/shadcn/sheet";
import type { TaskDetail } from "@/lib/types/core";
import type { CalItem, DetailAction, MeetingDetail } from "@/lib/types/calendario";

import { DETAIL_COPY, TASK_ACTION, actionsFor, findAction } from "./event-detail-model";
import { DetailActionButton, KindChip, TaskFacts, EtapaBand, TaskSubtasksValue } from "./EventDetailParts";
import { MeetingDetailCard } from "./MeetingParts";

export type EventDetailCardProps = {
  item: CalItem;
  detail?: MeetingDetail;
  /** The task sheet: the Subtareas line comes from it. */
  task?: TaskDetail | null;
  actions: DetailAction[];
  onClose(): void;
  /** The item the card floats next to; found by `data-calendario-item` when omitted. */
  anchor?: Element | null;
};

/** Task actions of the floating card, in order (FE §5). */
const CARD_ORDER = [TASK_ACTION.complete, TASK_ACTION.reopen, TASK_ACTION.open, TASK_ACTION.propose];

const NARROW = "(max-width: 639px)";

function subscribeNarrow(cb: () => void) {
  const mql = window.matchMedia(NARROW);
  mql.addEventListener("change", cb);
  return () => mql.removeEventListener("change", cb);
}

/** Under 640 px the card is a bottom sheet (decision default). */
function useNarrow(): boolean {
  return useSyncExternalStore(
    subscribeNarrow,
    () => window.matchMedia(NARROW).matches,
    () => false,
  );
}

function CardBody({ item, task, actions, onClose, headingId, showClose }: Pick<EventDetailCardProps, "item" | "task" | "actions" | "onClose"> & { headingId: string; showClose: boolean }) {
  const shown = actionsFor(item, actions, CARD_ORDER);
  const done = findAction(shown, TASK_ACTION.complete, TASK_ACTION.reopen);
  return (
    <div className="flex flex-col gap-3 p-4">
      <EtapaBand etapa={item.etapa} />
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-2">
          <KindChip item={item} />
          <h2 id={headingId} tabIndex={-1} className="text-base font-semibold text-foreground outline-none">
            {item.title}
          </h2>
        </div>
        {showClose ? (
          <Button variant="ghost" size="icon-sm" aria-label={DETAIL_COPY.close} onClick={onClose}>
            <XIcon />
          </Button>
        ) : null}
      </div>
      {item.kind === "task" ? <TaskFacts item={item} /> : null}
      {item.kind === "task" && task ? (
        <p className="flex flex-col gap-1 text-sm text-muted-foreground">
          <span>Subtareas</span>
          <span className="text-foreground">
            <TaskSubtasksValue item={item} task={task} />
          </span>
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {shown.map((action) => (
          <DetailActionButton
            key={action.key}
            action={action}
            variant={action === done || action.primary ? "default" : action.key === TASK_ACTION.propose ? "secondary" : "outline"}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Detail of an item in the Visual Estilo: a non-modal floating card next to the
 * item (`role="dialog"`, named by the title) that traps nothing; Escape closes.
 * Under 640 px it is a bottom sheet.
 */
function TaskDetailCard({ item, task, actions, onClose, anchor }: EventDetailCardProps) {
  const narrow = useNarrow();
  const found = useMemo(
    () =>
      anchor !== undefined || typeof document === "undefined"
        ? null
        : document.querySelector(`[data-calendario-item="${CSS.escape(item.id)}"]`),
    [anchor, item.id]
  );
  const headingId = `event-detail-${item.id}`;

  const target = anchor ?? found;
  const floating = !narrow && !target;

  useEffect(() => {
    if (!floating) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [floating, onClose]);

  if (narrow) {
    return (
      <Sheet open onOpenChange={(open) => !open && onClose()}>
        <SheetContent side="bottom" showCloseButton={false} className="max-h-[85dvh] overflow-y-auto motion-reduce:transition-none">
          <SheetTitle className="sr-only">{item.title}</SheetTitle>
          <SheetDescription className="sr-only">{DETAIL_COPY.close}</SheetDescription>
          <CardBody item={item} task={task} actions={actions} onClose={onClose} headingId={headingId} showClose />
        </SheetContent>
      </Sheet>
    );
  }

  if (floating) {
    return (
      <div
        role="dialog"
        aria-label={item.title}
        data-slot="event-detail-card"
        className="fixed right-4 bottom-4 z-50 w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-border bg-popover text-popover-foreground shadow-lg"
      >
        <CardBody item={item} task={task} actions={actions} onClose={onClose} headingId={headingId} showClose />
      </div>
    );
  }

  return (
    <Popover open onOpenChange={(open) => !open && onClose()}>
      <PopoverContent anchor={target} side="right" align="start" aria-label={item.title} data-slot="event-detail-card" className="w-[22rem] max-w-[calc(100vw-2rem)] motion-reduce:transition-none">
        <CardBody item={item} task={task} actions={actions} onClose={onClose} headingId={headingId} showClose />
      </PopoverContent>
    </Popover>
  );
}

/** Detail of a task or meeting (per-Estilo container): meetings render their own detail, tasks the task detail. */
export function EventDetailCard(props: EventDetailCardProps) {
  if (props.item.kind === "event") return <MeetingDetailCard item={props.item} detail={props.detail} onClose={props.onClose} />;
  return <TaskDetailCard {...props} />;
}
