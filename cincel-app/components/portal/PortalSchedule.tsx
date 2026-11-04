import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/shadcn/card";
import { Progress } from "@/components/ui/shadcn/progress";
import type { PortalScheduleDTO, PortalScheduleSectionDTO } from "@/lib/types/portal";
import { formatDateDMY } from "@/lib/utils/date";

export const PORTAL_SCHEDULE_EMPTY = "El cronograma aún no está disponible.";

/** Sections per planta, keeping the DTO's order for both plantas and sections. */
export function groupByPlanta(sections: PortalScheduleSectionDTO[]): { planta: string; sections: PortalScheduleSectionDTO[] }[] {
  const groups = new Map<string, PortalScheduleSectionDTO[]>();
  for (const section of sections) {
    const list = groups.get(section.planta);
    if (list) list.push(section);
    else groups.set(section.planta, [section]);
  }
  return [...groups.entries()].map(([planta, list]) => ({ planta, sections: list }));
}

/**
 * Cronograma tab (FE §3.3): read-only, one row per section grouped by planta, built from PortalScheduleDTO only.
 * Never imports the staff cronograma hooks; there is no tarea or responsable in the DTO to show.
 */
export default function PortalSchedule({ schedule }: { schedule: PortalScheduleDTO }) {
  if (!schedule || schedule.sections.length === 0) {
    return <p className="py-6 text-sm text-muted-foreground">{PORTAL_SCHEDULE_EMPTY}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {groupByPlanta(schedule.sections).map(({ planta, sections }) => (
        <Card key={planta} role="region" aria-label={planta}>
          <CardHeader>
            <CardTitle role="heading" aria-level={2}>
              {planta}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col divide-y">
              {sections.map((s) => {
                const pct = Math.max(0, Math.min(100, Math.round(s.progressPct)));
                return (
                  <li key={s.key} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
                    <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <span className="min-w-0 break-words text-sm font-medium">{s.seccion}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {formatDateDMY(s.start)} – {formatDateDMY(s.end)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Progress value={pct} aria-label={`Avance de ${s.seccion}`} className="flex-1" />
                      <span className="w-10 text-right text-xs tabular-nums">{pct}%</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
