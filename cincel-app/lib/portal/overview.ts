/**
 * Data of the portal project page (FE §3.11, §4.10.2 "Portal proyecto"), shaped once for the widget library so
 * Visual, Esencial and Analítico render the same numbers: the page passes these to `PhaseStepper`,
 * `ProgressListWidget`, `AgendaWidget` and `RecordTable`, which decide how each style looks. Built only from
 * the portal DTOs (no money, tarea, responsable or staff besides the project manager). Pure and client-safe.
 *
 * Sections the canvas draws without portal data today (approvals, messages, payments) have no field here, so
 * the page has nothing to render for them.
 */
import type {
  PortalFileDTO,
  PortalFolderGroupDTO,
  PortalProjectDTO,
  PortalScheduleDTO,
  PortalTeamMemberDTO,
  PortalEtapaDTO,
} from "@/lib/types/portal";
import type { AgendaItem, ProgressItem, RecordTableData } from "@/lib/types/widgets";
import { formatDateDMY } from "@/lib/utils/date";
import type { Group } from "@/components/widgets/GroupedTable";
import { etapaColorSlot, type EtapaColorSlot } from "@/lib/etapas/etapa-color";

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

export const PORTAL_ETAPA_STATE_LABEL: Record<PortalEtapaDTO["state"], string> = {
  completado: "Completado",
  en_curso: "En curso",
  por_iniciar: "Por iniciar",
};

export type PortalStepper = {
  steps: number;
  /** 1-indexed; 0 while no etapa has started. */
  current: number;
  /** e.g. "Fase actual: Diseño · 2 de 3". */
  label: string;
};

export type PortalOverviewData = {
  etapas: PortalEtapaDTO[];
  stepper: PortalStepper | null;
  progress: ProgressItem[];
  entregas: AgendaItem[];
  /** null when the project's client folder can't be listed (not ready, Drive unavailable): no section. */
  documentos: RecordTableData | null;
  /** The etapa in progress (the hero chip), null when none is. */
  heroEtapa: PortalEtapaDTO | null;
  /** Etapas completado or en curso ("{n} de {total} etapas en marcha"). */
  etapasActive: number;
  /** The first open delivery (`entregas[0]`), null when there is none. */
  nextEntrega: AgendaItem | null;
  /** The 4 newest files across the folder groups, each with its folder's name; empty when there are none. */
  recentFiles: PortalRecentFile[];
  /** "Tu equipo Cincel", manager first. */
  team: PortalTeamMemberDTO[];
  /** Analítico tables (KPIs, phases, deliverables, files by folder) build from these portal DTOs as given. */
  analitico: PortalAnaliticoInput;
};

/** What `PortalAnalitico` reads: the source DTOs, today (`YYYY-MM-DD`) and when the data was fetched. */
export type PortalAnaliticoInput = PortalAnaliticoSource & { today: string; updatedAt: number | null };

export type PortalRecentFile = PortalFileDTO & { folder: string };

/** How many files the Resumen shows as recent documents. */
export const PORTAL_RECENT_FILES = 4;

function clampPct(value: number): number {
  return Math.max(0, Math.min(100, Math.round(Number.isFinite(value) ? value : 0)));
}

export function buildPortalStepper(etapas: PortalEtapaDTO[]): PortalStepper | null {
  if (etapas.length === 0) return null;
  const currentIndex = etapas.findIndex((t) => t.state === "en_curso");
  if (currentIndex !== -1) {
    return {
      steps: etapas.length,
      current: currentIndex + 1,
      label: `Fase actual: ${etapas[currentIndex].name} · ${currentIndex + 1} de ${etapas.length}`,
    };
  }
  const done = etapas.filter((t) => t.state === "completado").length;
  if (done === etapas.length) return { steps: etapas.length, current: etapas.length + 1, label: "Todas las fases completadas" };
  return { steps: etapas.length, current: done, label: done === 0 ? "Por iniciar" : `${done} de ${etapas.length} fases completadas` };
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

/** The etapa in progress: the first `en_curso` one. */
export function buildPortalHeroEtapa(etapas: PortalEtapaDTO[]): PortalEtapaDTO | null {
  return etapas.find((t) => t.state === "en_curso") ?? null;
}

/** Etapas that are done or under way. */
export function countPortalEtapasActive(etapas: PortalEtapaDTO[]): number {
  return etapas.filter((t) => t.state === "completado" || t.state === "en_curso").length;
}

/**
 * The newest files across the folder groups, newest first, each with its folder's name. Without groups the
 * top of the client folder stands in as "General".
 */
export function buildPortalRecentFiles(
  folders: PortalFolderGroupDTO[] | null,
  files: PortalFileDTO[] | null,
  limit: number = PORTAL_RECENT_FILES,
): PortalRecentFile[] {
  const groups = folders ?? (files ? [{ folderId: "", name: "General", files }] : []);
  const seen = new Set<string>();
  const all: PortalRecentFile[] = [];
  for (const group of groups) {
    for (const f of group.files) {
      if (f.kind !== "file" || seen.has(f.id)) continue;
      seen.add(f.id);
      all.push({ ...f, folder: group.name });
    }
  }
  return all
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt) || a.name.localeCompare(b.name, "es"))
    .slice(0, limit);
}

/** Up to two initials of a name, for avatars. */
export function portalInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return `${first}${last}`.toLocaleUpperCase("es-MX");
}

/** The schedule with only the DTO's section fields, so nothing else a caller passes reaches the page. */
function portalScheduleDTO(schedule: PortalScheduleDTO): PortalScheduleDTO {
  if (!schedule) return null;
  return {
    sections: schedule.sections.map((s) => ({
      key: s.key,
      planta: s.planta,
      seccion: s.seccion,
      start: s.start,
      end: s.end,
      progressPct: s.progressPct,
      ...(s.actualStart !== undefined ? { actualStart: s.actualStart } : {}),
      ...(s.actualEnd !== undefined ? { actualEnd: s.actualEnd } : {}),
      ...(s.etapaKey !== undefined ? { etapaKey: s.etapaKey } : {}),
    })),
  };
}

export function buildPortalOverview(input: {
  project: PortalProjectDTO;
  schedule: PortalScheduleDTO;
  etapas: PortalEtapaDTO[];
  files: PortalFileDTO[] | null;
  /** The client folder one level deep (`PortalProjectData.documentFolders`). */
  folders?: PortalFolderGroupDTO[] | null;
  team?: PortalTeamMemberDTO[];
  /** `YYYY-MM-DD`. */
  today: string;
  /** `query.dataUpdatedAt` (epoch ms), for Analítico's "Actualizado" line. */
  updatedAt?: number | null;
}): PortalOverviewData {
  const entregas = buildPortalEntregas(input.schedule, input.today);
  return {
    etapas: input.etapas,
    stepper: buildPortalStepper(input.etapas),
    progress: buildPortalProgress(input.project, input.schedule),
    entregas,
    documentos: buildPortalDocumentos(input.files),
    heroEtapa: buildPortalHeroEtapa(input.etapas),
    etapasActive: countPortalEtapasActive(input.etapas),
    nextEntrega: entregas[0] ?? null,
    recentFiles: buildPortalRecentFiles(input.folders ?? null, input.files),
    team: input.team ?? [],
    analitico: {
      project: input.project,
      schedule: portalScheduleDTO(input.schedule),
      etapas: input.etapas,
      documents: input.files,
      documentFolders: input.folders ?? null,
      today: input.today,
      updatedAt: input.updatedAt ?? null,
    },
  };
}

/**
 * Portal Esencial status line: where the project is now. `next` is the `YYYY-MM-DD` of the next delivery.
 * `pct` is the etapa's own progress; `general` marks the fallback to the project's overall % when the etapa
 * carries none (copy then says "de avance general"). `sin_etapas` is a project without etapas.
 */
export type PortalStatusSentence =
  | { kind: "en_curso"; etapa: string; slot: EtapaColorSlot | null; pct: number; next: string | null; general?: boolean }
  | { kind: "terminado" }
  | { kind: "por_iniciar"; next: string | null }
  | { kind: "sin_etapas"; pct: number; next: string | null };

export function buildPortalStatusSentence(
  etapas: PortalEtapaDTO[],
  next: AgendaItem | null,
  /** `project.progressPct`, used when the etapa has no progress of its own. */
  projectPct?: number,
): PortalStatusSentence {
  const nextDate = next ? next.start.slice(0, 10) : null;
  const general = clampPct(projectPct ?? 0);
  if (etapas.length === 0) return { kind: "sin_etapas", pct: general, next: nextDate };

  let index = etapas.findIndex((t) => t.state === "en_curso");
  if (index === -1) {
    if (etapas.every((t) => t.state === "completado")) return { kind: "terminado" };
    if (etapas.every((t) => t.state === "por_iniciar")) return { kind: "por_iniciar", next: nextDate };
    // Between etapas: the last one finished is where the project stands.
    index = etapas.map((t) => t.state).lastIndexOf("completado");
  }
  const etapa = etapas[index];
  const own = (etapa as { progressPct?: number | null }).progressPct;
  const hasOwn = typeof own === "number" && Number.isFinite(own);
  return {
    kind: "en_curso",
    etapa: etapa.name,
    slot: etapaColorSlot({ key: etapa.key, sortOrder: index + 1 }),
    pct: hasOwn ? clampPct(own) : general,
    next: nextDate,
    ...(hasOwn ? {} : { general: true }),
  };
}

// ── Analítico (Portal-Analitico): KPIs, phases by etapa, deliverables and files by folder ──────────────────

export const PORTAL_ANALITICO_COPY = {
  avanceGeneral: "Avance general",
  etapaActual: "Etapa actual",
  entregables: "Entregables",
  desvio: "Desvío",
  documentos: "Documentos",
  sinCronograma: "Aún no hay cronograma.",
  archivosPendientes: "Los archivos aún no están listos.",
  sinDocumentos: "Aún no hay documentos compartidos.",
  carpetaRaiz: "General",
  sinEtapa: "Sin etapa",
} as const;

export const PORTAL_PHASE_ESTADO = { done: "Completado", open: "En curso", pending: "Por iniciar" } as const;
export const PORTAL_ENTREGABLE_ESTADO = { done: "Entregado", open: "En curso", pending: "Por iniciar" } as const;

export type PortalKpis = {
  avance: number;
  avanceDelta: number | null;
  etapa: { name: string; pct: number; slot: EtapaColorSlot | null } | null;
  entregables: { done: number; total: number };
  desvio: number | null;
  documentos: { total: number; nuevosSemana: number };
};
export type PortalPhaseRow = {
  key: string;
  fase: string;
  plan: string;
  real: string | null;
  estado: "Completado" | "En curso" | "Por iniciar";
  avance: number;
  desvio: number | null;
};
export type PortalEntregableRow = {
  key: string;
  entregable: string;
  etapa: string | null;
  fechaPlan: string;
  fechaReal: string | null;
  estado: "Entregado" | "En curso" | "Por iniciar";
  desvio: number | null;
};
export type PortalFileRow = PortalFileDTO & { tipo: string; tamano: string; subidoPor: "Tú" | "Cincel" };

/** A group of the Analítico tables, as `GroupedTable` takes it. */
export type PortalTableGroup<Row> = Group<Row>;

type PortalSection = NonNullable<PortalScheduleDTO>["sections"][number];

export const PORTAL_MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"] as const;

function ymd(iso: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return match ? { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) } : null;
}

/** `YYYY-MM-DD…` → `14 nov`. */
export function portalDayMonth(iso: string): string {
  const p = ymd(iso);
  return p ? `${p.d} ${PORTAL_MONTHS[p.m - 1] ?? ""}`.trim() : iso;
}

/** `YYYY-MM-DD…` → `14 nov 2026`. */
export function portalDayMonthYear(iso: string): string {
  const p = ymd(iso);
  return p ? `${portalDayMonth(iso)} ${p.y}` : iso;
}

/** `6–17 oct` within a month, `27 oct–7 nov` across months (and years: `8 dic–26 feb`). */
export function portalDateRange(start: string, end: string): string {
  const a = ymd(start);
  const b = ymd(end);
  if (!a || !b) return `${start}–${end}`;
  if (a.y === b.y && a.m === b.m) return a.d === b.d ? portalDayMonth(end) : `${a.d}–${portalDayMonth(end)}`;
  return `${portalDayMonth(start)}–${portalDayMonth(end)}`;
}

/** `Actualizado 7 nov 2026 · 14:05` parts in Mexico City time. */
export function portalUpdatedAt(epochMs: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(epochMs));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${portalDayMonthYear(`${get("year")}-${get("month")}-${get("day")}`)} · ${get("hour")}:${get("minute")}`;
}

function dayNumber(iso: string): number {
  const p = ymd(iso);
  return p ? Date.UTC(p.y, p.m - 1, p.d) / 86_400_000 : NaN;
}

/** `+3`, `−2`, `0`: signed days for the Desvío cells. */
export function formatPortalDesvio(days: number): string {
  if (days > 0) return `+${days}`;
  if (days < 0) return `−${Math.abs(days)}`;
  return "0";
}

/**
 * True once some section carries a real date (`schedule_tasks.started_on` / `finished_on`); until then Real and
 * Desvío hide, so a schedule nobody has moved since the change shows no empty columns.
 */
export function portalScheduleHasRealDates(schedule: PortalScheduleDTO): boolean {
  return (schedule?.sections ?? []).some((s) => Boolean(s.actualStart) || Boolean(s.actualEnd));
}

/**
 * Days late of one section: real end − planned end once finished; today − planned end while still open after
 * it; null otherwise and while the DTO has no real dates.
 */
function sectionDesvio(s: PortalSection, today: string, hasReal: boolean): number | null {
  if (!hasReal) return null;
  const end = s.actualEnd ?? (s.progressPct < 100 && today > s.end ? today : null);
  if (end === null) return null;
  const days = Math.round(dayNumber(end) - dayNumber(s.end));
  return Number.isFinite(days) ? days : null;
}

function phaseEstado(s: PortalSection, today: string): PortalPhaseRow["estado"] {
  if (clampPct(s.progressPct) >= 100) return PORTAL_PHASE_ESTADO.done;
  return s.start <= today ? PORTAL_PHASE_ESTADO.open : PORTAL_PHASE_ESTADO.pending;
}

function maxOrNull(values: (number | null)[]): number | null {
  const kept = values.filter((v): v is number => v !== null);
  return kept.length ? Math.max(...kept) : null;
}

function average(values: number[]): number {
  return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0;
}

/** The project's current etapa: the first `en_curso` one, with its own progress and color slot. */
function currentEtapa(etapas: PortalEtapaDTO[]): PortalKpis["etapa"] {
  const index = etapas.findIndex((t) => t.state === "en_curso");
  if (index === -1) return null;
  const t = etapas[index];
  const own = (t as { progressPct?: number | null }).progressPct;
  return {
    name: t.name,
    pct: clampPct(typeof own === "number" ? own : 0),
    slot: etapaColorSlot({ key: t.key, sortOrder: index + 1 }),
  };
}

/** Every listed file: across the folder groups when present, else the top of the client folder. */
function allPortalFiles(groups: PortalFolderGroupDTO[] | null | undefined, documents: PortalFileDTO[] | null): PortalFileDTO[] | null {
  if (groups) return groups.flatMap((g) => g.files.filter((f) => f.kind === "file"));
  return documents ? documents.filter((f) => f.kind === "file") : null;
}

/** The fields of `PortalProjectData` the Analítico KPIs read. */
export type PortalAnaliticoSource = {
  project: PortalProjectDTO;
  schedule: PortalScheduleDTO | null;
  etapas: PortalEtapaDTO[];
  documents: PortalFileDTO[] | null;
  documentFolders?: PortalFolderGroupDTO[] | null;
};

export function buildPortalKpis(d: PortalAnaliticoSource, today: string): PortalKpis {
  const sections = d.schedule?.sections ?? [];
  const hasReal = portalScheduleHasRealDates(d.schedule ?? null);
  const files = allPortalFiles(d.documentFolders, d.documents) ?? [];
  const weekAgo = dayNumber(today) - 7;
  return {
    avance: clampPct(d.project.progressPct),
    avanceDelta: typeof d.project.progressDeltaMonth === "number" ? Math.round(d.project.progressDeltaMonth) : null,
    etapa: currentEtapa(d.etapas),
    entregables: { done: sections.filter((s) => clampPct(s.progressPct) >= 100).length, total: sections.length },
    desvio: hasReal ? (maxOrNull(sections.map((s) => sectionDesvio(s, today, hasReal))) ?? 0) : null,
    documentos: {
      total: files.length,
      nuevosSemana: files.filter((f) => f.modifiedAt !== "" && dayNumber(f.modifiedAt.slice(0, 10)) > weekAgo).length,
    },
  };
}

function toPhaseRow(s: PortalSection, today: string, hasReal: boolean): PortalPhaseRow {
  const real = s.actualStart ? (s.actualEnd ? portalDateRange(s.actualStart, s.actualEnd) : `${portalDayMonth(s.actualStart)}–`) : null;
  return {
    key: s.key,
    fase: s.seccion,
    plan: portalDateRange(s.start, s.end),
    real,
    estado: phaseEstado(s, today),
    avance: clampPct(s.progressPct),
    desvio: sectionDesvio(s, today, hasReal),
  };
}

/** Group label and color: the etapa once sections carry `etapaKey`, else the planta (the default until then). */
function phaseGroupOf(
  s: PortalSection,
  byEtapa: boolean,
  etapas: PortalEtapaDTO[],
): { id: string; label: string; color?: string } {
  if (!byEtapa) return { id: `planta:${s.planta}`, label: s.planta };
  const index = etapas.findIndex((t) => t.key === s.etapaKey);
  if (!s.etapaKey) return { id: "etapa:", label: PORTAL_ANALITICO_COPY.sinEtapa };
  const etapa = index === -1 ? null : etapas[index];
  const slot = etapaColorSlot({ key: s.etapaKey, sortOrder: index + 1 });
  return { id: `etapa:${s.etapaKey}`, label: etapa?.name ?? s.etapaKey, color: slot ? `var(--chart-${slot})` : undefined };
}

/**
 * Phases (schedule sections) grouped by planta until sections carry an etapa, then by etapa. Each group carries
 * its fase count, average progress and worst deviation, or "por iniciar" when none of its fases started.
 */
export function buildPortalPhaseTable(
  s: PortalScheduleDTO,
  today: string,
  etapas: PortalEtapaDTO[] = [],
): PortalTableGroup<PortalPhaseRow>[] {
  const sections = s?.sections ?? [];
  const hasReal = portalScheduleHasRealDates(s);
  const byEtapa = sections.some((x) => typeof x.etapaKey === "string" && x.etapaKey !== "");
  const groups = new Map<string, PortalTableGroup<PortalPhaseRow> & { rows: PortalPhaseRow[] }>();
  for (const section of sections) {
    const g = phaseGroupOf(section, byEtapa, etapas);
    let group = groups.get(g.id);
    if (!group) {
      group = { ...g, metrics: [], rows: [] };
      groups.set(g.id, group);
    }
    group.rows.push(toPhaseRow(section, today, hasReal));
  }
  return [...groups.values()].map((group) => {
    const pending = group.rows.every((r) => r.estado === PORTAL_PHASE_ESTADO.pending);
    const desvio = maxOrNull(group.rows.map((r) => r.desvio));
    const metrics: PortalTableGroup<PortalPhaseRow>["metrics"] = pending
      ? [{ key: "estado", value: "por iniciar", tone: "muted" }]
      : [
          { key: "avance", value: `${average(group.rows.map((r) => r.avance))} %` },
          ...(desvio !== null
            ? [{ key: "desvio", value: `${formatPortalDesvio(desvio)} d`, tone: desvio > 2 ? ("warning" as const) : ("default" as const) }]
            : []),
        ];
    return { ...group, caption: `${group.rows.length} ${group.rows.length === 1 ? "fase" : "fases"}`, metrics };
  });
}

/** Totals of the phase table: fase count, average progress by section and the worst deviation (null without real dates). */
export function portalPhaseTotals(groups: PortalTableGroup<PortalPhaseRow>[]): { fases: number; avance: number; desvio: number | null } {
  const rows = groups.flatMap((g) => g.rows ?? []);
  return { fases: rows.length, avance: average(rows.map((r) => r.avance)), desvio: maxOrNull(rows.map((r) => r.desvio)) };
}

/** Sections as deliverables, by planned end: delivered at 100 %, in progress once started. */
export function buildPortalEntregables(
  s: PortalScheduleDTO,
  today: string,
  etapas: PortalEtapaDTO[] = [],
): PortalEntregableRow[] {
  const sections = s?.sections ?? [];
  const hasReal = portalScheduleHasRealDates(s);
  const byEtapa = sections.some((x) => typeof x.etapaKey === "string" && x.etapaKey !== "");
  return [...sections]
    .sort((a, b) => a.end.localeCompare(b.end) || a.seccion.localeCompare(b.seccion, "es"))
    .map((section) => {
      const estado = phaseEstado(section, today);
      return {
        key: section.key,
        entregable: section.seccion,
        etapa: phaseGroupOf(section, byEtapa, etapas).label,
        fechaPlan: portalDayMonth(section.end),
        fechaReal: section.actualEnd ? portalDayMonth(section.actualEnd) : null,
        estado:
          estado === PORTAL_PHASE_ESTADO.done
            ? PORTAL_ENTREGABLE_ESTADO.done
            : estado === PORTAL_PHASE_ESTADO.open
              ? PORTAL_ENTREGABLE_ESTADO.open
              : PORTAL_ENTREGABLE_ESTADO.pending,
        desvio: sectionDesvio(section, today, hasReal),
      };
    });
}

/** The next open deliverable's planned end (`YYYY-MM-DD`), today or later; null when none. */
export function portalNextEntregable(s: PortalScheduleDTO, today: string): string | null {
  const next = (s?.sections ?? [])
    .filter((x) => x.end >= today && clampPct(x.progressPct) < 100)
    .sort((a, b) => a.end.localeCompare(b.end))[0];
  return next ? next.end : null;
}

function toFileRow(f: PortalFileDTO): PortalFileRow {
  return {
    ...f,
    tipo: portalFileType(f),
    tamano: formatPortalFileSize(f.sizeBytes),
    subidoPor: f.uploadedBy === "cliente" ? "Tú" : "Cincel",
  };
}

function sumSizes(files: PortalFileDTO[]): number {
  return files.reduce((acc, f) => acc + (typeof f.sizeBytes === "number" && Number.isFinite(f.sizeBytes) ? f.sizeBytes : 0), 0);
}

/**
 * Files grouped by folder (newest first inside each), with the file count and total size per folder. Folders
 * without files are left out. Null while the folders can't be listed (not ready, Drive unavailable).
 */
export function buildPortalFilesByFolder(g: PortalFolderGroupDTO[] | null): PortalTableGroup<PortalFileRow>[] | null {
  if (g === null) return null;
  return g
    .map((folder) => ({ folder, files: folder.files.filter((f) => f.kind === "file") }))
    .filter(({ files }) => files.length > 0)
    .map(({ folder, files }) => ({
      id: `carpeta:${folder.folderId}`,
      label: folder.name,
      caption: `${files.length} ${files.length === 1 ? "archivo" : "archivos"}`,
      metrics: [{ key: "tamano", value: formatPortalFileSize(sumSizes(files)) }],
      rows: [...files]
        .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt) || a.name.localeCompare(b.name, "es"))
        .map(toFileRow),
    }));
}

/** Folder count, file count and total size of the files table. */
export function portalFilesTotals(groups: PortalTableGroup<PortalFileRow>[]): { carpetas: number; archivos: number; tamano: string } {
  const rows = groups.flatMap((g) => g.rows ?? []);
  return { carpetas: groups.length, archivos: rows.length, tamano: formatPortalFileSize(sumSizes(rows)) };
}

/** The folder groups, or one "General" group from the top-level listing when the page has no folder groups. */
export function portalFolderGroupsOf(d: Pick<PortalAnaliticoSource, "documents" | "documentFolders">): PortalFolderGroupDTO[] | null {
  if (d.documentFolders) return d.documentFolders;
  if (d.documents === null) return null;
  return [{ folderId: "root", name: PORTAL_ANALITICO_COPY.carpetaRaiz, files: d.documents.filter((f) => f.kind === "file") }];
}
