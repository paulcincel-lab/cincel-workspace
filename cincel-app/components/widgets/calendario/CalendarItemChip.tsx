import type { CalItem } from "@/lib/types/calendario";

import { MeetingChip } from "./MeetingParts";

export type CalendarItemChipProps = {
  item: CalItem;
  density: "chip" | "card" | "block";
  proposal?: "new" | "ghost";
};

/** One task or meeting on the calendar. Markup belongs to Phase 1. */
export function CalendarItemChip({ item, density }: CalendarItemChipProps) {
  if (item.kind === "event") return <MeetingChip item={item} density={density} />;
  return <span data-slot="calendar-item-chip">{item.title}</span>;
}
