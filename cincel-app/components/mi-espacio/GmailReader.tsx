"use client";

export type GmailReaderProps = { threadId: string; onClose(): void };

/**
 * Gmail reading pane (redesign FE §3.3): body in `<iframe sandbox srcdoc>`,
 * attachments, Responder / Crear tarea / Vincular a proyecto.
 *
 * Contract stub: renders nothing until its owning issue implements it.
 */
export function GmailReader(props: GmailReaderProps) {
  void props;
  return null;
}
