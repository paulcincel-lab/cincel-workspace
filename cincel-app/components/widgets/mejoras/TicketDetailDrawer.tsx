"use client";

export type TicketDetailDrawerProps = {
  /** Code in the `?solicitud=` URL param, e.g. `SOL-0123`; null = closed. */
  code: string | null;
  onClose: () => void;
};

/** Mejoras ticket detail drawer (stub: #1115). */
export function TicketDetailDrawer(_props: TicketDetailDrawerProps) {
  return null;
}
