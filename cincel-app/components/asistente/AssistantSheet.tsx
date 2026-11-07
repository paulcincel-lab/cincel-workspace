"use client";

import type { AssistantContext } from "@/lib/types/redesign";

export type AssistantSheetProps = { open: boolean; onOpenChange(open: boolean): void; context: AssistantContext; threadId?: string };

/**
 * Assistant sheet, 460 px (redesign FE §3.9); extends `AssistantChat`.
 *
 * Contract stub: renders nothing until its owning issue implements it.
 */
export function AssistantSheet(props: AssistantSheetProps) {
  void props;
  return null;
}
