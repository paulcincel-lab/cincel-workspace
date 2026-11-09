/**
 * Smart quick-add parser (pure, client-safe): `@persona`, `#tramo`, dates,
 * `!prioridad` and `/` commands. For now it only trims the text; full rules
 * in #984.
 */
import type { TaskPriority } from "@/lib/types/core";

export type QuickAddPerson = { id: string; name: string; suggested?: boolean; openCount?: number; overdueCount?: number };
export type QuickAddTramo = { id: string; key: string; name: string };
export type QuickAddParseContext = {
  /** YYYY-MM-DD, org time zone */
  today: string;
  people: readonly QuickAddPerson[];
  tramos: readonly QuickAddTramo[];
  meId: string | null;
};
export type QuickAddToken = {
  kind: "person" | "tramo" | "date" | "priority";
  start: number;
  end: number;
  raw: string;
  status: "resolved" | "ambiguous" | "unknown";
  value?: string;
  label?: string;
  candidates?: { id: string; label: string }[];
};
export type ParsedQuickAdd = {
  title: string;
  assigneeId?: string;
  tramoId?: string;
  dueDate?: string;
  priority?: TaskPriority;
  tokens: QuickAddToken[];
  slash: string | null;
};

export function parseQuickAdd(text: string, ctx: QuickAddParseContext): ParsedQuickAdd {
  void ctx;
  return { title: text.trim(), tokens: [], slash: null };
}
