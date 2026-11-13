/**
 * Asistente Analítico (client-safe): the step rows of the steps table and of
 * "Exportar pasos", the data panel tables per tool output, the KPI strip of
 * a message and the thread totals of the conversation header. Built on the
 * step model of `lib/assistant/tool-steps.ts` (`toToolSteps`).
 */
import type { Group, HeatRule } from "@/components/widgets/GroupedTable";
import type { KpiStripItem } from "@/components/widgets/KpiStrip";
import { toToolSteps, type ToolStep, type ToolStepGroup, type ToolStepState } from "@/lib/assistant/tool-steps";
import { etapaColorVar } from "@/lib/etapas/etapa-color";
import type { AssistantMessageMeta, AssistantUIMessage } from "@/lib/types/asistente";
import type { RecordColumn, RecordTableData } from "@/lib/types/widgets";
import { CSV_BOM, escapeCsvFormula } from "@/lib/utils/export-service";

const LOCALE = "es-MX";
const SECONDS = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const INTEGER = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });

/** Shown for an unknown duration. */
export const NO_DURATION = "—";

export type StepRow = Record<string, unknown>;
/** Columns of a step table (the `GroupedTable` column shape). */
export type GroupedTableColumn = RecordColumn;
export type StepTable = {
  title: string;
  columns: GroupedTableColumn[];
  /** One group per etapa, or the single `FLAT_GROUP_ID` group when the table has no groups. */
  groups: Group<StepRow>[];
  /** Footer values by column key (e.g. Σ días). */
  totals?: Record<string, number>;
  heat?: HeatRule[];
};

/** Id of the only group of a table without groups (its rows go straight under the step header). */
export const FLAT_GROUP_ID = "filas";

/** Max rows of a generic record table. */
export const RECORD_ROWS_MAX = 50;

// ── Formatting ─────────────────────────────────────────────────────────────

/** "0.4 s" (one decimal, es-MX); under 0.1 s "<0.1 s"; unknown "—". */
export function formatSeconds(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return NO_DURATION;
  if (ms < 100) return "<0.1 s";
  return `${SECONDS.format(ms / 1000)} s`;
}

/** Integer with the es-MX thousands separator ("3,812"). */
export function formatCount(n: number): string {
  return INTEGER.format(n);
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

// ── Step rows (steps table, CSV) ───────────────────────────────────────────

export type StepTableRow = {
  key: string;
  /** 1-based step number inside its message. */
  index: number;
  /** Raw tool name; an approval group of n > 1 calls reads "create_task × 4". */
  tool: string;
  short: string;
  params: string;
  state: ToolStepState;
  durationMs: number | null;
  rows: number | null;
  errorText?: string;
  group: ToolStepGroup;
};

/** "proyecto=Oficina Polanco · estado=vencidas". */
export function paramsText(step: Pick<ToolStep, "params">): string {
  return step.params.map((param) => `${param.key}=${param.value}`).join(" · ");
}

function sumKnown(values: (number | null)[]): number | null {
  const known = values.filter((value): value is number => value !== null && Number.isFinite(value));
  return known.length === 0 ? null : known.reduce((sum, value) => sum + value, 0);
}

/** One state for an approval group: pending wins, then running, error, done; all denied → denied. */
export function groupState(steps: readonly ToolStep[]): ToolStepState {
  const states = new Set(steps.map((step) => step.state));
  if (states.has("needs-confirmation")) return "needs-confirmation";
  if (states.has("running")) return "running";
  if (states.has("confirmed")) return "confirmed";
  if (states.has("error")) return "error";
  if (states.has("done")) return "done";
  return "denied";
}

/** The rows of the steps table: one per step, one per approval group. Numbered from 1. */
export function stepTableRows(groups: readonly ToolStepGroup[]): StepTableRow[] {
  const rows: StepTableRow[] = [];
  for (const group of groups) {
    if (group.kind === "steps") {
      for (const step of group.steps) {
        rows.push({
          key: step.toolCallId,
          index: rows.length + 1,
          tool: step.toolName,
          short: step.short,
          params: paramsText(step),
          state: step.state,
          durationMs: step.durationMs,
          rows: step.rows,
          errorText: step.errorText,
          group,
        });
      }
      continue;
    }
    const first = group.steps[0];
    if (!first) continue;
    const n = group.steps.length;
    const failed = group.steps.find((step) => step.state === "error");
    rows.push({
      key: first.toolCallId,
      index: rows.length + 1,
      tool: n > 1 ? `${group.toolName} × ${n}` : group.toolName,
      short: first.short,
      params: paramsText(first),
      state: groupState(group.steps),
      durationMs: sumKnown(group.steps.map((step) => step.durationMs)),
      rows: group.preview.length > 0 ? group.preview.length : n,
      errorText: failed?.errorText,
      group,
    });
  }
  return rows;
}

/** Estado cell text without its symbol (CSV and screen readers). */
export const STEP_STATE_TEXT: Record<ToolStepState, string> = {
  running: "En curso",
  confirmed: "En curso",
  "needs-confirmation": "Requiere confirmación",
  done: "Listo",
  error: "Error",
  denied: "Cancelado",
};

export function allSteps(groups: readonly ToolStepGroup[]): ToolStep[] {
  return groups.flatMap((group) => group.steps);
}

/** Steps, Σ duration and pending confirmations of a whole thread (conversation header). */
export function threadStepStats(messages: readonly AssistantUIMessage[]): {
  steps: number;
  totalMs: number | null;
  pending: number;
} {
  const steps = messages.filter((message) => message.role === "assistant").flatMap((message) => allSteps(toToolSteps(message)));
  return {
    steps: steps.length,
    totalMs: sumKnown(steps.map((step) => step.durationMs)),
    pending: steps.filter((step) => step.state === "needs-confirmation").length,
  };
}

/** "3 pasos · 1.2 s · 4 requieren confirmación" (parts at 0 left out; no duration → no seconds). */
export function threadStepsLine(stats: ReturnType<typeof threadStepStats>): string {
  const parts = [`${stats.steps} ${plural(stats.steps, "paso", "pasos")}`];
  if (stats.totalMs !== null) parts.push(formatSeconds(stats.totalMs));
  if (stats.pending > 0) {
    parts.push(`${stats.pending} ${plural(stats.pending, "requiere confirmación", "requieren confirmación")}`);
  }
  return parts.join(" · ");
}

/** The 1-step box line: "1 paso · list_projects · 0.4 s · 12 filas" (unknown parts left out). */
export function singleStepLine(row: StepTableRow): string {
  const parts = ["1 paso", row.tool];
  if (row.durationMs !== null) parts.push(formatSeconds(row.durationMs));
  if (row.rows !== null) parts.push(`${formatCount(row.rows)} ${plural(row.rows, "fila", "filas")}`);
  return parts.join(" · ");
}

// ── KPIs ───────────────────────────────────────────────────────────────────

function metaToolMs(meta: AssistantMessageMeta | undefined): number | null {
  const toolMs: unknown = meta?.toolMs;
  if (typeof toolMs === "number") return Number.isFinite(toolMs) ? toolMs : null;
  if (toolMs && typeof toolMs === "object") {
    return sumKnown(Object.values(toolMs as Record<string, unknown>).map((v) => (typeof v === "number" ? v : null)));
  }
  return null;
}

/** HERRAMIENTAS · ESCRITURAS PENDIENTES · FILAS LEÍDAS · TIEMPO of one message. */
export function stepKpis(steps: readonly ToolStep[], meta?: AssistantMessageMeta): KpiStripItem[] {
  const pending = steps.filter((step) => step.state === "needs-confirmation").length;
  const read = steps
    .filter((step) => step.approvalId === undefined)
    .reduce((sum, step) => sum + (step.rows ?? 0), 0);
  const totalMs = sumKnown(steps.map((step) => step.durationMs)) ?? metaToolMs(meta);
  return [
    { key: "herramientas", label: "Herramientas", value: formatCount(steps.length) },
    { key: "pendientes", label: "Escrituras pendientes", value: formatCount(pending) },
    { key: "filas", label: "Filas leídas", value: formatCount(read) },
    { key: "tiempo", label: "Tiempo", value: formatSeconds(totalMs) },
  ];
}

// ── Data panel tables ──────────────────────────────────────────────────────

/** Tool results that carry third-party text are stored as `{ untrusted: true, content }`. */
function unwrap(output: unknown): unknown {
  if (output && typeof output === "object" && (output as { untrusted?: unknown }).untrusted === true) {
    return (output as { content?: unknown }).content;
  }
  return output;
}

function isFailure(output: unknown): boolean {
  return !!output && typeof output === "object" && !Array.isArray(output) && (output as { ok?: unknown }).ok === false;
}

function objectRows(output: unknown): Record<string, unknown>[] | null {
  const value = unwrap(output);
  if (!Array.isArray(value)) return null;
  return value.filter((row): row is Record<string, unknown> => !!row && typeof row === "object" && !Array.isArray(row));
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function localToday(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Whole days from a `YYYY-MM-DD` date to today; 0 when not past; null without a date. */
export function daysLate(date: string | null, today: string = localToday()): number | null {
  if (!date) return null;
  const a = Date.parse(`${date.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

const NO_ETAPA_ID = "sin-etapa";

/** `list_activities_due` → "tareas vencidas": one group per etapa, days late per task, Σ días. */
export function activitiesDueTable(output: unknown, today: string = localToday()): StepTable | null {
  const rows = objectRows(output);
  if (!rows) return null;
  type Etapa = { id: string; label: string; key: string | null; sortOrder: number | null; rows: StepRow[] };
  const etapas = new Map<string, Etapa>();
  for (const row of rows) {
    const key = str(row.workflowKey);
    const label = str(row.workflow) ?? "Sin etapa";
    const id = key ?? (str(row.workflow) ? `etapa-${label}` : NO_ETAPA_ID);
    const etapa = etapas.get(id) ?? { id, label, key, sortOrder: num(row.workflowSortOrder), rows: [] };
    const vence = str(row.commitmentDate);
    const dias = daysLate(vence, today);
    etapa.rows.push({
      id: str(row.id) ?? `${id}-${etapa.rows.length}`,
      taskId: str(row.id),
      tarea: str(row.description) ?? "",
      responsable: str(row.manager),
      vence,
      vencida: vence !== null && vence.slice(0, 10) < today,
      dias,
      blocked: row.blocked === true || row.status === "bloqueado",
    });
    etapas.set(id, etapa);
  }
  const ordered = [...etapas.values()].sort(
    (a, b) => (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER) || a.label.localeCompare(b.label, LOCALE),
  );
  const groups: Group<StepRow>[] = ordered.map((etapa) => {
    const total = etapa.rows.reduce((sum, row) => sum + ((row.dias as number | null) ?? 0), 0);
    const blocked = etapa.rows.some((row) => row.blocked === true);
    return {
      id: etapa.id,
      label: etapa.label,
      color: etapa.key ? etapaColorVar({ key: etapa.key, sortOrder: etapa.sortOrder ?? 0 }) : undefined,
      metrics: [
        { key: "resumen", value: `${etapa.rows.length} · ${formatCount(total)} d`, tone: "muted" },
        ...(blocked ? [{ key: "bloqueada", value: "bloqueada", tone: "destructive" as const }] : []),
      ],
      rows: etapa.rows,
    };
  });
  const dias = groups.flatMap((group) => group.rows ?? []).reduce((sum, row) => sum + ((row.dias as number | null) ?? 0), 0);
  return {
    title: "tareas vencidas",
    columns: [
      { key: "tarea", label: "Etapa → tarea" },
      { key: "responsable", label: "Responsable" },
      { key: "vence", label: "Vence", format: "date", mono: true },
      { key: "dias", label: "Días", format: "count", align: "right", mono: true },
    ],
    groups,
    totals: { dias },
    heat: [{ key: "dias", warnAt: 4, critAt: 9 }],
  };
}

/** `team_workload_summary` → "carga por persona": open tasks and load %, heat over 80 % / 100 %. */
export function workloadTable(output: unknown): StepTable | null {
  const rows = objectRows(output);
  if (!rows) return null;
  return {
    title: "carga por persona",
    columns: [
      { key: "persona", label: "Persona" },
      { key: "etapa", label: "Etapa" },
      { key: "abiertas", label: "Abiertas", format: "count", align: "right", mono: true },
      { key: "carga", label: "Carga", format: "percent", align: "right", mono: true },
    ],
    groups: [
      {
        id: FLAT_GROUP_ID,
        label: "",
        metrics: [],
        rows: rows.map((row, index) => ({
          id: `${str(row.name) ?? "persona"}-${index}`,
          persona: str(row.name) ?? "",
          etapa: str(row.mainWorkflow),
          abiertas: num(row.activeTasks),
          carga: num(row.occupancyPct),
        })),
      },
    ],
    // Integer percents: warn on 80–100, critical above 100.
    heat: [{ key: "carga", warnAt: 79, critAt: 100 }],
  };
}

/** Output tables per tool (the data panel); a tool without an entry gets a generic record table. */
export const STEP_TABLES: Partial<Record<string, (output: unknown, input: unknown) => StepTable | null>> = {
  list_activities_due: (output) => activitiesDueTable(output),
  team_workload_summary: (output) => workloadTable(output),
};

/** "+3 · sin confirmar" / "+3 · creadas" / "cancelado" for an approval group. */
export function approvalMeta(group: Extract<ToolStepGroup, { kind: "approval" }>): string {
  const n = group.preview.length > 0 ? group.preview.length : group.steps.length;
  const state = groupState(group.steps);
  if (state === "denied") return "cancelado";
  if (state === "done") return `+${n} · ${plural(n, "creada", "creadas")}`;
  return `+${n} · sin confirmar`;
}

/** An approval group → "filas a crear" from its preview rows. */
export function approvalTable(group: Extract<ToolStepGroup, { kind: "approval" }>): StepTable {
  return {
    title: "filas a crear",
    columns: [
      { key: "tarea", label: "Tarea nueva" },
      { key: "responsable", label: "Responsable" },
      { key: "vence", label: "Vence", format: "date", mono: true },
    ],
    groups: [
      {
        id: FLAT_GROUP_ID,
        label: "",
        metrics: [],
        rows: group.preview.map((row, index) => ({
          id: `${group.steps[0]?.toolCallId ?? "fila"}-${index}`,
          op: row.op,
          tarea: row.title,
          responsable: row.person ?? null,
          vence: row.date ?? null,
        })),
      },
    ],
  };
}

function cellValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return typeof value === "boolean" ? (value ? "sí" : "no") : value;
  }
  if (Array.isArray(value)) return value.map((item) => (typeof item === "object" ? JSON.stringify(item) : String(item))).join(", ");
  return JSON.stringify(value);
}

/**
 * Any other tool output as a `RecordTable`: its array rows (first 50, keys as
 * headers), or a key/value table of an object. Null for failures and outputs
 * with nothing tabular.
 */
export function recordStepTable(output: unknown): RecordTableData | null {
  const value = unwrap(output);
  if (value === null || value === undefined || isFailure(value)) return null;
  const rows = objectRows(value);
  if (rows) {
    if (rows.length === 0) return null;
    const shown = rows.slice(0, RECORD_ROWS_MAX);
    const keys = [...new Set(shown.flatMap((row) => Object.keys(row)))];
    return {
      columns: keys.map((key) => ({
        key,
        label: key,
        ...(shown.every((row) => row[key] === null || row[key] === undefined || typeof row[key] === "number")
          ? { format: "count" as const }
          : {}),
      })),
      rows: shown.map((row) => Object.fromEntries(keys.map((key) => [key, cellValue(row[key])]))),
    };
  }
  if (typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return null;
  return {
    columns: [
      { key: "campo", label: "Campo" },
      { key: "valor", label: "Valor" },
    ],
    rows: entries.map(([key, v]) => ({ campo: key, valor: cellValue(v) })),
  };
}

/** Leaf row count of a step table. */
export function stepTableRowCount(table: StepTable): number {
  const count = (group: Group<StepRow>): number =>
    (group.rows?.length ?? 0) + (group.children ?? []).reduce((sum, child) => sum + count(child), 0);
  return table.groups.reduce((sum, group) => sum + count(group), 0);
}

// ── Context estimate ───────────────────────────────────────────────────────

/** Estimated context tokens: ceil(chars / 4) over the thread's text parts plus the draft. */
export function estimateContextTokens(messages: readonly AssistantUIMessage[], draft = ""): number {
  let chars = draft.length;
  for (const message of messages) {
    for (const part of message.parts) if (part.type === "text") chars += part.text.length;
  }
  return Math.ceil(chars / 4);
}

/** "~3.8k tokens de contexto" (under 1000: "~812 tokens de contexto"). */
export function contextTokensLabel(tokens: number): string {
  if (tokens < 1000) return `~${tokens} tokens de contexto`;
  return `~${SECONDS.format(tokens / 1000)}k tokens de contexto`;
}

// ── CSV ("Exportar pasos") ─────────────────────────────────────────────────

export const STEPS_CSV_HEADER = ["#", "mensaje", "herramienta", "que_hizo", "parametros", "estado", "duracion_s", "filas"];

function csvCell(value: string | number | null): string {
  const text = value === null ? "" : escapeCsvFormula(String(value));
  return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Every step row of the thread, as the steps tables show them: UTF-8 with
 * BOM, `;` separator, CRLF. `mensaje` is the assistant message number.
 */
export function stepsCsv(messages: readonly AssistantUIMessage[]): string {
  const lines: string[] = [STEPS_CSV_HEADER.map(csvCell).join(";")];
  let ordinal = 0;
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    ordinal += 1;
    for (const row of stepTableRows(toToolSteps(message))) {
      lines.push(
        [
          row.index,
          ordinal,
          row.tool,
          row.short,
          row.params,
          STEP_STATE_TEXT[row.state],
          row.durationMs === null ? null : (row.durationMs / 1000).toFixed(1),
          row.rows,
        ]
          .map(csvCell)
          .join(";"),
      );
    }
  }
  return `${CSV_BOM}${lines.join("\r\n")}\r\n`;
}

/** `pasos-{slug-del-titulo}.csv`. */
export function stepsCsvFileName(title: string): string {
  const slug = title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return `pasos-${slug || "conversacion"}.csv`;
}
