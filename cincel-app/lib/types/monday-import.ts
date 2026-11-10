/**
 * Payloads of the monday import wizard (#672) shared by the server actions
 * (lib/actions/monday-import-actions.ts) and the screens. Type-only: safe to
 * import from client components.
 */
import type {
  BoardStrategy,
  MappingInput,
  MondayStatusMap,
  ProjectFlowGroupTarget,
  StatusMapEntry,
} from "@/scripts/monday/mapping.schema";
import type { PlanIssueCode } from "@/scripts/monday/plan";
import type { RollbackBlocker } from "@/scripts/monday/rollback";

export type { BoardStrategy, MappingInput, MondayStatusMap, ProjectFlowGroupTarget, StatusMapEntry };

/** Every action answers `{ ok: true, ... }` or an inline Spanish error. */
export type MondayImportFail = { ok: false; error: string };
export type MondayImportResult<T> = ({ ok: true } & T) | MondayImportFail;

// --- Paso 1: Conectar monday ------------------------------------------------

export interface MondayBoardSummary {
  id: string;
  name: string;
  workspaceId: string | null;
  workspaceName: string | null;
  /** monday's own count; null when monday doesn't say. */
  itemsCount: number | null;
  hierarchyType: string | null;
  /** monday API calls to export this board alone (items + updates; §4.3). */
  estimatedCalls: number;
}

export interface MondayConnection {
  account: { id: string; slug: string; name: string };
  tokenUser: { name: string; email: string };
  /** Where the token came from: typed in the wizard, or MONDAY_TOKEN on the server. */
  tokenSource: "input" | "env";
  workspaces: { id: string; name: string }[];
  boards: MondayBoardSummary[];
  /** Calls for every visible board with updates and files (§4.3); files add 1 per 50 once known. */
  estimatedCalls: number;
}

// --- Jobs (export, apply, rollback) -----------------------------------------

export type MondayImportJobKind = "export" | "apply" | "rollback";
/** `interrupted`: the server restarted while the job ran; start it again to resume. */
export type MondayImportJobStatus = "running" | "succeeded" | "failed" | "interrupted";

export interface MondayImportJob {
  kind: MondayImportJobKind;
  status: MondayImportJobStatus;
  startedAt: string;
  finishedAt: string | null;
  /** 0..total; total is null while unknown. */
  progress: { done: number; total: number | null; label: string };
  /** The command's output lines, oldest first (last 500). Never holds the token. English; only downloaded. */
  log: string[];
  /** What the job did, in Spanish and without server paths: the Registro shown on screen. Missing on older runs. */
  notes?: string[];
  /** Spanish summary of why it failed. */
  error: string | null;
}

// --- Run (one export folder + its draft mapping) -----------------------------

export type MondayImportStep =
  | "conectar"
  | "tableros"
  | "equivalencias"
  | "personas"
  | "opciones"
  | "vista_previa"
  | "importar";

export interface MondayImportRunState {
  runId: string;
  createdAt: string;
  updatedAt: string;
  /** Last step the admin saved; the wizard resumes there. */
  step: MondayImportStep;
  account: { id: string; slug: string; name: string } | null;
  /** Boards picked in Conectar (export --boards). */
  boardIds: string[];
  exportOptions: { updates: boolean; files: boolean };
  /** True once every picked board has its `.done` marker. */
  exported: boolean;
  /** The draft mapping.json (prefilled by init); null until the export finished. */
  mapping: MappingInput | null;
  /** Last job of each kind. */
  jobs: Partial<Record<MondayImportJobKind, MondayImportJob>>;
  /** The import batch apply created, once it did. */
  batchId: string | null;
  batchStatus: "applying" | "applied" | "rolled_back" | null;
}

// --- Paso 3: Equivalencias choices -------------------------------------------

/** The Cincel side of every Equivalencias select (project flow FE §7.8). */
export interface MondayImportChoices {
  statuses: { id: string; name: string; closes: boolean; countsAsCompleted: boolean }[];
  /** Active tramos with their active fases, in catalog order. */
  workflows: { id: string; name: string; phases: { id: string; name: string; sortOrder: number }[] }[];
  /** Active templates with their fase. */
  templates: { id: string; workflowId: string; phaseId: string; name: string }[];
  /** Live, active puestos with their candidate fases. */
  positions: { id: string; name: string; phaseIds: string[] }[];
  clients: { id: string; name: string }[];
  staff: { id: string; name: string; email: string | null }[];
  providerSubtypes: string[];
  /** The saved firm-wide status map (RD-5). */
  statusMap: MondayStatusMap;
}

/** Per board: what init found in the export, so every monday thing has a row in the table. */
export interface MondayBoardSource {
  id: string;
  name: string;
  columns: { id: string; title: string; type: string }[];
  subitemColumns: { id: string; title: string; type: string }[];
  groups: { id: string; title: string }[];
  /** Status columns' labels: columnId → labels. `items`: active items and subitems with the label (the status map's «Elementos»). */
  statusLabels: Record<string, { id: string; name: string; isDone: boolean; items?: number }[]>;
  itemCount: number;
  /** "Con dato": columnId → share (0..1) of the board's items with a value in that column (board and subitem columns). */
  columnFill?: Record<string, number>;
  /** Active top-level items, for template matches and project names by item. */
  items: { id: string; name: string; groupId: string | null }[];
  /** monday people in the people columns of the board's items and subitems, for the card avatars (#685). */
  userIds?: string[];
}

export interface MondayExportSource {
  boards: MondayBoardSource[];
  users: { id: string; name: string; email: string | null; kind: string | null }[];
  hasFiles: boolean;
  hasUpdates: boolean;
}

// --- Paso 5: Opciones ---------------------------------------------------------

export interface MondayImportOptionsInfo {
  /** null when files can be included; else why the switch is disabled. */
  filesDisabledReason: string | null;
  /** null when updates can be included; else why (not exported). */
  updatesDisabledReason: string | null;
}

// --- Paso 6: Vista previa -----------------------------------------------------

export interface MondayPreviewCounts {
  proyectos: number;
  tareas: number;
  subtareas: number;
  checklist: number;
  dependencias: number;
  contactos: number;
  comentarios: number;
  archivos: number;
  filasCronograma: number;
  /** Already imported by an earlier batch; apply skips them. */
  yaImportados: number;
}

export interface MondayPreviewIssue {
  code: PlanIssueCode;
  blocking: boolean;
  boardId: string | null;
  itemId: string | null;
  /** The monday board and item names it is about, when known. */
  boardName: string | null;
  itemName: string | null;
  /** Spanish, without ids or server paths (lib/monday-import/preview-issues.ts). */
  message: string;
  /** The step where it gets fixed ("Corregir" opens it on `boardId`). */
  fixStep: MondayImportStep;
  /** PERSON_UNMATCHED (#689): the monday user, so "Corregir" opens their row of Personas and "Crear integrante" works here. */
  personId?: string | null;
  personName?: string | null;
}

/** One monday item as the Cincel row apply creates for it. */
export interface MondayPreviewSample {
  mondayItemId: string;
  mondayName: string;
  groupTitle: string | null;
  entity: "proyecto" | "tarea" | "contacto";
  cincel: {
    title: string;
    project: string | null;
    status: string | null;
    customStatus: string | null;
    priority: string | null;
    manager: string | null;
    /** A task's tramo; a project's tramos, joined. */
    tramo: string | null;
    /** A task's fase. */
    phase: string | null;
    /** A task with no template and no fase-name match: "Sin fase · revisar". */
    phaseReview: boolean;
    /** The espacio a task goes to (a `space` group). */
    space: string | null;
    /** A task of a "Tareas de administración" group. */
    admin: boolean;
    commitmentDate: string | null;
    deliveryDate: string | null;
    kind: "workflow" | "usuario" | "admin" | null;
    template: boolean;
    checklistItems: number;
    /** Top-level tasks of a project sample. */
    tasks: number;
    /** Subtasks of a task sample (parent_task children). */
    childTasks: number;
    comments: number;
    files: number;
    contactType: string | null;
  };
}

export interface MondayPreviewBoard {
  boardId: string;
  name: string;
  strategy: BoardStrategy;
  counts: MondayPreviewCounts;
  /** Up to 5 items of the board; boards whose items become tasks list up to 5 of their projects first. */
  samples: MondayPreviewSample[];
}

export interface MondayPreview {
  /** False while any blocking issue is left: Next / Importar stay disabled. */
  canApply: boolean;
  totals: MondayPreviewCounts;
  boards: MondayPreviewBoard[];
  issues: MondayPreviewIssue[];
}

// --- Paso 7: Importar / Deshacer -----------------------------------------------

export interface MondayImportedProject {
  id: string;
  name: string;
  href: string;
  /** The monday board it came from (its import ref's source), for the board cards (#685). */
  boardId?: string | null;
}

export interface MondayRollbackCheck {
  batchId: string;
  canRollback: boolean;
  blockers: RollbackBlocker[];
}

// --- Project flow (FE §7.8): puesto suggestion and "Reacomodar importación" ---

/** "Crear integrante": the puesto suggested by where the person's tasks land. */
export interface MondayPositionSuggestion {
  position: { id: string; name: string } | null;
  /** The person's tasks in this import. */
  tasks: number;
  /** Up to 3. */
  topPhases: { workflowName: string; phaseName: string; tasks: number }[];
}

export interface MondayRemapBoard {
  boardId: string;
  name: string;
  /** null: board missing from the stored export. */
  source: MondayBoardSource | null;
  /** "Tramo del tablero". */
  workflowId: string | null;
  /** Current targets, prefilled from the import refs (groupId → target). */
  groupTargets: Record<string, ProjectFlowGroupTarget>;
}

export interface MondayRemapState {
  project: { id: string; name: string };
  boards: MondayRemapBoard[];
  choices: MondayImportChoices;
}

export type MondayRemapInput = Array<{
  boardId: string;
  workflowId: string | null;
  groupTargets: Record<string, ProjectFlowGroupTarget>;
}>;

export interface MondayRemapPreview {
  tasks: number;
  changes: {
    tramo: number;
    phase: number;
    space: number;
    admin: number;
    otherProject: number;
    unchanged: number;
    phaseUnresolved: number;
  };
  /** "Tramo · Fase · Espacio" before/after, up to 10. */
  samples: Array<{ taskId: string; title: string; before: string; after: string }>;
  issues: MondayPreviewIssue[];
}
