import type { MeetingMinutes } from "@/lib/types/calendario";

import { CalendarioStubSection } from "./stub-section";

export type MeetingMinutesPanelProps = { minutes: MeetingMinutes | null; eventId: string };

/** "Después de la reunión". Markup belongs to Phase 6. */
export function MeetingMinutesPanel({ minutes }: MeetingMinutesPanelProps) {
  return <CalendarioStubSection label="Después de la reunión" titles={minutes?.decisions.map((d) => d.text) ?? []} />;
}
