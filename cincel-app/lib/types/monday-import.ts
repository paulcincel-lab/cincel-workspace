/**
 * Payloads of the monday import wizard (#672) shared by the server actions
 * (lib/actions/monday-import-actions.ts) and the screens. Type-only: safe to
 * import from client components.
 */
import type { BoardStrategy, MappingInput } from "@/scripts/monday/mapping.schema";
import type { PlanIssueCode } from "@/scripts/monday/plan";
import type { RollbackBlocker } from "@/scripts/monday/rollback";

export type { BoardStrategy, MappingInput };

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
  /** The command's output lines, oldest first (last 500). Never holds the token. */
  log: string[];
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

/** The Cincel side of every Equivalencias select. */
export interface MondayImportChoices {
  statuses: { id: string; name: string; closes: boolean }[];
  areas: { id: string; name: string; workflowIds: string[] }[];
  workflows: { id: string; name: string }[];
  templates: { id: string; workflowId: string; name: string }[];
  clients: { id: string; name: string }[];
  staff: { id: string; name: string; email: string | null }[];
  providerSubtypes: string[];
}

/** Per board: what init found in the export, so every monday thing has a row in the table. */
export interface MondayBoardSource {
  id: string;
  name: string;
  columns: { id: string; title: string; type: string }[];
  subitemColumns: { id: string; title: string; type: string }[];
  groups: { id: string; title: string }[];
  /** Status columns' labels: columnId → labels. */
  statusLabels: Record<string, { id: string; name: string; isDone: boolean }[]>;
  itemCount: number;
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
  message: string;
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
    phase: string | null;
    commitmentDate: string | null;
    deliveryDate: string | null;
    kind: "workflow" | "usuario" | null;
    template: boolean;
    checklistItems: number;
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
  /** Up to 5 items of the board. */
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
}

export interface MondayRollbackCheck {
  batchId: string;
  canRollback: boolean;
  blockers: RollbackBlocker[];
}
