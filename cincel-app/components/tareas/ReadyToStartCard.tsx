"use client";

import { Button } from "@/components/ui/shadcn/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/shadcn/card";
import type { EtapaCandidateProject, WorkflowRef } from "@/lib/types/core";
import { formatDateDMY } from "@/lib/utils/date";

export interface ReadyToStartCardProps {
  workflow: WorkflowRef;
  ready: EtapaCandidateProject[];
  /** `activities.canCreateActivity`; without it only a read-only count shows. */
  canStart: boolean;
  onStart: (projectId: string) => void;
}

function readySinceText(readySince: string | null): string | null {
  if (!readySince) return null;
  return `Listo desde ${formatDateDMY(readySince.slice(0, 10))}`;
}

/** "Listos para iniciar" card of `/actividades/[etapa]` (FE §3.1, §4.3). */
export function ReadyToStartCard({ workflow, ready, canStart, onStart }: ReadyToStartCardProps) {
  if (!canStart) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="ready-to-start-count">
        Listos para iniciar: {ready.length}
      </p>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Listos para iniciar ({ready.length})</CardTitle>
      </CardHeader>
      <CardContent>
        {ready.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay proyectos listos para iniciar {workflow.name}.</p>
        ) : (
          <ul className="divide-y divide-border">
            {ready.map((entry) => {
              const since = readySinceText(entry.readySince);
              return (
                <li key={entry.project.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{entry.project.name}</p>
                    {since ? <p className="text-xs text-muted-foreground">{since}</p> : null}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    aria-label={`Iniciar ${workflow.name} en ${entry.project.name}`}
                    onClick={() => onStart(entry.project.id)}
                  >
                    Iniciar
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
