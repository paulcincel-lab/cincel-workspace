"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { CellContext, ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/ui/DataTable";
import { ChecklistProgressCell } from "@/components/tareas/ChecklistProgressCell";
import { AccordionPanels } from "@/components/ui/AccordionPanels";
import { PageHeader } from "@/components/v2/layout/PageHeader";
import { CapacityRing } from "@/components/v2/status/CapacityRing";
import { LoadBar } from "@/components/v2/status/LoadBar";
import { PersonAvatar } from "@/components/v2/status/PersonAvatar";
import { createRowActionsColumn, type RowAction } from "@/components/v2/table/RowActionsMenu";
import { createSelectionColumn } from "@/components/v2/table/bulk-select";
import { BulkActionBar } from "@/components/v2/table/BulkActionBar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/shadcn/tabs";
import { Button } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";
import { Switch } from "@/components/ui/shadcn/switch";
import ExportMenu from "@/components/ui/ExportMenu";
import InlineEditable from "@/components/ui/InlineEditable";
import TeamMultiSelect, { TeamMembersCompact } from "@/components/ui/TeamMultiSelect";
import NewProjectTemplateModal from "@/components/tareas/NewProjectTemplateModal";
import NewTaskModal, { type NewTaskFormValues } from "@/components/tareas/NewTaskModal";
import TaskDrawer from "@/components/tareas/TaskDrawer";
import { DEPARTMENTOS, phasesFor } from "@/lib/actividades/departamento";
import { getCurrentAuthenticatedUser } from "@/lib/auth/auth-service";
import { fetchTaskStatusesAction } from "@/lib/actions/task-statuses-actions";
import { TaskStatusCell } from "@/components/tareas/TaskStatusCell";
import {
  isTaskClosed,
  parseStatusValue,
  statusSelectItems,
  statusSelectValue,
  taskStatusLabel,
} from "@/lib/tasks/status-options";
import { canChangeActivityStatus, resolveActivitiesCapabilities } from "@/lib/auth/permissions";
import { loadGeneralSettings } from "@/lib/settings/general-settings";
import { exportTableData, type ExportColumn } from "@/lib/utils/export-service";
import {
  fetchTasksAction,
  fetchTaskAction,
  createUserTaskAction,
  updateTaskAction,
  setTaskStatusAction,
  setTaskCustomStatusAction,
  assignTaskAction,
  archiveTaskAction,
  deleteTaskAction,
  setTaskSupportAction,
  addChecklistItemAction,
  updateChecklistItemAction,
  removeChecklistItemAction,
  reorderChecklistAction,
  reorderProjectTasksAction,
  addTaskCommentAction,
  addTaskAttachmentAction,
  addTaskLinkAction,
  removeTaskLinkAction,
} from "@/lib/actions/tasks-actions";
import type {
  ProjectListItem,
  Staff,
  TaskChecklistItem,
  TaskDetail,
  TaskListItem,
  TaskPatch,
  TaskPriority,
  TaskStatusOption,
  TaskLinkInput,
  WorkflowDetail,
} from "@/lib/types/core";


const DEFAULT_PRIORITY: TaskPriority = "media";

interface ActividadesClientProps {
  slug: string;
  workflow: WorkflowDetail | null;
  initialTasks: TaskListItem[];
  initialProjects: ProjectListItem[];
  initialStaff: Array<Staff & { suggested: boolean }>;
}

export function ActividadesClient({
  slug,
  workflow,
  initialTasks,
  initialProjects,
  initialStaff,
}: ActividadesClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const projectFromQuery = searchParams.get("project") || "";

  const departamento = DEPARTMENTOS.find((d) => d.slug === slug)!;
  const [tasks, setTasks] = useState<TaskListItem[]>(initialTasks);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [templateOpen, setTemplateOpen] = useState(false);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedTaskDetail, setSelectedTaskDetail] = useState<TaskDetail | null>(null);
  const [search, setSearch] = useState("");
  const [managerFilter, setManagerFilter] = useState("");
  const [teamFilter, setTeamFilter] = useState("");
  // A built-in status or a custom one, as a status select value (see status-options.ts).
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [deliveryDateFilter, setDeliveryDateFilter] = useState("");
  // Finished tasks are hidden by default so the list stays short to read.
  const [showCompleted, setShowCompleted] = useState(false);
  const [view, setView] = useState<"activas" | "archivadas">("activas");

  const [authenticatedUser] = useState(() => getCurrentAuthenticatedUser());
  const capabilities = useMemo(() => resolveActivitiesCapabilities(authenticatedUser), [authenticatedUser]);
  const viewerId = authenticatedUser?.member.id || "";

  const phases = useMemo(() => phasesFor(departamento.template), [departamento.template]);
  const staffNames = useMemo(() => initialStaff.map((m) => m.name), [initialStaff]);
  const staffOptions = useMemo(() => initialStaff.map((m) => ({ id: m.id, name: m.name })), [initialStaff]);
  const nameToStaffId = useMemo(() => new Map(initialStaff.map((s) => [s.name, s.id])), [initialStaff]);

  const refresh = useCallback(async () => {
    if (!workflow) return;
    try {
      const rows = await fetchTasksAction({ workflowId: workflow.id, archived: view === "archivadas" });
      setTasks(rows);
    } catch (err) {
      console.error(err);
    }
  }, [workflow, view]);

  useEffect(() => {
    // Sync the task list with the server on mount and whenever workflow/view
    // change — refresh() is also reused by CRUD handlers, so it can't be
    // inlined here without duplicating the fetch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  const [customStatuses, setCustomStatuses] = useState<TaskStatusOption[]>([]);
  useEffect(() => {
    fetchTaskStatusesAction()
      .then(setCustomStatuses)
      .catch((err) => console.error(err));
  }, []);

  useEffect(() => {
    if (!selectedTaskId) return;
    let cancelled = false;
    fetchTaskAction(selectedTaskId)
      .then((detail) => {
        if (!cancelled) setSelectedTaskDetail(detail);
      })
      .catch((err) => console.error(err));
    return () => {
      cancelled = true;
    };
  }, [selectedTaskId]);

  const activeTaskDetail = selectedTaskId && selectedTaskDetail?.id === selectedTaskId ? selectedTaskDetail : null;

  async function runAction<T>(fn: () => Promise<T>, onSuccess?: (result: T) => void) {
    try {
      const result = await fn();
      onSuccess?.(result);
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : "No se pudo completar la acción.";
      window.alert(message.startsWith("FORBIDDEN:") ? "No tienes permiso para realizar esta acción." : message);
      await refresh();
    }
  }

  // Widgets summarize the active workload only — they don't make sense over
  // the archived view.
  const capacityByPerson = useMemo(() => {
    if (view !== "activas") return [];
    const byManager = new Map<string, { name: string; count: number }>();
    tasks.forEach((t) => {
      if (!t.manager) return;
      const cur = byManager.get(t.manager.id) ?? { name: t.manager.name, count: 0 };
      cur.count += 1;
      byManager.set(t.manager.id, cur);
    });
    return Array.from(byManager.entries()).map(([id, { name, count }]) => {
      const staffMember = initialStaff.find((s) => s.id === id);
      const capacity = staffMember?.capacity ?? 8;
      return { id, name, count, percent: Math.round((count / Math.max(capacity, 1)) * 100) };
    });
  }, [tasks, initialStaff, view]);

  const phaseMix = useMemo(
    () =>
      view !== "activas"
        ? []
        : phases.map((phase) => ({
            phase,
            percent: tasks.length === 0 ? 0 : (tasks.filter((t) => t.phase === phase).length / tasks.length) * 100,
          })),
    [tasks, phases, view]
  );

  // "Nueva tarea" and the quick-add row list every active project, not only
  // ones whose currentWorkflow is this department — a project already
  // advanced to a later stage (e.g. one now in Construcción) can still need
  // a Presale/Diseño task logged retroactively (#420 narrowed this to
  // Diseño/Construcción only; the same problem showed up on Presale too, so
  // it now applies to every department).
  const projectOptions = useMemo(
    () => initialProjects.filter((p) => p.status === "activo").map((p) => ({ id: p.id, name: p.name })),
    [initialProjects]
  );

  const projectFilterOptions = useMemo(() => {
    const map = new Map<string, string>();
    tasks.forEach((t) => map.set(t.project.id, t.project.name));
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [tasks]);

  const managerOptions = useMemo(() => {
    const map = new Map<string, string>();
    tasks.forEach((t) => {
      if (t.manager) map.set(t.manager.id, t.manager.name);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [tasks]);

  const teamOptions = useMemo(() => {
    const map = new Map<string, string>();
    tasks.forEach((t) => t.support.forEach((s) => map.set(s.id, s.name)));
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [tasks]);

  function updateProjectFilter(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (!value) params.delete("project");
    else params.set("project", value);
    const queryString = params.toString();
    router.replace(queryString ? `${pathname}?${queryString}` : pathname);
  }

  const filteredTasks = useMemo(() => {
    const query = search.toLowerCase();
    return tasks.filter((t) => {
      const matchesSearch =
        !query ||
        t.project.name.toLowerCase().includes(query) ||
        t.title.toLowerCase().includes(query) ||
        (t.phase ?? "").toLowerCase().includes(query) ||
        (t.manager?.name ?? "").toLowerCase().includes(query) ||
        t.status.toLowerCase().includes(query);
      const matchesProject = !projectFromQuery || t.project.id === projectFromQuery;
      const matchesManager = !managerFilter || t.manager?.id === managerFilter;
      const matchesTeam = !teamFilter || t.support.some((s) => s.id === teamFilter);
      const matchesStatus = !statusFilter || statusSelectValue(t) === statusFilter;
      // An explicit status filter wins, so picking Completado still shows those tasks.
      const matchesCompletion = showCompleted || !!statusFilter || !isTaskClosed(t);
      const matchesDeliveryDate = !deliveryDateFilter || (t.deliveryDate || "") === deliveryDateFilter;
      return (
        matchesSearch &&
        matchesProject &&
        matchesManager &&
        matchesTeam &&
        matchesStatus &&
        matchesCompletion &&
        matchesDeliveryDate
      );
    });
  }, [tasks, search, projectFromQuery, managerFilter, teamFilter, statusFilter, showCompleted, deliveryDateFilter]);

  function clearFilters() {
    setSearch("");
    updateProjectFilter("");
    setManagerFilter("");
    setTeamFilter("");
    setStatusFilter("");
    setDeliveryDateFilter("");
    setShowCompleted(false);
    setView("activas");
  }

  function toggle(id: string | number) {
    const key = String(id);
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleAll(ids: (string | number)[]) {
    const keys = ids.map(String);
    setSelected((cur) => {
      const allSelected = keys.every((id) => cur.has(id));
      return allSelected ? new Set() : new Set(keys);
    });
  }

  function applyDetailUpdate(updated: TaskDetail) {
    setTasks((cur) => cur.map((t) => (t.id === updated.id ? updated : t)));
    setSelectedTaskDetail((cur) => (cur && cur.id === updated.id ? updated : cur));
  }

  async function updateField(task: TaskListItem, patch: TaskPatch) {
    await runAction(() => updateTaskAction(task.id, patch), applyDetailUpdate);
  }

  async function changeStatus(task: TaskListItem, value: string) {
    const parsed = parseStatusValue(value);
    await runAction(
      () =>
        parsed.kind === "custom"
          ? setTaskCustomStatusAction(task.id, parsed.id)
          : setTaskStatusAction(task.id, parsed.status),
      applyDetailUpdate
    );
  }

  async function changeManager(task: TaskListItem, managerId: string | null) {
    await runAction(() => assignTaskAction(task.id, managerId), applyDetailUpdate);
  }

  async function changeSupport(task: TaskListItem, staffIds: string[]) {
    await runAction(() => setTaskSupportAction(task.id, staffIds), (support) => {
      setTasks((cur) => cur.map((t) => (t.id === task.id ? { ...t, support } : t)));
      setSelectedTaskDetail((cur) => (cur && cur.id === task.id ? { ...cur, support } : cur));
    });
  }

  async function archiveOne(task: TaskListItem, archived: boolean) {
    await runAction(
      () => archiveTaskAction(task.id, archived),
      async () => {
        await refresh();
        if (selectedTaskId === task.id) setSelectedTaskId(null);
      }
    );
  }

  async function deleteOne(task: TaskListItem) {
    await runAction(
      () => deleteTaskAction(task.id),
      async () => {
        await refresh();
        if (selectedTaskId === task.id) setSelectedTaskId(null);
      }
    );
  }

  async function bulkArchive() {
    const ids = Array.from(selected);
    await Promise.all(ids.map((id) => archiveTaskAction(id, true).catch((err) => console.error(err))));
    await refresh();
    setSelected(new Set());
  }

  async function bulkComplete() {
    const ids = Array.from(selected);
    await Promise.all(ids.map((id) => setTaskStatusAction(id, "completado").catch((err) => console.error(err))));
    await refresh();
    setSelected(new Set());
  }

  async function applyTemplate({ projectId, items }: { projectId: string; items: { phase: string; description: string }[] }) {
    await runAction(
      () =>
        Promise.all(
          items.map((item) =>
            createUserTaskAction({
              projectId,
              title: item.description,
              phase: item.phase,
              workflowId: workflow?.id ?? null,
              priority: DEFAULT_PRIORITY,
            })
          )
        ),
      () => {
        setTemplateOpen(false);
        void refresh();
      }
    );
  }

  async function addTask(values: NewTaskFormValues) {
    await runAction(
      () =>
        createUserTaskAction({
          projectId: values.projectId,
          title: values.title,
          notes: values.notes || null,
          workflowId: workflow?.id ?? null,
          phase: values.phase || null,
          managerId: values.managerId,
          supportIds: values.supportIds,
          priority: DEFAULT_PRIORITY,
          commitmentDate: values.commitmentDate || null,
          reviewDate: values.reviewDate || null,
        }),
      () => void refresh()
    );
  }

  async function addQuickTask(projectId: string) {
    const title = (quickTitles[projectId] ?? "").trim();
    if (!title) return;
    setQuickTitles((prev) => ({ ...prev, [projectId]: "" }));
    await addTask({
      projectId,
      title,
      phase: phases[0] ?? "",
      managerId: null,
      supportIds: [],
      notes: "",
      commitmentDate: "",
      reviewDate: "",
    });
  }

  async function reorderProjectTasks(projectId: string, orderedTaskIds: string[]) {
    try {
      await reorderProjectTasksAction(projectId, orderedTaskIds);
      await refresh();
    } catch (err) {
      console.error(err);
    }
  }

  async function addComment(comment: string) {
    if (!selectedTaskId) return;
    try {
      await addTaskCommentAction(selectedTaskId, comment);
      const detail = await fetchTaskAction(selectedTaskId);
      setSelectedTaskDetail(detail);
    } catch (err) {
      console.error(err);
    }
  }

  async function addLink(input: TaskLinkInput) {
    if (!selectedTaskId) return;
    try {
      await addTaskLinkAction(selectedTaskId, input);
      const detail = await fetchTaskAction(selectedTaskId);
      setSelectedTaskDetail(detail);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "No se pudo agregar el enlace.");
    }
  }

  async function removeLink(linkId: string) {
    if (!selectedTaskId) return;
    try {
      await removeTaskLinkAction(linkId);
      const detail = await fetchTaskAction(selectedTaskId);
      setSelectedTaskDetail(detail);
    } catch (err) {
      console.error(err);
    }
  }

  async function addAttachment(file: File, checklistItemId?: string) {
    if (!selectedTaskId) return;
    try {
      const formData = new FormData();
      formData.set("file", file);
      if (checklistItemId) formData.set("checklistItemId", checklistItemId);
      await addTaskAttachmentAction(selectedTaskId, formData);
      const detail = await fetchTaskAction(selectedTaskId);
      setSelectedTaskDetail(detail);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "No se pudo adjuntar el archivo.");
    }
  }

  async function addChecklistItem(title: string) {
    if (!selectedTaskId) return;
    try {
      await addChecklistItemAction(selectedTaskId, title);
      const detail = await fetchTaskAction(selectedTaskId);
      setSelectedTaskDetail(detail);
      if (detail) setTasks((cur) => cur.map((t) => (t.id === detail.id ? detail : t)));
    } catch (err) {
      console.error(err);
    }
  }

  async function toggleChecklistItem(item: TaskChecklistItem) {
    if (!selectedTaskId) return;
    try {
      await updateChecklistItemAction(item.id, { completed: !item.completed });
      const detail = await fetchTaskAction(selectedTaskId);
      setSelectedTaskDetail(detail);
      if (detail) setTasks((cur) => cur.map((t) => (t.id === detail.id ? detail : t)));
    } catch (err) {
      console.error(err);
    }
  }

  async function removeChecklistItem(item: TaskChecklistItem) {
    if (!selectedTaskId) return;
    try {
      await removeChecklistItemAction(item.id);
      const detail = await fetchTaskAction(selectedTaskId);
      setSelectedTaskDetail(detail);
      if (detail) setTasks((cur) => cur.map((t) => (t.id === detail.id ? detail : t)));
    } catch (err) {
      console.error(err);
    }
  }

  async function reorderChecklist(orderedIds: string[]) {
    if (!selectedTaskId) return;
    try {
      await reorderChecklistAction(selectedTaskId, orderedIds);
      const detail = await fetchTaskAction(selectedTaskId);
      setSelectedTaskDetail(detail);
      if (detail) setTasks((cur) => cur.map((t) => (t.id === detail.id ? detail : t)));
    } catch (err) {
      console.error(err);
    }
  }

  const canExport = capabilities.canExportData;

  const exportColumns = useMemo<ExportColumn<TaskListItem>[]>(
    () => [
      { key: "project", header: "Proyecto", getValue: (t) => t.project.name },
      { key: "phase", header: "Fase", getValue: (t) => t.phase || "" },
      { key: "title", header: "Actividad", getValue: (t) => t.title },
      { key: "manager", header: "Responsable", getValue: (t) => t.manager?.name || "Sin responsable" },
      { key: "reviewDate", header: "Próxima revisión", isDate: true, getValue: (t) => t.reviewDate || "" },
      { key: "deliveryDate", header: "Fecha de entrega", isDate: true, getValue: (t) => t.deliveryDate || "" },
      { key: "status", header: "Estatus", getValue: (t) => taskStatusLabel(t) },
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

  const [quickTitles, setQuickTitles] = useState<Record<string, string>>({});

  const projectGroups = useMemo(() => {
    const groups = new Map<string, { id: string; name: string; tasks: TaskListItem[] }>();
    for (const task of filteredTasks) {
      const group = groups.get(task.project.id) ?? { id: task.project.id, name: task.project.name, tasks: [] };
      group.tasks.push(task);
      groups.set(task.project.id, group);
    }
    return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [filteredTasks]);

  const columns = useMemo<ColumnDef<TaskListItem, unknown>[]>(() => {
    if (!workflow) return [];

    const phaseOptionsWithOther = [...phases, "Otro..."];

    return [
      createSelectionColumn<TaskListItem>({
        getId: (t) => t.id,
        selectedIds: selected,
        onToggle: toggle,
        onToggleAll: toggleAll,
      }),
      {
        id: "phase",
        header: "Fase",
        cell: ({ row }: CellContext<TaskListItem, unknown>) => {
          const task = row.original;
          const currentPhase = task.phase ?? "";
          const display = (
            <span className="block max-w-24 truncate text-sm" title={currentPhase || undefined}>
              {currentPhase || <span className="text-muted-foreground">Sin fase</span>}
            </span>
          );
          if (!capabilities.canReorderPhases) return display;
          const selectablePhases = Array.from(new Set([...phaseOptionsWithOther, currentPhase].filter(Boolean)));
          return (
            <InlineEditable
              value={currentPhase}
              onCommit={(value) => updateField(task, { phase: value || null })}
              commitOnChange
              renderDisplay={() => display}
              renderEditor={({ onChange, onBlur }) => (
                <Select
                  defaultOpen
                  value={currentPhase}
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
        // The project a task belongs to is set at creation and can't be moved
        // afterwards (TaskPatch has no projectId) — display only.
        cell: ({ row }: CellContext<TaskListItem, unknown>) => (
          <span className="font-medium">{row.original.project.name}</span>
        ),
      },
      {
        id: "title",
        header: "Tarea",
        cell: ({ row }: CellContext<TaskListItem, unknown>) => {
          const task = row.original;
          return (
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <InlineEditable
                  displayClassName="whitespace-normal"
                  value={task.title}
                  onCommit={(value) => value.trim() && updateField(task, { title: value.trim() })}
                  renderDisplay={(value) => <span className="font-medium">{value}</span>}
                  renderEditor={({ value, onChange, onBlur, onKeyDown }) => (
                    <Input autoFocus value={value} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} onKeyDown={onKeyDown} className="text-sm" />
                  )}
                />
              </div>
              <Button variant="outline" size="sm" className="h-6 w-6 shrink-0 rounded-full p-0 text-xs" onClick={() => setSelectedTaskId(task.id)} title="Ver detalle">
                ⓘ
              </Button>
            </div>
          );
        },
      },
      {
        id: "checklist",
        header: "Checklist",
        enableSorting: false,
        cell: ({ row }: CellContext<TaskListItem, unknown>) => (
          <ChecklistProgressCell
            total={row.original.checklist.total}
            completed={row.original.checklist.completed}
            onClick={() => setSelectedTaskId(row.original.id)}
          />
        ),
      },
      {
        id: "manager",
        header: "Responsable",
        cell: ({ row }: CellContext<TaskListItem, unknown>) => {
          const task = row.original;
          if (!capabilities.canChangeResponsible) {
            return task.manager ? <PersonAvatar name={task.manager.name} size="sm" /> : <span className="text-muted-foreground">Sin responsable</span>;
          }
          return (
            <InlineEditable
              value={task.manager?.name ?? ""}
              onCommit={(value) => changeManager(task, nameToStaffId.get(value) ?? null)}
              commitOnChange
              renderDisplay={(value) => (value ? <PersonAvatar name={value} size="sm" /> : <span className="text-muted-foreground">Sin responsable</span>)}
              renderEditor={({ onChange, onBlur }) => (
                <Select defaultOpen value={task.manager?.name ?? ""} onValueChange={(next) => { onChange(next as string); onBlur(); }}>
                  <SelectTrigger className="w-full text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {staffNames.map((m) => (
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
        cell: ({ row }: CellContext<TaskListItem, unknown>) => {
          const task = row.original;
          const supportNames = task.support.map((s) => s.name);
          return (
            <InlineEditable
              value={supportNames.join("||")}
              onCommit={(value) => {
                const names = value.split("||").map((s) => s.trim()).filter(Boolean);
                const ids = names.map((n) => nameToStaffId.get(n)).filter((id): id is string => Boolean(id));
                void changeSupport(task, ids);
              }}
              renderDisplay={() => <TeamMembersCompact members={supportNames} />}
              renderEditor={({ value, onChange, onBlur }) => (
                <TeamMultiSelect
                  options={staffNames}
                  selected={value.split("||").map((s) => s.trim()).filter(Boolean)}
                  onChange={(members) => {
                    onChange(members.join("||"));
                    const ids = members.map((n) => nameToStaffId.get(n)).filter((id): id is string => Boolean(id));
                    void changeSupport(task, ids);
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
        cell: ({ row }: CellContext<TaskListItem, unknown>) => {
          const task = row.original;
          const canChange = canChangeActivityStatus({
            capabilities,
            task: { manager: task.manager, support: task.support },
            viewerId,
          });
          return (
            <TaskStatusCell
              task={task}
              customStatuses={customStatuses}
              canChange={canChange}
              onChange={(value) => void changeStatus(task, value)}
            />
          );
        },
      },
      {
        id: "commitmentDate",
        header: "Compromiso",
        cell: ({ row }: CellContext<TaskListItem, unknown>) => {
          const task = row.original;
          return (
            <InlineEditable
              value={task.commitmentDate || ""}
              onCommit={(value) => updateField(task, { commitmentDate: value || null })}
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
        cell: ({ row }: CellContext<TaskListItem, unknown>) => {
          const task = row.original;
          return (
            <InlineEditable
              value={task.reviewDate || ""}
              onCommit={(value) => updateField(task, { reviewDate: value || null })}
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
        cell: ({ row }: CellContext<TaskListItem, unknown>) => {
          const task = row.original;
          return (
            <InlineEditable
              value={task.deliveryDate || ""}
              onCommit={(value) => updateField(task, { deliveryDate: value || null })}
              renderDisplay={(value) => <span className="text-sm">{value || "Sin fecha"}</span>}
              renderEditor={({ value, onChange, onBlur, onKeyDown }) => (
                <Input autoFocus type="date" value={value} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} onKeyDown={onKeyDown} className="text-sm" />
              )}
            />
          );
        },
      },
      createRowActionsColumn<TaskListItem>((task) => {
        const actions: RowAction<TaskListItem>[] = [
          { label: "Ver detalle", onSelect: (t) => setSelectedTaskId(t.id) },
          {
            label: task.archived ? "Desarchivar" : "Archivar",
            separatorBefore: true,
            onSelect: (t) => void archiveOne(t, !t.archived),
          },
        ];
        if (capabilities.canDeleteActivity) {
          actions.push({
            label: "Eliminar",
            variant: "destructive",
            onSelect: (t) => {
              if (window.confirm(`Se eliminará la tarea "${t.title}" del proyecto "${t.project.name}". Esta acción no se puede deshacer. ¿Deseas continuar?`)) {
                void deleteOne(t);
              }
            },
          });
        }
        return actions;
      }),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflow, phases, selected, capabilities, viewerId, staffNames, nameToStaffId]);

  // Each accordion already names the project, so the per-row Proyecto column is redundant.
  const groupedColumns = useMemo(() => columns.filter((c) => c.id !== "project"), [columns]);

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

      {!workflow ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          {departamento.description}
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-5 rounded-lg border border-border bg-card p-4">
              {capacityByPerson.length === 0 ? (
                <span className="text-sm text-muted-foreground">Sin tareas activas.</span>
              ) : (
                capacityByPerson.map((p) => (
                  <CapacityRing key={p.id} percent={p.percent} label={p.name} sublabel={`${p.count} tareas`} />
                ))
              )}
            </div>
            <div className="flex flex-wrap gap-2">
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

          {phaseMix.length > 0 ? (
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

            <Select
              items={{ __all__: "Proyecto", ...Object.fromEntries(projectFilterOptions.map((p) => [p.id, p.name])) }}
              value={projectFromQuery || "__all__"}
              onValueChange={(v) => updateProjectFilter(v === "__all__" ? "" : (v as string))}
            >
              <SelectTrigger className="h-9 w-auto"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Proyecto</SelectItem>
                {projectFilterOptions.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              items={{ __all__: "Responsable", ...Object.fromEntries(managerOptions.map((m) => [m.id, m.name])) }}
              value={managerFilter || "__all__"}
              onValueChange={(v) => setManagerFilter(v === "__all__" ? "" : (v as string))}
            >
              <SelectTrigger className="h-9 w-auto"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Responsable</SelectItem>
                {managerOptions.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              items={{ __all__: "Equipo", ...Object.fromEntries(teamOptions.map((t) => [t.id, t.name])) }}
              value={teamFilter || "__all__"}
              onValueChange={(v) => setTeamFilter(v === "__all__" ? "" : (v as string))}
            >
              <SelectTrigger className="h-9 w-auto"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Equipo</SelectItem>
                {teamOptions.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              items={{
                __all__: "Estatus",
                ...Object.fromEntries(statusSelectItems(customStatuses).map((i) => [i.value, i.label])),
              }}
              value={statusFilter || "__all__"}
              onValueChange={(v) => setStatusFilter(v === "__all__" ? "" : (v as string))}
            >
              <SelectTrigger className="h-9 w-auto"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Estatus</SelectItem>
                {statusSelectItems(customStatuses).map((i) => (
                  <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input type="date" value={deliveryDateFilter} onChange={(e) => setDeliveryDateFilter(e.target.value)} aria-label="Filtrar por fecha de entrega" className="h-9 w-auto" />

            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Switch checked={showCompleted} onCheckedChange={setShowCompleted} />
              Mostrar completadas
            </label>

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
          {projectGroups.length === 0 ? (
            <DataTable
              columns={groupedColumns}
              data={[]}
              emptyMessage="No hay tareas que coincidan con los filtros actuales."
              wrapperClassName={selected.size > 0 ? "rounded-t-none border-t-0" : undefined}
            />
          ) : (
            <AccordionPanels
              groups={projectGroups.map((group) => ({
                id: group.id,
                title: group.name,
                count: group.tasks.length,
                content: (
                  <>
                    <DataTable
                      columns={groupedColumns}
                      data={group.tasks}
                      getRowId={(row) => row.id}
                      wrapperClassName="rounded-none! border-x-0! border-b-0! shadow-none!"
                      onReorderRows={
                        capabilities.canReorderPhases && view === "activas"
                          ? (ids) => void reorderProjectTasks(group.id, ids)
                          : undefined
                      }
                    />
                    {capabilities.canCreateActivity && view === "activas" ? (
                      <Input
                        value={quickTitles[group.id] ?? ""}
                        onChange={(e) => setQuickTitles((prev) => ({ ...prev, [group.id]: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void addQuickTask(group.id);
                          }
                        }}
                        placeholder="+ Nueva tarea (Enter para añadir)"
                        aria-label={`Nueva tarea en ${group.name}`}
                        className="h-10 rounded-none border-0 border-t border-border text-sm shadow-none"
                      />
                    ) : null}
                  </>
                ),
              }))}
            />
          )}

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
            staff={staffOptions}
            phaseOptions={phases}
            onClose={() => setNewTaskOpen(false)}
            onSave={(values) => {
              void addTask(values);
              setNewTaskOpen(false);
            }}
          />

          <TaskDrawer
            open={selectedTaskId !== null}
            task={activeTaskDetail}
            staffOptions={staffOptions}
            onClose={() => setSelectedTaskId(null)}
            onAddComment={(comment) => void addComment(comment)}
            onAddAttachment={(file, checklistItemId) => void addAttachment(file, checklistItemId)}
        onAddLink={(input) => void addLink(input)}
        onRemoveLink={(id) => void removeLink(id)}
            onAddChecklistItem={(title) => void addChecklistItem(title)}
            onToggleChecklistItem={(item) => void toggleChecklistItem(item)}
            onRemoveChecklistItem={(item) => void removeChecklistItem(item)}
            onReorderChecklist={(orderedIds) => void reorderChecklist(orderedIds)}
            onChangeSupport={(staffIds) => {
              if (!activeTaskDetail) return;
              void changeSupport(activeTaskDetail, staffIds);
            }}
          />
        </>
      )}
    </div>
  );
}
