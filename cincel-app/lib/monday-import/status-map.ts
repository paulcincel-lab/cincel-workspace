/**
 * The firm-wide monday status map (project flow FE §4.6 item 5, BE §10.6): the built-in defaults for monday labels
 * and the helpers that read and fill the saved map (app_settings `monday.status_map`). Every key is
 * `statusLabelKey(label)`. Pure and client-safe: init, the wizard's status table and the server share it.
 */
import {
  MondayStatusMap as MondayStatusMapSchema,
  statusLabelKey,
  type MappingInput,
  type MondayStatusMap,
  type StatusMapEntry,
  type StatusTarget,
} from "@/scripts/monday/mapping.schema";
import type { MondayExportSource, MondayImportChoices } from "@/lib/types/monday-import";

/** The app_settings key of the saved firm-wide map. */
export const STATUS_MAP_SETTING_KEY = "monday.status_map";

type BaseStatus = "pendiente" | "en_proceso" | "completado" | "bloqueado";

/**
 * A default of the table: a base status, or a seeded custom status found by name ("Cancelado", "En espera"), with
 * an optional priority.
 */
type StatusDefault =
  | { status: BaseStatus; priority?: StatusMapEntry["priority"] }
  | { customStatusName: string; priority?: StatusMapEntry["priority"] };

/** Labels matched by `defaultsKey` (case, accents and inner spaces ignored). */
export const STATUS_MAP_DEFAULTS: Readonly<Record<string, StatusDefault>> = {
  "en proceso": { status: "en_proceso" },
  entregado: { status: "completado" },
  confirmado: { status: "completado" },
  cancelado: { customStatusName: "cancelado" },
  "no se requiere": { customStatusName: "cancelado" },
  "en espera": { customStatusName: "en espera" },
  importante: { status: "pendiente", priority: "alta" },
  "siguiente paso": { status: "pendiente", priority: "alta" },
  "-": { status: "pendiente" },
};

/** `statusLabelKey` without accents: how the defaults table and custom status names are matched. */
export function defaultsKey(label: string): string {
  return statusLabelKey(label.normalize("NFD").replace(/[̀-ͯ]/g, ""));
}

const BASE_BY_NAME: Record<string, "pendiente" | "en_proceso" | "bloqueado"> = {
  pendiente: "pendiente",
  "en proceso": "en_proceso",
  bloqueado: "bloqueado",
};

const BLOCKED = /stuck|bloquead|detenid/i;
const IN_PROGRESS = /working|proceso|curso/i;

/** Custom statuses by `defaultsKey(name)` → id, from rows or an init lookup keyed by lower(name). */
export function customStatusIndex(
  statuses: Iterable<{ id: string; name: string }> | ReadonlyMap<string, string>,
): Map<string, string> {
  const out = new Map<string, string>();
  if (statuses instanceof Map) {
    for (const [name, id] of statuses) out.set(defaultsKey(name), id);
  } else {
    for (const status of statuses as Iterable<{ id: string; name: string }>) out.set(defaultsKey(status.name), status.id);
  }
  return out;
}

/**
 * The default entry of one monday label:
 * 1. a label named like an existing custom status → that status;
 * 2. the built-in table (Cancelado / En espera resolve to the seeded custom statuses by name);
 * 3. monday's done marker → Completado;
 * 4. named like a base status, or blocked / in progress patterns → that status;
 * 5. else Pendiente flagged `defaulted` ("Sin equivalente"). A label monday doesn't mark done never defaults to
 *    Completado unless the table says so.
 */
export function defaultStatusEntry(
  label: { name: string; isDone?: boolean },
  /** Custom statuses by `defaultsKey(name)` (see `customStatusIndex`). */
  customStatuses: ReadonlyMap<string, string> = new Map(),
): StatusMapEntry {
  const key = defaultsKey(label.name);
  const custom = customStatuses.get(key);
  if (custom) return { target: { customStatusId: custom }, priority: null };
  const row = STATUS_MAP_DEFAULTS[key];
  if (row) {
    const priority = row.priority ?? null;
    if ("status" in row) return { target: { status: row.status }, priority };
    const seeded = customStatuses.get(row.customStatusName);
    if (seeded) return { target: { customStatusId: seeded }, priority };
  }
  if (label.isDone) return { target: { status: "completado" }, priority: null };
  const base = BASE_BY_NAME[key];
  if (base) return { target: { status: base }, priority: null };
  if (BLOCKED.test(label.name)) return { target: { status: "bloqueado" }, priority: null };
  if (IN_PROGRESS.test(label.name)) return { target: { status: "en_proceso" }, priority: null };
  return { target: { status: "pendiente", defaulted: true }, priority: null };
}

/** Whether no equivalent was found and the label starts as Pendiente: «Sin equivalente». */
export function isDefaultedTarget(target: StatusTarget | undefined): boolean {
  return Boolean(target && "status" in target && target.defaulted);
}

/**
 * The map for a set of labels: saved entries are kept as they are (labels seen before keep their choice), labels
 * not in the saved map get their default. Saved entries for labels not in `labels` stay too.
 */
export function fillStatusMap(
  saved: MondayStatusMap,
  labels: Iterable<{ name: string; isDone?: boolean }>,
  customStatuses: ReadonlyMap<string, string> = new Map(),
): MondayStatusMap {
  const out: MondayStatusMap = { ...saved };
  for (const label of labels) {
    const key = statusLabelKey(label.name);
    if (!key || out[key]) continue;
    out[key] = defaultStatusEntry(label, customStatuses);
  }
  return out;
}

/** The saved setting's text as a map; anything that doesn't parse reads as an empty map. */
export function parseStoredStatusMap(value: string | null | undefined): MondayStatusMap {
  if (!value) return {};
  let raw: unknown;
  try {
    raw = JSON.parse(value);
  } catch {
    return {};
  }
  const parsed = MondayStatusMapSchema.safeParse(raw);
  return parsed.success ? parsed.data : {};
}

/** The custom status ids a map points at. */
export function statusMapCustomIds(map: MondayStatusMap): string[] {
  const ids = new Set<string>();
  for (const entry of Object.values(map)) if ("customStatusId" in entry.target) ids.add(entry.target.customStatusId);
  return [...ids];
}

// ── Wizard status table (FE §4.6 item 5) ─────────────────────────────────────

export type StatusMapPriority = NonNullable<StatusMapEntry["priority"]>;

export const STATUS_MAP_PRIORITY_LABELS: Record<StatusMapPriority, string> = {
  alta: "Alta",
  media: "Media",
  baja: "Baja",
};

/** The Cincel side of a default row: a built-in status, or a seeded custom status found by name. */
type DefaultTarget = { status: "pendiente" | "en_proceso" | "completado" | "bloqueado" } | { customName: string };

const DEFAULTS: Record<string, { target: DefaultTarget; priority: StatusMapPriority | null }> = {
  "en proceso": { target: { status: "en_proceso" }, priority: null },
  entregado: { target: { status: "completado" }, priority: null },
  confirmado: { target: { status: "completado" }, priority: null },
  cancelado: { target: { customName: "Cancelado" }, priority: null },
  "no se requiere": { target: { customName: "Cancelado" }, priority: null },
  "en espera": { target: { customName: "En espera" }, priority: null },
  importante: { target: { status: "pendiente" }, priority: "alta" },
  "siguiente paso": { target: { status: "pendiente" }, priority: "alta" },
  "-": { target: { status: "pendiente" }, priority: null },
};

const nameKey = (name: string) =>
  name.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase().replace(/\s+/g, " ");

/**
 * A label's starting entry when the saved map doesn't have it. `defaulted`: no equivalent, so it starts Pendiente
 * and shows «Sin equivalente» until the admin picks one.
 */
export function defaultStatusMapEntry(
  label: string,
  statuses: MondayImportChoices["statuses"],
): { entry: StatusMapEntry; defaulted: boolean } {
  const fallback = { entry: { target: { status: "pendiente" as const }, priority: null }, defaulted: true };
  const found = DEFAULTS[nameKey(label)];
  if (!found) return fallback;
  if ("status" in found.target) return { entry: { target: { status: found.target.status }, priority: found.priority }, defaulted: false };
  const wanted = nameKey(found.target.customName);
  const custom = statuses.find((status) => nameKey(status.name) === wanted);
  if (!custom) return fallback;
  return { entry: { target: { customStatusId: custom.id }, priority: found.priority }, defaulted: false };
}

export interface StatusMapLabel {
  /** `statusLabelKey(name)`. */
  key: string;
  /** The label as monday writes it (first seen). */
  name: string;
  /** Active items and subitems with the label across the boards; null when the export doesn't say. */
  items: number | null;
  /** monday marks it as done. */
  isDone: boolean;
}

/**
 * Distinct monday labels of the status columns of the mapped boards (skipped boards left out), in first-seen order.
 * `boardId` narrows them to one board (the board sheet).
 */
export function statusMapLabels(mapping: MappingInput, source: MondayExportSource, boardId?: string): StatusMapLabel[] {
  const out = new Map<string, StatusMapLabel>();
  for (const board of mapping.boards) {
    if (board.strategy === "skip" || board.strategy === "crm_contacts") continue;
    if (boardId && board.mondayBoardId !== boardId) continue;
    const boardSource = source.boards.find((candidate) => candidate.id === board.mondayBoardId);
    if (!boardSource) continue;
    const columnIds = new Set([
      ...Object.entries(board.columns).filter(([, target]) => target === "status").map(([id]) => id),
      ...Object.entries(board.subitemColumns ?? {}).filter(([, target]) => target === "status").map(([id]) => id),
    ]);
    for (const columnId of columnIds) {
      for (const label of boardSource.statusLabels[columnId] ?? []) {
        const key = statusLabelKey(label.name);
        if (!key) continue;
        const row = out.get(key);
        if (!row) {
          out.set(key, { key, name: label.name.trim(), items: label.items ?? null, isDone: label.isDone });
          continue;
        }
        row.isDone ||= label.isDone;
        if (label.items != null) row.items = (row.items ?? 0) + label.items;
      }
    }
  }
  return [...out.values()];
}

export interface StatusMapRow extends StatusMapLabel {
  entry: StatusMapEntry;
  /** Not in the saved map and no default: Pendiente with «Sin equivalente». */
  defaulted: boolean;
}

/** Each label with its entry: the saved one, else its default. */
export function statusMapRows(
  labels: StatusMapLabel[],
  saved: MondayStatusMap,
  statuses: MondayImportChoices["statuses"],
): StatusMapRow[] {
  return labels.map((label) => {
    const entry = saved[label.key];
    if (entry) return { ...label, entry: { target: entry.target, priority: entry.priority ?? null }, defaulted: false };
    return { ...label, ...defaultStatusMapEntry(label.name, statuses) };
  });
}

/** A saved entry that points at a custom status the firm no longer has (STATUS_NOT_FOUND). */
export function isMissingCustomStatus(target: StatusTarget, statuses: MondayImportChoices["statuses"]): boolean {
  return "customStatusId" in target && !statuses.some((status) => status.id === target.customStatusId);
}

/** The whole map to save after one row changes. */
export function setStatusMapEntry(map: MondayStatusMap, key: string, entry: StatusMapEntry): MondayStatusMap {
  return { ...map, [key]: entry };
}
