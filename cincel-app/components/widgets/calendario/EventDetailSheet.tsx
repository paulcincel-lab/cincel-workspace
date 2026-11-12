"use client";

import { useState } from "react";

import { Button } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/shadcn/sheet";
import type { CalItem, DetailAction, MeetingDetail } from "@/lib/types/calendario";

import { DETAIL_COPY, TASK_ACTION, actionsFor, findAction } from "./event-detail-model";
import { DetailActionButton, KindChip, TaskFacts, TramoBand } from "./EventDetailParts";
import { MeetingDetailSheet } from "./MeetingParts";

export type EventDetailSheetProps = {
  item: CalItem;
  detail?: MeetingDetail;
  actions: DetailAction[];
  onClose(): void;
};

/** Task actions of the bottom sheet, in order: the primary first (FE §5). */
const SHEET_ORDER = [TASK_ACTION.complete, TASK_ACTION.reopen, TASK_ACTION.changeDate, TASK_ACTION.propose];

/** Detail of an item in the Esencial Estilo: a modal bottom sheet with a big title and one primary action. */
function TaskDetailSheet({ item, actions, onClose }: EventDetailSheetProps) {
  const [picking, setPicking] = useState(false);
  const shown = actionsFor(item, actions, SHEET_ORDER);
  const primary = findAction(shown, TASK_ACTION.complete, TASK_ACTION.reopen) ?? shown.find((a) => a.primary);
  const secondaries = shown.filter((a) => a !== primary);
  const changeDate = findAction(shown, TASK_ACTION.changeDate);

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="bottom"
        data-slot="event-detail-sheet"
        className="max-h-[90dvh] gap-0 overflow-y-auto rounded-t-2xl pb-[env(safe-area-inset-bottom)] motion-reduce:transition-none"
      >
        <span aria-hidden data-slot="drag-handle" className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/40" />
        <div className="flex flex-col gap-3 p-4">
          <TramoBand tramo={item.tramo} />
          <KindChip item={item} />
          <SheetTitle tabIndex={-1} className="text-2xl leading-tight font-semibold outline-none">
            {item.title}
          </SheetTitle>
          <SheetDescription className="sr-only">{DETAIL_COPY.close}</SheetDescription>
          {item.kind === "task" ? <TaskFacts item={item} /> : null}
        </div>
        <div className="flex flex-col gap-2 p-4 pt-0">
          {primary ? <DetailActionButton action={primary} variant="default" size="lg" className="h-[54px] w-full text-base" /> : null}
          {secondaries.map((action) =>
            action.key === TASK_ACTION.changeDate && changeDate?.onPickDate ? (
              <div key={action.key} className="flex flex-col gap-2">
                <Button variant="outline" size="lg" className="h-11 w-full" aria-expanded={picking} disabled={action.disabled} onClick={() => setPicking((v) => !v)}>
                  {action.label}
                </Button>
                {picking ? (
                  <Input
                    type="date"
                    aria-label={DETAIL_COPY.changeDatePicker}
                    defaultValue={item.date}
                    className="h-11"
                    onChange={(e) => {
                      if (!e.target.value) return;
                      changeDate.onPickDate?.(e.target.value);
                      setPicking(false);
                    }}
                  />
                ) : null}
              </div>
            ) : (
              <DetailActionButton key={action.key} action={action} variant="outline" size="lg" className="h-11 w-full" />
            ),
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Detail of a task or meeting (per-Estilo container): meetings render their own detail, tasks the task detail. */
export function EventDetailSheet(props: EventDetailSheetProps) {
  if (props.item.kind === "event") return <MeetingDetailSheet item={props.item} detail={props.detail} onClose={props.onClose} />;
  return <TaskDetailSheet {...props} />;
}
