/**
 * Data of the portal project page (FE §3.11, §4.10.2 "Portal proyecto"), shaped once for the widget library so
 * Visual, Esencial and Analítico render the same numbers: the page passes these to `PhaseStepper`,
 * `ProgressListWidget`, `AgendaWidget` and `RecordTable`, which decide how each style looks. Built only from
 * the portal DTOs (no money, tarea, responsable or staff besides the project manager). Pure and client-safe.
 *
 * Sections the canvas draws without portal data today (approvals, messages, payments) have no field here, so
 * the page has nothing to render for them.
 */
import type { PortalFileDTO, PortalProjectDTO, PortalScheduleDTO, PortalTramoDTO } from "@/lib/types/portal";
import type { AgendaItem, ProgressItem, RecordTableData } from "@/lib/types/widgets";
import { formatDateDMY } from "@/lib/utils/date";

export const PORTAL_OVERVIEW_COPY = {
  fases: "Fases",
  avance: "Avance",
  avanceGeneral: "Avance general",
  entregas: "Próximas entregas",
  entregasVacio: "No hay entregas próximas.",
  documentos: "Documentos compartidos",
  documentosVacio: "Aún no hay documentos compartidos.",
  descargar: "Descargar",
} as const;

export const PORTAL_TRAMO_STATE_LABEL: Record<PortalTramoDTO["state"], string> = {
  completado: "Completado",
  en_curso: "En curso",
  por_iniciar: "Por iniciar",
};

export type PortalStepper = {
  steps: number;
  /** 1-indexed; 0 while no tramo has started. */
  current: number;
  /** e.g. "Fase actual: Diseño · 2 de 3". */
  label: string;
};

export type PortalOverviewData = {
  tramos: PortalTramoDTO[];
  stepper: PortalStepper | null;
  progress: ProgressItem[];
  entregas: AgendaItem[];
  /** null when the project's client folder can't be listed (not ready, Drive unavailable): no section. */
  documentos: RecordTableData | null;
};

function clampPct(value: number): number {
  return Math.max(0, Math.min(100, Math.round(Number.isFinite(value) ? value : 0)));
}

export function buildPortalStepper(tramos: PortalTramoDTO[]): PortalStepper | null {
  if (tramos.length === 0) return null;
  const currentIndex = tramos.findIndex((t) => t.state === "en_curso");
  if (currentIndex !== -1) {
    return {
      steps: tramos.length,
      current: currentIndex + 1,
      label: `Fase actual: ${tramos[currentIndex].name} · ${currentIndex + 1} de ${tramos.length}`,
    };
  }
  const done = tramos.filter((t) => t.state === "completado").length;
  if (done === tramos.length) return { steps: tramos.length, current: tramos.length + 1, label: "Todas las fases completadas" };
  return { steps: tramos.length, current: done, label: done === 0 ? "Por iniciar" : `${done} de ${tramos.length} fases completadas` };
}

/** Overall progress first, then one row per schedule section (partida) in the schedule's order. */
export function buildPortalProgress(project: PortalProjectDTO, schedule: PortalScheduleDTO): ProgressItem[] {
  const items: ProgressItem[] = [{ id: "general", label: PORTAL_OVERVIEW_COPY.avanceGeneral, real: clampPct(project.progressPct) }];
  for (const s of schedule?.sections ?? []) {
    items.push({
      id: s.key,
      label: s.seccion,
      sublabel: `${s.planta} · ${formatDateDMY(s.start)} – ${formatDateDMY(s.end)}`,
      real: clampPct(s.progressPct),
    });
  }
  return items;
}

/** Sections still open whose end date is today or later, by end date: the deliveries the client waits for. */
export function buildPortalEntregas(schedule: PortalScheduleDTO, today: string): AgendaItem[] {
  return (schedule?.sections ?? [])
    .filter((s) => s.end >= today && s.progressPct < 100)
    .sort((a, b) => a.end.localeCompare(b.end) || a.seccion.localeCompare(b.seccion, "es"))
    .map((s) => ({ id: s.key, title: s.seccion, start: s.end, allDay: true, project: s.planta }));
}

/** Short type label for a shared file. */
export function portalFileType(file: Pick<PortalFileDTO, "name" | "mimeType" | "deliveredAs">): string {
  if (file.deliveredAs === "pdf" || file.mimeType === "application/pdf") return "PDF";
  const dot = file.name.lastIndexOf(".");
  if (dot > 0 && dot < file.name.length - 1) return file.name.slice(dot + 1).toUpperCase();
  if (file.mimeType.startsWith("image/")) return "Imagen";
  return "Archivo";
}

export function formatPortalFileSize(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Files (not folders) at the top of the client folder, newest first. */
export function buildPortalDocumentos(files: PortalFileDTO[] | null): RecordTableData | null {
  if (files === null) return null;
  const rows = files
    .filter((f) => f.kind === "file")
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt) || a.name.localeCompare(b.name, "es"))
    .map((f) => ({
      id: f.id,
      name: f.name,
      tipo: portalFileType(f),
      modifiedAt: f.modifiedAt.slice(0, 10),
      size: formatPortalFileSize(f.sizeBytes),
    }));
  return {
    columns: [
      { key: "name", label: "Documento" },
      { key: "tipo", label: "Tipo" },
      { key: "modifiedAt", label: "Fecha", format: "date", align: "right", mono: true },
      { key: "size", label: "Tamaño", align: "right", mono: true, hideOn: ["visual", "esencial"] },
    ],
    rows,
  };
}

export function buildPortalOverview(input: {
  project: PortalProjectDTO;
  schedule: PortalScheduleDTO;
  tramos: PortalTramoDTO[];
  files: PortalFileDTO[] | null;
  /** `YYYY-MM-DD`. */
  today: string;
}): PortalOverviewData {
  return {
    tramos: input.tramos,
    stepper: buildPortalStepper(input.tramos),
    progress: buildPortalProgress(input.project, input.schedule),
    entregas: buildPortalEntregas(input.schedule, input.today),
    documentos: buildPortalDocumentos(input.files),
  };
}
