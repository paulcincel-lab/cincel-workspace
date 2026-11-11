import type { CalEventItem } from "@/lib/types/calendario";

import { CalendarioStubSection } from "./stub-section";

export type MeetingsListProps = { meetings: CalEventItem[]; onOpen?(id: string): void };

/** The Reuniones list. Markup belongs to Phase 6. */
export function MeetingsList({ meetings }: MeetingsListProps) {
  return <CalendarioStubSection label="Reuniones" titles={meetings.map((meeting) => meeting.title)} />;
}
