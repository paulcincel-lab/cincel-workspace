import type { CalItem, DetailAction, MeetingDetail } from "@/lib/types/calendario";

import { CalendarioStubSection } from "./stub-section";

export type EventDetailCardProps = {
  item: CalItem;
  detail?: MeetingDetail;
  actions: DetailAction[];
  onClose(): void;
};

/** Detail of a task or meeting (per-Estilo container). Markup belongs to Phase 1 (tasks) and Phase 2 (meetings). */
export function EventDetailCard({ item, actions }: EventDetailCardProps) {
  return <CalendarioStubSection label={`Detalle: ${item.title}`} titles={actions.map((action) => action.label)} />;
}
