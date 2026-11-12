/** Proposal change shapes, diff and undo plan (BE §6.3, ADR 0007). Pure and client-safe. */
import type { AppliedChange, MeetingPatch, ProposalChange } from "@/lib/types/calendario";

/** Hours a proposal is valid (`expires_at = created_at + 24 h`). */
export const PROPOSAL_TTL_HOURS = 24;
/** Minutes the undo token is valid (D9). */
export const UNDO_WINDOW_MINUTES = 15;
/** Most changes one proposal may carry. */
export const MAX_PROPOSAL_CHANGES = 200;

/** Skip reasons shown in the card and counted in the toast. */
export const SKIP_NO_PERMISSION = "Sin permiso";
export const SKIP_CHANGED = "Cambió desde la propuesta";
export const SKIP_GONE = "Ya no existe";
export const SKIP_CHANGED_AFTER_APPLY = "Cambió después de aplicar";
export const SKIP_NOT_UNDOABLE = "No se puede deshacer";
export const SKIP_FAILED = "No se pudo aplicar";

/** What `apply` stores per applied change so undo can restore it (`AppliedChange.undo`). */
export type UndoPayload =
  | { type: "task_date"; field: "commitmentDate" | "deliveryDate"; before: string | null; after: string }
  | { type: "event_create" }
  | { type: "event_update"; before: MeetingPatch; after: MeetingPatch }
  | { type: "event_cancel" }
  | { type: "task_create" }
  | { type: "decision"; text: string; projectId: string | null };

const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T/;

/** Equality for the values a proposal compares: dates, instants, strings, small arrays. */
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (typeof a === "string" && typeof b === "string" && ISO_DATETIME.test(a) && ISO_DATETIME.test(b)) {
    const x = Date.parse(a);
    const y = Date.parse(b);
    return !Number.isNaN(x) && x === y;
  }
  if (typeof a === "object" && typeof b === "object" && a !== null && b !== null) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}

/** True when the current value no longer equals the change's `before`. */
export function isStale(change: ProposalChange, current: unknown): boolean {
  switch (change.type) {
    case "task_date":
      return !sameValue(current, change.before.date);
    case "event_update": {
      if (current === null || typeof current !== "object") return true;
      const now = current as Record<string, unknown>;
      return (Object.keys(change.before) as (keyof MeetingPatch)[]).some(
        (key) => key in now && !sameValue(now[key], change.before[key]),
      );
    }
    default:
      return false;
  }
}

/** The before/after rows of a proposal as a flat diff, for the table and the chat card. */
export function diffRows(changes: ProposalChange[]): { changeId: string; title: string; before: string | null; after: string }[] {
  return changes.map((change) => {
    switch (change.type) {
      case "task_date":
        return { changeId: change.changeId, title: change.title, before: change.before.date, after: change.after.date };
      case "event_create":
        return { changeId: change.changeId, title: change.draft.title, before: null, after: change.draft.start };
      case "event_update":
        return {
          changeId: change.changeId,
          title: change.after.title ?? change.before.title ?? "Reunión",
          before: change.before.start ?? change.before.title ?? null,
          after: change.after.start ?? change.after.title ?? "Cambio",
        };
      case "event_cancel":
        return { changeId: change.changeId, title: "Reunión", before: null, after: "Cancelada" };
      case "task_create":
        return { changeId: change.changeId, title: change.draft.title, before: null, after: change.draft.commitmentDate ?? "Sin fecha" };
      case "decision":
        return { changeId: change.changeId, title: change.text, before: null, after: "Decisión" };
    }
  });
}

/**
 * What undo restores: per applied change, only where the current value still equals `after`.
 * `current` maps a changeId to what the entity holds now: the date (task_date), the patch fields
 * (event_update), or `"exists"` (created rows). A missing or `undefined` entry means the row is gone.
 */
export function undoPlan(
  applied: AppliedChange[],
  current: Record<string, unknown>,
): { restore: AppliedChange[]; skipped: { changeId: string; reason: string }[] } {
  const restore: AppliedChange[] = [];
  const skipped: { changeId: string; reason: string }[] = [];
  for (const item of applied) {
    const undo = item.undo as UndoPayload | null;
    const now = current[item.changeId];
    if (!undo) {
      skipped.push({ changeId: item.changeId, reason: SKIP_NOT_UNDOABLE });
      continue;
    }
    if (undo.type === "event_cancel") {
      skipped.push({ changeId: item.changeId, reason: SKIP_NOT_UNDOABLE });
      continue;
    }
    if (now === undefined) {
      skipped.push({ changeId: item.changeId, reason: SKIP_GONE });
      continue;
    }
    if (undo.type === "task_date") {
      if (sameValue(now, undo.after)) restore.push(item);
      else skipped.push({ changeId: item.changeId, reason: SKIP_CHANGED_AFTER_APPLY });
      continue;
    }
    if (undo.type === "event_update") {
      const patch = (now ?? {}) as Record<string, unknown>;
      const after = undo.after as Record<string, unknown>;
      const unchanged = Object.keys(after).every((key) => !(key in patch) || sameValue(patch[key], after[key]));
      if (unchanged) restore.push(item);
      else skipped.push({ changeId: item.changeId, reason: SKIP_CHANGED_AFTER_APPLY });
      continue;
    }
    restore.push(item);
  }
  return { restore, skipped };
}
