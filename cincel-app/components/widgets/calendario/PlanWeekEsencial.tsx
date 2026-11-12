"use client";

import { Button } from "@/components/ui/shadcn/button";
import { Card } from "@/components/ui/shadcn/card";

import { cellAfter, cellOf, cellTone, CELL_TONE_LABEL, dayLong, daysOf, meterLabel, type PlanPlacement } from "./plan-week-model";
import { PlanWeekBacklog, type PlanWeekCommon } from "./plan-week-parts";

/**
 * Esencial: one card per day with the viewer's planned tasks and one big
 * "Planear mi semana". The lanes of other people are hidden; "Mover a…" is
 * the way to place a task (no drag).
 */
export function PlanWeekEsencial({
  data,
  placed,
  viewerStaffId,
  onMove,
  onPlan,
  busy,
}: PlanWeekCommon & { placed: PlanPlacement[]; viewerStaffId?: string | null }) {
  const person = data.people.find((p) => p.staffId === viewerStaffId) ?? (data.people.length === 1 ? data.people[0] : undefined);
  const staffId = person?.staffId ?? null;
  const days = daysOf(data);
  return (
    <div className="flex flex-col gap-4">
      <Button type="button" size="lg" className="h-11 w-full text-base" disabled={busy} onClick={() => onPlan?.()}>
        ✦ Planear mi semana
      </Button>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {days.map((date) => {
          const cell = staffId ? cellOf(data, staffId, date) : undefined;
          const workday = cell?.workday ?? person?.workday ?? 6;
          const hours = staffId ? cellAfter(cell, placed, staffId, date) : 0;
          const mine = staffId ? placed.filter((p) => p.staffId === staffId && p.date === date) : [];
          const absent = Boolean(person?.absent.includes(date));
          return (
            <li key={date}>
              <Card className="flex h-full flex-col gap-1.5 p-3">
                <p className="text-sm font-semibold capitalize">{dayLong(date)}</p>
                <p className="text-xs text-muted-foreground">
                  {absent ? "Ausente" : `${meterLabel(hours, workday)} h · ${CELL_TONE_LABEL[cellTone(hours, workday)]}`}
                </p>
                {mine.length > 0 ? (
                  <ul className="flex flex-col gap-1">
                    {mine.map((p) => (
                      <li key={p.changeId} className="truncate rounded-md border border-dashed border-primary px-1.5 py-0.5 text-sm">
                        {p.title}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </Card>
            </li>
          );
        })}
      </ul>
      <PlanWeekBacklog data={data} onMove={onMove} draggable={false} lockedStaffId={staffId} />
    </div>
  );
}
