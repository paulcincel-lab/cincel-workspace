/**
 * Release A compatibility (BE §4.3 step 2, §9.9): until the Phase 2 UI sends
 * the new fields, writes from the old screens must still satisfy the new
 * constraints so migration 0025 can set `workflow_task_templates.phase_id`
 * NOT NULL and the `projects_name_lower_uq` index never surfaces as a 500.
 * No `server-only` import, so scripts can use it.
 */
import { nameKey } from "@/lib/project-flow/names";

export type TemplatePhaseCandidate = {
  id: string;
  name: string;
  sortOrder: number;
  active: boolean;
};

export type TemplatePhaseSource = {
  /** Sent by the new UI; wins when present. */
  phaseId?: string | null;
  /** Old free-text fase sent by the old UI. */
  phase?: string | null;
};

function byCatalogOrder(a: TemplatePhaseCandidate, b: TemplatePhaseCandidate): number {
  return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "es");
}

/** The fase whose `nameKey` equals `text` (active fases first), or null. */
export function matchPhaseByName(
  text: string | null | undefined,
  phases: readonly TemplatePhaseCandidate[]
): string | null {
  const trimmed = text?.trim();
  if (!trimmed) return null;
  const key = nameKey(trimmed);
  const matches = [...phases].sort(byCatalogOrder).filter((p) => nameKey(p.name) === key);
  return (matches.find((p) => p.active) ?? matches[0])?.id ?? null;
}

/**
 * The fase a template is stored under: 1) `phaseId` when given; 2) the fase of
 * the tramo whose `nameKey` equals the old `phase` text (active fases first);
 * 3) the tramo's first fase in catalog order (first active one, else the first
 * one). Null only when the tramo has no fases at all.
 */
export function resolveTemplatePhaseId(
  source: TemplatePhaseSource,
  phases: readonly TemplatePhaseCandidate[]
): string | null {
  if (source.phaseId) return source.phaseId;
  const byName = matchPhaseByName(source.phase, phases);
  if (byName) return byName;
  const ordered = [...phases].sort(byCatalogOrder);
  return (ordered.find((p) => p.active) ?? ordered[0])?.id ?? null;
}

const UNIQUE_VIOLATION = "23505";

/**
 * True when `err` (or one of its causes, as drizzle wraps driver errors) is a
 * unique violation on `constraint`. postgres.js reports the index name in
 * `constraint_name`; node-postgres in `constraint`.
 */
export function isUniqueViolationOn(err: unknown, constraint: string): boolean {
  let current: unknown = err;
  for (let depth = 0; current && typeof current === "object" && depth < 5; depth++) {
    const e = current as { code?: unknown; constraint_name?: unknown; constraint?: unknown; cause?: unknown };
    if (e.code === UNIQUE_VIOLATION && (e.constraint_name === constraint || e.constraint === constraint)) {
      return true;
    }
    current = e.cause;
  }
  return false;
}

export const PROJECT_NAME_UNIQUE_INDEX = "projects_name_lower_uq";

/** Rethrows a `projects_name_lower_uq` violation as `NAME_TAKEN`; anything else unchanged. */
export function rethrowProjectNameTaken(err: unknown): never {
  if (isUniqueViolationOn(err, PROJECT_NAME_UNIQUE_INDEX)) throw new Error("NAME_TAKEN");
  throw err;
}
