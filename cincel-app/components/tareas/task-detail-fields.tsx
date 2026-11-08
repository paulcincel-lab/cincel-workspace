"use client";

/**
 * Task detail fields shared by `TaskSheet` (redesign FE §3.4): tramo, fase and
 * espacio selects, the checklist editor, the attachment grid and their helpers.
 * The select options come from the catalog keys the sheet's one call seeds
 * (`useTaskSheetCatalogs`).
 */
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import type {
  ProjectSpaceRef,
  TaskChecklistItem,
  TaskDetail,
  TaskStatusOption,
  WorkflowPhaseRef,
  WorkflowRef,
} from "@/lib/types/core";
import type { CatalogAssignableStaffOption } from "@/lib/types/catalog";
import { Button } from "@/components/ui/shadcn/button";
import { ChecklistAddItemInput, ChecklistItemRow } from "@/components/tareas/ChecklistItemRow";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";
import {
  catalogAssignableStaffOptions,
  catalogProjectSpacesOptions,
  catalogTaskStatusesOptions,
  catalogWorkflowsOptions,
} from "@/lib/query/options/catalog";
import { taskPhasesOptions } from "@/lib/query/options/tareas";

/** Select values for "Sin fase" / "Sin espacio" (Select items can't carry null). */
const NO_PHASE = "__none__";
const NO_SPACE = "__none__";

const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
/** File types a task attachment accepts (the upload route checks them again). */
export const TASK_ATTACHMENT_ACCEPT = "image/*,.txt,text/plain";

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

const NO_STATUSES: TaskStatusOption[] = [];
const NO_TRAMOS: WorkflowRef[] = [];
const NO_STAFF: CatalogAssignableStaffOption[] = [];
const NO_PHASES: WorkflowPhaseRef[] = [];
const NO_SPACES: ProjectSpaceRef[] = [];

export type TaskSheetCatalogs = {
  statuses: TaskStatusOption[];
  tramos: WorkflowRef[];
  /** Responsable and "@" mentions: `{id,name,suggested}`, suggested for the task's tramo first. */
  staff: CatalogAssignableStaffOption[];
  /** The active fases of the task's tramo; empty without one. */
  phases: WorkflowPhaseRef[];
  /** The project's espacios; empty for an admin task. */
  spaces: ProjectSpaceRef[];
};

/**
 * The options of the sheet's selects, from the catalog keys `getTaskSheetData`
 * seeded (`catalog.taskStatuses`, `catalog.workflows`,
 * `catalog.assignableStaff(workflowId)`, `catalog.projectSpaces(pid)` and the
 * tramo's fases): no request while they are fresh, a refetch of only the
 * stale one otherwise.
 */
export function useTaskSheetCatalogs(
  task: Pick<TaskDetail, "kind" | "workflowId" | "projectId"> | null,
): TaskSheetCatalogs {
  // Nothing is read before the task loads: its one call seeds these keys first.
  const loaded = task !== null;
  const workflowId = task?.workflowId ?? null;
  const withSpaces = loaded && task.kind !== "admin";
  const withPhases = withSpaces && workflowId !== null;
  const statuses = useQuery({ ...catalogTaskStatusesOptions(), enabled: loaded }).data ?? NO_STATUSES;
  const tramos = useQuery({ ...catalogWorkflowsOptions(), enabled: loaded }).data ?? NO_TRAMOS;
  const staff = useQuery({ ...catalogAssignableStaffOptions(workflowId), enabled: loaded }).data ?? NO_STAFF;
  const phases = useQuery({ ...taskPhasesOptions(workflowId ?? ""), enabled: withPhases }).data ?? NO_PHASES;
  const spaces = useQuery({ ...catalogProjectSpacesOptions(task?.projectId ?? ""), enabled: withSpaces }).data ?? NO_SPACES;
  return {
    statuses,
    tramos,
    staff,
    phases: withPhases ? phases : NO_PHASES,
    spaces: withSpaces ? spaces : NO_SPACES,
  };
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
                <ChecklistItemRow label={item.title} checked={item.completed} onToggle={() => onToggle(item)} />
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

      <ChecklistAddItemInput value={newChecklistItem} onValueChange={setNewChecklistItem} onSubmit={handleAdd} />
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
