"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CellContext, ColumnDef } from "@tanstack/react-table";

import { AccordionPanels } from "@/components/ui/AccordionPanels";
import { ChecklistProgressCell } from "@/components/tareas/ChecklistProgressCell";
import { DataTable } from "@/components/ui/DataTable";
import { TaskMemberProjectFilters, matchesMemberFilter, matchesProjectFilter } from "@/components/tareas/TaskMemberProjectFilters";
import { PageHeader } from "@/components/v2/layout/PageHeader";
import { PersonAvatar } from "@/components/v2/status/PersonAvatar";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/shadcn/tabs";
import { DEPARTMENTOS } from "@/lib/actividades/departamento";
import { fetchTasksAction } from "@/lib/actions/tasks-actions";
import { BASE_STATUSES, BASE_STATUS_LABEL, BASE_STATUS_VARIANT, taskStatusLabel } from "@/lib/tasks/status-options";
import type { TaskListItem, TaskStatus } from "@/lib/types/core";

/**
 * One read-only view of every activity across all stages (Presale → Diseño →
 * Construcción), grouped by project. Editing stays in each
 * department's own page — every task title links straight there.
 */
export function TodasActividadesClient({ initialTasks }: { initialTasks: TaskListItem[] }) {
  const router = useRouter();
  const [tasks, setTasks] = useState<TaskListItem[]>(initialTasks);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "">("");
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [projectId, setProjectId] = useState("");

  useEffect(() => {
    // Hydrate with the current user's session once mounted (the server render
    // falls back to an empty list when there's no session yet).
    fetchTasksAction()
      .then(setTasks)
      .catch((err) => console.error(err));
  }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return tasks.filter((t) => {
      if (stageFilter && t.workflow?.key !== stageFilter) return false;
      if (statusFilter && t.status !== statusFilter) return false;
      if (!matchesMemberFilter(t, memberIds) || !matchesProjectFilter(t, projectId)) return false;
      if (!query) return true;
      return (
        t.title.toLowerCase().includes(query) ||
        t.project.name.toLowerCase().includes(query) ||
        (t.phase ?? "").toLowerCase().includes(query)
      );
    });
  }, [tasks, search, stageFilter, statusFilter, memberIds, projectId]);

  const projectGroups = useMemo(() => {
    const groups = new Map<string, { id: string; name: string; tasks: TaskListItem[] }>();
    for (const task of filtered) {
      const group = groups.get(task.project.id) ?? { id: task.project.id, name: task.project.name, tasks: [] };
      group.tasks.push(task);
      groups.set(task.project.id, group);
    }
    return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [filtered]);

  const columns = useMemo<ColumnDef<TaskListItem, unknown>[]>(
    () => [
      {
        id: "stage",
        header: "Etapa",
        cell: ({ row }: CellContext<TaskListItem, unknown>) => {
          const key = row.original.workflow?.key;
          const label = DEPARTMENTOS.find((d) => d.slug === key)?.label ?? row.original.workflow?.name ?? "Sin etapa";
          return <Badge variant="outline">{label}</Badge>;
        },
      },
      { id: "phase", header: "Fase", cell: ({ row }: CellContext<TaskListItem, unknown>) => row.original.phase || "—" },
      {
        id: "title",
        header: "Tarea",
        cell: ({ row }: CellContext<TaskListItem, unknown>) => {
          const task = row.original;
          const href = task.workflow
            ? `/actividades/${task.workflow.key}?project=${encodeURIComponent(task.project.name)}`
            : "/actividades/presale";
          return (
            <Link href={href} className="font-medium hover:underline">
              {task.title}
            </Link>
          );
        },
      },
      {
        id: "checklist",
        header: "Checklist",
        enableSorting: false,
        cell: ({ row }: CellContext<TaskListItem, unknown>) => (
          <ChecklistProgressCell total={row.original.checklist.total} completed={row.original.checklist.completed} />
        ),
      },
      {
        id: "manager",
        header: "Responsable",
        cell: ({ row }: CellContext<TaskListItem, unknown>) =>
          row.original.manager ? (
            <PersonAvatar name={row.original.manager.name} size="sm" />
          ) : (
            <span className="text-muted-foreground">Sin responsable</span>
          ),
      },
      {
        id: "status",
        header: "Estado",
        cell: ({ row }: CellContext<TaskListItem, unknown>) => (
          <Badge variant={BASE_STATUS_VARIANT[row.original.status]}>{taskStatusLabel(row.original)}</Badge>
        ),
      },
      {
        id: "commitmentDate",
        header: "Compromiso",
        cell: ({ row }: CellContext<TaskListItem, unknown>) => row.original.commitmentDate || "Sin fecha",
      },
      {
        id: "deliveryDate",
        header: "Fecha de entrega",
        cell: ({ row }: CellContext<TaskListItem, unknown>) => row.original.deliveryDate || "Sin fecha",
      },
    ],
    []
  );

  const hasFilters = Boolean(search || stageFilter || statusFilter || memberIds.length || projectId);

  return (
    <div>
      <PageHeader
        title="Todas las actividades"
        description="Todas las etapas en una sola vista: Presale, Taller de Diseño y Construcción."
        actions={
          <Tabs value="todas" onValueChange={(v) => router.push(`/actividades/${v}`)}>
            <TabsList>
              <TabsTrigger value="todas">Todas</TabsTrigger>
              {DEPARTMENTOS.map((d) => (
                <TabsTrigger key={d.slug} value={d.slug}>
                  {d.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3">
        <Input
          type="text"
          placeholder="Buscar tarea..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 w-56"
        />
        <Select
          items={{ __all__: "Etapa", ...Object.fromEntries(DEPARTMENTOS.map((d) => [d.slug, d.label])) }}
          value={stageFilter || "__all__"}
          onValueChange={(v) => setStageFilter(v === "__all__" ? "" : (v as string))}
        >
          <SelectTrigger className="h-9 w-auto"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Etapa</SelectItem>
            {DEPARTMENTOS.map((d) => (
              <SelectItem key={d.slug} value={d.slug}>{d.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          items={{ __all__: "Estatus", ...Object.fromEntries(BASE_STATUSES.map((s) => [s, BASE_STATUS_LABEL[s]])) }}
          value={statusFilter || "__all__"}
          onValueChange={(v) => setStatusFilter(v === "__all__" ? "" : (v as TaskStatus))}
        >
          <SelectTrigger className="h-9 w-auto"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Estatus</SelectItem>
            {BASE_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{BASE_STATUS_LABEL[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <TaskMemberProjectFilters
          tasks={tasks}
          memberIds={memberIds}
          onMemberIdsChange={setMemberIds}
          projectId={projectId}
          onProjectIdChange={setProjectId}
          showClear={false}
        />
        {hasFilters ? (
          <Button
            variant="outline"
            onClick={() => {
              setSearch("");
              setStageFilter("");
              setStatusFilter("");
              setMemberIds([]);
              setProjectId("");
            }}
          >
            Limpiar filtros
          </Button>
        ) : null}
      </div>

      {projectGroups.length === 0 ? (
        <DataTable columns={columns} data={[]} emptyMessage="No hay actividades que coincidan con los filtros actuales." />
      ) : (
        <AccordionPanels
          groups={projectGroups.map((group) => ({
            id: group.id,
            title: group.name,
            count: group.tasks.length,
            content: (
              <DataTable
                columns={columns}
                data={group.tasks}
                getRowId={(row) => row.id}
                wrapperClassName="rounded-none! border-x-0! border-b-0! shadow-none!"
              />
            ),
          }))}
        />
      )}
    </div>
  );
}
