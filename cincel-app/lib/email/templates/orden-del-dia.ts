import { notImplemented } from "@/lib/stubs";

import type { MailContent } from "./layout";

export type OrdenDelDiaParams = {
  title: string;
  /** "jueves 12 nov, 10:00 – 11:00" */
  when: string;
  location: string | null;
  meetUrl: string | null;
  items: string[];
  organizerName: string;
};

/** "Orden del día · {título}" (BE §11.3). Body belongs to the Phase 6 issue. */
export function ordenDelDiaEmail(params: OrdenDelDiaParams): MailContent {
  return notImplemented("ordenDelDiaEmail", params);
}
