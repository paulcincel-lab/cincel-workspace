/**
 * Assistant tool group "Widgets de respuesta" (redesign BE §10.3; Phase 7):
 * `render_table` and `render_timeline`, client widgets offered to all staff
 * with no confirmation. They touch no data: the input is validated against
 * the shared widget shapes (`RecordTableData`, `AgendaItem`, BE §6.1) and the
 * client renders it from the tool part's input (`AssistantTableMessage`,
 * `AssistantTimelineMessage`, FE §4.9). The result only acknowledges the
 * render so the model can continue.
 *
 * `render_confirmation` is not model-callable: it is the client's visual for
 * AI SDK approval requests (`ConfirmationCard`, BE §8.10), so it is not
 * registered here.
 */
import { z } from "zod";

import { defineTool, type DefinedTool } from "@/lib/assistant/define-tool";
import { toolSummaries } from "@/lib/assistant/tool-summaries";
import type { PresentationStyle } from "@/lib/types/redesign";
import type { AgendaItem, RecordColumnFormat, RecordTableData } from "@/lib/types/widgets";

// ── Shared widget shapes (BE §6.1) ──────────────────────────────────────────

const PRESENTATION_STYLES = ["visual", "esencial", "analitico"] as const satisfies readonly PresentationStyle[];
const COLUMN_FORMATS = [
  "text",
  "count",
  "percent",
  "hours",
  "days",
  "date",
  "delta",
  "mxn",
] as const satisfies readonly RecordColumnFormat[];

/** Upper bounds that keep one chat message readable. */
export const RENDER_TABLE_LIMITS = { columns: 12, rows: 200 } as const;
export const RENDER_TIMELINE_LIMITS = { items: 60 } as const;

const recordColumnSchema = z.object({
  key: z.string().trim().min(1).max(60).describe("Clave del campo en cada fila"),
  label: z.string().trim().min(1).max(80).describe("Encabezado visible de la columna"),
  align: z.enum(["left", "right"]).optional(),
  mono: z.boolean().optional().describe("Tipografía monoespaciada (cifras, claves)"),
  width: z.number().int().positive().max(800).optional(),
  format: z.enum(COLUMN_FORMATS).optional().describe("Formato de los valores de la columna"),
  hideOn: z.array(z.enum(PRESENTATION_STYLES)).optional().describe("Estilos de presentación donde se oculta"),
});

const cellSchema = z.union([z.string().max(500), z.number(), z.boolean(), z.null()]);

const recordTableFields = {
  columns: z.array(recordColumnSchema).min(1).max(RENDER_TABLE_LIMITS.columns),
  rows: z.array(z.record(z.string(), cellSchema)).max(RENDER_TABLE_LIMITS.rows),
  groupBy: z.string().trim().min(1).optional().describe("Clave de columna para agrupar filas"),
  totals: z
    .union([z.literal("auto"), z.record(z.string(), z.union([z.string(), z.number()]))])
    .optional()
    .describe('"auto" suma las columnas numéricas; o un objeto clave → total'),
  heat: z
    .array(z.object({ key: z.string().trim().min(1), warnAt: z.number(), critAt: z.number() }))
    .optional()
    .describe("Columnas con semáforo: advertencia y crítico a partir de esos valores"),
};

type RecordTableFields = z.output<z.ZodObject<typeof recordTableFields>>;

/** Column keys unique; `groupBy` and `heat[].key` name a column. */
function checkTableColumns(data: RecordTableFields, ctx: z.RefinementCtx): void {
  const keys = new Set<string>();
  data.columns.forEach((column, index) => {
    if (keys.has(column.key)) {
      ctx.addIssue({ code: "custom", path: ["columns", index, "key"], message: `Columna repetida "${column.key}".` });
    }
    keys.add(column.key);
  });
  if (data.groupBy && !keys.has(data.groupBy)) {
    ctx.addIssue({ code: "custom", path: ["groupBy"], message: `groupBy "${data.groupBy}" no es una columna.` });
  }
  data.heat?.forEach((rule, index) => {
    if (!keys.has(rule.key)) {
      ctx.addIssue({ code: "custom", path: ["heat", index, "key"], message: `heat "${rule.key}" no es una columna.` });
    }
  });
}

/** `RecordTableData` (BE §6.1). */
export const recordTableDataSchema = z.object(recordTableFields).superRefine(checkTableColumns);

/** `render_table` args = `RecordTableData & { title? }` (FE `RenderTableArgs`). */
export const renderTableSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional().describe("Título de la tabla"),
    ...recordTableFields,
  })
  .superRefine(checkTableColumns);

const ISO_DATE_OR_DATETIME = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/, "Fecha ISO 8601");

/** `AgendaItem` (BE §6.1). */
export const agendaItemSchema = z
  .object({
    id: z.string().trim().min(1).max(120),
    title: z.string().trim().min(1).max(200),
    start: ISO_DATE_OR_DATETIME.describe("Inicio ISO 8601 (fecha o fecha y hora)"),
    end: ISO_DATE_OR_DATETIME.optional().describe("Fin ISO 8601"),
    allDay: z.boolean().optional(),
    estimated: z.boolean().optional().describe("Fecha estimada (sin compromiso)"),
    project: z.string().trim().max(200).optional(),
    etapa: z.string().trim().max(60).nullable().optional().describe("Clave de la etapa (workflows.key)"),
    attendees: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
    href: z
      .string()
      .trim()
      .regex(/^\/(?!\/)/, "Solo enlaces internos de Cincel (empiezan con /)")
      .optional(),
    meetingUrl: z
      .string()
      .trim()
      .regex(/^https?:\/\//, "URL http(s)")
      .optional()
      .describe("Solo cuando el evento ya trae un enlace de Cutto guardado"),
  })
  .refine((item) => !item.end || item.end >= item.start, { message: "end no puede ser antes de start", path: ["end"] });

/** `render_timeline` args = `{ title?, items: AgendaItem[] }` (FE `RenderTimelineArgs`). */
export const renderTimelineSchema = z.object({
  title: z.string().trim().min(1).max(120).optional().describe("Título de la línea de tiempo"),
  items: z.array(agendaItemSchema).min(1).max(RENDER_TIMELINE_LIMITS.items),
});

// Compile-time check: the zod outputs stay assignable to the shared shapes.
type Assignable<T, U extends T> = U;
export type RenderTableInput = Assignable<RecordTableData & { title?: string }, z.output<typeof renderTableSchema>>;
export type RenderTimelineInput = Assignable<
  { title?: string; items: AgendaItem[] },
  z.output<typeof renderTimelineSchema>
>;

// ── Tools ───────────────────────────────────────────────────────────────────

const render_table = defineTool({
  name: "render_table",
  description:
    "Renderiza una tabla en la conversación (columnas con clave, encabezado y formato; filas como objetos clave → valor; agrupación, totales y semáforo opcionales). Úsala para comparar varias filas con varias columnas, p. ej. horas por persona o partidas con monto y avance.",
  schema: renderTableSchema,
  capability: () => true,
  available: () => true,
  confirm: false,
  write: false,
  summarize: toolSummaries.render_table,
  async run(_ctx, input) {
    return { ok: true, rendered: "table", rows: input.rows.length } as const;
  },
});

const render_timeline = defineTool({
  name: "render_timeline",
  description:
    "Renderiza una línea de tiempo en la conversación con eventos o fechas de tareas (id, título, inicio ISO, fin, proyecto, etapa, asistentes, enlace interno). Úsala para agendas, entregas y cronogramas cortos.",
  schema: renderTimelineSchema,
  capability: () => true,
  available: () => true,
  confirm: false,
  write: false,
  summarize: toolSummaries.render_timeline,
  async run(_ctx, input) {
    return { ok: true, rendered: "timeline", items: input.items.length } as const;
  },
});

export const tools: DefinedTool[] = [render_table, render_timeline] as DefinedTool[];
