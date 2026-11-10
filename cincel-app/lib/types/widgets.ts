/**
 * Shared widget data shapes (BE §6.1, FE §4.10.1): the only definition. Every
 * aggregate action returns these and every library widget in
 * `components/widgets/*` renders them. The shapes are serializable; UI-only
 * inputs (`actions`, `footer`, `renderCell`) are component props, not fields.
 */
import type { TaskStatus } from "@/lib/types/core";
import type { AbsenceRange, PersonProjectLoad, PresentationStyle, WeekLoad } from "@/lib/types/redesign";

/** 7 points, oldest → newest. */
export type Series7 = number[];
export type Tone = "default" | "ok" | "warn" | "critical";
/** `workflows.key`. */
export type TramoKey = string;

/** Color of a KPI delta: better, worse or unchanged. */
export type KpiDeltaTone = "good" | "bad" | "neutral";

export type KpiDatum = {
  key: string;
  label: string;
  value: number;
  display?: string;
  /**
   * Week-over-week `value` (Analítico "Δ 7 días"). `label` is the Visual chip
   * text ("+4 vs. semana", "+1 este mes", "sin cambio") and `tone` its color;
   * a zero change is `neutral`. Without them the chip derives both from
   * `value` / `good`.
   */
  delta?: { value: number; good: boolean; caption: string; label?: string; tone?: KpiDeltaTone };
  series7?: Series7;
  avg30?: number;
  min30?: number;
  max30?: number;
  /** share 0–1. */
  split?: { tramo: TramoKey; share: number }[];
  caption?: string;
  href?: string;
  /** Omitted = all styles (review B13). */
  visibleIn?: PresentationStyle[];
};

export type DistributionSegment = {
  key: string;
  label: string;
  value: number;
  /** e.g. "var(--chart-1)". */
  colorVar: string;
  secondary?: number;
  extra?: Record<string, number | string>;
};

export type ProgressItem = {
  id: string;
  label: string;
  sublabel?: string;
  /** 0–100. */
  real: number;
  plan?: number | null;
  budgetPct?: number | null;
  colorVar?: string;
  href?: string;
  next?: { title: string; date: string } | null;
  /** Open tasks of the project (`PortfolioRow.open`, Inicio `inicioPortfolioRows`). */
  open?: number;
  /** Open tasks past their commitment date (`PortfolioRow.overdue`). */
  overdue?: number;
  /** The project's delivery date (`endDate`, `YYYY-MM-DD`), null without one. */
  deliveryDate?: string | null;
  /** Manager, coordinator and task assignees, deduplicated (Inicio Visual avatars). */
  team?: { id: string; initials: string; tramo: TramoKey | null }[];
  /** Overdue share ≥ 45 % of open tasks (`projectAtRisk`); only with `sections.showProjectRisk`. */
  atRisk?: boolean;
};

export type AttentionItem = {
  id: string;
  title: string;
  href: string;
  project: string;
  tramo: TramoKey | null;
  reason: string;
  tone: Tone;
  assignee: { id: string; name: string; initials: string } | null;
  due: string | null;
  daysLate: number | null;
  /** Live subtareas done / total; null without subtareas (Inicio Visual caption). */
  subtasks?: { done: number; total: number } | null;
  /** 0–100: 100 when completed, else the share of done subtareas (`taskProgressPct`). */
  progressPct?: number;
  /** The task's project (`toAttentionItems`; Inicio Analítico groups by it). */
  projectId?: string;
  /** Base status and its label (custom status name when set). */
  status?: { value: TaskStatus; label: string };
};

export type AgendaItem = {
  id: string;
  title: string;
  start: string;
  end?: string;
  allDay?: boolean;
  estimated?: boolean;
  project?: string;
  tramo?: TramoKey | null;
  attendees?: string[];
  href?: string;
  /** Only when a Cutto URL is stored on the event (none until Cutto Q1). */
  meetingUrl?: string;
};

export type Availability = "libre" | "ocupado" | "saturado" | "vacaciones";

export type PersonDatum = {
  id: string;
  name: string;
  initials: string;
  photoUrl?: string | null;
  /** Project Flow positions when present, else null (no access role as puesto). */
  puesto?: string | null;
  tramo?: TramoKey | null;
  open: number;
  overdue: number;
  activeProjects?: number;
  occupancyPct?: number;
  weekHours?: number | null;
  availability?: Availability[];
  href?: string;
  /** Open tasks en proceso (`inicioWorkloadRows`). */
  inProgress?: number;
  /** Mean days late of the overdue tasks (1 decimal), null without any (`inicioWorkloadRows`). */
  avgDaysLate?: number | null;
  /** 4 weeks of load, this Monday first (`PeopleOverviewRow.weeks`). */
  weeks?: WeekLoad[];
  /** Approved absences overlapping the 4 weeks. */
  absences?: AbsenceRange[];
  /** Open tasks per project, overdue desc then open desc (Personas Analítico). */
  projects?: PersonProjectLoad[];
  /** Shares at least one active project with the viewer (Personas Analítico). */
  sharesProjectWithViewer?: boolean;
  /** Weekly capacity in open tasks (`staff.capacity`), for client-side load previews. */
  capacity?: number;
};

export type EntityCard = {
  id: string;
  title: string;
  subtitle?: string;
  href?: string;
  /** lucide icon name. */
  iconName?: string;
  tramo?: TramoKey | null;
  progress?: number;
  badges?: { label: string; tone: Tone }[];
  meta?: { label: string; value: string }[];
  /**
   * Whole-card token tint in Visual (FE §14.5): `muted`, or `chart-N` rendered
   * as `tint-chart-N` with `ink-chart-N` text. Used by notes (`note.color`);
   * Esencial and Analítico ignore it.
   */
  tint?: EntityCardTint;
};

export type EntityCardTint = "muted" | "chart-1" | "chart-2" | "chart-3" | "chart-4" | "chart-5";

export type RecordColumnFormat = "text" | "count" | "percent" | "hours" | "days" | "date" | "delta" | "mxn";

export type RecordColumn = {
  key: string;
  label: string;
  align?: "left" | "right";
  mono?: boolean;
  width?: number;
  format?: RecordColumnFormat;
  hideOn?: PresentationStyle[];
};

export type RecordTableData = {
  columns: RecordColumn[];
  rows: Record<string, unknown>[];
  groupBy?: string;
  totals?: Record<string, string | number> | "auto";
  heat?: { key: string; warnAt: number; critAt: number }[];
};
