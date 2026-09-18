import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/shadcn/accordion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/shadcn/card";
import type { Adicional } from "@/lib/types/schedule";

interface AdicionalesPanelProps {
  adicionales: Adicional[];
  defaultOpen?: boolean;
}

/** Grouped, read-only list of quoted optional work (cotización). Collapsed by default; expanded on the report route. */
export function AdicionalesPanel({ adicionales, defaultOpen = false }: AdicionalesPanelProps) {
  if (adicionales.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Adicionales de obra</CardTitle>
      </CardHeader>
      <CardContent>
        <Accordion defaultValue={defaultOpen ? adicionales.map((a) => a.partida) : []}>
          {adicionales.map((a) => (
            <AccordionItem key={a.partida} value={a.partida}>
              <AccordionTrigger>{a.partida}</AccordionTrigger>
              <AccordionContent>
                <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
                  {a.items.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </CardContent>
    </Card>
  );
}
