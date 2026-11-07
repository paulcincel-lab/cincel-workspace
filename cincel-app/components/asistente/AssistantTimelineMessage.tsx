"use client";

import { AgendaWidget } from "@/components/widgets/AgendaWidget";
import type { AgendaItem } from "@/lib/types/widgets";

/** Same shape as `AgendaWidget`. */
export type RenderTimelineArgs = { title?: string; items: AgendaItem[] };

export type AssistantTimelineMessageProps = RenderTimelineArgs;

export const ASSISTANT_TIMELINE_DEFAULT_TITLE = "Agenda";
export const ASSISTANT_TIMELINE_EMPTY_TEXT = "Sin eventos para mostrar";

/**
 * `render_timeline` (redesign FE §4.9): adapter onto `AgendaWidget`. The
 * agenda follows the user's presentation style through the widget, grouped by
 * day; no items render the widget's empty state.
 */
export function AssistantTimelineMessage({ title, items }: AssistantTimelineMessageProps) {
  const list = Array.isArray(items) ? items : [];
  return (
    <AgendaWidget
      title={title?.trim() || ASSISTANT_TIMELINE_DEFAULT_TITLE}
      items={list}
      mode="day"
      groupBy="day"
      emptyText={ASSISTANT_TIMELINE_EMPTY_TEXT}
    />
  );
}
