/**
 * Step logic of the monday import wizard (#672): labels, select encodings and immutable edits of the draft
 * mapping.json. Pure and client-safe (only `mapping.schema.ts` and types): the screens render it, the tests cover it.
 */

import {
  Mapping,
  type BoardStrategy,
  type ClientRef,
  type ColumnTarget,
  type MappingInput,
  type PersonTarget,
  type StatusTarget,
} from "@/scripts/monday/mapping.schema";
import type {
  MondayBoardSource,
  MondayConnection,
  MondayExportSource,
  MondayImportChoices,
  MondayImportJob,
  MondayImportRunState,
  MondayImportStep,
  MondayPreview,
} from "@/lib/types/monday-import";
import type { RollbackBlocker } from "@/scripts/monday/rollback";

export type BoardDraft = MappingInput["boards"][number];

export const MONDAY_IMPORT_STEPS: { id: MondayImportStep; label: string; description: string }[] = [
  { id: "conectar", label: "Conectar monday", description: "Escribe tu token de monday para ver tus tableros." },
  {
    id: "tableros",
    label: "Tableros",
    description: "Elige los tableros a importar y qué será cada uno en Cincel.",
  },
  {
    id: "equivalencias",
    label: "Equivalencias",
    description: "Revisa qué será en Cincel cada columna, estatus y grupo de monday.",
  },
  { id: "personas", label: "Personas", description: "Elige quién es en Cincel cada persona de monday." },
  { id: "opciones", label: "Opciones", description: "Elige si se importan la bitácora y los archivos." },
  { id: "vista_previa", label: "Vista previa", description: "Revisa lo que se va a crear antes de importar." },
  { id: "importar", label: "Importar", description: "Importa a Cincel y revisa el resultado." },
];

export function stepIndex(step: MondayImportStep): number {
  return MONDAY_IMPORT_STEPS.findIndex((candidate) => candidate.id === step);
}

export function nextStep(step: MondayImportStep): MondayImportStep {
  return MONDAY_IMPORT_STEPS[Math.min(stepIndex(step) + 1, MONDAY_IMPORT_STEPS.length - 1)].id;
}

export function previousStep(step: MondayImportStep): MondayImportStep {
  return MONDAY_IMPORT_STEPS[Math.max(stepIndex(step) - 1, 0)].id;
}

// --- Labels -------------------------------------------------------------------------------------------------------

export const STRATEGY_OPTIONS: { value: BoardStrategy; label: string; description: string }[] = [
  {
    value: "board_as_project",
    label: "Tablero como proyecto",
    description: "El tablero será un proyecto; cada elemento, una tarea y cada grupo, una fase.",
  },
  {
    value: "group_as_project",
    label: "Grupo como proyecto",
    description: "Cada grupo será un proyecto y sus elementos, sus tareas.",
  },
  {
    value: "item_as_project",
    label: "Elemento como proyecto",
    description: "Cada elemento será un proyecto y sus subelementos, sus tareas.",
  },
  {
    value: "crm_contacts",
    label: "Contactos del Directorio",
    description: "Cada elemento será un contacto del Directorio.",
  },
  { value: "skip", label: "No importar", description: "Este tablero no se importa." },
];

export function strategyDescription(strategy: BoardStrategy): string {
  return STRATEGY_OPTIONS.find((option) => option.value === strategy)?.description ?? "";
}

export const COLUMN_TARGET_LABELS: Record<ColumnTarget, string> = {
  title: "Título",
  notes: "Notas",
  status: "Estatus",
  priority: "Prioridad",
  people: "Responsables",
  commitment_date: "Fecha compromiso",
  delivery_date: "Fecha de entrega",
  timeline: "Cronograma (inicio y fin)",
  dependencies: "Dependencias",
  files: "Archivos",
  client: "Cliente",
  contact_email: "Correo del contacto",
  contact_phone: "Teléfono del contacto",
  import_data: "Guardar como dato importado",
  ignore: "Ignorar",
};

export const BASE_STATUS_LABELS = {
  pendiente: "Pendiente",
  en_proceso: "En proceso",
  completado: "Completado",
  bloqueado: "Bloqueado",
} as const;

export const SUBITEM_LABELS: Record<NonNullable<BoardDraft["subitems"]>, string> = {
  checklist: "Checklist de la tarea",
  child_tasks: "Subtareas",
  ignore: "Ignorar",
};

export const CONTACT_TYPE_LABELS = { cliente: "Cliente", socio: "Socio", proveedor: "Proveedor" } as const;

// --- Select encodings (Select values are strings) ----------------------------------------------------------------

export function encodeStatusTarget(target: StatusTarget | undefined): string {
  if (!target) return "";
  return "customStatusId" in target ? `custom:${target.customStatusId}` : `status:${target.status}`;
}

export function decodeStatusTarget(value: string): StatusTarget | null {
  if (value.startsWith("custom:")) return { customStatusId: value.slice("custom:".length) };
  if (value.startsWith("status:")) {
    const status = value.slice("status:".length);
    if (status in BASE_STATUS_LABELS) return { status: status as keyof typeof BASE_STATUS_LABELS };
  }
  return null;
}

export function encodeClient(client: ClientRef | null | undefined): string {
  if (!client) return "none";
  if (client.kind === "contact") return `contact:${client.contactId}`;
  if (client.kind === "relation_column") return `relation:${client.columnId}`;
  return "new";
}

/** `new` takes the board name and is an empresa until the admin says otherwise. */
export function decodeClient(value: string, newName: string): ClientRef | null {
  if (value.startsWith("contact:")) return { kind: "contact", contactId: value.slice("contact:".length) };
  if (value.startsWith("relation:")) return { kind: "relation_column", columnId: value.slice("relation:".length) };
  if (value === "new") return { kind: "new", name: newName, contactKind: "empresa" };
  return null;
}

export function encodePerson(target: PersonTarget | undefined): string {
  if (!target) return "unmapped";
  if (target.action === "staff") return `staff:${target.staffId}`;
  if (target.action === "contact") return target.contactId ? `contact:${target.contactId}` : "contact";
  return "ignore";
}

export function decodePerson(value: string): PersonTarget {
  if (value.startsWith("staff:")) return { action: "staff", staffId: value.slice("staff:".length) };
  if (value.startsWith("contact:")) return { action: "contact", contactId: value.slice("contact:".length) };
  if (value === "contact") return { action: "contact" };
  if (value === "ignore") return { action: "ignore" };
  return null;
}

// --- Draft edits (immutable) ---------------------------------------------------------------------------------------

export function findBoard(mapping: MappingInput, boardId: string): BoardDraft | undefined {
  return mapping.boards.find((board) => board.mondayBoardId === boardId);
}

export function updateBoard(
  mapping: MappingInput,
  boardId: string,
  update: (board: BoardDraft) => BoardDraft,
): MappingInput {
  return {
    ...mapping,
    boards: mapping.boards.map((board) => (board.mondayBoardId === boardId ? update(board) : board)),
  };
}

/** A label's first target: done labels close the task, the rest start Pendiente (same default as init). */
export function defaultStatusTarget(label: { isDone: boolean }): StatusTarget {
  return { status: label.isDone ? "completado" : "pendiente" };
}

/**
 * Sets a column's Cincel field. Turning a column into `status` adds a status map for its labels so every label
 * has a visible equivalent; turning it into something else drops that map.
 */
export function setColumnTarget(
  board: BoardDraft,
  source: MondayBoardSource,
  columnId: string,
  target: ColumnTarget,
  subitem = false,
): BoardDraft {
  const next: BoardDraft = subitem
    ? { ...board, subitemColumns: { ...(board.subitemColumns ?? {}), [columnId]: target } }
    : { ...board, columns: { ...board.columns, [columnId]: target } };
  const statusMaps = { ...board.statusMaps };
  const other = subitem ? next.columns : (next.subitemColumns ?? {});
  const stillStatus = other[columnId] === "status";
  if (target === "status") {
    const current = statusMaps[columnId] ?? {};
    const filled = { ...current };
    for (const label of source.statusLabels[columnId] ?? []) filled[label.id] ??= defaultStatusTarget(label);
    statusMaps[columnId] = filled;
  } else if (!stillStatus) {
    delete statusMaps[columnId];
  }
  return { ...next, statusMaps };
}

export function setStatusTarget(board: BoardDraft, columnId: string, labelId: string, target: StatusTarget): BoardDraft {
  return {
    ...board,
    statusMaps: { ...board.statusMaps, [columnId]: { ...(board.statusMaps[columnId] ?? {}), [labelId]: target } },
  };
}

/** Sets or clears (empty string) one entry of a record field such as projectNames, projectCodes, templateMatches. */
export function setRecordEntry(
  record: Record<string, string> | undefined,
  key: string,
  value: string,
): Record<string, string> {
  const next = { ...(record ?? {}) };
  if (value.trim()) next[key] = value;
  else delete next[key];
  return next;
}

/** Picking an área keeps the workflow only when it belongs to it, or picks the área's only workflow. */
export function setBoardArea(board: BoardDraft, areaId: string | null, choices: MondayImportChoices): BoardDraft {
  const area = choices.areas.find((candidate) => candidate.id === areaId);
  const flows = area?.workflowIds ?? [];
  let workflowId = board.workflowId ?? null;
  if (area && workflowId && !flows.includes(workflowId)) workflowId = null;
  if (area && !workflowId && flows.length === 1) workflowId = flows[0];
  return { ...board, areaId: areaId ?? null, workflowId };
}

/** Workflows offered for a board: the área's when it has any, else every workflow. */
export function workflowsForBoard(board: BoardDraft, choices: MondayImportChoices): MondayImportChoices["workflows"] {
  const area = choices.areas.find((candidate) => candidate.id === board.areaId);
  if (!area || area.workflowIds.length === 0) return choices.workflows;
  return choices.workflows.filter((workflow) => area.workflowIds.includes(workflow.id));
}

/** Changing the workflow drops template matches that belong to another workflow. */
export function setBoardWorkflow(board: BoardDraft, workflowId: string | null, choices: MondayImportChoices): BoardDraft {
  const allowed = new Set(choices.templates.filter((t) => t.workflowId === workflowId).map((t) => t.id));
  const templateMatches = Object.fromEntries(
    Object.entries(board.templateMatches ?? {}).filter(([, templateId]) => allowed.has(templateId)),
  );
  return { ...board, workflowId, templateMatches };
}

/** What a monday group becomes in Cincel for the board's strategy. */
export function groupEquivalent(strategy: BoardStrategy, groupTitle: string): string {
  switch (strategy) {
    case "board_as_project":
      return `Fase «${groupTitle}» del proyecto`;
    case "group_as_project":
      return `Proyecto «${groupTitle}»`;
    case "item_as_project":
      return `Sus elementos serán proyectos (fase «${groupTitle}»)`;
    case "crm_contacts":
      return "Contactos del Directorio";
    case "skip":
      return "No se importa";
  }
}

/** Keys of `projectNames` / `projectCodes` per strategy: the board, each group or each item. */
export function projectKeys(board: BoardDraft, source: MondayBoardSource): { id: string; mondayName: string }[] {
  switch (board.strategy) {
    case "board_as_project":
      return [{ id: board.mondayBoardId, mondayName: source.name }];
    case "group_as_project":
      return source.groups.map((group) => ({ id: group.id, mondayName: group.title }));
    case "item_as_project":
      return source.items.map((item) => ({ id: item.id, mondayName: item.name }));
    default:
      return [];
  }
}

/** Items whose name a template could match: every item but on CRM or skipped boards. */
export function templateCandidateItems(board: BoardDraft, source: MondayBoardSource): MondayBoardSource["items"] {
  if (board.strategy === "crm_contacts" || board.strategy === "skip") return [];
  return source.items;
}

export function setPerson(mapping: MappingInput, userId: string, target: PersonTarget): MappingInput {
  return { ...mapping, people: { ...mapping.people, [userId]: target } };
}

/** Suggested staff for a monday user, by email (case insensitive). */
export function suggestStaff(
  user: { email: string | null },
  staff: MondayImportChoices["staff"],
): MondayImportChoices["staff"][number] | null {
  const email = user.email?.trim().toLowerCase();
  if (!email) return null;
  return staff.find((member) => member.email?.trim().toLowerCase() === email) ?? null;
}

/** monday users still without an equivalent (null target). */
export function unmappedPeople(mapping: MappingInput, source: MondayExportSource): MondayExportSource["users"] {
  return source.users.filter((user) => !mapping.people[user.id]);
}

/** Options with the disabled switches forced off, so the draft never asks for what can't be imported. */
export function setOptions(
  mapping: MappingInput,
  options: { includeUpdates: boolean; includeFiles: boolean },
  disabled: { updates: boolean; files: boolean },
): MappingInput {
  return {
    ...mapping,
    options: {
      includeUpdates: disabled.updates ? false : options.includeUpdates,
      includeFiles: disabled.files ? false : options.includeFiles,
    },
  };
}

// --- Validation and Next ---------------------------------------------------------------------------------------

/** What `mapping.schema.ts` rejects, as "path: message" lines (same format as the server). */
export function validateMapping(mapping: MappingInput | null): string[] {
  if (!mapping) return ["Todavía no hay equivalencias: primero exporta los tableros."];
  const parsed = Mapping.safeParse(mapping);
  if (parsed.success) return [];
  return parsed.error.issues.map((issue) => `${issue.path.map(String).join(".") || "(raíz)"}: ${issue.message}`);
}

export type WizardState = {
  connection: MondayConnection | null;
  run: MondayImportRunState | null;
  /** Boards checked in Tableros (export --boards). */
  selectedBoardIds: string[];
  mapping: MappingInput | null;
  preview: MondayPreview | null;
};

export function isJobRunning(job: MondayImportJob | undefined): boolean {
  return job?.status === "running";
}

/** Whether Siguiente is enabled on a step. */
export function canAdvance(step: MondayImportStep, state: WizardState): boolean {
  const run = state.run;
  switch (step) {
    case "conectar":
      return state.connection !== null || Boolean(run?.exported);
    case "tableros":
      return Boolean(run?.exported) && !isJobRunning(run?.jobs.export) && Boolean(state.mapping?.boards.length);
    case "equivalencias":
    case "personas":
    case "opciones":
      return validateMapping(state.mapping).length === 0;
    case "vista_previa":
      return Boolean(state.preview?.canApply);
    case "importar":
      return false;
  }
}

/**
 * Where a resumed wizard opens: the saved step once the export is done; Tableros while an export runs; else
 * Conectar (the token is never stored, so connecting again is needed to export).
 */
export function initialStep(run: MondayImportRunState | null): MondayImportStep {
  if (!run) return "conectar";
  if (run.batchId || isJobRunning(run.jobs.apply) || isJobRunning(run.jobs.rollback)) return "importar";
  if (run.exported && run.mapping) return run.step === "conectar" ? "tableros" : run.step;
  if (isJobRunning(run.jobs.export)) return "tableros";
  return "conectar";
}

/** 0..100 for the Progress bar; null while the total is unknown. */
export function jobPercent(job: MondayImportJob | undefined): number | null {
  if (!job) return null;
  if (job.status === "succeeded") return 100;
  const { done, total } = job.progress;
  if (!total) return null;
  return Math.max(0, Math.min(100, Math.round((done / total) * 100)));
}

export const JOB_STATUS_LABELS: Record<MondayImportJob["status"], string> = {
  running: "En curso",
  succeeded: "Terminado",
  failed: "Falló",
  interrupted: "Interrumpido",
};

/** Calls of the picked boards (§4.3). */
export function estimatedCallsFor(connection: MondayConnection | null, boardIds: readonly string[]): number {
  if (!connection) return 0;
  const picked = new Set(boardIds);
  return connection.boards.filter((board) => picked.has(board.id)).reduce((sum, board) => sum + board.estimatedCalls, 0);
}

const BLOCKER_KIND_LABELS: Record<RollbackBlocker["kind"], string> = {
  edited: "Se editó en Cincel después de importar",
  history: "Tiene historial nuevo en Cincel",
  reference: "Otro registro de Cincel lo usa",
  portal: "Ya se compartió en el portal de clientes",
};

/** One line per rollback blocker (§9). */
export function rollbackBlockerText(blocker: RollbackBlocker): string {
  return `${BLOCKER_KIND_LABELS[blocker.kind] ?? "Bloquea"}: ${blocker.what}`;
}

/** Preview count labels, in display order. */
export const PREVIEW_COUNT_LABELS: [keyof MondayPreview["totals"], string][] = [
  ["proyectos", "Proyectos"],
  ["tareas", "Tareas"],
  ["subtareas", "Subtareas"],
  ["checklist", "Elementos de checklist"],
  ["dependencias", "Dependencias"],
  ["contactos", "Contactos"],
  ["comentarios", "Comentarios"],
  ["archivos", "Archivos"],
  ["filasCronograma", "Filas de cronograma"],
  ["yaImportados", "Ya importados (se omiten)"],
];
