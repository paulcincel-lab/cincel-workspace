/**
 * Shared DTOs for the core model. Ids are uuids; enum values are the ASCII
 * codes stored in the database — display labels live in the UI.
 */

// ── Enums ───────────────────────────────────────────────────────────────────
export type ContactType = "cliente" | "socio" | "proveedor";
export type ContactKind = "empresa" | "particular";
export type ProviderSubtype = "contratista" | "colaborador" | "tienda";
export type ProviderStatus = "activo" | "inactivo" | "pausado" | "prospecto" | "lista_negra";
export type StaffKind = "empleado" | "freelance" | "servicio_social";
export type ProjectStatus = "activo" | "pausado" | "completado" | "cancelado";
/** `admin`: admin-only task, no tramo / fase / espacio, administrators only (project flow). */
export type TaskKind = "workflow" | "usuario" | "admin";
/** When a tramo starts by itself (BE §3.2). The UI shows it as one switch: `manual` = off. */
export type WorkflowAutoStart = "on_create" | "on_ready" | "manual";
export type TaskStatus = "pendiente" | "en_proceso" | "completado" | "bloqueado";
export type TaskPriority = "alta" | "media" | "baja";
export type HistoryEntity =
  | "task"
  | "project"
  | "contact"
  | "resource_link"
  | "staff"
  | "area"
  | "workflow";
export type HistoryEventKind = "comentario" | "cambio";
export type ContactTagKind = "categoria" | "habilidad";

// ── People inside ───────────────────────────────────────────────────────────
export type Staff = {
  id: string;
  kind: StaffKind;
  name: string;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  role: string | null;
  capacity: number;
  availability: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  /** Role and áreas come from Google Workspace (`google_sub` set); Equipo shows them read-only. */
  googleManaged: boolean;
  /** Last Google sign-in (ISO). */
  lastLoginAt: string | null;
  /** Set when the access re-check revoked access (ISO); cleared by the next allowed sign-in. */
  accessRevokedAt: string | null;
  accessRevokedReason: string | null;
  /**
   * Project flow (FE §7.1): the person's puestos and the candidate fases they
   * suggest. Optional until the staff DTOs fill them (Equipo, Phase 3).
   */
  positions?: PositionRef[];
  candidatePhases?: Array<WorkflowPhaseRef & { workflowName: string }>;
};

/** A collaborator's emergency contact, for quick access in Equipo (#451). */
export type EmergencyContact = { name: string | null; relation: string | null; phone: string | null; address: string | null };

export type StaffProfile = {
  personalEmail: string | null;
  homePhone: string | null;
  nationality: string | null;
  address: string | null;
  maritalStatus: string | null;
  birthDate: string | null;
  curp: string | null;
  rfc: string | null;
  emergencyContactName: string | null;
  emergencyContactRelation: string | null;
  emergencyContactPhone: string | null;
  emergencyContactAddress: string | null;
};

export type StaffAccess = {
  hasPassword: boolean;
  enabled: boolean;
  mustChangePassword: boolean;
  passwordUpdatedAt: string | null;
  lastLoginAt: string | null;
};

export type StaffDetail = Staff & {
  profile: StaffProfile | null;
  positions: PositionRef[];
  access: StaffAccess | null;
};

export type StaffInput = {
  kind?: StaffKind;
  name: string;
  lastName?: string | null;
  phone?: string | null;
  email?: string | null;
  role?: string | null;
  capacity?: number;
  availability?: string | null;
  active?: boolean;
};

// ── Puestos (project flow, FE §7.1) ─────────────────────────────────────────
export type PositionRef = { id: string; name: string };
export type Position = PositionRef & {
  sortOrder: number;
  active: boolean;
  /** Candidate fases, in tramo then catalog order. Suggestions only. */
  phases: Array<WorkflowPhaseRef & { workflowId: string; workflowName: string }>;
  staffCount: number;
  /** Referenced by a Google group mapping (can't be deleted: IN_USE). */
  googleManaged: boolean;
};
export type PositionInput = { name: string; active?: boolean };

// ── People outside (CRM) ────────────────────────────────────────────────────
export type Contact = {
  id: string;
  type: ContactType;
  kind: ContactKind;
  name: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  location: string | null;
  acquisitionChannel: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ContactPerson = {
  id: string;
  name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
  isPrimary: boolean;
  sortOrder: number;
};

export type ContactPersonInput = Omit<ContactPerson, "id" | "sortOrder"> & { id?: string };

export type ContactTag = { kind: ContactTagKind; value: string };

export type ProviderProfile = {
  subtype: ProviderSubtype;
  status: ProviderStatus | null;
  mainSpecialty: string | null;
  department: string | null;
  seniority: string | null;
  priceLevel: string | null;
  availability: string | null;
  comments: string | null;
  rating: number | null;
  startDate: string | null;
  staffId: string | null;
};

export type ClientStats = {
  totalProjects: number;
  activeProjects: number;
  firstWorkDate: string | null;
  totalContractedMxn: string;
};

export type ContactListItem = Contact & {
  primaryPerson: ContactPerson | null;
  tags: ContactTag[];
  providerProfile: ProviderProfile | null;
};

export type ContactDetail = Contact & {
  people: ContactPerson[];
  tags: ContactTag[];
  providerProfile: ProviderProfile | null;
  stats: ClientStats | null;
  projects: Array<{ id: string; name: string; status: ProjectStatus; startDate: string | null }>;
};

export type ContactInput = {
  type: ContactType;
  kind?: ContactKind;
  name: string;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  location?: string | null;
  acquisitionChannel?: string | null;
  notes?: string | null;
  people?: ContactPersonInput[];
  tags?: ContactTag[];
  providerProfile?: ProviderProfile | null;
};

// ── Method ──────────────────────────────────────────────────────────────────
/** A tramo (Presale, Diseño, Construcción). */
export type Workflow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  active: boolean;
  sortOrder: number;
  autoStart: WorkflowAutoStart;
};

/** A fase of a tramo's catalog. */
export type WorkflowPhaseRef = { id: string; name: string; sortOrder: number };
export type WorkflowPhase = WorkflowPhaseRef & {
  workflowId: string;
  active: boolean;
  /** Active templates in this fase. */
  templateCount: number;
};
export type WorkflowPhaseInput = { name: string; active?: boolean };

/** Read-only: when this tramo's projects become "Listos para iniciar". Null for the first tramo. */
export type TramoReadiness = { afterWorkflow: WorkflowRef; afterPhase: WorkflowPhaseRef } | null;

export type WorkflowTaskTemplate = {
  id: string;
  workflowId: string;
  /**
   * The template's fase. `phase_id` stays nullable in the DB until release B
   * (0025); 0024 backfills every template, so "" only shows before 0024 runs.
   */
  phaseId: string;
  phaseName: string;
  title: string;
  notes: string | null;
  defaultPriority: TaskPriority;
  commitmentOffsetDays: number | null;
  reviewOffsetDays: number | null;
  deliveryOffsetDays: number | null;
  sortOrder: number;
  active: boolean;
};

export type WorkflowDetail = Workflow & {
  /** Catalog order. */
  phases: WorkflowPhase[];
  templates: WorkflowTaskTemplate[];
  readiness: TramoReadiness;
};

export type WorkflowInput = {
  key: string;
  name: string;
  description?: string | null;
  active?: boolean;
  sortOrder?: number;
};

export type WorkflowTaskTemplateInput = {
  /** Required: a fase of the template's tramo (else PHASE_MISMATCH). */
  phaseId: string;
  title: string;
  notes?: string | null;
  defaultPriority?: TaskPriority;
  commitmentOffsetDays?: number | null;
  reviewOffsetDays?: number | null;
  deliveryOffsetDays?: number | null;
  sortOrder?: number;
  active?: boolean;
};

// ── Work ────────────────────────────────────────────────────────────────────
export type Project = {
  id: string;
  code: string | null;
  name: string;
  /** Optional (ADR 0003). Admin only: null for non-admins once DTOs take a ViewerScope. */
  clientId: string | null;
  /** Who brought the project in. Admin only (null for others). */
  origin: string | null;
  /** Admin only. */
  originStaffId: string | null;
  status: ProjectStatus;
  currentWorkflowId: string | null;
  projectType: string | null;
  addressStreet: string | null;
  addressCity: string | null;
  addressState: string | null;
  managerId: string | null;
  coordinatorId: string | null;
  progress: number;
  startDate: string | null;
  endDate: string | null;
  contractAmountMxn: string | null;
  createdAt: string;
  updatedAt: string;
};

export type StaffRef = { id: string; name: string };
export type ContactRef = { id: string; name: string; type: ContactType };
export type WorkflowRef = { id: string; key: string; name: string; sortOrder: number };

/** A tramo started on a project. */
export type ProjectTramo = WorkflowRef & { startedAt: string | null; closedAt: string | null; current: boolean };

// ── Espacios ────────────────────────────────────────────────────────────────
export type ProjectSpaceRef = { id: string; name: string };
export type ProjectSpace = ProjectSpaceRef & { projectId: string; sortOrder: number; taskCount: number };

export type ProjectListItem = Project & {
  /** Null: no client, or the viewer isn't admin. */
  client: ContactRef | null;
  currentWorkflow: WorkflowRef | null;
  /** Started tramos in tramo order, with dates and `current`. Replaces `stages`. */
  tramos: ProjectTramo[];
  /** First catalog fase of the current tramo with open tasks. */
  activePhase: WorkflowPhaseRef | null;
  /** No current tramo (migration flag "Asignar tramo"). */
  needsTramo: boolean;
  /** @deprecated Every stage the project is in, in workflow order; use `tramos`. */
  stages: WorkflowRef[];
  manager: StaffRef | null;
  coordinator: StaffRef | null;
  taskCounts: { total: number; open: number; blocked: number };
};

/** Same audiences as task links: for the internal team or for the client. */
export type ProjectLink = {
  id: string;
  kind: TaskLinkKind;
  title: string;
  url: string;
  driveFileId: string | null;
};

export type ProjectLinkInput = { kind: TaskLinkKind; title: string; url: string };

export type ProjectDetail = Project & {
  /** Null: no client, or the viewer isn't admin. */
  client: ContactRef | null;
  currentWorkflow: WorkflowRef | null;
  tramos: ProjectTramo[];
  needsTramo: boolean;
  /** @deprecated Every stage the project is in, in workflow order; use `tramos`. */
  stages: WorkflowRef[];
  manager: StaffRef | null;
  coordinator: StaffRef | null;
  /** Admin only. */
  originStaff: StaffRef | null;
  /** Admins only (null for others, and for projects not imported): the monday boards it came from. */
  mondayImport: { boards: Array<{ id: string; name: string }> } | null;
  members: Array<StaffRef & { role: string | null; active: boolean }>;
  contacts: Array<ContactRef & { role: string | null }>;
  links: ProjectLink[];
};

/** "+ Nuevo proyecto": the name only (FE §3.4). */
export type ProjectCreateInput = { name: string };

export type ProjectInput = {
  code?: string | null;
  name: string;
  clientId: string | null;
  /** Admin only. */
  origin?: string | null;
  /** Admin only. */
  originStaffId?: string | null;
  status?: ProjectStatus;
  projectType?: string | null;
  addressStreet?: string | null;
  addressCity?: string | null;
  addressState?: string | null;
  managerId?: string | null;
  coordinatorId?: string | null;
  progress?: number;
  startDate?: string | null;
  endDate?: string | null;
  contractAmountMxn?: string | null;
};

export type Task = {
  id: string;
  projectId: string;
  kind: TaskKind;
  templateId: string | null;
  workflowId: string | null;
  /** A fase of the task's tramo; null = "Sin fase · revisar". */
  phaseId: string | null;
  /** An espacio of the task's project. */
  spaceId: string | null;
  /** When the task last closed; null while open. */
  closedAt: string | null;
  title: string;
  notes: string | null;
  createdById: string;
  managerId: string | null;
  status: TaskStatus;
  /** Display-only custom status; `status` remains the base status. */
  customStatusId: string | null;
  priority: TaskPriority;
  /** Manual drag order within a project; null = not manually ordered. */
  sortOrder: number | null;
  commitmentDate: string | null;
  reviewDate: string | null;
  deliveryDate: string | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
};

/**
 * An admin-defined status of its own. `closes` = closes the task;
 * `countsAsCompleted` = counts as finished work (only when it closes).
 */
export type TaskStatusOption = {
  id: string;
  name: string;
  closes: boolean;
  countsAsCompleted: boolean;
  sortOrder: number;
};

export type TaskStatusInput = {
  name: string;
  closes?: boolean;
  /** `true` with `closes: false` → INVALID. */
  countsAsCompleted?: boolean;
  sortOrder?: number;
};

export type TaskListItem = Task & {
  customStatus: { id: string; name: string; closes: boolean; countsAsCompleted: boolean } | null;
  /** `clientName` is null when the project has no client, or the viewer isn't admin. */
  project: { id: string; name: string; clientName: string | null };
  workflow: WorkflowRef | null;
  /** The task's fase (FE §7.1); null = "Sin fase · revisar". */
  phase: WorkflowPhaseRef | null;
  space: ProjectSpaceRef | null;
  manager: StaffRef | null;
  support: StaffRef[];
  checklist: { total: number; completed: number };
  parentTaskId: string | null;
  /** Null when the task has no parent or the parent was deleted ("Tarea padre eliminada"). */
  parentTitle: string | null;
  /** Live (not deleted, not archived) child tasks. */
  subtaskCount: number;
  subtaskDoneCount: number;
  /** Dependencies that aren't completado, deleted or archived. */
  waitingOn: number;
};

/** Compact task reference for subtask and dependency lists. */
export type TaskRef = {
  id: string;
  title: string;
  status: TaskStatus;
  managerName: string | null;
  commitmentDate: string | null;
};

/** Untranslated data an import kept for a row (`core.import_refs.data`). */
export type ImportData = {
  source: "monday";
  importedAt: string;
  boardName: string | null;
  groupTitle: string | null;
  data: Record<string, unknown>;
};

export type TaskChecklistItem = {
  id: string;
  title: string;
  completed: boolean;
  sortOrder: number;
};

/** Metadata only — the file bytes are fetched separately via the download route. */
export type TaskAttachment = {
  id: string;
  taskId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: StaffRef | null;
  /** Set when this is a photo attached to a specific checklist item. */
  checklistItemId: string | null;
  createdAt: string;
};

export type TaskLinkKind = "interno" | "cliente";

export type TaskLink = {
  id: string;
  taskId: string;
  kind: TaskLinkKind;
  title: string;
  url: string;
  createdAt: string;
};

export type TaskLinkInput = { kind: TaskLinkKind; title: string; url: string };

export type TaskDetail = TaskListItem & {
  createdBy: StaffRef;
  checklistItems: TaskChecklistItem[];
  attachments: TaskAttachment[];
  links: TaskLink[];
  history: HistoryEvent[];
};

export type UserTaskInput = {
  projectId: string;
  title: string;
  notes?: string | null;
  /** The task's tramo. Required: null (or an unknown tramo) → INVALID. */
  workflowId: string | null;
  /** Must belong to `workflowId` (PHASE_MISMATCH). */
  phaseId?: string | null;
  /** Must belong to `projectId` (SPACE_MISMATCH). */
  spaceId?: string | null;
  managerId?: string | null;
  supportIds?: string[];
  priority?: TaskPriority;
  commitmentDate?: string | null;
  reviewDate?: string | null;
  deliveryDate?: string | null;
};

/** Input for a child task: project, fase and tramo come from the parent; `spaceId` allowed. */
export type SubtaskInput = Omit<UserTaskInput, "projectId" | "phaseId" | "workflowId">;

/** "+ Tarea de administración": no tramo, fase or espacio; administrator assignees only. */
export type AdminTaskInput = Omit<UserTaskInput, "workflowId" | "phaseId" | "spaceId">;

export type TaskPatch = Partial<
  Pick<
    Task,
    | "title"
    | "notes"
    | "phaseId"
    | "spaceId"
    | "priority"
    | "status"
    | "managerId"
    | "commitmentDate"
    | "reviewDate"
    | "deliveryDate"
    | "workflowId"
  >
>; // `workflowId` only when the task has none and isn't an admin task (else INVALID)

export type TaskFilters = {
  projectId?: string;
  workflowId?: string;
  phaseId?: string;
  spaceId?: string;
  /** Default excludes "admin"; admin tasks only when asked and the viewer is admin. */
  kind?: TaskKind | TaskKind[];
  status?: TaskStatus | TaskStatus[];
  managerId?: string;
  involvesStaffId?: string;
  archived?: boolean;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
};

// ── Starting a tramo (FE §7.1, BE §9) ────────────────────────────────────────
export type TramoCandidateProject = {
  project: { id: string; name: string };
  currentTramo: WorkflowRef | null;
  /** ISO; null in "Próximos". */
  readySince: string | null;
  /** "Próximos" only. */
  pending: { tramo: WorkflowRef; phase: WorkflowPhaseRef; open: number; total: number } | null;
};

export type TramoBoard = {
  workflow: WorkflowRef;
  /** Not started here, readiness met. */
  ready: TramoCandidateProject[];
  /** Not started here, readiness not met. */
  upcoming: TramoCandidateProject[];
  /** Projects with this tramo started; drives "Deshacer inicio" on the project block. */
  started: Array<{
    projectId: string;
    /** Latest start batch of this tramo; null if none. */
    batchId: string | null;
    createdCount: number;
    /** No created task edited yet, and no later batch. */
    canUndo: boolean;
  }>;
};

export type StaffCandidate = { id: string; name: string; positions: string[]; openTasks: number };

export type StartTramoPreview = {
  project: { id: string; name: string };
  workflow: WorkflowRef;
  alreadyStarted: boolean;
  /** workflow.autoStart !== "manual" */
  autoStart: boolean;
  phases: Array<{
    phase: WorkflowPhaseRef;
    /** Templates still to create (idempotent). */
    templates: Array<{ id: string; title: string }>;
    /** Templates already created on this project. */
    existing: number;
    /** Staff whose puestos list this fase. */
    candidates: StaffCandidate[];
  }>;
};

export type StartTramoAssignment =
  | { mode: "self" }
  | { mode: "by_phase"; managers: Record<string /* phaseId */, string | null> }
  | { mode: "none" };

export type StartTramoInput = {
  projectId: string;
  workflowId: string;
  /** Checked fases. */
  phaseIds: string[];
  assignment: StartTramoAssignment;
  /** Admin only; sets the firm-wide setting. */
  autoStart?: boolean;
};

export type StartTramoResult = {
  /** Null when nothing was created. */
  batchId: string | null;
  createdCount: number;
  skippedCount: number;
  /** A project_stages row was opened. */
  stageCreated: boolean;
  project: { id: string; name: string };
  workflow: WorkflowRef;
};

/**
 * Who is reading: passed from actions to repositories and DTO builders (BE §6).
 * `staffId` is the session staff id; `isAdmin` is `canSeeAdminData(user)`
 * (lib/auth/permissions.ts), which gates admin tasks, client and origin data.
 */
export type ViewerScope = { staffId: string; isAdmin: boolean };

// ── Shared ──────────────────────────────────────────────────────────────────
export type HistoryEvent = {
  id: string;
  entity: HistoryEntity;
  entityId: string;
  kind: HistoryEventKind;
  actor: StaffRef | null;
  field: string | null;
  beforeValue: string | null;
  afterValue: string | null;
  comment: string | null;
  eventAt: string;
};

export type DriveFileMeta = {
  id: string;
  googleFileId: string;
  fileName: string | null;
  mimeType: string | null;
  iconLink: string | null;
  thumbnailLink: string | null;
  webViewLink: string | null;
  syncedAt: string | null;
};

export type DriveFileInput = Omit<DriveFileMeta, "id">;
