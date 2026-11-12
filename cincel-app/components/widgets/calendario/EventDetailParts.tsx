"use client";

import type { ReactNode } from "react";

import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { PeopleStack } from "@/components/widgets/PeopleStack";
import { tramoColorClass } from "@/lib/tramos/tramo-color";
import type { CalItem, CalTramoRef, DetailAction } from "@/lib/types/calendario";
import { cn } from "@/lib/utils";

import { DETAIL_COPY, kindChip, projectTramoLine, responsableLine, taskNote, taskWhen } from "./event-detail-model";

/** A tramo's colour as the dot and band classes (tokens only). */
export function tramoBandClass(tramo: CalTramoRef | null): string {
  return tramo ? tramoColorClass({ key: tramo.key ?? "", sortOrder: 0, colorSlot: tramo.colorSlot }) : tramoColorClass(null);
}

export function TramoBand({ tramo, className }: { tramo: CalTramoRef | null; className?: string }) {
  return <span aria-hidden data-slot="tramo-band" className={cn("block h-1 w-full rounded-full", tramoBandClass(tramo), className)} />;
}

export function KindChip({ item }: { item: CalItem }) {
  return <Badge variant="outline">{kindChip(item)}</Badge>;
}

/** The task facts every presentation shares: when, project · tramo, responsable · estatus, note. */
export function TaskFacts({ item, showNote = true }: { item: Extract<CalItem, { kind: "task" }>; showNote?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <p className={cn("font-medium", item.overdue ? "text-destructive" : "text-foreground")}>{taskWhen(item)}</p>
      <p className="text-muted-foreground">{projectTramoLine(item)}</p>
      <p className="flex items-center gap-2 text-muted-foreground">
        <PeopleStack people={item.manager ? [item.manager] : []} label="Responsable" />
        <span>{responsableLine(item)}</span>
      </p>
      {showNote ? <p className="text-muted-foreground">{taskNote(item)}</p> : null}
    </div>
  );
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
