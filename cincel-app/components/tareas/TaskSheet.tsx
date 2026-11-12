"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { FormSheet } from "@/components/patterns/FormSheet";
import TaskDependencies from "@/components/tareas/TaskDependencies";
import {
  TASK_ATTACHMENT_ACCEPT,
  TaskAttachmentGrid,
  TaskPhaseSelect,
  TaskSpaceSelect,
  TaskTramoSelect,
  sortTaskHistory,
  taskAttachmentError,
  useTaskSheetCatalogs,
} from "@/components/tareas/task-detail-fields";
import {
  useAddTaskAttachmentMutation,
  useAddTaskCommentMutation,
  useAssignTaskMutation,
  useTaskStatusMutation,
  useEstimatedHoursMutation,
  useUpdateTaskMutation,
} from "@/components/tareas/task-sheet-mutations";
import TaskSubtasks from "@/components/tareas/TaskSubtasks";
import { WaitingBadge } from "@/components/tareas/TaskRowMeta";
import { HistoryEventList } from "@/components/ui/HistoryEventList";
import { PEOPLE_EMPTY } from "@/components/widgets/editable-cell";
import { ImportDataPanel, useImportData } from "@/components/ui/ImportDataPanel";
import { Button } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";
import { Textarea } from "@/components/ui/shadcn/textarea";
import { StatusChip } from "@/components/widgets/StatusChip";
import { TramoBadge } from "@/components/widgets/TramoBadge";
import { canChangeActivityStatus, resolveActivitiesCapabilities } from "@/lib/auth/permissions";
import { cachedDateTimeFormat } from "@/lib/dates/zoned-formatters";
import { actionErrorText } from "@/lib/errors";
import { mutationErrorText } from "@/lib/query/mutation";
import { taskSheetOptions } from "@/lib/query/options/tareas";
import { selectCurrentUser, useSessionStore } from "@/lib/stores/session-store";
import { isDueDateLate, parseStatusValue, statusSelectItems, statusSelectValue } from "@/lib/tasks/status-options";
import type { StaffRef, TaskPatch, TaskPriority, TaskRef } from "@/lib/types/core";

import { TaskHoursField } from "./TaskHoursField";
import { HOURS_FIELD_LABEL, SUPPORT_COLUMN_LABEL } from "./task-table-copy";

export type TaskSheetProps = { taskId: string; onClose(): void };

/** The search param that opens the sheet over `/tareas` (FE §2.1). */
export const TASK_SHEET_PARAM = "tarea";

const PRIORITY_LABEL: Record<TaskPriority, string> = { alta: "Alta", media: "Media", baja: "Baja" };
const PRIORITIES: TaskPriority[] = ["alta", "media", "baja"];
const NO_MANAGER = "__none__";

const NOT_FOUND_COPY = "No encontramos esta tarea. Puede que ya no exista o que no tengas acceso a ella.";

/** `?…` of `search` with `tarea` set to `taskId`, or removed when `taskId` is null (other params kept). */
export function taskSheetSearch(search: string | URLSearchParams, taskId: string | null): string {
  const next = new URLSearchParams(typeof search === "string" ? search : search.toString());
  if (taskId) next.set(TASK_SHEET_PARAM, taskId);
  else next.delete(TASK_SHEET_PARAM);
  const qs = next.toString();
  return qs ? `?${qs}` : "";
}

/** Href that opens the sheet for `taskId` over the current view (`/tareas?…&tarea=<id>`). */
export function taskSheetHref(pathname: string, search: string | URLSearchParams, taskId: string): string {
  return `${pathname}${taskSheetSearch(search, taskId)}`;
}

/**
 * Shallow URL change (`history.pushState` / `replaceState`): Next keeps
 * `useSearchParams` in sync without a server render, so the view under the
 * sheet is not re-rendered or refetched.
 */
function shallowNavigate(mode: "push" | "replace", href: string): void {
  const url = `${href}${window.location.hash}`;
  if (mode === "push") window.history.pushState(null, "", url);
  else window.history.replaceState(null, "", url);
}

/**
 * Mounts `TaskSheet` from the URL: open while `?tarea=<id>` is present, closed
 * otherwise. Render it next to the view (never around it) so the view stays
 * mounted. Closing removes `tarea` with `history.replaceState` (no server
 * render); browser back pops the entry that added it, which closes the sheet
 * too.
 */
export function TaskSheetRoute() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const taskId = searchParams.get(TASK_SHEET_PARAM);

  const close = useCallback(() => {
    shallowNavigate("replace", `${pathname}${taskSheetSearch(searchParams, null)}`);
  }, [pathname, searchParams]);

  if (!taskId) return null;
  return <TaskSheet taskId={taskId} onClose={close} />;
}

// ── "@" mentions ────────────────────────────────────────────────────────────

/** Lower case without accents, for matching names. */
function fold(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/**
 * The mention being typed at `caret`: the text after an "@" that starts the
 * comment or follows a space, up to the caret (no line breaks). Null when the
 * caret isn't inside a mention.
 */
export function activeMention(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf("@");
  if (at < 0) return null;
  if (at > 0 && !/\s/.test(before[at - 1])) return null;
  const query = before.slice(at + 1);
  if (query.includes("\n") || query.length > 40) return null;
  return { start: at, query };
}

/** Staff whose name contains the query (case and accent insensitive), names starting with it first. */
export function mentionSuggestions(staff: StaffRef[], query: string, limit = 6): StaffRef[] {
  const q = fold(query.trim());
  const matches = staff.filter((s) => fold(s.name).includes(q));
  matches.sort((a, b) => Number(!fold(a.name).startsWith(q)) - Number(!fold(b.name).startsWith(q)));
  return matches.slice(0, limit);
}

/** `text` with the mention at `start…caret` replaced by "@Nombre Apellido ", and the new caret. */
export function insertMention(text: string, start: number, caret: number, name: string): { text: string; caret: number } {
  const inserted = `@${name} `;
  return { text: text.slice(0, start) + inserted + text.slice(caret), caret: start + inserted.length };
}

type CommentComposerProps = {
  staff: StaffRef[];
  onSubmit(text: string): Promise<void>;
};

/** Comment box with "@" mentions; submits with "Comentar" or Ctrl/⌘ + Enter. */
function CommentComposer({ staff, onSubmit }: CommentComposerProps) {
  const ids = useId();
  const textareaId = `${ids}-comentario`;
  const listId = `${ids}-menciones`;
  const errorId = `${ids}-error`;
  const ref = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null);
  const [highlight, setHighlight] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const suggestions = useMemo(() => (mention ? mentionSuggestions(staff, mention.query) : []), [mention, staff]);
  const open = suggestions.length > 0;
  const active = open ? Math.min(highlight, suggestions.length - 1) : -1;

  const syncMention = (value: string, caret: number) => {
    setMention(activeMention(value, caret));
    setHighlight(0);
  };

  const pick = (person: StaffRef) => {
    const el = ref.current;
    if (!mention) return;
    const caret = el?.selectionStart ?? text.length;
    // The caret can't sit before the "@" being completed.
    const next = insertMention(text, mention.start, Math.max(caret, mention.start + 1 + mention.query.length), person.name);
    setText(next.text);
    setMention(null);
    if (el) {
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(next.caret, next.caret);
      });
    }
  };

  const submit = async () => {
    const trimmed = text.trim();
    if (!trimmed || pending) return;
    setPending(true);
    setError(null);
    try {
      await onSubmit(trimmed);
      setText("");
      setMention(null);
    } catch (err) {
      setError(mutationErrorText(err));
    } finally {
      setPending(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (open) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setHighlight((i) => (i + 1) % suggestions.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setHighlight((i) => (i - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        pick(suggestions[active]);
        return;
      }
      if (event.key === "Escape") {
        // Close the suggestions only, not the sheet.
        event.preventDefault();
        event.stopPropagation();
        setMention(null);
        return;
      }
    }
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void submit();
    }
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={textareaId}>Comentario</Label>
      <div className="relative">
        <Textarea
          ref={ref}
          id={textareaId}
          rows={2}
          value={text}
          placeholder="Escribe un comentario · usa @ para mencionar"
          aria-autocomplete="list"
          aria-controls={open ? listId : undefined}
          aria-activedescendant={open ? `${listId}-${active}` : undefined}
          aria-describedby={error ? errorId : undefined}
          aria-invalid={error ? true : undefined}
          onChange={(event) => {
            setText(event.target.value);
            syncMention(event.target.value, event.target.selectionStart ?? event.target.value.length);
          }}
          onBlur={() => setMention(null)}
          onKeyDown={onKeyDown}
        />
        {open ? (
          <ul
            id={listId}
            role="listbox"
            aria-label="Mencionar a"
            className="absolute inset-x-0 top-full z-10 mt-1 max-h-48 overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md"
          >
            {suggestions.map((person, index) => (
              <li
                key={person.id}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
                className="cursor-pointer rounded-md px-2 py-1.5 text-sm aria-selected:bg-muted"
                // Keep the focus in the textarea while picking with the mouse.
                onMouseDown={(event) => {
                  event.preventDefault();
                  pick(person);
                }}
              >
                {person.name}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {error ? (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end">
        <Button type="button" size="sm" disabled={pending || !text.trim()} onClick={() => void submit()}>
          Comentar
        </Button>
      </div>
    </div>
  );
}

// ── Data ────────────────────────────────────────────────────────────────────

/** "29 sep 2026" before the dots and case are cleaned; one formatter for the module. */
const SHORT_DATE_FORMAT = cachedDateTimeFormat("es-MX", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** Lower-case es-MX date ("29 sep 2026") for a YYYY-MM-DD value. */
export function formatShortDate(value: string): string {
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return value;
  return SHORT_DATE_FORMAT.format(new Date(Date.UTC(y, m - 1, d)))
    .replace(/\./g, "")
    .toLowerCase();
}

function todayIso(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// ── Sheet ───────────────────────────────────────────────────────────────────

/**
 * Task sheet (redesign FE §3.4, frame `TareaDetalle`): opens from
 * `/tareas?tarea=<id>` over the mounted view, on the `FormSheet` shell.
 * Loads with one `getTaskSheetData` call (`taskSheetOptions`, which seeds the
 * catalog keys the selects read); every edit is a targeted mutation that
 * writes the detail from its result or patches it optimistically. Property
 * edits save right away; title and descripción save with "Guardar cambios".
 * Fase and Espacio render only when that data exists. A task the viewer
 * can't see loads as missing (the server returns null), so nothing of it
 * reaches the page.
 */
export function TaskSheet({ taskId, onClose }: TaskSheetProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const query = useQuery(taskSheetOptions(taskId));
  const task = query.data ?? null;

  const [error, setError] = useState<string | null>(null);
  const [attachmentError, setAttachmentError] = useState("");
  const [draft, setDraft] = useState<{ taskId: string; title: string; notes: string } | null>(null);

  const user = useSessionStore(selectCurrentUser);
  const capabilities = useMemo(() => resolveActivitiesCapabilities(user), [user]);
  const viewerId = user?.member.id ?? "";

  const importData = useImportData("task", task?.id);
  const catalogs = useTaskSheetCatalogs(task);
  const { statuses, tramos, staff, phases, spaces } = catalogs;
  const taskManager = task?.manager;
  const historyNames = useMemo(() => {
    const names = new Map<string, string>();
    for (const list of [staff, phases, spaces, tramos, statuses]) for (const o of list) names.set(o.id, o.name);
    if (taskManager) names.set(taskManager.id, taskManager.name);
    return names;
  }, [staff, phases, spaces, tramos, statuses, taskManager]);

  // Hooks run before the task loads; the mutations only fire once it has.
  const target = useMemo(() => ({ id: taskId, projectId: task?.projectId ?? "" }), [taskId, task?.projectId]);
  const mutationOptions = useMemo(() => ({ onError: setError }), []);
  const update = useUpdateTaskMutation(target, mutationOptions);
  const hours = useEstimatedHoursMutation(target, mutationOptions);
  const status = useTaskStatusMutation(target, statuses, mutationOptions);
  const assign = useAssignTaskMutation(target, mutationOptions);
  const attach = useAddTaskAttachmentMutation(target, mutationOptions);
  // The composer shows its own error.
  const comment = useAddTaskCommentMutation(target, { onError: () => undefined });

  const busy = update.isPending || hours.isPending || status.isPending || assign.isPending || attach.isPending;

  // A fresh draft of title and descripción for each task opened.
  if (task && draft?.taskId !== task.id) {
    setDraft({ taskId: task.id, title: task.title, notes: task.notes ?? "" });
  }

  /** Opens another task in this sheet; a new history entry (shallow), so browser back returns here. */
  const openTask = useCallback(
    (ref: Pick<TaskRef, "id">) => {
      shallowNavigate("push", taskSheetHref(pathname, searchParams, ref.id));
    },
    [pathname, searchParams],
  );

  const sortedHistory = useMemo(() => (task ? sortTaskHistory(task.history) : []), [task]);
  const statusItems = useMemo(() => statusSelectItems(statuses), [statuses]);

  const handleOpenChange = (open: boolean) => {
    if (!open) onClose();
  };

  if (query.isError || (query.isSuccess && task === null)) {
    return (
      <FormSheet
        title="Tarea no disponible"
        open
        onOpenChange={handleOpenChange}
        onSubmit={async () => onClose()}
        submitLabel="Volver a la lista"
      >
        <p role="status" className="text-sm text-muted-foreground">
          {query.isError ? actionErrorText(query.error) : NOT_FOUND_COPY}
        </p>
      </FormSheet>
    );
  }

  if (!task || !draft || draft.taskId !== task.id) {
    return (
      <FormSheet
        title="Detalle de tarea"
        open
        onOpenChange={handleOpenChange}
        onSubmit={async () => undefined}
        submitLabel="Guardar cambios"
        pending
      >
        <p role="status" className="text-sm text-muted-foreground">
          Cargando tarea…
        </p>
      </FormSheet>
    );
  }

  // Permissions (the server checks them again).
  const canEdit = capabilities.canCreateActivity;
  const canChangeStatus = canChangeActivityStatus({ capabilities, task, viewerId });
  const canReassign = capabilities.canChangeResponsible;

  const isAdminTask = task.kind === "admin";
  const showTramoSelect = !isAdminTask && !task.workflowId && tramos.length > 0;
  const showPhase = !isAdminTask && Boolean(task.workflowId) && (phases.length > 0 || task.phase !== null);
  const spaceOptions = catalogs.spaces.length > 0 ? catalogs.spaces : task.space ? [task.space] : [];
  const showSpace = !isAdminTask && spaceOptions.length > 0;
  const isSubtask = Boolean(task.parentTaskId && task.parentTitle !== null);
  const lateCommitment = isDueDateLate(task.commitmentDate, todayIso(), task);
  const managerMissing = task.manager !== null && !staff.some((s) => s.id === task.manager?.id);

  const patch = (next: TaskPatch) => {
    setError(null);
    update.mutate(next);
  };

  const changeStatus = (value: string) => {
    if (value === statusSelectValue(task)) return;
    setError(null);
    status.mutate(parseStatusValue(value));
  };

  /** "Guardar cambios": title and descripción; FormSheet shows a thrown error through `actionErrorText`. */
  const saveDraft = async () => {
    const title = draft.title.trim();
    if (!title) throw new Error("INVALID: title");
    const next: TaskPatch = {};
    if (title !== task.title) next.title = title;
    const notes = draft.notes.trim() ? draft.notes : null;
    if (notes !== (task.notes ?? null)) next.notes = notes;
    if (Object.keys(next).length === 0) return;
    setError(null);
    await update.mutateAsync(next);
  };

  const addAttachment = (file: File) => {
    setError(null);
    attach.mutate({ file });
  };

  const handleAttachmentChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const message = taskAttachmentError(file);
    setAttachmentError(message);
    if (!message) addAttachment(file);
  };

  const ids = {
    title: `tarea-${task.id}-titulo`,
    notes: `tarea-${task.id}-descripcion`,
    commitment: `tarea-${task.id}-compromiso`,
    late: `tarea-${task.id}-vencida`,
    review: `tarea-${task.id}-revision`,
    hours: `tarea-${task.id}-horas`,
    files: `tarea-${task.id}-adjuntos`,
    activity: `tarea-${task.id}-actividad`,
  };

  return (
    <FormSheet
      title="Detalle de tarea"
      description={task.project.name}
      open
      onOpenChange={handleOpenChange}
      onSubmit={saveDraft}
      submitLabel="Guardar cambios"
      pending={busy}
      error={error}
    >
      <div data-slot="task-sheet" className="space-y-6">
        {/* Header row: the status select; the sheet's own close button sits in its header. */}
        <div className="flex flex-wrap items-center gap-3">
          <Select
            items={Object.fromEntries(statusItems.map((s) => [s.value, s.label]))}
            value={statusSelectValue(task)}
            disabled={!canChangeStatus || busy}
            onValueChange={(v) => {
              if (v) changeStatus(v as string);
            }}
          >
            <SelectTrigger aria-label="Estatus" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statusItems.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <WaitingBadge waitingOn={task.waitingOn} />
        </div>

        {task.parentTaskId ? (
          task.parentTitle !== null ? (
            <p className="text-sm text-muted-foreground">
              Subtarea de{" "}
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0"
                onClick={() => openTask({ id: task.parentTaskId as string })}
              >
                {task.parentTitle}
              </Button>
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Tarea padre eliminada</p>
          )
        ) : null}

        {/* Inline-editable title. */}
        <div>
          <Label htmlFor={ids.title} className="sr-only">
            Título
          </Label>
          <Input
            id={ids.title}
            value={draft.title}
            disabled={!canEdit}
            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            className="h-auto text-lg font-semibold"
          />
        </div>

        {/* Properties grid. */}
        <dl className="grid grid-cols-[8.5rem_minmax(0,1fr)] items-center gap-x-4 gap-y-3 text-sm">
          <dt className="text-muted-foreground">Estatus</dt>
          <dd>
            <StatusChip status={{ status: task.status, customStatus: task.customStatus }} />
          </dd>

          <dt className="text-muted-foreground">Responsable</dt>
          <dd>
            {canReassign ? (
              <Select
                items={{
                  [NO_MANAGER]: "Sin responsable",
                  ...Object.fromEntries(staff.map((s) => [s.id, s.name])),
                  ...(managerMissing && task.manager ? { [task.manager.id]: task.manager.name } : {}),
                }}
                value={task.managerId ?? NO_MANAGER}
                disabled={busy}
                onValueChange={(v) => {
                  const next = v && v !== NO_MANAGER ? (v as string) : null;
                  if (next === task.managerId) return;
                  setError(null);
                  assign.mutate(next);
                }}
              >
                <SelectTrigger aria-label="Responsable" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_MANAGER}>Sin responsable</SelectItem>
                  {managerMissing && task.manager ? (
                    <SelectItem value={task.manager.id}>{task.manager.name}</SelectItem>
                  ) : null}
                  {staff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <span className="text-foreground">{task.manager?.name ?? "Sin responsable"}</span>
            )}
          </dd>

          <dt className="text-muted-foreground">{SUPPORT_COLUMN_LABEL}</dt>
          <dd data-slot="task-support" className="text-foreground">
            {task.support.length > 0 ? task.support.map((s) => s.name).join(", ") : <span className="text-muted-foreground">{PEOPLE_EMPTY}</span>}
          </dd>

          <dt className="text-muted-foreground">Proyecto</dt>
          <dd>
            <Link href={`/proyectos/${task.project.id}`} className="text-foreground underline underline-offset-4">
              {task.project.name}
            </Link>
          </dd>

          <dt className="text-muted-foreground">Tramo</dt>
          <dd>
            {task.workflow ? (
              <TramoBadge tramo={task.workflow} variant="chip" />
            ) : showTramoSelect ? (
              <TaskTramoSelect
                tramos={tramos}
                disabled={!canEdit || busy}
                triggerClassName="w-full"
                onChange={(id) => void patch({ workflowId: id })}
              />
            ) : (
              <span className="text-muted-foreground">{isAdminTask ? "Administración" : "Sin tramo"}</span>
            )}
          </dd>

          {showPhase ? (
            <>
              <dt className="text-muted-foreground">Fase</dt>
              <dd>
                <TaskPhaseSelect
                  task={task}
                  phases={phases}
                  disabled={!canEdit || busy}
                  triggerClassName="w-full"
                  onChange={(id) => void patch({ phaseId: id })}
                />
              </dd>
            </>
          ) : null}

          {showSpace ? (
            <>
              <dt className="text-muted-foreground">Espacio</dt>
              <dd>
                <TaskSpaceSelect
                  task={task}
                  spaces={spaceOptions}
                  disabled={!canEdit || busy}
                  triggerClassName="w-full"
                  onChange={(id) => void patch({ spaceId: id })}
                />
              </dd>
            </>
          ) : null}

          <dt>
            <label htmlFor={ids.commitment} className="text-muted-foreground">
              Fecha compromiso
            </label>
          </dt>
          <dd className="space-y-1">
            <Input
              id={ids.commitment}
              type="date"
              value={task.commitmentDate ?? ""}
              disabled={!canEdit || busy}
              aria-describedby={lateCommitment ? ids.late : undefined}
              onChange={(event) => void patch({ commitmentDate: event.target.value || null })}
            />
            {lateCommitment && task.commitmentDate ? (
              <p id={ids.late} className="text-xs text-destructive">
                Vencida desde el {formatShortDate(task.commitmentDate)}
              </p>
            ) : null}
          </dd>

          <dt>
            <label htmlFor={ids.review} className="text-muted-foreground">
              Revisión
            </label>
          </dt>
          <dd>
            <Input
              id={ids.review}
              type="date"
              value={task.reviewDate ?? ""}
              disabled={!canEdit || busy}
              onChange={(event) => void patch({ reviewDate: event.target.value || null })}
            />
          </dd>

          <dt>
            <label htmlFor={ids.hours} className="text-muted-foreground">
              {HOURS_FIELD_LABEL}
            </label>
          </dt>
          <dd>
            <TaskHoursField
              id={ids.hours}
              task={task}
              disabled={!canEdit || busy}
              onSave={(value) => {
                setError(null);
                hours.mutate(value);
              }}
            />
          </dd>

          <dt className="text-muted-foreground">Prioridad</dt>
          <dd>
            <Select
              items={Object.fromEntries(PRIORITIES.map((p) => [p, PRIORITY_LABEL[p]]))}
              value={task.priority}
              disabled={!canEdit || busy}
              onValueChange={(v) => {
                if (v && v !== task.priority) void patch({ priority: v as TaskPriority });
              }}
            >
              <SelectTrigger aria-label="Prioridad" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {PRIORITY_LABEL[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </dd>
        </dl>

        <section className="space-y-2">
          <Label htmlFor={ids.notes} className="text-base font-semibold">
            Descripción
          </Label>
          <Textarea
            id={ids.notes}
            rows={4}
            value={draft.notes}
            disabled={!canEdit}
            placeholder="Agrega una descripción"
            onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
          />
        </section>

        {!isSubtask ? (
          <TaskSubtasks key={task.id} parentId={task.id} projectId={task.projectId} onOpenSubtask={openTask} />
        ) : null}

        <TaskDependencies
          key={`deps-${task.id}`}
          taskId={task.id}
          projectId={task.projectId}
          onOpenTask={openTask}
        />

        <section aria-labelledby={ids.files} className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 id={ids.files} className="text-base font-semibold text-foreground">
              Adjuntos
            </h3>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:border-primary hover:text-foreground">
              Adjuntar
              <input
                type="file"
                accept={TASK_ATTACHMENT_ACCEPT}
                className="sr-only"
                aria-label="Adjuntar imagen o .txt (máx. 10MB)"
                onChange={handleAttachmentChange}
              />
            </label>
          </div>
          <TaskAttachmentGrid task={task} />
          {attachmentError ? <p className="text-xs text-destructive">{attachmentError}</p> : null}
        </section>

        <section aria-labelledby={ids.activity} className="space-y-3">
          <h3 id={ids.activity} className="text-base font-semibold text-foreground">
            Actividad
          </h3>
          <HistoryEventList
            events={sortedHistory}
            names={historyNames}
            empty={<p className="text-sm text-muted-foreground">Todavía no hay actividad en esta tarea.</p>}
          />
          <CommentComposer
            key={task.id}
            staff={staff}
            onSubmit={async (text) => {
              await comment.mutateAsync(text);
            }}
          />
        </section>

        <ImportDataPanel importData={importData} />
      </div>
    </FormSheet>
  );
}
