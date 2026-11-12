"use client";

import { Checkbox } from "@/components/ui/shadcn/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/shadcn/table";

import { cellAfter, cellOf, dayLong, daysOf, meterLabel, cellTone, CELL_TONE_LABEL, type PlanPlacement } from "./plan-week-model";
import { PlanWeekBacklog, dayHead, type PlanWeekCommon } from "./plan-week-parts";

/** Analítico: table person × day with hours, and the proposal as a checkbox table. */
export function PlanWeekAnalitico({
  data,
  proposal,
  checked = [],
  placed,
  picked,
  onPick,
  onMove,
  onToggle,
}: PlanWeekCommon & { placed: PlanPlacement[] }) {
  const days = daysOf(data);
  const rows = (proposal?.changes ?? []).filter((c) => c.type === "task_date");
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(16rem,20rem)_minmax(0,1fr)]">
      <PlanWeekBacklog data={data} picked={picked} onPick={onPick} onMove={onMove} draggable={false} />
      <div className="flex min-w-0 flex-col gap-4">
        <Table aria-label="Horas por persona y día">
          <TableHeader>
            <TableRow>
              <TableHead>Persona</TableHead>
              {days.map((d) => (
                <TableHead key={d}>{dayHead(d)}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.people.map((person) => (
              <TableRow key={person.staffId}>
                <TableCell className="font-medium">{person.name}</TableCell>
                {days.map((date) => {
                  const cell = cellOf(data, person.staffId, date);
                  const workday = cell?.workday ?? person.workday;
                  if (person.absent.includes(date)) return <TableCell key={date}>Ausente</TableCell>;
                  const hours = cellAfter(cell, placed, person.staffId, date);
                  return (
                    <TableCell key={date} className="tabular-nums">
                      {meterLabel(hours, workday)}
                      <span className="sr-only"> {CELL_TONE_LABEL[cellTone(hours, workday)]}</span>
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {rows.length > 0 ? (
          <Table aria-label="Cambios propuestos">
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <span className="sr-only">Incluir</span>
                </TableHead>
                <TableHead>Tarea</TableHead>
                <TableHead>Persona</TableHead>
                <TableHead>Día</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((change) =>
                change.type === "task_date" ? (
                  <TableRow key={change.changeId}>
                    <TableCell>
                      <Checkbox
                        aria-label={`Incluir ${change.title}`}
                        checked={checked.includes(change.changeId)}
                        onCheckedChange={() => onToggle?.(change.changeId)}
                      />
                    </TableCell>
                    <TableCell>{change.title}</TableCell>
                    <TableCell>{data.people.find((p) => p.staffId === change.staffId)?.name ?? "Sin responsable"}</TableCell>
                    <TableCell>{dayLong(change.after.date)}</TableCell>
                  </TableRow>
                ) : null,
              )}
            </TableBody>
          </Table>
        ) : null}
      </div>
    </div>
  );
}
