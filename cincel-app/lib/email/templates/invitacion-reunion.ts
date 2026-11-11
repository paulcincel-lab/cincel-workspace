import { notImplemented } from "@/lib/stubs";

import type { MailContent } from "./layout";

export type InvitacionReunionParams = {
  title: string;
  when: string;
  location: string | null;
  /** Link to the meeting in Cincel; no `.ics` is attached (BE §7.6). */
  meetingUrl: string;
  organizerName: string;
  kind: "invitacion" | "cambio" | "cancelacion";
};

/** Invitation, change and cancel notice of a meeting on the failure path (BE §7.6). Body belongs to the Phase 2 issue. */
export function invitacionReunionEmail(params: InvitacionReunionParams): MailContent {
  return notImplemented("invitacionReunionEmail", params);
}
