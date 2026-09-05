"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { CellContext, ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/ui/DataTable";
import { PageHeader } from "@/components/v2/layout/PageHeader";
import { CapacityRing } from "@/components/v2/status/CapacityRing";
import { LoadBar } from "@/components/v2/status/LoadBar";
import { PhaseStepper } from "@/components/v2/status/PhaseStepper";
import { PersonAvatar } from "@/components/v2/status/PersonAvatar";
import { StatusBadge } from "@/components/v2/status/StatusBadge";
import { createRowActionsColumn, type RowAction } from "@/components/v2/table/RowActionsMenu";
import { createSelectionColumn } from "@/components/v2/table/bulk-select";
import { BulkActionBar } from "@/components/v2/table/BulkActionBar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/shadcn/tabs";
import { Button } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";
import ExportMenu from "@/components/ui/ExportMenu";
import InlineEditable from "@/components/ui/InlineEditable";
import TeamMultiSelect, { TeamMembersCompact } from "@/components/ui/TeamMultiSelect";
import NewProjectTemplateModal from "@/components/tareas/NewProjectTemplateModal";
import NewTaskModal from "@/components/tareas/NewTaskModal";
import TaskDrawer from "@/components/tareas/TaskDrawer";
import { DEPARTMENTOS, phasesFor } from "@/lib/actividades/departamento";
import { saveActivities } from "@/lib/repositories/activities-repository";
import { getCurrentAuthenticatedUser } from "@/lib/auth/auth-service";
import { canChangeActivityStatus, resolveActivitiesCapabilities } from "@/lib/auth/permissions";
import { loadGeneralSettings } from "@/lib/settings/general-settings";
import { exportTableData, type ExportColumn } from "@/lib/utils/export-service";
import type { Task, TaskStatus } from "@/lib/types/task";
import type { ProjectItem } from "@/lib/proyectos/use-projects-data";
import type { TeamMember } from "@/lib/data/team";

interface ActividadesClientProps {
  slug: string;
  initialTasks: Task[];
  initialProjects: ProjectItem[];
  initialTeam: TeamMember[];
}

function nextTaskId(tasks: Task[]) {
  return tasks.reduce((max, t) => Math.max(max, t.id), 0) + 1;
}

export function ActividadesClient({
  slug,
  initialTasks,
  initialProjects,
  initialTeam,
}: ActividadesClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const projectFromQuery = searchParams.get("project") || "Todos los proyectos";

  const departamento = DEPARTMENTOS.find((d) => d.slug === slug)!;
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [selected, setSelected] = useState<Set<string | number>>(new Set());
  const [templateOpen, setTemplateOpen] = useState(false);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [search, setSearch] = useState("");
  const [managerFilter, setManagerFilter] = useState("Todos");
  const [teamFilter, setTeamFilter] = useState("Todos");
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [deliveryDateFilter, setDeliveryDateFilter] = useState("");
  const [view, setView] = useState<"activas" | "archivadas">("activas");

  const [authenticatedUser] = useState(() => getCurrentAuthenticatedUser());
  const capabilities = useMemo(() => resolveActivitiesCapabilities(authenticatedUser), [authenticatedUser]);
  const viewerName = authenticatedUser?.member.name || "";

  const phases = useMemo(() => phasesFor(departamento.template), [departamento.template]);
  const teamMemberNames = useMemo(() => initialTeam.map((m) => m.name), [initialTeam]);

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
    () => initialProjects.filter((p) => p.active && p.stage === departamento.stage).map((p) => p.name),
    [initialProjects, departamento.stage]
  );

  const projectFilterOptions = useMemo(() => ["Todos los proyectos", ...new Set(tasks.map((t) => t.project))], [tasks]);
  const managers = useMemo(() => ["Todos", ...new Set(tasks.map((t) => t.manager))], [tasks]);
  const teams = useMemo(() => ["Todos", ...new Set(tasks.flatMap((t) => t.support))], [tasks]);
  const statuses = useMemo(() => ["Todos", ...new Set(tasks.map((t) => t.status))], [tasks]);

  function updateProjectFilter(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "Todos los proyectos") params.delete("project");
    else params.set("project", value);
    const queryString = params.toString();
    router.replace(queryString ? `${pathname}?${queryString}` : pathname);
  }

  const filteredTasks = useMemo(() => {
    const query = search.toLowerCase();
    return tasks.filter((t) => {
      const matchesSearch =
        !query ||
        t.project.toLowerCase().includes(query) ||
        t.description.toLowerCase().includes(query) ||
        t.phase.toLowerCase().includes(query) ||
        t.manager.toLowerCase().includes(query) ||
        t.status.toLowerCase().includes(query);
      const matchesProject = projectFromQuery === "Todos los proyectos" || t.project === projectFromQuery;
      const matchesManager = managerFilter === "Todos" || t.manager === managerFilter;
      const matchesTeam = teamFilter === "Todos" || t.support.includes(teamFilter);
      const matchesStatus = statusFilter === "Todos" || t.status === statusFilter;
      const matchesDeliveryDate = !deliveryDateFilter || (t.deliveryDate || "") === deliveryDateFilter;
      const matchesView = view === "archivadas" ? t.archived : !t.archived;
      return matchesSearch && matchesProject && matchesManager && matchesTeam && matchesStatus && matchesDeliveryDate && matchesView;
    });
  }, [tasks, search, projectFromQuery, managerFilter, teamFilter, statusFilter, deliveryDateFilter, view]);

  function clearFilters() {
    setSearch("");
    updateProjectFilter("Todos los proyectos");
    setManagerFilter("Todos");
    setTeamFilter("Todos");
    setStatusFilter("Todos");
    setDeliveryDateFilter("");
    setView("activas");
  }

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

  async function persist(next: Task[]) {
    setTasks(next);
    if (departamento.workflow) await saveActivities(departamento.workflow, next);
  }

  function updateTask(updated: Task) {
    void persist(tasks.map((t) => (t.id === updated.id ? { ...updated, updatedAt: "Hoy" } : t)));
    setSelectedTask((cur) => (cur && cur.id === updated.id ? { ...updated, updatedAt: "Hoy" } : cur));
  }

  function updateField<K extends keyof Task>(task: Task, field: K, value: Task[K]) {
    updateTask({ ...task, [field]: value });
  }

  function deleteTask(taskId: number) {
    void persist(tasks.filter((t) => t.id !== taskId));
    setSelectedTask((cur) => (cur?.id === taskId ? null : cur));
  }

  async function bulkArchive() {
    await persist(tasks.map((t) => (selected.has(t.id) ? { ...t, archived: true, updatedAt: "Hoy" } : t)));
    setSelected(new Set());
  }

  async function bulkComplete() {
    await persist(tasks.map((t) => (selected.has(t.id) ? { ...t, status: "Completado" as const, updatedAt: "Hoy" } : t)));
    setSelected(new Set());
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
    await persist([...tasks, ...created]);
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
    const today = now.slice(0, 10);
    const created: Task = {
      id: nextTaskId(tasks),
      workflow: departamento.workflow,
      priority: "Media",
      updatedAt: now,
      createdAt: now,
      history: values.notes.trim()
        ? [{ id: Date.now(), date: today, author: values.manager, comment: values.notes.trim() }]
        : [],
      checklist: [],
      archived: false,
      ...values,
    };
    await persist([...tasks, created]);
  }

  const canExport = capabilities.canExportData;

  const exportColumns = useMemo<ExportColumn<Task>[]>(
    () => [
      { key: "project", header: "Proyecto", getValue: (t) => t.project },
      { key: "phase", header: "Fase", getValue: (t) => t.phase },
      { key: "description", header: "Actividad", getValue: (t) => t.description },
      { key: "manager", header: "Responsable", getValue: (t) => t.manager || "Sin responsable" },
      { key: "reviewDate", header: "Próxima revisión", isDate: true, getValue: (t) => t.reviewDate || "" },
      { key: "deliveryDate", header: "Fecha de entrega", isDate: true, getValue: (t) => t.deliveryDate || "" },
      { key: "status", header: "Estatus", getValue: (t) => t.status },
    ],
    []
  );

  async function exportActivities(format: "xlsx" | "pdf") {
    const { settings } = loadGeneralSettings();
    await exportTableData({
      moduleName: `Actividades ${departamento.label}`,
      fileName: `actividades-${slug}-${Date.now()}`,
      format,
      companyName: settings.company.tradeName || settings.company.legalName,
      columns: exportColumns,
      rows: filteredTasks,
      landscape: true,
    });
  }

  const columns = useMemo<ColumnDef<Task, unknown>[]>(() => {
    if (!departamento.workflow) return [];

    const phaseOptionsWithOther = [...phases, "Otro..."];

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
        cell: ({ row }: CellContext<Task, unknown>) => {
          const task = row.original;
          const idx = phases.indexOf(task.phase);
          const display = (
            <PhaseStepper steps={Math.max(phases.length, 1)} current={idx === -1 ? 1 : idx + 1} label={task.phase} />
          );
          if (!capabilities.canReorderPhases) return display;
          const selectablePhases = Array.from(new Set([...phaseOptionsWithOther, task.phase]));
          return (
            <InlineEditable
              value={task.phase}
              onCommit={(value) => updateField(task, "phase", value)}
              commitOnChange
              renderDisplay={() => display}
              renderEditor={({ onChange, onBlur }) => (
                <Select
                  defaultOpen
                  value={task.phase}
                  onValueChange={(next) => {
                    const value = next as string;
                    if (value === "Otro...") {
                      const custom = window.prompt("Nueva fase", "")?.trim();
                      if (custom) onChange(custom);
                      onBlur();
                      return;
                    }
                    onChange(value);
                    onBlur();
                  }}
                >
                  <SelectTrigger className="w-full text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {selectablePhases.map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          );
        },
      },
      {
        id: "project",
        header: "Proyecto",
        cell: ({ row }: CellContext<Task, unknown>) => {
          const task = row.original;
          const selectableProjects = Array.from(new Set([...projectOptions, task.project]));
          return (
            <InlineEditable
              value={task.project}
              onCommit={(value) => updateField(task, "project", value)}
              renderDisplay={(value) => <span className="font-medium">{value}</span>}
              renderEditor={({ onChange, onBlur }) => (
                <Select defaultOpen value={task.project} onValueChange={(next) => { onChange(next as string); onBlur(); }}>
                  <SelectTrigger className="w-full text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {selectableProjects.map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          );
        },
      },
      {
        id: "description",
        header: "Tarea",
        cell: ({ row }: CellContext<Task, unknown>) => {
          const task = row.original;
          return (
            <InlineEditable
              value={task.description}
              onCommit={(value) => updateField(task, "description", value)}
              renderDisplay={(value) => <span className="font-medium">{value}</span>}
              renderEditor={({ value, onChange, onBlur, onKeyDown }) => (
                <Input autoFocus value={value} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} onKeyDown={onKeyDown} className="text-sm" />
              )}
            />
          );
        },
      },
      {
        id: "notes",
        header: "Seguimiento",
        enableSorting: false,
        cell: ({ row }: CellContext<Task, unknown>) => {
          const task = row.original;
          const latestNote = task.history.length > 0 ? task.history[task.history.length - 1].comment : task.notes;
          return (
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm text-muted-foreground" title={latestNote || "Sin seguimiento"}>
                {latestNote || "Sin seguimiento"}
              </span>
              <Button variant="outline" size="sm" className="h-6 w-6 shrink-0 rounded-full p-0 text-xs" onClick={() => setSelectedTask(task)} title="Ver detalle">
                ⓘ
              </Button>
            </div>
          );
        },
      },
      {
        id: "manager",
        header: "Responsable",
        cell: ({ row }: CellContext<Task, unknown>) => {
          const task = row.original;
          if (!capabilities.canChangeResponsible) return <PersonAvatar name={task.manager} size="sm" />;
          return (
            <InlineEditable
              value={task.manager}
              onCommit={(value) => updateField(task, "manager", value)}
              commitOnChange
              renderDisplay={(value) => <PersonAvatar name={value} size="sm" />}
              renderEditor={({ onChange, onBlur }) => (
                <Select defaultOpen value={task.manager} onValueChange={(next) => { onChange(next as string); onBlur(); }}>
                  <SelectTrigger className="w-full text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {teamMemberNames.map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          );
        },
      },
      {
        id: "support",
        header: "Equipo",
        enableSorting: false,
        cell: ({ row }: CellContext<Task, unknown>) => {
          const task = row.original;
          return (
            <InlineEditable
              value={task.support.join("||")}
              onCommit={(value) => updateField(task, "support", value.split("||").map((s) => s.trim()).filter(Boolean))}
              renderDisplay={() => <TeamMembersCompact members={task.support} />}
              renderEditor={({ value, onChange, onBlur }) => (
                <TeamMultiSelect
                  options={teamMemberNames}
                  selected={value.split("||").map((s) => s.trim()).filter(Boolean)}
                  onChange={(members) => {
                    onChange(members.join("||"));
                    updateField(task, "support", members);
                  }}
                  onBlur={onBlur}
                />
              )}
            />
          );
        },
      },
      {
        id: "status",
        header: "Estado",
        cell: ({ row }: CellContext<Task, unknown>) => {
          const task = row.original;
          const canChange = canChangeActivityStatus({ capabilities, task, viewerName });
          if (!canChange) return <StatusBadge kind="task-status" value={task.status} />;
          return (
            <InlineEditable
              value={task.status}
              onCommit={(value) => updateField(task, "status", value as TaskStatus)}
              commitOnChange
              renderDisplay={(value) => <StatusBadge kind="task-status" value={value as TaskStatus} />}
              renderEditor={({ onChange, onBlur }) => (
                <Select defaultOpen value={task.status} onValueChange={(next) => { onChange(next as string); onBlur(); }}>
                  <SelectTrigger className="w-full text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Pendiente">Pendiente</SelectItem>
                    <SelectItem value="En proceso">En proceso</SelectItem>
                    <SelectItem value="Completado">Completado</SelectItem>
                    <SelectItem value="Bloqueado">Bloqueado</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          );
        },
      },
      {
        id: "commitmentDate",
        header: "Compromiso",
        cell: ({ row }: CellContext<Task, unknown>) => {
          const task = row.original;
          return (
            <InlineEditable
              value={task.commitmentDate || ""}
              onCommit={(value) => updateField(task, "commitmentDate", value)}
              renderDisplay={(value) => <span className="text-sm">{value || "Sin fecha"}</span>}
              renderEditor={({ value, onChange, onBlur, onKeyDown }) => (
                <Input autoFocus type="date" value={value} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} onKeyDown={onKeyDown} className="text-sm" />
              )}
            />
          );
        },
      },
      {
        id: "reviewDate",
        header: "Próxima revisión",
        cell: ({ row }: CellContext<Task, unknown>) => {
          const task = row.original;
          return (
            <InlineEditable
              value={task.reviewDate || ""}
              onCommit={(value) => updateField(task, "reviewDate", value)}
              renderDisplay={(value) => <span className="text-sm">{value || "Sin fecha"}</span>}
              renderEditor={({ value, onChange, onBlur, onKeyDown }) => (
                <Input autoFocus type="date" value={value} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} onKeyDown={onKeyDown} className="text-sm" />
              )}
            />
          );
        },
      },
      {
        id: "deliveryDate",
        header: "Fecha de entrega",
        cell: ({ row }: CellContext<Task, unknown>) => {
          const task = row.original;
          return (
            <InlineEditable
              value={task.deliveryDate || ""}
              onCommit={(value) => updateField(task, "deliveryDate", value)}
              renderDisplay={(value) => <span className="text-sm">{value || "Sin fecha"}</span>}
              renderEditor={({ value, onChange, onBlur, onKeyDown }) => (
                <Input autoFocus type="date" value={value} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} onKeyDown={onKeyDown} className="text-sm" />
              )}
            />
          );
        },
      },
      createRowActionsColumn<Task>((task) => {
        const actions: RowAction<Task>[] = [
          { label: "Ver detalle", onSelect: (t) => setSelectedTask(t) },
          {
            label: task.archived ? "Desarchivar" : "Archivar",
            separatorBefore: true,
            onSelect: (t) => updateField(t, "archived", !t.archived),
          },
        ];
        if (capabilities.canDeleteActivity) {
          actions.push({
            label: "Eliminar",
            variant: "destructive",
            onSelect: (t) => {
              if (window.confirm(`Se eliminará la tarea "${t.description}" del proyecto "${t.project}". Esta acción no se puede deshacer. ¿Deseas continuar?`)) {
                deleteTask(t.id);
              }
            },
          });
        }
        return actions;
      }),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departamento.workflow, phases, selected, capabilities, viewerName, teamMemberNames, projectOptions]);

  return (
    <div>
      <PageHeader
        title={departamento.label}
        description={departamento.description}
        actions={
          <Tabs value={slug} onValueChange={(v) => router.push(`/actividades/${v}`)}>
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
                  <CapacityRing key={p.name} percent={p.percent} label={p.name} sublabel={`${p.count} tareas`} />
                ))
              )}
            </div>
            <div className="flex gap-2">
              {capabilities.canCreateActivity ? (
                <>
                  <Button variant="outline" onClick={() => setTemplateOpen(true)}>
                    Iniciar plantilla de {departamento.label}
                  </Button>
                  <Button onClick={() => setNewTaskOpen(true)}>+ Nueva tarea</Button>
                </>
              ) : null}
            </div>
          </div>

          {phases.length > 0 ? (
            <div className="mb-4 rounded-lg border border-border bg-card p-4">
              <div className="mb-2 flex justify-between text-[11px] text-muted-foreground">
                <span>Mezcla por fase</span>
                <span>{phases.join(" · ")}</span>
              </div>
              <LoadBar segments={phaseMix.map((p, i) => ({ percent: p.percent, opacity: 0.4 + (0.6 * (i + 1)) / phases.length }))} />
            </div>
          ) : null}

          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3">
            <Input type="text" placeholder="Buscar tarea..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 w-56" />

            <Select value={projectFromQuery} onValueChange={(v) => updateProjectFilter(v as string)}>
              <SelectTrigger className="h-9 w-auto"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Todos los proyectos">Proyecto</SelectItem>
                {projectFilterOptions.filter((p) => p !== "Todos los proyectos").map((p) => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={managerFilter} onValueChange={(v) => setManagerFilter(v as string)}>
              <SelectTrigger className="h-9 w-auto"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Todos">Responsable</SelectItem>
                {managers.filter((m) => m !== "Todos").map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={teamFilter} onValueChange={(v) => setTeamFilter(v as string)}>
              <SelectTrigger className="h-9 w-auto"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Todos">Equipo</SelectItem>
                {teams.filter((t) => t !== "Todos").map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as string)}>
              <SelectTrigger className="h-9 w-auto"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Todos">Estatus</SelectItem>
                {statuses.filter((s) => s !== "Todos").map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input type="date" value={deliveryDateFilter} onChange={(e) => setDeliveryDateFilter(e.target.value)} aria-label="Filtrar por fecha de entrega" className="h-9 w-auto" />

            <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
              <TabsList>
                <TabsTrigger value="activas">Activas</TabsTrigger>
                <TabsTrigger value="archivadas">Archivadas</TabsTrigger>
              </TabsList>
            </Tabs>

            <Button variant="outline" onClick={clearFilters}>Limpiar filtros</Button>

            {canExport ? <ExportMenu onExport={exportActivities} /> : null}
          </div>

          <BulkActionBar
            selectedCount={selected.size}
            actions={[
              { label: "Marcar completadas", onClick: bulkComplete },
              { label: "Archivar", onClick: bulkArchive, variant: "destructive" },
            ]}
          />
          <DataTable
            columns={columns}
            data={filteredTasks}
            getRowId={(row) => String(row.id)}
            emptyMessage="No hay tareas que coincidan con los filtros actuales."
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
            teamMembers={teamMemberNames}
            phaseOptions={phases}
            onClose={() => setNewTaskOpen(false)}
            onSave={(values) => {
              void addTask(values);
              setNewTaskOpen(false);
            }}
          />

          <TaskDrawer
            key={selectedTask?.id ?? "none"}
            task={selectedTask}
            teamMembers={teamMemberNames}
            onClose={() => setSelectedTask(null)}
            onSave={updateTask}
          />
        </>
      )}
    </div>
  );
}
