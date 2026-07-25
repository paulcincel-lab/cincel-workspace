export type CalendarView = "month" | "week" | "day";

export type CalendarEventType =
  | "Compromiso"
  | "Proxima revision"
  | "Fecha de entrega"
  | "Reunion"
  | "Visita de obra";

export type CalendarEvent = {
  id: string;
  taskId: number;
  date: string;
  time: string;
  title: string;
  project: string;
  responsible: string;
  stage: string;
  stageLabel: string;
  phase: string;
  type: CalendarEventType;
  href: string;
};

export type CalendarFilters = {
  project: string;
  responsible: string;
  type: string;
  stage: string;
};

export type CalendarFilterOptions = {
  projects: string[];
  responsibles: string[];
  types: string[];
  stages: string[];
};

export type CalendarTypeSummaryRow = {
  type: CalendarEventType;
  total: number;
};
