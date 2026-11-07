"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { Alert, AlertDescription } from "@/components/ui/shadcn/alert";
import { Button } from "@/components/ui/shadcn/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/shadcn/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/shadcn/table";
import NewTaskModal, { type NewTaskFormValues } from "@/components/tareas/NewTaskModal";
import { TaskStatusCell } from "@/components/tareas/TaskStatusCell";
import {
  assignTaskAction,
  createAdminTaskAction,
  fetchAdminTasksAction,
  setTaskCustomStatusAction,
  setTaskStatusAction,
} from "@/lib/actions/tasks-actions";
import { fetchProjectsAction } from "@/lib/actions/projects-actions";
import { fetchStaffAction } from "@/lib/actions/staff-actions";
import { fetchTaskStatusesAction } from "@/lib/actions/task-statuses-actions";
import { isStaffAdministrator } from "@/lib/auth/access-role";
import { getCurrentAuthenticatedUser } from "@/lib/auth/auth-service";
import { canSeeAdminData } from "@/lib/auth/permissions";
import { flowErrorCode } from "@/lib/project-flow/errors";
import { isDueDateLate, parseStatusValue } from "@/lib/tasks/status-options";
import { cn } from "@/lib/utils";
import type { Staff, TaskListItem, TaskStatusOption } from "@/lib/types/core";

/** The Presale page, where every admin task is listed ("Ver todas →"). */
export const ADMIN_TASKS_PAGE = "/actividades/presale";

const NO_MANAGER = "__none__";

export const ADMIN_TASKS_EMPTY = "Nada pendiente para administración.";
export const ADMIN_TASKS_LOAD_ERROR = "No se pudieron cargar las tareas de administración.";

/** Spanish copy for an admin task action error (FE §9). */
export function adminTaskErrorText(err: unknown): string {
  switch (flowErrorCode(err)) {
    case "ASSIGNEE_NOT_ADMIN":
      return "Las tareas de administración solo se asignan a administradores.";
    case "FORBIDDEN":
      return "No tienes permiso para realizar esta acción.";
    case "NOT_FOUND":
      return "Ya no existe. Recarga la página.";
    case "ADMIN_TASK":
      return "Las tareas de administración no tienen fase ni espacio.";
    case "INVALID":
      return "Faltan datos o no son válidos. Revisa el formulario e intenta de nuevo.";
    default:
      return "No se pudo completar la acción. Intenta de nuevo.";
  }
}

/** Active administrators only: the responsable pickers of admin tasks (RD-12). */
export function adminStaffOptions(staff: Staff[]): Array<{ id: string; name: string }> {
  return staff
    .filter((s) => s.active && isStaffAdministrator(s.role, s.email))
    .map((s) => ({ id: s.id, name: s.name }));
}

const SHORT_DATE = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short" });

function formatDate(value: string | null): string {
  if (!value) return "—";
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? value : SHORT_DATE.format(parsed).replace(".", "");
}

function todayIso(): string {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${m}-${d}`;
}

export interface AdminTasksCardProps {
  /** RSC-provided on Presale; omitted on the dashboard (self-fetch). */
  initialTasks?: TaskListItem[];
  /** Dashboard: 5. Adds the "Ver todas →" link to the Presale page. */
  limit?: number;
  onOpenTask?: (id: string) => void;
}

/** "Para administración": the open admin tasks, for administrators only (FE §3.1, §3.6, §4.3). */
export function AdminTasksCard({ initialTasks, limit, onOpenTask }: AdminTasksCardProps) {
  const [authenticatedUser] = useState(() => getCurrentAuthenticatedUser());
  const isAdmin = canSeeAdminData(authenticatedUser);

  const [tasks, setTasks] = useState<TaskListItem[] | null>(initialTasks ?? null);
  const [isLoading, setIsLoading] = useState(initialTasks === undefined);
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [customStatuses, setCustomStatuses] = useState<TaskStatusOption[]>([]);
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [modalOpen, setModalOpen] = useState(false);

  const reload = useCallback(async () => {
    setIsLoading(true);
    setLoadError(false);
    try {
      setTasks(await fetchAdminTasksAction());
    } catch (err) {
      console.error(err);
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin || initialTasks !== undefined) return;
    // Loaded after first paint so the dashboard RSC stays shared (FE §3.6).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [isAdmin, initialTasks, reload]);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    fetchStaffAction()
      .then((rows) => {
        if (!cancelled) setStaff(rows);
      })
      .catch((err) => console.error(err));
    fetchTaskStatusesAction()
      .then((rows) => {
        if (!cancelled) setCustomStatuses(rows);
      })
      .catch((err) => console.error(err));
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  const adminOptions = useMemo(() => adminStaffOptions(staff), [staff]);

  if (!isAdmin) return null;

  async function run(fn: () => Promise<unknown>) {
    setActionError(null);
    try {
      await fn();
      await reload();
    } catch (err) {
      console.error(err);
      setActionError(adminTaskErrorText(err));
    }
  }

  function openModal() {
    setModalOpen(true);
    if (projects.length > 0) return;
    fetchProjectsAction()
      .then((rows) => setProjects(rows.filter((p) => p.status === "activo").map((p) => ({ id: p.id, name: p.name }))))
      .catch((err) => console.error(err));
  }

  function createTask(values: NewTaskFormValues) {
    void run(() =>
      createAdminTaskAction({
        projectId: values.projectId,
        title: values.title,
        notes: values.notes || null,
        managerId: values.managerId,
        supportIds: values.supportIds,
        commitmentDate: values.commitmentDate || null,
        reviewDate: values.reviewDate || null,
      })
    );
  }

  function changeStatus(task: TaskListItem, value: string) {
    const parsed = parseStatusValue(value);
    void run(() =>
      parsed.kind === "custom"
        ? setTaskCustomStatusAction(task.id, parsed.id)
        : setTaskStatusAction(task.id, parsed.status)
    );
  }

  function changeManager(task: TaskListItem, managerId: string | null) {
    void run(() => assignTaskAction(task.id, managerId));
  }

  const today = todayIso();
  const rows = tasks ?? [];
  const visible = limit ? rows.slice(0, limit) : rows;

  return (
    <Card className="min-w-0">
      <CardHeader className="border-b">
        <CardTitle className="font-semibold">Para administración</CardTitle>
        <CardAction className="flex items-center gap-3">
          {limit ? (
            <Link href={ADMIN_TASKS_PAGE} className="text-sm text-muted-foreground hover:text-foreground">
              Ver todas →
            </Link>
          ) : null}
          <Button size="sm" variant="outline" onClick={openModal}>
            + Tarea de administración
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="px-0">
        {actionError ? (
          <Alert variant="destructive" className="mx-4 mb-3 w-auto">
            <AlertDescription>{actionError}</AlertDescription>
          </Alert>
        ) : null}

        {isLoading && tasks === null ? (
          <div className="space-y-2 px-4" aria-label="Cargando tareas de administración">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-2/3" />
          </div>
        ) : loadError && tasks === null ? (
          <Alert variant="destructive" className="mx-4 w-auto">
            <AlertDescription className="flex items-center justify-between gap-3">
              <span>{ADMIN_TASKS_LOAD_ERROR}</span>
              <Button size="sm" variant="outline" onClick={() => void reload()}>
                Reintentar
              </Button>
            </AlertDescription>
          </Alert>
        ) : visible.length === 0 ? (
          <p className="px-4 text-sm text-muted-foreground">{ADMIN_TASKS_EMPTY}</p>
        ) : (
          <Table className="min-w-[640px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">Proyecto</TableHead>
                <TableHead>Tarea</TableHead>
                <TableHead>Responsable</TableHead>
                <TableHead>Compromiso</TableHead>
                <TableHead className="pr-4">Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((task) => {
                const late = isDueDateLate(task.commitmentDate, today, task);
                // An earlier non-admin assignee (legacy data) still shows by name.
                const managerItems: Record<string, string> = {
                  [NO_MANAGER]: "Sin responsable",
                  ...Object.fromEntries(adminOptions.map((o) => [o.id, o.name])),
                  ...(task.manager && !adminOptions.some((o) => o.id === task.manager?.id)
                    ? { [task.manager.id]: task.manager.name }
                    : {}),
                };
                return (
                  <TableRow key={task.id}>
                    <TableCell className="pl-4">
                      <Link href={`/proyectos/${task.project.id}/ficha`} className="hover:underline">
                        {task.project.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {onOpenTask ? (
                        <Button variant="link" className="h-auto p-0 font-medium" onClick={() => onOpenTask(task.id)}>
                          {task.title}
                        </Button>
                      ) : (
                        <span className="font-medium">{task.title}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Select
                        items={managerItems}
                        value={task.manager?.id ?? NO_MANAGER}
                        onValueChange={(v) => {
                          const next = v as string;
                          changeManager(task, next && next !== NO_MANAGER ? next : null);
                        }}
                      >
                        <SelectTrigger aria-label={`Responsable de ${task.title}`} className="w-44">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_MANAGER}>Sin responsable</SelectItem>
                          {adminOptions.map((o) => (
                            <SelectItem key={o.id} value={o.id}>
                              {o.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className={cn("tabular-nums", late && "text-destructive")}>
                      {formatDate(task.commitmentDate)}
                    </TableCell>
                    <TableCell className="pr-4">
                      <TaskStatusCell
                        task={task}
                        customStatuses={customStatuses}
                        canChange
                        onChange={(value) => changeStatus(task, value)}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {modalOpen ? (
        <NewTaskModal
          key={projects.length}
          open={modalOpen}
          mode="admin"
          projects={projects}
          staff={adminOptions}
          onClose={() => setModalOpen(false)}
          onSave={(values) => {
            createTask(values);
            setModalOpen(false);
          }}
        />
      ) : null}
    </Card>
  );
}

export default AdminTasksCard;
