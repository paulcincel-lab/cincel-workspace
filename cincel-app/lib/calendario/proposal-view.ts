/** Pure view helpers of an open proposal (FE §7.1): rows of the table and entries of the overlay. */
import type { Proposal, ProposalChange } from "@/lib/types/calendario";

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "9 nov" from "2026-11-09" or an ISO timestamp (the date part is read as written). */
export function shortDate(value: string | null | undefined): string {
  if (!value) return "Sin fecha";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return value;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] ?? ""}`;
}

/** "9 nov, 10:00" for an ISO timestamp with a time part; the date alone otherwise. */
export function shortDateTime(value: string | null | undefined): string {
  if (!value) return "Sin fecha";
  const t = /T(\d{2}):(\d{2})/.exec(value);
  return t ? `${shortDate(value)}, ${t[1]}:${t[2]}` : shortDate(value);
}

export type ProposalRow = {
  changeId: string;
  type: ProposalChange["type"];
  title: string;
  project: string;
  /** Null for a creation. */
  before: string | null;
  after: string;
};

export function proposalRow(change: ProposalChange): ProposalRow {
  switch (change.type) {
    case "task_date":
      return {
        changeId: change.changeId,
        type: change.type,
        title: change.title,
        project: change.projectName ?? "Sin proyecto",
        before: shortDate(change.before.date),
        after: shortDate(change.after.date),
      };
    case "event_create":
      return { changeId: change.changeId, type: change.type, title: change.draft.title, project: "Reunión", before: null, after: shortDateTime(change.draft.start) };
    case "event_update":
      return {
        changeId: change.changeId,
        type: change.type,
        title: change.after.title ?? change.before.title ?? "Reunión",
        project: "Reunión",
        before: change.before.start ? shortDateTime(change.before.start) : null,
        after: change.after.start ? shortDateTime(change.after.start) : "Sin cambio de hora",
      };
    case "event_cancel":
      return { changeId: change.changeId, type: change.type, title: "Cancelar reunión", project: "Reunión", before: null, after: "Se cancela" };
    case "task_create":
      return {
        changeId: change.changeId,
        type: change.type,
        title: change.draft.title,
        project: "Tarea nueva",
        before: null,
        after: shortDate(change.draft.commitmentDate),
      };
    case "decision":
      return { changeId: change.changeId, type: change.type, title: change.text, project: "Decisión", before: null, after: "Se registra" };
  }
}

export function proposalRows(proposal: Proposal): ProposalRow[] {
  return proposal.changes.map(proposalRow);
}

export type OverlayEntry = {
  changeId: string;
  /** "t:<uuid>" / "e:<uuid>" of the item that moves; null for a creation. */
  originalItemId: string | null;
  title: string;
  /** Day (YYYY-MM-DD) where the proposed item lands; null when it does not land on a day. */
  date: string | null;
  /** Mono tag, announced by text: "propuesta: desde 9 nov" / "propuesta: nueva reunión". */
  tag: string;
  kind: "moved" | "new" | "cancel";
};

export function overlayEntries(proposal: Proposal, checked: readonly string[]): OverlayEntry[] {
  const out: OverlayEntry[] = [];
  for (const c of proposal.changes) {
    if (!checked.includes(c.changeId)) continue;
    switch (c.type) {
      case "task_date":
        out.push({
          changeId: c.changeId,
          originalItemId: `t:${c.taskId}`,
          title: c.title,
          date: c.after.date,
          tag: `propuesta: desde ${shortDate(c.before.date)}`,
          kind: "moved",
        });
        break;
      case "event_create":
        out.push({ changeId: c.changeId, originalItemId: null, title: c.draft.title, date: c.draft.start.slice(0, 10), tag: "propuesta: nueva reunión", kind: "new" });
        break;
      case "event_update":
        out.push({
          changeId: c.changeId,
          originalItemId: `e:${c.eventId}`,
          title: c.after.title ?? c.before.title ?? "Reunión",
          date: c.after.start ? c.after.start.slice(0, 10) : null,
          tag: c.before.start ? `propuesta: desde ${shortDate(c.before.start)}` : "propuesta: cambio de reunión",
          kind: "moved",
        });
        break;
      case "event_cancel":
        out.push({ changeId: c.changeId, originalItemId: `e:${c.eventId}`, title: "Reunión", date: null, tag: "propuesta: cancelar reunión", kind: "cancel" });
        break;
      case "task_create":
        out.push({ changeId: c.changeId, originalItemId: null, title: c.draft.title, date: c.draft.commitmentDate, tag: "propuesta: nueva tarea", kind: "new" });
        break;
      case "decision":
        break;
    }
  }
  return out;
}

/** Ids ("t:…" / "e:…") of the items a checked change moves or cancels: drawn greyed and struck. */
export function originalItemIds(proposal: Proposal, checked: readonly string[]): Set<string> {
  const ids = new Set<string>();
  for (const e of overlayEntries(proposal, checked)) if (e.originalItemId) ids.add(e.originalItemId);
  return ids;
}

/** True when the proposal can no longer be applied (status or `expiresAt`). */
export function isProposalStale(proposal: Proposal | null, now: number = Date.now()): boolean {
  if (!proposal) return true;
  return proposal.status !== "propuesta" || Date.parse(proposal.expiresAt) <= now;
}

/** Table title: the kind's title for 1 change, "Cambiar {n} fechas compromiso" for dates. */
export function proposalTableTitle(proposal: Proposal): string {
  const dates = proposal.changes.filter((c) => c.type === "task_date").length;
  if (proposal.kind === "mover_tareas" && dates > 1 && dates === proposal.changes.length) return `Cambiar ${dates} fechas compromiso`;
  return proposal.title;
}
