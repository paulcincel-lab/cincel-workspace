"use client";

import type { TodayStatus } from "@/lib/types/redesign";

/**
 * First-login-of-the-day clock-in dialog (redesign FE §3.10): dismissible
 * before `requiredFrom`, mandatory after.
 *
 * Contract stub: renders nothing until its owning issue implements it.
 */
export type ClockInPromptProps = { status: TodayStatus; requiredFrom: string | null; now: Date };

export function ClockInPrompt(props: ClockInPromptProps) {
  void props;
  return null;
}
