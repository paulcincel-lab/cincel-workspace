import type { MeetingPrep } from "@/lib/types/calendario";

import { CalendarioStubSection } from "./stub-section";

export type MeetingPrepPanelProps = { prep: MeetingPrep | null; eventId: string };

/** "Antes de la reunión". Markup belongs to Phase 6. */
export function MeetingPrepPanel({ prep }: MeetingPrepPanelProps) {
  return <CalendarioStubSection label="Antes de la reunión" titles={prep?.agenda ?? []} />;
}
