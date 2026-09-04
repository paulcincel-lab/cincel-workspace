"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/ui/DataTable";
import { PageHeader } from "@/components/v2/layout/PageHeader";
import { CapacityRing } from "@/components/v2/status/CapacityRing";
import { LoadBar } from "@/components/v2/status/LoadBar";
import { PhaseStepper } from "@/components/v2/status/PhaseStepper";
import { PersonAvatar } from "@/components/v2/status/PersonAvatar";
import { createRowActionsColumn } from "@/components/v2/table/RowActionsMenu";
import { createSelectionColumn } from "@/components/v2/table/bulk-select";
import { BulkActionBar } from "@/components/v2/table/BulkActionBar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/shadcn/tabs";
import { Button } from "@/components/ui/shadcn/button";
import NewProjectTemplateModal from "@/components/tareas/NewProjectTemplateModal";
import NewTaskModal from "@/components/tareas/NewTaskModal";
import { DEPARTMENTOS, phasesFor } from "@/lib/actividades/departamento";
import { saveActivities } from "@/lib/repositories/activities-repository";
import type { Task } from "@/lib/types/task";
import type { ProjectItem } from "@/lib/proyectos/use-projects-data";
import type { TeamMember } from "@/lib/data/team";

interface ActividadesV2ClientProps {
  slug: string;
  initialTasks: Task[];
  initialProjects: ProjectItem[];
  initialTeam: TeamMember[];
}

function nextTaskId(tasks: Task[]) {
  return tasks.reduce((max, t) => Math.max(max, t.id), 0) + 1;
}

export function ActividadesV2Client({
  slug,
  initialTasks,
  initialProjects,
  initialTeam,
}: ActividadesV2ClientProps) {
  const router = useRouter();
  const departamento = DEPARTMENTOS.find((d) => d.slug === slug)!;
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [selected, setSelected] = useState<Set<string | number>>(new Set());
  const [templateOpen, setTemplateOpen] = useState(false);
  const [newTaskOpen, setNewTaskOpen] = useState(false);

  const phases = useMemo(() => phasesFor(departamento.template), [departamento.template]);

  const active = useMemo(() => tasks.filter((t) => !t.archived), [tasks]);

  const capacityByPerson = useMemo(() => {
    const byManager = new Map<string, number>();
    active.forEach((t) => byManager.set(t.manager, (byManager.get(t.manager) ?? 0) + 1));
    return Array.from(byManager.entries()).map(([name, count]) => {
      const member = initialTeam.find((m) => m.name === name);
      const capacity = member?.capacity ?? 8;
      return { name, count, percent: Math.round((count / Math.max(capacity, 1)) * 100) };
    });
  }, [active, initialTeam]);

  const phaseMix = useMemo(
    () =>
      phases.map((phase) => ({
        phase,
        percent: active.length === 0 ? 0 : (active.filter((t) => t.phase === phase).length / active.length) * 100,
      })),
    [active, phases]
  );

  const projectOptions = useMemo(
    () =>
      initialProjects
        .filter((p) => p.active && p.stage === departamento.stage)
        .map((p) => p.name),
    [initialProjects, departamento.stage]
  );

  function toggle(id: string | number) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll(ids: (string | number)[]) {
    setSelected((cur) => {
      const allSelected = ids.every((id) => cur.has(id));
      return allSelected ? new Set() : new Set(ids);
    });
  }

  async function bulkArchive() {
    const next = tasks.map((t) => (selected.has(t.id) ? { ...t, archived: true } : t));
    setTasks(next);
    setSelected(new Set());
    if (departamento.workflow) await saveActivities(departamento.workflow, next);
  }

  async function bulkComplete() {
    const next = tasks.map((t) =>
      selected.has(t.id) ? { ...t, status: "Completado" as const } : t
    );
    setTasks(next);
    setSelected(new Set());
    if (departamento.workflow) await saveActivities(departamento.workflow, next);
  }

  async function applyTemplate({ project, items }: { project: string; items: { phase: string; description: string }[] }) {
    if (!departamento.workflow) return;
    const startId = nextTaskId(tasks);
    const now = new Date().toISOString();
    const created: Task[] = items.map((item, i) => ({
      id: startId + i,
      project,
      workflow: departamento.workflow!,
      phase: item.phase,
      description: item.description,
      notes: "",
      manager: initialTeam[0]?.name ?? "",
      support: [],
      status: "Pendiente",
      priority: "Media",
      commitmentDate: "",
      reviewDate: "",
      updatedAt: now,
      createdAt: now,
      history: [],
      checklist: [],
      archived: false,
    }));
    const next = [...tasks, ...created];
    setTasks(next);
    await saveActivities(departamento.workflow, next);
    setTemplateOpen(false);
  }

  async function addTask(values: {
    project: string;
    phase: string;
    description: string;
    manager: string;
    support: string[];
    status: Task["status"];
    notes: string;
    commitmentDate: string;
    reviewDate: string;
  }) {
    if (!departamento.workflow) return;
    const now = new Date().toISOString();
    const created: Task = {
      id: nextTaskId(tasks),
      workflow: departamento.workflow,
      priority: "Media",
      updatedAt: now,
      createdAt: now,
      history: [],
      checklist: [],
      archived: false,
      ...values,
    };
    const next = [...tasks, created];
    setTasks(next);
    await saveActivities(departamento.workflow, next);
  }

  const columns = useMemo<ColumnDef<Task, unknown>[]>(() => {
    if (!departamento.workflow) return [];
    return [
      createSelectionColumn<Task>({
        getId: (t) => t.id,
        selectedIds: selected,
        onToggle: toggle,
        onToggleAll: toggleAll,
      }),
      {
        id: "phase",
        header: "Fase",
        cell: ({ row }) => {
          const idx = phases.indexOf(row.original.phase);
          return (
            <PhaseStepper
              steps={Math.max(phases.length, 1)}
              current={idx === -1 ? 1 : idx + 1}
              label={row.original.phase}
            />
          );
        },
      },
      { accessorKey: "project", header: "Proyecto" },
      { accessorKey: "description", header: "Tarea", cell: ({ row }) => <span className="font-medium">{row.original.description}</span> },
      {
        id: "manager",
        header: "Responsable",
        cell: ({ row }) => <PersonAvatar name={row.original.manager} size="sm" />,
      },
      createRowActionsColumn<Task>((task) => [
        {
          label: "Marcar completada",
          onSelect: async () => {
            const next = tasks.map((t) => (t.id === task.id ? { ...t, status: "Completado" as const } : t));
            setTasks(next);
            await saveActivities(departamento.workflow!, next);
          },
        },
        {
          label: "Archivar",
          variant: "destructive",
          separatorBefore: true,
          onSelect: async () => {
            const next = tasks.map((t) => (t.id === task.id ? { ...t, archived: true } : t));
            setTasks(next);
            await saveActivities(departamento.workflow!, next);
          },
        },
      ]),
    ];
  }, [departamento.workflow, phases, selected, tasks]);

  return (
    <div>
      <PageHeader
        title={departamento.label}
        description={departamento.description}
        actions={
          <Tabs value={slug} onValueChange={(v) => router.push(`/v2/actividades/${v}`)}>
            <TabsList>
              {DEPARTMENTOS.map((d) => (
                <TabsTrigger key={d.slug} value={d.slug}>
                  {d.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        }
      />

      {!departamento.workflow ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          {departamento.description}
        </div>
      ) : (
        <>
          <div className="mb-4 flex items-center justify-between">
            <div className="flex flex-wrap gap-5 rounded-lg border border-border bg-card p-4">
              {capacityByPerson.length === 0 ? (
                <span className="text-sm text-muted-foreground">Sin tareas activas.</span>
              ) : (
                capacityByPerson.map((p) => (
                  <CapacityRing
                    key={p.name}
                    percent={p.percent}
                    label={p.name}
                    sublabel={`${p.count} tareas`}
                  />
                ))
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setTemplateOpen(true)}>
                Iniciar plantilla de {departamento.label}
              </Button>
              <Button onClick={() => setNewTaskOpen(true)}>+ Nueva tarea</Button>
            </div>
          </div>

          {phases.length > 0 ? (
            <div className="mb-4 rounded-lg border border-border bg-card p-4">
              <div className="mb-2 flex justify-between text-[11px] text-muted-foreground">
                <span>Mezcla por fase</span>
                <span>{phases.join(" · ")}</span>
              </div>
              <LoadBar
                segments={phaseMix.map((p, i) => ({
                  percent: p.percent,
                  opacity: 0.4 + (0.6 * (i + 1)) / phases.length,
                }))}
              />
            </div>
          ) : null}

          <BulkActionBar
            selectedCount={selected.size}
            actions={[
              { label: "Marcar completadas", onClick: bulkComplete },
              { label: "Archivar", onClick: bulkArchive, variant: "destructive" },
            ]}
          />
          <DataTable
            columns={columns}
            data={active}
            getRowId={(row) => String(row.id)}
            emptyMessage="No hay tareas activas en este departamento."
            wrapperClassName={selected.size > 0 ? "rounded-t-none border-t-0" : undefined}
          />

          <NewProjectTemplateModal
            open={templateOpen}
            templateItems={[...departamento.template]}
            projectOptions={projectOptions}
            onClose={() => setTemplateOpen(false)}
            onCreate={applyTemplate}
          />

          <NewTaskModal
            open={newTaskOpen}
            projects={projectOptions}
            teamMembers={initialTeam.map((m) => m.name)}
            phaseOptions={phases}
            onClose={() => setNewTaskOpen(false)}
            onSave={addTask}
          />
        </>
      )}
    </div>
  );
}
