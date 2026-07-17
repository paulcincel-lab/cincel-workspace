export type TaskStatus =
  | "Pendiente"
  | "En proceso"
  | "Completado"
  | "Bloqueado";

export type TaskPriority =
  | "Alta"
  | "Media"
  | "Baja";

export type WorkflowType =
  | "Presale"
  | "Diseño"
  | "Construcción";

export interface TaskHistoryItem {
  id: number;

  date: string;

  author: string;

  comment: string;
}

export interface TaskChecklistItem {
  id: number;

  title: string;

  completed: boolean;
}

export interface Task {
  id: number;

  project: string;

  workflow: WorkflowType;

  phase: string;

  description: string;

  notes: string;

  manager: string;

  support: string[];

  status: TaskStatus;

  priority: TaskPriority;

  commitmentDate: string;

  reviewDate: string;

  updatedAt: string;

  createdAt: string;

  history: TaskHistoryItem[];

  checklist: TaskChecklistItem[];
}