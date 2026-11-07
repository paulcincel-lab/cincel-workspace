"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { CellContext, ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/ui/DataTable";
import { ChecklistProgressCell } from "@/components/tareas/ChecklistProgressCell";
import { AccordionPanels } from "@/components/ui/AccordionPanels";
import { PageHeader } from "@/components/v2/layout/PageHeader";
import { CapacityRing } from "@/components/v2/status/CapacityRing";
import { TramoBadge } from "@/components/v2/status/TramoBadge";
import { TramoChips } from "@/components/tareas/TramoChips";
import { PersonAvatar } from "@/components/v2/status/PersonAvatar";
import { createRowActionsColumn, type RowAction } from "@/components/v2/table/RowActionsMenu";
import { createSelectionColumn } from "@/components/v2/table/bulk-select";
import { BulkActionBar } from "@/components/v2/table/BulkActionBar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/shadcn/tabs";
import { Alert, AlertDescription } from "@/components/ui/shadcn/alert";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";
import { Switch } from "@/components/ui/shadcn/switch";
import ExportMenu from "@/components/ui/ExportMenu";
import InlineEditable from "@/components/ui/InlineEditable";
import TeamMultiSelect, { TeamMembersCompact } from "@/components/ui/TeamMultiSelect";
import NewTaskModal, { type NewTaskFormValues } from "@/components/tareas/NewTaskModal";
import TaskDrawer from "@/components/tareas/TaskDrawer";
import { PhaseStrip } from "@/components/tareas/PhaseStrip";
import { UpcomingProjects } from "@/components/tareas/UpcomingProjects";
import { ReadyToStartCard } from "@/components/tareas/ReadyToStartCard";
import { StartTramoSheet } from "@/components/tareas/StartTramoSheet";
import { UndoStartTramoButton } from "@/components/tareas/UndoStartTramoButton";
import { notifyTramoStarted } from "@/components/tareas/start-tramo-toast";
import {
  GENERAL_SLUG,
  NO_PHASE_LABEL,
  defaultQuickAddPhaseId,
  isWithinPhaseReorder,
  openTasksByPhase,
  projectBlockDomId,
  sortTramoTasks,
  spaceFilterOptions,
  spacesByProjectOf,
} from "@/lib/actividades/tramo-page";
import { actionErrorText } from "@/lib/errors";
import { fetchProjectSpacesAction } from "@/lib/actions/projects-actions";
import { fetchTramoBoardAction } from "@/lib/actions/tramo-start-actions";
import { getCurrentAuthenticatedUser } from "@/lib/auth/auth-service";
import { fetchTaskStatusesAction } from "@/lib/actions/task-statuses-actions";
import { TaskStatusCell } from "@/components/tareas/TaskStatusCell";
import { SubtaskCountBadge, SubtaskOfLine, WaitingBadge } from "@/components/tareas/TaskRowMeta";
import {
  isDueDateLate,
  isTaskClosed,
  parseStatusValue,
  statusSelectItems,
  statusSelectValue,
  taskStatusLabel,
} from "@/lib/tasks/status-options";
import { cn } from "@/lib/utils";
import { canChangeActivityStatus, resolveActivitiesCapabilities } from "@/lib/auth/permissions";
import { useGeneralSettings } from "@/lib/settings/use-general-settings";
import { exportTableData, type ExportColumn } from "@/lib/utils/export-service";
import { buildGeneralProjectBlocks, clearLegacyGroupByStorage } from "@/lib/actividades/general-blocks";
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
  StartTramoResult,
  TaskChecklistItem,
  TaskDetail,
  TaskListItem,
  TaskPatch,
  TaskPriority,
  TaskStatusOption,
  TaskLinkInput,
  TramoBoard,
  WorkflowDetail,
  WorkflowPhaseRef,
} from "@/lib/types/core";


const DEFAULT_PRIORITY: TaskPriority = "media";

const GENERAL_LABEL = "General";
const GENERAL_DESCRIPTION = "Todas las tareas de todos los tramos, agrupadas por proyecto.";

/** Active fases of a tramo, in catalog order. */
function activePhasesOf(workflow: WorkflowDetail | null | undefined): WorkflowPhaseRef[] {
  if (!workflow) return [];
  return workflow.phases
    .filter((p) => p.active)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(({ id, name, sortOrder }) => ({ id, name, sortOrder }));
}

interface ActividadesClientProps {
  /** "general" or the tramo's `workflows.key`. */
  slug: string;
  /** The page's tramo; null on General. */
  workflow: WorkflowDetail | null;
  /** Every active tramo, by `sortOrder` (tabs and each task's own fase catalog). */
  workflows?: WorkflowDetail[];
  initialTasks: TaskListItem[];
  initialProjects: ProjectListItem[];
  initialStaff: Array<Staff & { suggested: boolean }>;
  /** Listos para iniciar, Próximos and started projects of this tramo; null on General. */
  initialBoard?: TramoBoard | null;
}

export function ActividadesClient({
  slug,
  workflow,
  workflows = [],
  initialTasks,
  initialProjects,
  initialStaff,
  initialBoard = null,
}: ActividadesClientProps) {
  const generalSettings = useGeneralSettings();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const projectFromQuery = searchParams.get("project") || "";

  // The General view isn't a tramo: it lists every tramo's tasks, one block
  // per project.
  const isGeneral = slug === GENERAL_SLUG;
  const pageLabel = isGeneral ? GENERAL_LABEL : (workflow?.name ?? slug);
  // A tramo page with its workflow loaded (the RSC 404s unknown keys; null
  // only when the initial load failed).
  const isTramoPage = !isGeneral && Boolean(workflow);
  // General is always one block per project (FE §3.2). The old
  // "Proyecto / Actividad" selector is gone: drop its remembered choice.
  useEffect(() => {
    if (isGeneral) clearLegacyGroupByStorage();
  }, [isGeneral]);
  const pageDescription = isGeneral ? GENERAL_DESCRIPTION : (workflow?.description ?? undefined);
  const workflowsById = useMemo(() => new Map(workflows.map((w) => [w.id, w])), [workflows]);
  // Tabs: General plus one per active tramo, by sortOrder.
  const tramoTabs = useMemo(
    () => [...workflows].filter((w) => w.active).sort((a, b) => a.sortOrder - b.sortOrder),
    [workflows]
  );
  const [tasks, setTasks] = useState<TaskListItem[]>(initialTasks);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Action errors show here, at the top of the page (FE §9).
  const [pageError, setPageError] = useState<string | null>(null);
  const [board, setBoard] = useState<TramoBoard | null>(initialBoard);
  // The project the Iniciar tramo sheet is open for (Iniciar, Agregar fases, `?project=`).
  const [startProjectId, setStartProjectId] = useState<string | null>(null);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedTaskDetail, setSelectedTaskDetail] = useState<TaskDetail | null>(null);
  const [search, setSearch] = useState("");
  const [managerFilter, setManagerFilter] = useState("");
  const [teamFilter, setTeamFilter] = useState("");
  // A built-in status or a custom one, as a status select value (see status-options.ts).
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [deliveryDateFilter, setDeliveryDateFilter] = useState("");
  const [phaseFilter, setPhaseFilter] = useState("");
  const [spaceFilter, setSpaceFilter] = useState("");
  // Finished tasks are hidden by default so the list stays short to read.
  const [showCompleted, setShowCompleted] = useState(false);
  const [view, setView] = useState<"activas" | "archivadas">("activas");

  const [authenticatedUser] = useState(() => getCurrentAuthenticatedUser());
  const capabilities = useMemo(() => resolveActivitiesCapabilities(authenticatedUser), [authenticatedUser]);
  const viewerId = authenticatedUser?.member.id || "";

  // The tramo's active fase catalog: strip, Fase filter, quick-add and Nueva tarea.
  const phases = useMemo(() => activePhasesOf(workflow), [workflow]);
  const staffNames = useMemo(() => initialStaff.map((m) => m.name), [initialStaff]);
  const staffOptions = useMemo(() => initialStaff.map((m) => ({ id: m.id, name: m.name })), [initialStaff]);
  const nameToStaffId = useMemo(() => new Map(initialStaff.map((s) => [s.name, s.id])), [initialStaff]);

  const refresh = useCallback(async () => {
    if (!workflow && !isGeneral) return;
    try {
      const rows = await fetchTasksAction({
        ...(workflow && !isGeneral ? { workflowId: workflow.id } : {}),
        archived: view === "archivadas",
      });
      setTasks(rows);
    } catch (err) {
      console.error(err);
    }
  }, [workflow, isGeneral, view]);

  const refreshBoard = useCallback(async () => {
    if (isGeneral || !workflow) return;
    try {
      setBoard(await fetchTramoBoardAction(workflow.id));
    } catch (err) {
      console.error(err);
    }
  }, [workflow, isGeneral]);

  useEffect(() => {
    // Same as the task list: hydrate the board when the RSC couldn't.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!initialBoard) void refreshBoard();
  }, [initialBoard, refreshBoard]);

  // `?project={id}` (ficha "Iniciar {tramo}" / "Asignar tramo"): open the
  // Iniciar tramo sheet for that project once, ready or not, and scroll to
  // its block when it has one.
  const deepLinkHandled = useRef(false);
  useEffect(() => {
    if (deepLinkHandled.current || isGeneral || !workflow || !projectFromQuery) return;
    deepLinkHandled.current = true;
    if (capabilities.canCreateActivity) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStartProjectId(projectFromQuery);
    }
    const block = typeof document !== "undefined" ? document.getElementById(projectBlockDomId(projectFromQuery)) : null;
    block?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }, [isGeneral, workflow, projectFromQuery, capabilities.canCreateActivity]);

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
      setPageError(actionErrorText(err, { tramoName: workflow?.name }));
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

  // Fase strip: open tasks per fase of this tramo (active view only).
  const openByPhase = useMemo(
    () => (view !== "activas" || isGeneral ? {} : openTasksByPhase(tasks)),
    [tasks, view, isGeneral]
  );

  // "Nueva tarea" and the quick-add row list every active project, not only
  // the ones whose current tramo is this one: a project already in a later
  // tramo can still need a task of this one logged retroactively (#420).
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

  const spaceOptions = useMemo(() => spaceFilterOptions(tasks), [tasks]);
  const spacesByProject = useMemo(() => spacesByProjectOf(tasks), [tasks]);
  // Each project's full espacio list (also espacios with no tasks yet), loaded
  // on demand for the Espacio selects of the New task modal and the drawer.
  const [loadedSpaces, setLoadedSpaces] = useState<Record<string, Array<{ id: string; name: string }>>>({});
  const loadProjectSpaces = useCallback(async (projectIds: string[]) => {
    const ids = Array.from(new Set(projectIds.filter(Boolean)));
    if (ids.length === 0) return;
    const rows = await Promise.all(
      ids.map((id) =>
        fetchProjectSpacesAction(id)
          .then((spaces) => [id, spaces.map((sp) => ({ id: sp.id, name: sp.name }))] as const)
          .catch((err) => {
            console.error(err);
            return null;
          })
      )
    );
    setLoadedSpaces((cur) => {
      const next = { ...cur };
      for (const row of rows) if (row) next[row[0]] = row[1];
      return next;
    });
  }, []);
  const projectSpaces = useMemo(() => ({ ...spacesByProject, ...loadedSpaces }), [spacesByProject, loadedSpaces]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (newTaskOpen) void loadProjectSpaces(projectOptions.map((p) => p.id));
  }, [newTaskOpen, projectOptions, loadProjectSpaces]);
  const drawerProjectId = activeTaskDetail?.projectId ?? "";
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (drawerProjectId) void loadProjectSpaces([drawerProjectId]);
  }, [drawerProjectId, loadProjectSpaces]);
  // Fase name for a task: its tramo's catalog first, else the name on the row.
  const phaseNameOf = useCallback(
    (task: TaskListItem): string => {
      const catalog = task.workflowId ? workflowsById.get(task.workflowId)?.phases ?? workflow?.phases : workflow?.phases;
      return catalog?.find((p) => p.id === task.phaseId)?.name ?? task.phase?.name ?? "";
    },
    [workflowsById, workflow]
  );

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
        phaseNameOf(t).toLowerCase().includes(query) ||
        (t.manager?.name ?? "").toLowerCase().includes(query) ||
        t.status.toLowerCase().includes(query);
      const matchesProject = !projectFromQuery || t.project.id === projectFromQuery;
      const matchesManager = !managerFilter || t.manager?.id === managerFilter;
      const matchesTeam = !teamFilter || t.support.some((s) => s.id === teamFilter);
      const matchesStatus = !statusFilter || statusSelectValue(t) === statusFilter;
      // An explicit status filter wins, so picking Completado still shows those tasks.
      const matchesCompletion = showCompleted || !!statusFilter || !isTaskClosed(t);
      const matchesDeliveryDate = !deliveryDateFilter || (t.deliveryDate || "") === deliveryDateFilter;
      const matchesPhase = !phaseFilter || t.phaseId === phaseFilter;
      const matchesSpace = !spaceFilter || t.spaceId === spaceFilter;
      return (
        matchesPhase &&
        matchesSpace &&
        matchesSearch &&
        matchesProject &&
        matchesManager &&
        matchesTeam &&
        matchesStatus &&
        matchesCompletion &&
        matchesDeliveryDate
      );
    });
  }, [
    tasks,
    search,
    projectFromQuery,
    managerFilter,
    teamFilter,
    statusFilter,
    showCompleted,
    deliveryDateFilter,
    phaseFilter,
    spaceFilter,
    phaseNameOf,
  ]);

  // Filters other than Proyecto (which also carries the `?project=` deep link).
  const hasActiveFilters = Boolean(
    search ||
      managerFilter ||
      teamFilter ||
      statusFilter ||
      deliveryDateFilter ||
      phaseFilter ||
      spaceFilter
  );

  function clearFilters() {
    setSearch("");
    updateProjectFilter("");
    setManagerFilter("");
    setTeamFilter("");
    setStatusFilter("");
    setDeliveryDateFilter("");
    setPhaseFilter("");
    setSpaceFilter("");
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

  async function addTask(values: NewTaskFormValues) {
    // A task always belongs to this page's tramo; creating one never starts it.
    if (!workflow) return;
    await runAction(
      () =>
        createUserTaskAction({
          projectId: values.projectId,
          title: values.title,
          notes: values.notes || null,
          workflowId: workflow.id,
          phaseId: values.phaseId,
          spaceId: values.spaceId,
          managerId: values.managerId,
          supportIds: values.supportIds,
          priority: DEFAULT_PRIORITY,
          commitmentDate: values.commitmentDate || null,
          reviewDate: values.reviewDate || null,
        }),
      () => void refresh()
    );
  }

  async function addQuickTask(projectId: string, blockTasks: TaskListItem[]) {
    const title = (quickTitles[projectId] ?? "").trim();
    if (!title) return;
    setQuickTitles((prev) => ({ ...prev, [projectId]: "" }));
    await addTask({
      projectId,
      title,
      phaseId: quickPhases[projectId] ?? defaultQuickAddPhaseId(blockTasks, phases),
      spaceId: null,
      managerId: null,
      supportIds: [],
      notes: "",
      commitmentDate: "",
      reviewDate: "",
    });
  }

  async function reorderProjectTasks(projectId: string, blockTasks: TaskListItem[], orderedTaskIds: string[]) {
    // Drag only within a fase: a drop into another fase is refused and the
    // row snaps back (the rows were never changed locally).
    if (isTramoPage && !isWithinPhaseReorder(blockTasks, orderedTaskIds)) return;
    try {
      await reorderProjectTasksAction(projectId, orderedTaskIds);
      await refresh();
    } catch (err) {
      console.error(err);
    }
  }

  async function reloadAfterDependencyChange() {
    if (!selectedTaskId) return;
    try {
      const detail = await fetchTaskAction(selectedTaskId);
      setSelectedTaskDetail(detail);
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
      console.error(err);
      setPageError(actionErrorText(err));
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
      console.error(err);
      setPageError(actionErrorText(err));
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
      { key: "phase", header: "Fase", getValue: (t) => phaseNameOf(t) },
      { key: "title", header: "Actividad", getValue: (t) => t.title },
      { key: "manager", header: "Responsable", getValue: (t) => t.manager?.name || "Sin responsable" },
      { key: "reviewDate", header: "Próxima revisión", isDate: true, getValue: (t) => t.reviewDate || "" },
      { key: "deliveryDate", header: "Fecha de entrega", isDate: true, getValue: (t) => t.deliveryDate || "" },
      { key: "status", header: "Estatus", getValue: (t) => taskStatusLabel(t) },
    ],
    [phaseNameOf]
  );

  async function exportActivities(format: "xlsx" | "pdf") {
    await exportTableData({
      moduleName: `Actividades ${pageLabel}`,
      fileName: `actividades-${slug}-${Date.now()}`,
      format,
      companyName: generalSettings.company.tradeName || generalSettings.company.legalName,
      columns: exportColumns,
      rows: filteredTasks,
      landscape: true,
    });
  }

  const [quickTitles, setQuickTitles] = useState<Record<string, string>>({});
  // Quick-add fase per project block; unset = defaultQuickAddPhaseId.
  const [quickPhases, setQuickPhases] = useState<Record<string, string | null>>({});

  const projectGroups = useMemo(() => {
    // General: one block per project with its tramo chips, rows sorted by
    // tramo order, then fase order.
    if (isGeneral) return buildGeneralProjectBlocks(filteredTasks, initialProjects);
    // Tramo page: one block per project with this tramo started or with
    // tasks in it, by project name; rows by fase, then manual order.
    type TramoBlock = {
      id: string;
      name: string;
      tramos: ProjectListItem["tramos"];
      /** This tramo is the project's current one ("Tramo actual"). */
      current: boolean;
      tasks: TaskListItem[];
    };
    const projectsById = new Map(initialProjects.map((p) => [p.id, p]));
    const isCurrent = (projectId: string) =>
      Boolean(workflow) && projectsById.get(projectId)?.currentWorkflowId === workflow?.id;
    const groups = new Map<string, TramoBlock>();
    for (const task of filteredTasks) {
      const group =
        groups.get(task.project.id) ??
        { id: task.project.id, name: task.project.name, tramos: [], current: isCurrent(task.project.id), tasks: [] };
      group.tasks.push(task);
      groups.set(task.project.id, group);
    }
    // Started projects with no tasks yet still get a block, unless filters
    // narrow the list (then only matching tasks show).
    if (!hasActiveFilters && view === "activas") {
      for (const started of board?.started ?? []) {
        if (groups.has(started.projectId)) continue;
        if (projectFromQuery && started.projectId !== projectFromQuery) continue;
        const project = projectsById.get(started.projectId);
        if (!project) continue;
        groups.set(project.id, { id: project.id, name: project.name, tramos: [], current: isCurrent(project.id), tasks: [] });
      }
    }
    return [...groups.values()]
      .map((group) => ({ ...group, tasks: sortTramoTasks(group.tasks, phases) }))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [filteredTasks, isGeneral, initialProjects, workflow, board, phases, hasActiveFilters, view]);

  // Local calendar day (YYYY-MM-DD), to flag late dates in the table.
  const today = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  const columns = useMemo<ColumnDef<TaskListItem, unknown>[]>(() => {
    return [
      createSelectionColumn<TaskListItem>({
        getId: (t) => t.id,
        selectedIds: selected,
        onToggle: toggle,
        onToggleAll: toggleAll,
      }),
      // Only General mixes tramos in one block.
      ...(isGeneral
        ? [
            {
              id: "tramo",
              header: "Tramo",
              accessorFn: (t: TaskListItem) => t.workflow?.name ?? "",
              cell: ({ row }: CellContext<TaskListItem, unknown>) => <TramoBadge tramo={row.original.workflow} />,
            },
          ]
        : []),
      {
        id: "phase",
        header: "Fase",
        accessorFn: (t) => phaseNameOf(t),
        cell: ({ row }: CellContext<TaskListItem, unknown>) => {
          const task = row.original;
          const currentName = phaseNameOf(task);
          const display = (
            <span className="block max-w-24 truncate text-sm" title={currentName || undefined}>
              {currentName || <span className="text-muted-foreground">{NO_PHASE_LABEL}</span>}
            </span>
          );
          // The task's own tramo catalog (General mixes tramos), active fases
          // only, plus the task's current fase when it was deactivated.
          const taskWorkflow = task.workflowId ? (workflowsById.get(task.workflowId) ?? (workflow?.id === task.workflowId ? workflow : null)) : null;
          const taskPhases = activePhasesOf(taskWorkflow);
          if (!capabilities.canReorderPhases || taskPhases.length === 0) return display;
          const items: Array<{ id: string; label: string }> = taskPhases.map((p) => ({ id: p.id, label: p.name }));
          if (task.phaseId && !taskPhases.some((p) => p.id === task.phaseId)) {
            items.push({ id: task.phaseId, label: `${currentName || "Fase"} (inactiva)` });
          }
          return (
            <InlineEditable
              value={task.phaseId ?? ""}
              onCommit={(value) => value && value !== task.phaseId && updateField(task, { phaseId: value })}
              commitOnChange
              renderDisplay={() => display}
              renderEditor={({ onChange, onBlur }) => (
                <Select
                  defaultOpen
                  items={Object.fromEntries(items.map((i) => [i.id, i.label]))}
                  value={task.phaseId ?? ""}
                  onValueChange={(next) => {
                    onChange(next as string);
                    onBlur();
                  }}
                >
                  <SelectTrigger className="w-full text-sm" aria-label="Fase"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {items.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
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
        accessorFn: (t) => t.project.name,
        // The project a task belongs to is set at creation and can't be moved
        // afterwards (TaskPatch has no projectId) — display only.
        cell: ({ row }: CellContext<TaskListItem, unknown>) => (
          <span className="font-medium">{row.original.project.name}</span>
        ),
      },
      {
        id: "title",
        header: "Tarea",
        accessorFn: (t) => t.title,
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
                <SubtaskOfLine task={task} />
              </div>
              <SubtaskCountBadge task={task} />
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
        accessorFn: (t) => t.manager?.name ?? "",
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
        accessorFn: (t) => taskStatusLabel(t),
        cell: ({ row }: CellContext<TaskListItem, unknown>) => {
          const task = row.original;
          const canChange = canChangeActivityStatus({
            capabilities,
            task: { manager: task.manager, support: task.support },
            viewerId,
          });
          return (
            <div className="flex items-center gap-2">
              <TaskStatusCell
                task={task}
                customStatuses={customStatuses}
                canChange={canChange}
                onChange={(value) => void changeStatus(task, value)}
              />
              <WaitingBadge waitingOn={task.waitingOn} />
            </div>
          );
        },
      },
      {
        id: "commitmentDate",
        accessorFn: (t) => t.commitmentDate ?? "",
        header: "Compromiso",
        cell: ({ row }: CellContext<TaskListItem, unknown>) => {
          const task = row.original;
          return (
            <InlineEditable
              value={task.commitmentDate || ""}
              onCommit={(value) => updateField(task, { commitmentDate: value || null })}
              renderDisplay={(value) => (
                <span className={cn("text-sm", isDueDateLate(value, today, task) && "text-destructive")}>
                  {value || "Sin fecha"}
                </span>
              )}
              renderEditor={({ value, onChange, onBlur, onKeyDown }) => (
                <Input autoFocus type="date" value={value} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} onKeyDown={onKeyDown} className="text-sm" />
              )}
            />
          );
        },
      },
      {
        id: "reviewDate",
        accessorFn: (t) => t.reviewDate ?? "",
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
        accessorFn: (t) => t.deliveryDate ?? "",
        header: "Fecha de entrega",
        cell: ({ row }: CellContext<TaskListItem, unknown>) => {
          const task = row.original;
          return (
            <InlineEditable
              value={task.deliveryDate || ""}
              onCommit={(value) => updateField(task, { deliveryDate: value || null })}
              renderDisplay={(value) => (
                <span className={cn("text-sm", isDueDateLate(value, today, task) && "text-destructive")}>
                  {value || "Sin fecha"}
                </span>
              )}
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
  }, [workflow, workflowsById, phaseNameOf, isGeneral, phases, selected, capabilities, viewerId, staffNames, nameToStaffId, today]);

  // The block already names its project, so that column is redundant.
  const groupedColumns = useMemo(() => columns.filter((c) => c.id !== "project"), [columns]);
  const canReorder = capabilities.canReorderPhases && view === "activas";
  const isAdmin = authenticatedUser?.access === "Administrador";

  function openStartSheet(projectId: string) {
    setPageError(null);
    setStartProjectId(projectId);
  }

  async function refreshAfterStart() {
    await Promise.all([refresh(), refreshBoard()]);
  }

  async function handleTramoStarted(result: StartTramoResult) {
    setStartProjectId(null);
    notifyTramoStarted(result, { refresh: refreshAfterStart });
    await refreshAfterStart();
  }

  return (
    <div>
      <PageHeader
        title={pageLabel}
        description={pageDescription}
        actions={
          <Tabs value={slug} onValueChange={(v) => router.push(`/actividades/${v}`)}>
            <TabsList>
              <TabsTrigger value={GENERAL_SLUG}>{GENERAL_LABEL}</TabsTrigger>
              {tramoTabs.map((w) => (
                <TabsTrigger key={w.id} value={w.key}>
                  {w.name}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        }
      />

      {pageError ? (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription className="flex items-center justify-between gap-2">
            <span>{pageError}</span>
            <Button variant="ghost" size="sm" onClick={() => setPageError(null)}>
              Cerrar
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      <>
          {isTramoPage ? <PhaseStrip phases={phases} openByPhase={openByPhase} /> : null}

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
              {capabilities.canCreateActivity && isTramoPage ? (
                <Button onClick={() => setNewTaskOpen(true)}>+ Nueva tarea</Button>
              ) : null}
            </div>
          </div>

          {isTramoPage && workflow ? (
            <div className="mb-4 flex flex-col gap-4">
              {/* Listos para iniciar (StartTramoSheet issue owns the card and the sheet). */}
              <ReadyToStartCard
                workflow={workflow}
                ready={board?.ready ?? []}
                canStart={capabilities.canCreateActivity}
                onStart={openStartSheet}
              />
            </div>
          ) : null}

          {isTramoPage ? <UpcomingProjects upcoming={board?.upcoming ?? []} /> : null}

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

            {isTramoPage && phases.length > 0 ? (
              <Select
                items={{ __all__: "Fase", ...Object.fromEntries(phases.map((p) => [p.id, p.name])) }}
                value={phaseFilter || "__all__"}
                onValueChange={(v) => setPhaseFilter(v === "__all__" ? "" : (v as string))}
              >
                <SelectTrigger className="h-9 w-auto" aria-label="Filtrar por fase"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Fase</SelectItem>
                  {phases.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}

            {spaceOptions.length > 0 ? (
              <Select
                items={{ __all__: "Espacio", ...Object.fromEntries(spaceOptions.map((o) => [o.id, o.label])) }}
                value={spaceFilter || "__all__"}
                onValueChange={(v) => setSpaceFilter(v === "__all__" ? "" : (v as string))}
              >
                <SelectTrigger className="h-9 w-auto" aria-label="Filtrar por espacio"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Espacio</SelectItem>
                  {spaceOptions.map((o) => (
                    <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}

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
              emptyMessage={
                tasks.length === 0
                  ? isGeneral
                    ? "No hay tareas."
                    : `Sin tareas en ${pageLabel}.`
                  : "No hay tareas que coincidan con los filtros actuales."
              }
              wrapperClassName={selected.size > 0 ? "rounded-t-none border-t-0" : undefined}
            />
          ) : (
            <AccordionPanels
              groups={projectGroups.map((group) => ({
                id: group.id,
                title: group.name,
                count: group.tasks.length,
                anchorId: projectBlockDomId(group.id),
                badges:
                  isGeneral && group.tramos.length > 0 ? (
                    <TramoChips tramos={group.tramos} />
                  ) : "current" in group && group.current ? (
                    <Badge variant="outline">Tramo actual</Badge>
                  ) : undefined,
                actions:
                  isTramoPage && capabilities.canCreateActivity && view === "activas" ? (
                    <>
                      {workflow ? (
                        <UndoStartTramoButton
                          workflow={workflow}
                          projectName={group.name}
                          started={board?.started.find((s) => s.projectId === group.id)}
                          onUndone={refreshAfterStart}
                          onError={setPageError}
                        />
                      ) : null}
                      <Button variant="ghost" size="sm" onClick={() => openStartSheet(group.id)}>
                        Agregar fases
                      </Button>
                    </>
                  ) : undefined,
                content: (
                  <>
                    <DataTable
                      columns={groupedColumns}
                      data={group.tasks}
                      getRowId={(row) => row.id}
                      wrapperClassName="rounded-none! border-x-0! border-b-0! shadow-none!"
                      onReorderRows={
                        canReorder ? (ids) => void reorderProjectTasks(group.id, group.tasks, ids) : undefined
                      }
                    />
                    {capabilities.canCreateActivity && view === "activas" && isTramoPage ? (
                      <div className="flex items-center border-t border-border">
                        {phases.length > 0 ? (
                          <Select
                            items={Object.fromEntries(phases.map((p) => [p.id, p.name]))}
                            value={quickPhases[group.id] ?? defaultQuickAddPhaseId(group.tasks, phases) ?? ""}
                            onValueChange={(v) => setQuickPhases((prev) => ({ ...prev, [group.id]: v as string }))}
                          >
                            <SelectTrigger
                              className="h-10 w-44 shrink-0 rounded-none border-0 border-r border-border text-sm shadow-none"
                              aria-label={`Fase de la nueva tarea en ${group.name}`}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {phases.map((p) => (
                                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : null}
                        <Input
                          value={quickTitles[group.id] ?? ""}
                          onChange={(e) => setQuickTitles((prev) => ({ ...prev, [group.id]: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              void addQuickTask(group.id, group.tasks);
                            }
                          }}
                          placeholder="+ Nueva tarea (Enter para añadir)"
                          aria-label={`Nueva tarea en ${group.name}`}
                          className="h-10 flex-1 rounded-none border-0 text-sm shadow-none"
                        />
                      </div>
                    ) : null}
                  </>
                ),
              }))}
            />
          )}

          <NewTaskModal
            open={newTaskOpen}
            projects={projectOptions}
            staff={staffOptions}
            phases={phases}
            spacesByProject={projectSpaces}
            onClose={() => setNewTaskOpen(false)}
            onSave={(values) => {
              void addTask(values);
              setNewTaskOpen(false);
            }}
          />

          {isTramoPage && workflow ? (
            <StartTramoSheet
              open={startProjectId !== null}
              projectId={startProjectId}
              workflow={workflow}
              viewerId={viewerId}
              isAdmin={isAdmin}
              staff={initialStaff}
              onClose={() => setStartProjectId(null)}
              onStarted={(result) => void handleTramoStarted(result)}
            />
          ) : null}

          <TaskDrawer
            open={selectedTaskId !== null}
            task={activeTaskDetail}
            staffOptions={staffOptions}
            onClose={() => setSelectedTaskId(null)}
            onOpenTask={setSelectedTaskId}
            onDependenciesChange={() => void reloadAfterDependencyChange()}
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
            phases={
              activeTaskDetail?.workflowId
                ? activePhasesOf(
                    workflowsById.get(activeTaskDetail.workflowId) ??
                      (workflow?.id === activeTaskDetail.workflowId ? workflow : null)
                  )
                : undefined
            }
            spaces={activeTaskDetail ? projectSpaces[activeTaskDetail.projectId] : undefined}
            tramos={workflows.filter((w) => w.active)}
            onChangePhase={
              capabilities.canReorderPhases
                ? (phaseId) => {
                    if (activeTaskDetail) void updateField(activeTaskDetail, { phaseId });
                  }
                : undefined
            }
            onChangeSpace={(spaceId) => {
              if (activeTaskDetail) void updateField(activeTaskDetail, { spaceId });
            }}
            onChangeTramo={
              capabilities.canReorderPhases
                ? (workflowId) => {
                    if (activeTaskDetail) void updateField(activeTaskDetail, { workflowId });
                  }
                : undefined
            }
          />
      </>
    </div>
  );
}
