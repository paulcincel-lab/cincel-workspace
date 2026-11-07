/**
 * Widget builders (redesign BE §8.0.2): pure, isomorphic functions mapping
 * existing DTOs to the shared shapes of `lib/types/widgets.ts`. Extends
 * `lib/dashboard/donut-groups.ts`. Every aggregate action, page and assistant
 * widget uses these; none builds shapes by hand.
 */
import { notImplemented } from "@/lib/stubs";
import type { CalendarEvent } from "@/lib/types/calendar";
import type { ProjectListItem, Staff, TaskListItem } from "@/lib/types/core";
import type { PeopleOverviewRow, PortfolioRow, Reminder, TeamAbsence } from "@/lib/types/redesign";
import type {
  AgendaItem,
  AttentionItem,
  DistributionSegment,
  EntityCard,
  PersonDatum,
  ProgressItem,
  RecordColumn,
  RecordTableData,
} from "@/lib/types/widgets";

/** Generalizes `tasksByBaseStatus` / `projectsByTramo`. */
export function toDistribution<T>(
  items: T[],
  opts: {
    keyOf: (item: T) => string;
    labelOf: (item: T) => string;
    colorVarOf: (item: T) => string;
    secondaryOf?: (item: T) => number;
    extraOf?: (item: T) => Record<string, number | string>;
  },
): DistributionSegment[] {
  return notImplemented("toDistribution", items, opts);
}

export function toProgressItems(projects: ProjectListItem[], portfolio?: PortfolioRow[]): ProgressItem[] {
  return notImplemented("toProgressItems", projects, portfolio);
}

/** Reason / tone: vencida → critical, sin responsable / bloqueada → warn, por vencer ≤ 2 días → default. */
export function toAttentionItems(tasks: TaskListItem[], now: Date): AttentionItem[] {
  return notImplemented("toAttentionItems", tasks, now);
}

/** Calendar events, reminders, tasks or absences → agenda items (reuses `buildCalendarEvents`). */
export function toAgendaItems(
  source:
    | { kind: "events"; items: CalendarEvent[] }
    | { kind: "reminders"; items: Reminder[] }
    | { kind: "tasks"; items: TaskListItem[] }
    | { kind: "absences"; items: TeamAbsence[] },
): AgendaItem[] {
  return notImplemented("toAgendaItems", source);
}

export function toPersonDatum(staff: Staff, overviewRow: PeopleOverviewRow | null): PersonDatum {
  return notImplemented("toPersonDatum", staff, overviewRow);
}

export function toEntityCards<T>(items: T[], map: (item: T) => EntityCard): EntityCard[] {
  return notImplemented("toEntityCards", items, map);
}

/** `"auto"` totals sum the numeric columns. */
export function toRecordTable(
  columns: RecordColumn[],
  rows: Record<string, unknown>[],
  totals?: RecordTableData["totals"],
): RecordTableData {
  return notImplemented("toRecordTable", columns, rows, totals);
}
