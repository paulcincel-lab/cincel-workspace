/** Row → CalItem mapping (BE §5.2, §5.3). Pure and client-safe. Bodies belong to the Phase 1 issue. */
import { notImplemented } from "@/lib/stubs";
import type { CalEventItem, CalItem, CalTaskItem, CalTramoRef } from "@/lib/types/calendario";

/** Items per day the range loader returns, by vista (`mes` 3, `semana` 12, `dia` 200). */
export const PER_DAY_LIMIT = { mes: 3, semana: 12, dia: 200 } as const;

/** The due date a task shows: commitment date, else delivery date. */
export function dueDateOf(t: { commitmentDate: string | null; deliveryDate: string | null }): {
  date: string;
  field: "commitmentDate" | "deliveryDate";
} | null {
  return notImplemented("dueDateOf", t);
}

/** Open task whose due date is before `today` (org midnight). */
export function isOverdue(t: { date: string; completed: boolean }, today: string): boolean {
  return notImplemented("isOverdue", t, today);
}

/** The tramo colour slot of a workflow row, or null. */
export function tramoRefOf(w: { id: string; key: string | null; name: string; colorSlot: number | null } | null): CalTramoRef | null {
  return notImplemented("tramoRefOf", w);
}

/** A task row as a `CalTaskItem`. */
export function taskRowToItem(row: unknown, ctx: { today: string; canEdit: boolean }): CalTaskItem {
  return notImplemented("taskRowToItem", row, ctx);
}

/** An event row as a `CalEventItem`. */
export function eventRowToItem(row: unknown, ctx: { canEdit: boolean; viewerId: string }): CalEventItem {
  return notImplemented("eventRowToItem", row, ctx);
}

/** Order within a day: events by start, overdue tasks, open tasks by priority, completed. */
export function sortDayItems(items: CalItem[]): CalItem[] {
  return notImplemented("sortDayItems", items);
}
