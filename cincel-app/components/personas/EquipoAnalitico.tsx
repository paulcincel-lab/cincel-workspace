"use client";

import { useQuery } from "@tanstack/react-query";

import { PersonasTabs, type PersonasTab } from "@/components/personas/PersonasTabs";
import { newTaskInvalidations } from "@/components/tareas/NewTaskDialog";
import { Button } from "@/components/ui/shadcn/button";
import { PageHeader } from "@/components/widgets/PageHeader";
import { PeopleWidget } from "@/components/widgets/PeopleWidget";
import type { QuickAddCreated, QuickAddDraft } from "@/components/widgets/QuickAddRow";
import { createUserTaskAction } from "@/lib/actions/tasks-actions";
import { localIsoDate } from "@/lib/people/aggregates";
import { filterTeamAnalitico, personasCsv, personasCsvFileName } from "@/lib/personas/team";
import { useTeamAnaliticoState } from "@/lib/personas/use-team-analitico-state";
import { qk } from "@/lib/query/keys";
import { useActionMutation } from "@/lib/query/mutation";
import { catalogEtapasOptions } from "@/lib/query/options/catalog";
import { TIME_TRACKING_TIME_ZONE } from "@/lib/time-tracking/local-time";
import type { UserTaskInput } from "@/lib/types/core";
import type { PersonDatum } from "@/lib/types/widgets";

export type EquipoAnaliticoProps = {
  people: PersonDatum[];
  counts: Record<PersonasTab, number> | undefined;
  canCreate: boolean;
  /** `canChangeResponsible`: "Asignar a {candidato}". */
  canAssign: boolean;
  /** `canCreateActivity`: the quick assign row. */
  canCreateTask: boolean;
  onAddPerson(): void;
};

export const ANALITICO_DESCRIPTION = "Carga por área y persona, con capacidad de las próximas 4 semanas.";

function downloadText(text: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * Personas · Equipo in Analítico (frame `Personas-Analitico`): header with
 * "Exportar" (CSV of the visible people) and "Agregar persona", the tabs and
 * the grouped people table. Filters and expanded rows live in the URL.
 */
export function EquipoAnalitico({ people, counts, canCreate, canAssign, canCreateTask, onAddPerson }: EquipoAnaliticoProps) {
  const [state, setState] = useTeamAnaliticoState();
  const { data: etapas = [] } = useQuery(catalogEtapasOptions());
  const today = localIsoDate(new Date(), TIME_TRACKING_TIME_ZONE);
  const create = useActionMutation(createUserTaskAction, {
    invalidate: (vars: UserTaskInput) => [qk.personas.equipo(), ...newTaskInvalidations(vars.projectId)],
    successToast: "Tarea creada",
  });

  async function onCreateTask(assignee: PersonDatum, draft: QuickAddDraft): Promise<QuickAddCreated> {
    if (!draft.projectId) throw new Error("INVALID");
    const task = await create.mutateAsync({
      projectId: draft.projectId,
      title: draft.title,
      workflowId: draft.etapaId,
      managerId: assignee.id,
      priority: draft.priority,
      commitmentDate: draft.dueDate,
    });
    return { id: task.id, title: task.title };
  }

  function exportCsv() {
    const rows = filterTeamAnalitico(people, state, today);
    downloadText(personasCsv(rows, today), personasCsvFileName(today));
  }

  const activeEtapas = etapas.filter((t) => t.key.trim() !== "");

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Personas"
        description={ANALITICO_DESCRIPTION}
        actions={
          <>
            {people.length > 0 ? (
              <Button variant="outline" onClick={exportCsv}>
                Exportar
              </Button>
            ) : null}
            {canCreate ? <Button onClick={onAddPerson}>Agregar persona</Button> : null}
          </>
        }
      />
      <PersonasTabs active="equipo" counts={counts} />
      <PeopleWidget
        people={people}
        show={["load", "projects"]}
        emptyState={{
          title: "Aún no hay personas en el equipo",
          action: canCreate ? { label: "Agregar", onClick: onAddPerson } : undefined,
        }}
        team={{
          etapas: activeEtapas,
          today,
          state,
          onStateChange: setState,
          canCreateTask,
          canAssign,
          onCreateTask: canCreateTask ? onCreateTask : undefined,
        }}
      />
    </div>
  );
}
