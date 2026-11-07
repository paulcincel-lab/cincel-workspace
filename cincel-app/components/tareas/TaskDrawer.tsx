"use client";

import { useMemo, useState } from "react";

import type {
  ProjectSpaceRef,
  StaffRef,
  TaskChecklistItem,
  TaskDetail,
  TaskLinkInput,
  TaskRef,
  WorkflowPhaseRef,
  WorkflowRef,
} from "@/lib/types/core";
import { tramoPhaseLabel } from "@/lib/tasks/labels";
import TaskDependencies from "@/components/tareas/TaskDependencies";
import TaskSubtasks from "@/components/tareas/TaskSubtasks";
import { WaitingBadge } from "@/components/tareas/TaskRowMeta";
import { DriveLinksEditor } from "@/components/ui/DriveLinksEditor";
import { formatDateDMY } from "@/lib/utils/date";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/shadcn/sheet";
import { Button } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";
import { Checkbox } from "@/components/ui/shadcn/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";
import TeamMultiSelect from "@/components/ui/TeamMultiSelect";
import { HistoryEventList } from "@/components/ui/HistoryEventList";
import { HistoryCommentInput } from "@/components/ui/HistoryCommentInput";
import { ImportDataPanel, useImportData } from "@/components/ui/ImportDataPanel";

const STATUS_LABEL: Record<TaskDetail["status"], string> = {
  pendiente: "Pendiente",
  en_proceso: "En proceso",
  completado: "Completado",
  bloqueado: "Bloqueado",
};

/** Select values for "Sin fase" / "Sin espacio" (Select items can't carry null). */
const NO_PHASE = "__none__";
const NO_SPACE = "__none__";

const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
/** File types a task attachment accepts (the upload route checks them again). */
export const TASK_ATTACHMENT_ACCEPT = "image/*,.txt,text/plain";
const ATTACHMENT_ACCEPT = TASK_ATTACHMENT_ACCEPT;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Spanish copy when a file can't be attached to a task, or "" when it can.
 * `photo`: a checklist photo, which must be an image.
 */
export function taskAttachmentError(file: { type: string; size: number }, options: { photo?: boolean } = {}): string {
  const isImage = file.type.startsWith("image/");
  if (options.photo) {
    if (!isImage) return "Las fotos del checklist deben ser imágenes.";
  } else if (!isImage && file.type !== "text/plain") {
    return "Solo se permiten imágenes o archivos .txt.";
  }
  if (file.size > ATTACHMENT_MAX_BYTES) return "El archivo supera el límite de 10MB.";
  return "";
}

/** A task's bitácora in chronological order (oldest first). */
export function sortTaskHistory(history: TaskDetail["history"]): TaskDetail["history"] {
  return [...history].sort((a, b) => a.eventAt.localeCompare(b.eventAt));
}

/** Download/preview URL of a task attachment. */
export function taskAttachmentHref(taskId: string, attachmentId: string): string {
  return `/api/tareas/${taskId}/adjuntos/${attachmentId}`;
}

/** Tramo select for a non-admin task that has none (legacy rows); the select is hidden once it has one. */
export function TaskTramoSelect({
  tramos,
  onChange,
  triggerClassName = "w-56",
  disabled,
}: {
  tramos: WorkflowRef[];
  onChange: (workflowId: string) => void;
  triggerClassName?: string;
  disabled?: boolean;
}) {
  return (
    <Select
      items={Object.fromEntries(tramos.map((t) => [t.id, t.name]))}
      value=""
      disabled={disabled}
      onValueChange={(v) => {
        if (v) onChange(v as string);
      }}
    >
      <SelectTrigger aria-label="Tramo" className={triggerClassName}>
        <SelectValue placeholder="Sin tramo" />
      </SelectTrigger>
      <SelectContent>
        {tramos.map((t) => (
          <SelectItem key={t.id} value={t.id}>
            {t.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Fase select over the task's tramo catalog. A task without fase shows
 * "Sin fase · revisar"; a fase that is no longer active shows "(inactiva)".
 */
export function TaskPhaseSelect({
  task,
  phases,
  onChange,
  triggerClassName = "w-56",
  disabled,
}: {
  task: Pick<TaskDetail, "phaseId" | "phase">;
  phases: WorkflowPhaseRef[];
  onChange: (phaseId: string | null) => void;
  triggerClassName?: string;
  disabled?: boolean;
}) {
  const currentPhaseInList = Boolean(task.phaseId && phases.some((p) => p.id === task.phaseId));
  return (
    <Select
      items={{
        [NO_PHASE]: "Sin fase · revisar",
        ...Object.fromEntries(phases.map((p) => [p.id, p.name])),
        ...(task.phaseId && !currentPhaseInList && task.phase
          ? { [task.phaseId]: `${task.phase.name} (inactiva)` }
          : {}),
      }}
      value={task.phaseId ?? NO_PHASE}
      disabled={disabled}
      onValueChange={(v) => {
        const next = v && v !== NO_PHASE ? (v as string) : null;
        if (next && next !== task.phaseId) onChange(next);
      }}
    >
      <SelectTrigger aria-label="Fase" className={triggerClassName}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {task.phaseId ? null : (
          <SelectItem value={NO_PHASE} disabled>
            Sin fase · revisar
          </SelectItem>
        )}
        {task.phaseId && !currentPhaseInList && task.phase ? (
          <SelectItem value={task.phaseId} disabled>
            {task.phase.name} (inactiva)
          </SelectItem>
        ) : null}
        {phases.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Espacio select over the task's project espacios, with "Sin espacio". */
export function TaskSpaceSelect({
  task,
  spaces,
  onChange,
  triggerClassName = "w-56",
  disabled,
}: {
  task: Pick<TaskDetail, "spaceId">;
  spaces: ProjectSpaceRef[];
  onChange: (spaceId: string | null) => void;
  triggerClassName?: string;
  disabled?: boolean;
}) {
  return (
    <Select
      items={{
        [NO_SPACE]: "Sin espacio",
        ...Object.fromEntries(spaces.map((sp) => [sp.id, sp.name])),
      }}
      value={task.spaceId ?? NO_SPACE}
      disabled={disabled}
      onValueChange={(v) => {
        const next = v && v !== NO_SPACE ? (v as string) : null;
        if (next !== task.spaceId) onChange(next);
      }}
    >
      <SelectTrigger aria-label="Espacio" className={triggerClassName}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_SPACE}>Sin espacio</SelectItem>
        {spaces.map((sp) => (
          <SelectItem key={sp.id} value={sp.id}>
            {sp.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

type TaskChecklistEditorProps = {
  task: Pick<TaskDetail, "id" | "checklistItems" | "attachments">;
  onAdd: (title: string) => void;
  onToggle: (item: TaskChecklistItem) => void;
  onRemove: (item: TaskChecklistItem) => void;
  /** Reorders the checklist to the given id order; the ↑/↓ controls are hidden when omitted. */
  onReorder?: (orderedIds: string[]) => void;
  /** Attaches a photo to one item; the 📷 control is hidden when omitted. */
  onAddPhoto?: (item: TaskChecklistItem, file: File) => void;
  /** A rejected photo (type or size), as Spanish copy. */
  onPhotoError?: (message: string) => void;
};

/** The checklist rows (toggle, reorder, photos, remove) and the "Nuevo punto" row. */
export function TaskChecklistEditor({
  task,
  onAdd,
  onToggle,
  onRemove,
  onReorder,
  onAddPhoto,
  onPhotoError,
}: TaskChecklistEditorProps) {
  const [newChecklistItem, setNewChecklistItem] = useState("");

  const handleAdd = () => {
    const trimmed = newChecklistItem.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setNewChecklistItem("");
  };

  const handlePhotoChange = (item: TaskChecklistItem, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !onAddPhoto) return;
    const error = taskAttachmentError(file, { photo: true });
    if (error) {
      onPhotoError?.(error);
      return;
    }
    onPhotoError?.("");
    onAddPhoto(item, file);
  };

  const moveItem = (item: TaskChecklistItem, direction: "up" | "down") => {
    if (!onReorder) return;
    const items = task.checklistItems;
    const index = items.findIndex((i) => i.id === item.id);
    const swapWith = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || swapWith < 0 || swapWith >= items.length) return;
    const reordered = [...items];
    [reordered[index], reordered[swapWith]] = [reordered[swapWith], reordered[index]];
    onReorder(reordered.map((i) => i.id));
  };

  return (
    <>
      {task.checklistItems.length > 0 ? (
        task.checklistItems.map((item, index) => {
          const photos = task.attachments.filter((a) => a.checklistItemId === item.id);
          return (
            <div key={item.id} className="rounded-lg px-2 py-1.5 hover:bg-muted">
              <div className="flex items-center gap-1">
                {onReorder ? (
                  <div className="flex flex-col">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-4 w-5 p-0 text-xs text-muted-foreground disabled:opacity-30"
                      disabled={index === 0}
                      onClick={() => moveItem(item, "up")}
                      title="Mover arriba"
                    >
                      ↑
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-4 w-5 p-0 text-xs text-muted-foreground disabled:opacity-30"
                      disabled={index === task.checklistItems.length - 1}
                      onClick={() => moveItem(item, "down")}
                      title="Mover abajo"
                    >
                      ↓
                    </Button>
                  </div>
                ) : null}
                <label className="flex flex-1 items-center gap-3">
                  <Checkbox checked={item.completed} onCheckedChange={() => onToggle(item)} />
                  <span className={`flex-1 text-sm ${item.completed ? "text-muted-foreground line-through" : "text-foreground"}`}>
                    {item.title}
                  </span>
                </label>
                {onAddPhoto ? (
                  <label
                    className="inline-flex h-6 cursor-pointer items-center rounded-md px-2 text-xs text-muted-foreground hover:bg-background hover:text-foreground"
                    title="Adjuntar foto a este punto"
                  >
                    📷
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      aria-label={`Adjuntar foto a ${item.title}`}
                      onChange={(e) => handlePhotoChange(item, e)}
                    />
                  </label>
                ) : null}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive"
                  onClick={() => onRemove(item)}
                >
                  Quitar
                </Button>
              </div>
              {photos.length > 0 ? (
                <div className="mt-1.5 flex flex-wrap gap-1.5 pl-8">
                  {photos.map((photo) => {
                    const href = taskAttachmentHref(task.id, photo.id);
                    return (
                      <a key={photo.id} href={href} target="_blank" rel="noreferrer" title={photo.fileName}>
                        {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary uploaded content */}
                        <img src={href} alt={photo.fileName} className="h-12 w-12 rounded-md border border-border object-cover" />
                      </a>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })
      ) : (
        <p className="text-sm text-muted-foreground">Sin puntos de checklist.</p>
      )}

      <div className="flex gap-2 pt-2">
        <Input
          value={newChecklistItem}
          onChange={(event) => setNewChecklistItem(event.target.value)}
          placeholder="Nuevo punto..."
          aria-label="Nuevo punto del checklist"
          className="h-8 text-sm"
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              handleAdd();
            }
          }}
        />
        <Button variant="outline" size="sm" className="h-8" onClick={handleAdd}>
          Agregar
        </Button>
      </div>
    </>
  );
}

/** Thumbnails of the task's own attachments (not checklist photos), or "Sin archivos adjuntos.". */
export function TaskAttachmentGrid({ task }: { task: Pick<TaskDetail, "id" | "attachments"> }) {
  const files = task.attachments.filter((a) => !a.checklistItemId);
  if (files.length === 0) return <p className="text-sm text-muted-foreground">Sin archivos adjuntos.</p>;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {files.map((attachment) => {
        const href = taskAttachmentHref(task.id, attachment.id);
        const isImage = attachment.mimeType.startsWith("image/");
        return (
          <a
            key={attachment.id}
            href={href}
            target="_blank"
            rel="noreferrer"
            className="group rounded-xl border border-border p-2 text-xs hover:border-primary"
            title={attachment.fileName}
          >
            {isImage ? (
              // eslint-disable-next-line @next/next/no-img-element -- arbitrary uploaded content, not an optimizable static asset
              <img src={href} alt={attachment.fileName} className="h-20 w-full rounded-lg object-cover" />
            ) : (
              <div className="flex h-20 w-full items-center justify-center rounded-lg bg-muted text-2xl" aria-hidden="true">📄</div>
            )}
            <p className="mt-1 truncate font-medium text-foreground group-hover:underline">{attachment.fileName}</p>
            <p className="text-muted-foreground">{formatBytes(attachment.sizeBytes)}</p>
          </a>
        );
      })}
    </div>
  );
}

type Props = {
  open: boolean;
  task: TaskDetail | null;
  onClose: () => void;
  onAddComment: (comment: string) => void;
  onAddChecklistItem: (title: string) => void;
  onToggleChecklistItem: (item: TaskChecklistItem) => void;
  onRemoveChecklistItem: (item: TaskChecklistItem) => void;
  /** Reorders the checklist to the given id order (top to bottom). Optional so other callers can skip it. */
  onReorderChecklist?: (orderedIds: string[]) => void;
  /** Uploads a file as a task comment (#425). Optional — the attach control is hidden when omitted. */
  onAddAttachment?: (file: File, checklistItemId?: string) => void;
  /** Adds an internal or client Drive/web link (#436). Optional — the links section is hidden when omitted. */
  onAddLink?: (input: TaskLinkInput) => void;
  onRemoveLink?: (linkId: string) => void;
  /** Active staff available to assign as support. Optional — support editing is hidden when omitted. */
  staffOptions?: StaffRef[];
  onChangeSupport?: (staffIds: string[]) => void;
  /** Shows another task (a subtask or the parent) in this drawer. Optional — the Subtareas section is hidden when omitted. */
  onOpenTask?: (taskId: string) => void;
  /** Called after a dependency is added or removed, so the caller can refetch the task ("En espera"). */
  onDependenciesChange?: () => void;
  /** The task's tramo catalog (active fases, plus the task's own fase if inactive); enables the Fase select. */
  phases?: WorkflowPhaseRef[];
  /** The task's project espacios; enables the Espacio select. */
  spaces?: ProjectSpaceRef[];
  onChangePhase?: (phaseId: string | null) => void;
  onChangeSpace?: (spaceId: string | null) => void;
  /** Active tramos, for a non-admin task with no tramo (legacy rows). */
  tramos?: WorkflowRef[];
  /** Sets the tramo of a task that has none; the Tramo select is hidden once it has one. */
  onChangeTramo?: (workflowId: string) => void;
};

type BackEntry = { id: string; title: string };

export default function TaskDrawer({
  open,
  task,
  onClose,
  onAddComment,
  onAddChecklistItem,
  onToggleChecklistItem,
  onRemoveChecklistItem,
  onReorderChecklist,
  onAddAttachment,
  onAddLink,
  onRemoveLink,
  staffOptions = [],
  onChangeSupport,
  onOpenTask,
  onDependenciesChange,
  phases,
  spaces,
  onChangePhase,
  onChangeSpace,
  tramos = [],
  onChangeTramo,
}: Props) {
  /** Tasks the user came from inside this drawer (parent → subtask), for "← {padre}". */
  const [backStack, setBackStack] = useState<BackEntry[]>([]);
  const [attachmentError, setAttachmentError] = useState("");
  const importData = useImportData("task", task?.id);

  const nameToStaffId = useMemo(() => new Map(staffOptions.map((s) => [s.name, s.id])), [staffOptions]);
  const staffNames = useMemo(() => staffOptions.map((s) => s.name), [staffOptions]);

  const sortedHistory = useMemo(() => (task ? sortTaskHistory(task.history) : []), [task]);

  const isAdminTask = task?.kind === "admin";
  const showTramoSelect = Boolean(task && !isAdminTask && !task.workflowId && onChangeTramo && tramos.length > 0);
  const showPhaseSelect = Boolean(task && !isAdminTask && task.workflowId && phases && onChangePhase);
  const showSpaceSelect = Boolean(task && !isAdminTask && spaces && spaces.length > 0 && onChangeSpace);

  const backTo = backStack.length > 0 ? backStack[backStack.length - 1] : null;
  // A child whose parent was soft-deleted behaves as top-level and can take subtasks.
  const isSubtask = Boolean(task?.parentTaskId && task.parentTitle !== null);

  const handleClose = () => {
    setBackStack([]);
    onClose();
  };

  const openSubtask = (subtask: TaskRef) => {
    if (!task || !onOpenTask) return;
    setBackStack((stack) => [...stack, { id: task.id, title: task.title }]);
    onOpenTask(subtask.id);
  };

  /** Opens a linked task (dependency) fresh, without a back link. */
  const openLinkedTask = (linked: TaskRef) => {
    if (!onOpenTask) return;
    setBackStack([]);
    onOpenTask(linked.id);
  };

  const goBack = () => {
    if (!backTo || !onOpenTask) return;
    setBackStack((stack) => stack.slice(0, -1));
    onOpenTask(backTo.id);
  };

  const openParent = () => {
    if (!task?.parentTaskId || !onOpenTask) return;
    if (backTo?.id === task.parentTaskId) {
      goBack();
      return;
    }
    setBackStack([]);
    onOpenTask(task.parentTaskId);
  };

  const handleAttachmentChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !onAddAttachment) return;

    const error = taskAttachmentError(file);
    if (error) {
      setAttachmentError(error);
      return;
    }

    setAttachmentError("");
    onAddAttachment(file);
  };

  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) handleClose(); }}>
      <SheetContent side="right" className="w-[560px] p-0">
        {task ? (
          <>
            <SheetHeader>
              {backTo && onOpenTask ? (
                <Button variant="link" size="sm" className="h-auto self-start p-0" onClick={goBack}>
                  ← {backTo.title}
                </Button>
              ) : null}
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Detalle de tarea
                  </p>
                  <SheetTitle className="mt-2">{task.title}</SheetTitle>
                  {task.parentTaskId ? (
                    task.parentTitle !== null ? (
                      <p className="mt-1 text-sm text-muted-foreground">
                        Subtarea de{" "}
                        {onOpenTask ? (
                          <Button variant="link" size="sm" className="h-auto p-0" onClick={openParent}>
                            {task.parentTitle}
                          </Button>
                        ) : (
                          task.parentTitle
                        )}
                      </p>
                    ) : (
                      <p className="mt-1 text-sm text-muted-foreground">Tarea padre eliminada</p>
                    )
                  ) : null}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 text-sm text-muted-foreground">
                <span className="rounded-full bg-muted px-3 py-1">{task.project.name}</span>
                <span className="rounded-full bg-muted px-3 py-1">{tramoPhaseLabel(task)}</span>
                {task.space ? <span className="rounded-full bg-muted px-3 py-1">{task.space.name}</span> : null}
                <span className="rounded-full bg-muted px-3 py-1">{task.customStatus?.name ?? STATUS_LABEL[task.status]}</span>
                <WaitingBadge waitingOn={task.waitingOn} />
              </div>
            </SheetHeader>

            <div className="flex-1 space-y-6 overflow-y-auto p-6">
              <section>
                <h3 className="text-lg font-semibold text-foreground">Resumen</h3>
                <div className="mt-3 grid gap-3 rounded-2xl border border-border bg-muted p-4 text-sm text-muted-foreground">
                  {showTramoSelect ? (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Tramo</span>
                      <TaskTramoSelect tramos={tramos} onChange={(id) => onChangeTramo?.(id)} />
                    </div>
                  ) : null}
                  {showPhaseSelect ? (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Fase</span>
                      <TaskPhaseSelect task={task} phases={phases ?? []} onChange={(id) => onChangePhase?.(id)} />
                    </div>
                  ) : null}
                  {showSpaceSelect ? (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Espacio</span>
                      <TaskSpaceSelect task={task} spaces={spaces ?? []} onChange={(id) => onChangeSpace?.(id)} />
                    </div>
                  ) : null}
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Responsable</span>
                    <span className="font-medium">{task.manager?.name ?? "Sin responsable"}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Equipo</span>
                    <span className="font-medium text-right">
                      {task.support.length > 0 ? task.support.map((s) => s.name).join(", ") : "Sin apoyo"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Compromiso</span>
                    <span className="font-medium">{formatDateDMY(task.commitmentDate ?? "")}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Próxima revisión</span>
                    <span className="font-medium">{formatDateDMY(task.reviewDate ?? "")}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
                    <span className="text-muted-foreground">Estado</span>
                    <span className="font-medium">{task.customStatus?.name ?? STATUS_LABEL[task.status]}</span>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-lg font-semibold text-foreground">Historial</h3>
                <div className="mt-3 space-y-3 rounded-2xl border border-border p-4">
                  <HistoryEventList
                    events={sortedHistory}
                    empty={<p className="text-sm text-muted-foreground">No hay notas de seguimiento registradas.</p>}
                  />

                  <HistoryCommentInput
                    onSubmit={onAddComment}
                    placeholder="Agregar nueva nota de seguimiento..."
                    submitLabel="Guardar nota"
                  />
                </div>
              </section>

              <section>
                <h3 className="text-lg font-semibold text-foreground">Checklist</h3>
                <div className="mt-3 space-y-2 rounded-2xl border border-border p-4">
                  <TaskChecklistEditor
                    task={task}
                    onAdd={onAddChecklistItem}
                    onToggle={onToggleChecklistItem}
                    onRemove={onRemoveChecklistItem}
                    onReorder={onReorderChecklist}
                    onAddPhoto={onAddAttachment ? (item, file) => onAddAttachment(file, item.id) : undefined}
                    onPhotoError={setAttachmentError}
                  />
                </div>
              </section>

              {onOpenTask && !isSubtask ? (
                <TaskSubtasks key={task.id} parentId={task.id} onOpenSubtask={openSubtask} />
              ) : null}

              {onOpenTask ? (
                <TaskDependencies
                  key={`deps-${task.id}`}
                  taskId={task.id}
                  projectId={task.projectId}
                  onOpenTask={openLinkedTask}
                  onChange={onDependenciesChange}
                />
              ) : null}

              {onChangeSupport && staffOptions.length > 0 ? (
                <section>
                  <h3 className="text-lg font-semibold text-foreground">Staff de apoyo</h3>
                  <div className="mt-3 rounded-2xl border border-border p-4">
                    <TeamMultiSelect
                      options={staffNames}
                      selected={task.support.map((s) => s.name)}
                      onChange={(members) => {
                        const ids = members.map((n) => nameToStaffId.get(n)).filter((id): id is string => Boolean(id));
                        onChangeSupport(ids);
                      }}
                    />
                  </div>
                </section>
              ) : null}


              {onAddLink ? (
                <section>
                  <h3 className="text-lg font-semibold text-foreground">Enlaces de Drive</h3>
                  <div className="mt-3">
                    <DriveLinksEditor links={task.links} onAdd={onAddLink} onRemove={onRemoveLink} />
                  </div>
                </section>
              ) : null}

              {onAddAttachment ? (
                <section>
                  <h3 className="text-lg font-semibold text-foreground">Adjuntos</h3>
                  <div className="mt-3 space-y-3 rounded-2xl border border-border p-4">
                    <TaskAttachmentGrid task={task} />

                    <div>
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:border-primary hover:text-foreground">
                        + Adjuntar imagen o .txt (máx. 10MB)
                        <input type="file" accept={ATTACHMENT_ACCEPT} className="hidden" onChange={handleAttachmentChange} />
                      </label>
                      {attachmentError ? <p className="mt-2 text-xs text-destructive">{attachmentError}</p> : null}
                    </div>
                  </div>
                </section>
              ) : null}

              <ImportDataPanel importData={importData} />
            </div>

            <SheetFooter>
              <Button variant="outline" onClick={handleClose}>
                Cerrar
              </Button>
            </SheetFooter>
          </>
        ) : (
          <div className="p-6 text-sm text-muted-foreground">Cargando tarea...</div>
        )}
      </SheetContent>
    </Sheet>
  );
}
