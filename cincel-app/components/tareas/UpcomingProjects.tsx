import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/shadcn/accordion";
import type { TramoCandidateProject } from "@/lib/types/core";

/** "{proyecto} · falta {fase} de {tramo}: {abiertas} de {total} tareas abiertas". */
export function upcomingLine(item: TramoCandidateProject): string {
  if (!item.pending) return item.project.name;
  const { phase, tramo, open, total } = item.pending;
  return `${item.project.name} · falta ${phase.name} de ${tramo.name}: ${open} de ${total} tareas abiertas`;
}

/** Projects that aren't ready for this tramo yet. Collapsed by default; hidden when empty. */
export function UpcomingProjects({ upcoming }: { upcoming: TramoCandidateProject[] }) {
  if (upcoming.length === 0) return null;
  return (
    <Accordion className="mb-4 rounded-lg border border-border bg-card px-4">
      <AccordionItem value="proximos">
        <AccordionTrigger>{`Próximos (${upcoming.length})`}</AccordionTrigger>
        <AccordionContent>
          <ul className="flex flex-col gap-1">
            {upcoming.map((item) => (
              <li key={item.project.id} className="text-sm text-muted-foreground">
                {upcomingLine(item)}
              </li>
            ))}
          </ul>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
