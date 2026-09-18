import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/shadcn/card";
import { Separator } from "@/components/ui/shadcn/separator";
import { TaskCard } from "./task-card";
import { computeAlertas } from "@/lib/cronograma/metrics";
import type { ScheduleTask } from "@/lib/types/schedule";

interface AlertasPanelProps {
  tasks: ScheduleTask[];
  today: Date;
}

export function AlertasPanel({ tasks, today }: AlertasPanelProps) {
  const { atrasadas, flagged } = computeAlertas({ tasks }, today);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Alertas</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <section>
          <h4 className="mb-2 text-sm font-semibold text-foreground">
            Tareas atrasadas {atrasadas.length ? `(${atrasadas.length})` : ""}
          </h4>
          {atrasadas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin tareas atrasadas.</p>
          ) : (
            <div className="space-y-1.5">
              {atrasadas.map((t) => (
                <TaskCard key={t.id} task={t} />
              ))}
            </div>
          )}
        </section>

        <Separator />

        <section>
          <h4 className="mb-2 text-sm font-semibold text-foreground">
            Atención especial {flagged.length ? `(${flagged.length})` : ""}
          </h4>
          {flagged.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin tareas marcadas.</p>
          ) : (
            <div className="space-y-1.5">
              {flagged.map((t) => (
                <TaskCard key={t.id} task={t} />
              ))}
            </div>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
