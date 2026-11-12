export type CalendarEventType =
  | "Compromiso"
  | "Proxima revision"
  | "Fecha de entrega"
  | "Reunion"
  | "Visita de obra";

export type CalendarEvent = {
  id: string;
  taskId: string;
  date: string;
  time: string;
  title: string;
  project: string;
  /** The task's project id (cache invalidation after a delete). */
  projectId?: string;
  responsible: string;
  /** Tramo key (`workflows.key`), `"sin-tramo"`, or `"admin"` for admin tasks. */
  tramo: string;
  /** Tramo name, "Sin tramo", or "Administración" for admin tasks. */
  tramoLabel: string;
  phaseId: string | null;
  /** Fase name; "" when the task has none. */
  phaseLabel: string;
  type: CalendarEventType;
  href: string;
  /** People on the event; the detail popover falls back to `responsible`. */
  attendees?: string[];
  /** Where it happens, when the event stores one. */
  location?: string | null;
  /** Only when a Cutto URL is stored on the event (`AgendaItem.meetingUrl`). */
  meetingUrl?: string | null;
};
