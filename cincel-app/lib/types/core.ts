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
export type TaskKind = "workflow" | "usuario";
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

export type StaffAreaRef = { id: string; name: string; role: string | null };

export type StaffDetail = Staff & {
  profile: StaffProfile | null;
  areas: StaffAreaRef[];
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

export type Area = {
  id: string;
  name: string;
  description: string | null;
  leadId: string | null;
  active: boolean;
  sortOrder: number;
};

export type AreaDetail = Area & {
  lead: { id: string; name: string } | null;
  members: Array<{ staffId: string; name: string; role: string | null; active: boolean }>;
  workflows: Array<{ id: string; key: string; name: string }>;
};

export type AreaInput = {
  name: string;
  description?: string | null;
  leadId?: string | null;
  active?: boolean;
  sortOrder?: number;
};

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
export type Workflow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  active: boolean;
  sortOrder: number;
};

export type WorkflowTaskTemplate = {
  id: string;
  workflowId: string;
  phase: string | null;
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
  templates: WorkflowTaskTemplate[];
  areas: Array<{ id: string; name: string }>;
};

export type WorkflowInput = {
  key: string;
  name: string;
  description?: string | null;
  active?: boolean;
  sortOrder?: number;
};

export type WorkflowTaskTemplateInput = {
  phase?: string | null;
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
  clientId: string;
  status: ProjectStatus;
  currentWorkflowId: string | null;
  phase: string | null;
  /** Several phases can be active at once (#435). */
  phases: string[];
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
export type WorkflowRef = { id: string; key: string; name: string };

export type ProjectListItem = Project & {
  client: ContactRef;
  currentWorkflow: WorkflowRef | null;
  /** Every stage the project is in, in workflow order; includes `currentWorkflow`. */
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
  client: ContactRef;
  currentWorkflow: WorkflowRef | null;
  /** Every stage the project is in, in workflow order; includes `currentWorkflow`. */
  stages: WorkflowRef[];
  manager: StaffRef | null;
  coordinator: StaffRef | null;
  members: Array<StaffRef & { role: string | null; active: boolean }>;
  contacts: Array<ContactRef & { role: string | null }>;
  links: ProjectLink[];
};

export type ProjectInput = {
  code?: string | null;
  name: string;
  clientId: string;
  status?: ProjectStatus;
  currentWorkflowId: string | null;
  phase?: string | null;
  phases?: string[];
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

export type ApplyWorkflowPreview = {
  workflow: WorkflowRef;
  create: WorkflowTaskTemplate[];
  skip: WorkflowTaskTemplate[];
};

export type Task = {
  id: string;
  projectId: string;
  kind: TaskKind;
  templateId: string | null;
  workflowId: string | null;
  phase: string | null;
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

/** An admin-defined status of its own; `closes` = counts as finished work. */
export type TaskStatusOption = {
  id: string;
  name: string;
  closes: boolean;
  sortOrder: number;
};

export type TaskStatusInput = {
  name: string;
  closes?: boolean;
  sortOrder?: number;
};

export type TaskListItem = Task & {
  customStatus: { id: string; name: string; closes: boolean } | null;
  project: { id: string; name: string; clientName: string };
  workflow: WorkflowRef | null;
  manager: StaffRef | null;
  support: StaffRef[];
  checklist: { total: number; completed: number };
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
  workflowId?: string | null;
  phase?: string | null;
  managerId?: string | null;
  supportIds?: string[];
  priority?: TaskPriority;
  commitmentDate?: string | null;
  reviewDate?: string | null;
  deliveryDate?: string | null;
};

export type TaskPatch = Partial<
  Pick<
    Task,
    | "title"
    | "notes"
    | "phase"
    | "priority"
    | "status"
    | "managerId"
    | "commitmentDate"
    | "reviewDate"
    | "deliveryDate"
    | "workflowId"
  >
>;

export type TaskFilters = {
  projectId?: string;
  workflowId?: string;
  status?: TaskStatus | TaskStatus[];
  managerId?: string;
  involvesStaffId?: string;
  archived?: boolean;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
};

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
