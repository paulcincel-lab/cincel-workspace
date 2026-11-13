"use client";

/**
 * Task detail fields shared by `TaskSheet` (redesign FE §3.4): etapa, fase and
 * espacio selects, the attachment grid and their helpers.
 * The select options come from the catalog keys the sheet's one call seeds
 * (`useTaskSheetCatalogs`).
 */
import { useQuery } from "@tanstack/react-query";

import type {
  ProjectSpaceRef,
  TaskDetail,
  TaskStatusOption,
  WorkflowPhaseRef,
  WorkflowRef,
} from "@/lib/types/core";
import type { CatalogAssignableStaffOption } from "@/lib/types/catalog";
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

/** Spanish copy when a file can't be attached to a task, or "" when it can. */
export function taskAttachmentError(file: { type: string; size: number }): string {
  if (!file.type.startsWith("image/") && file.type !== "text/plain") {
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
const NO_ETAPAS: WorkflowRef[] = [];
const NO_STAFF: CatalogAssignableStaffOption[] = [];
const NO_PHASES: WorkflowPhaseRef[] = [];
const NO_SPACES: ProjectSpaceRef[] = [];

export type TaskSheetCatalogs = {
  statuses: TaskStatusOption[];
  etapas: WorkflowRef[];
  /** Responsable and "@" mentions: `{id,name,suggested}`, suggested for the task's etapa first. */
  staff: CatalogAssignableStaffOption[];
  /** The active fases of the task's etapa; empty without one. */
  phases: WorkflowPhaseRef[];
  /** The project's espacios; empty for an admin task. */
  spaces: ProjectSpaceRef[];
};

/**
 * The options of the sheet's selects, from the catalog keys `getTaskSheetData`
 * seeded (`catalog.taskStatuses`, `catalog.workflows`,
 * `catalog.assignableStaff(workflowId)`, `catalog.projectSpaces(pid)` and the
 * etapa's fases): no request while they are fresh, a refetch of only the
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
  const etapas = useQuery({ ...catalogWorkflowsOptions(), enabled: loaded }).data ?? NO_ETAPAS;
  const staff = useQuery({ ...catalogAssignableStaffOptions(workflowId), enabled: loaded }).data ?? NO_STAFF;
  const phases = useQuery({ ...taskPhasesOptions(workflowId ?? ""), enabled: withPhases }).data ?? NO_PHASES;
  const spaces = useQuery({ ...catalogProjectSpacesOptions(task?.projectId ?? ""), enabled: withSpaces }).data ?? NO_SPACES;
  return {
    statuses,
    etapas,
    staff,
    phases: withPhases ? phases : NO_PHASES,
    spaces: withSpaces ? spaces : NO_SPACES,
  };
}

/** Download/preview URL of a task attachment. */
export function taskAttachmentHref(taskId: string, attachmentId: string): string {
  return `/api/tareas/${taskId}/adjuntos/${attachmentId}`;
}

/** Etapa select for a non-admin task that has none (legacy rows); the select is hidden once it has one. */
export function TaskEtapaSelect({
  etapas,
  onChange,
  triggerClassName = "w-56",
  disabled,
}: {
  etapas: WorkflowRef[];
  onChange: (workflowId: string) => void;
  triggerClassName?: string;
  disabled?: boolean;
}) {
  return (
    <Select
      items={Object.fromEntries(etapas.map((t) => [t.id, t.name]))}
      value=""
      disabled={disabled}
      onValueChange={(v) => {
        if (v) onChange(v as string);
      }}
    >
      <SelectTrigger aria-label="Etapa" className={triggerClassName}>
        <SelectValue placeholder="Sin etapa" />
      </SelectTrigger>
      <SelectContent>
        {etapas.map((t) => (
          <SelectItem key={t.id} value={t.id}>
            {t.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Fase select over the task's etapa catalog. A task without fase shows
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

/** Thumbnails of the task's attachments (old checklist photos included), or "Sin archivos adjuntos.". */
export function TaskAttachmentGrid({ task }: { task: Pick<TaskDetail, "id" | "attachments"> }) {
  const files = task.attachments;
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
