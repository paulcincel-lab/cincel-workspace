"use client";

import type { TicketEvent } from "@/lib/types/soporte";

export type TicketTimelineProps = {
  events: TicketEvent[];
  /** Admins see internal notes, marked "Nota interna"; the author never gets them. */
  showInternal?: boolean;
};

/** The timeline shared by Mis solicitudes and Mejoras (stub: #1111). */
export function TicketTimeline(_props: TicketTimelineProps) {
  return null;
}
