import type { CalItem } from "@/lib/types/calendario";

export type CalendarItemChipProps = {
  item: CalItem;
  density: "chip" | "card" | "block";
  proposal?: "new" | "ghost";
};

/** One task or meeting on the calendar. Markup belongs to Phase 1. */
export function CalendarItemChip({ item }: CalendarItemChipProps) {
  return <span data-slot="calendar-item-chip">{item.title}</span>;
}
