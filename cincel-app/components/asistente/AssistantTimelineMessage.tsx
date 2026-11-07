"use client";

import type { AgendaItem } from "@/lib/types/widgets";

/** Same shape as `AgendaWidget`. */
export type RenderTimelineArgs = { title?: string; items: AgendaItem[] };

export type AssistantTimelineMessageProps = RenderTimelineArgs;

/**
 * `render_timeline` (redesign FE §4.9): adapter onto `AgendaWidget`.
 *
 * Contract stub: renders nothing until its owning issue implements it.
 */
export function AssistantTimelineMessage(props: AssistantTimelineMessageProps) {
  void props;
  return null;
}
