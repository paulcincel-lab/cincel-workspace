import { notImplemented } from "@/lib/stubs";

import type { MailContent } from "./layout";

export type MinutaParams = {
  title: string;
  when: string;
  decisions: string[];
  tasks: { title: string; owner: string | null; date: string | null }[];
  nextMeeting: string | null;
  organizerName: string;
};

/** "Minuta · {título}" (BE §11.3). Body belongs to the Phase 6 issue. */
export function minutaEmail(params: MinutaParams): MailContent {
  return notImplemented("minutaEmail", params);
}
