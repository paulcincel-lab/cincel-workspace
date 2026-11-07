"use client";

import type { NotificationPreferences } from "@/lib/types/redesign";

export type NotificacionesClientProps = { initial: NotificationPreferences };

/**
 * Ajustes › Notificaciones (redesign FE §3.8): kind × channel matrix and
 * quiet hours.
 *
 * Contract stub: renders nothing until its owning issue implements it.
 */
export function NotificacionesClient(props: NotificacionesClientProps) {
  void props;
  return null;
}
