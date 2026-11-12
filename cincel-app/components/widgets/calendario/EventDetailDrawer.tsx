import type { CalItem, DetailAction, MeetingDetail } from "@/lib/types/calendario";

import { MeetingDetailDrawer } from "./MeetingParts";
import { CalendarioStubSection } from "./stub-section";

export type EventDetailDrawerProps = {
  item: CalItem;
  detail?: MeetingDetail;
  actions: DetailAction[];
  onClose(): void;
};

/** Detail of a task or meeting (per-Estilo container). Markup belongs to Phase 1 (tasks) and Phase 2 (meetings). */
export function EventDetailDrawer({ item, detail, actions, onClose }: EventDetailDrawerProps) {
  if (item.kind === "event") return <MeetingDetailDrawer item={item} detail={detail} onClose={onClose} />;
  return <CalendarioStubSection label={`Detalle: ${item.title}`} titles={actions.map((action) => action.label)} />;
}
