"use client";

import { createContext, useContext } from "react";

import type { DayAlert } from "@/lib/calendario/alerts";
import type { OverlayEntry } from "@/lib/calendario/proposal-view";
import type { Proposal } from "@/lib/types/calendario";

/**
 * What the views draw while a proposal is open and for the day alerts (FE §7.1, §7.4): the proposed
 * entries per day, the originals to strike, the after-hours of each day and the banner alerts.
 * Provided once by the page (`CalendarioOverlayProvider`); an empty value when none is open.
 */
export type CalendarioOverlay = {
  proposal: Proposal | null;
  checked: string[];
  entries: OverlayEntry[];
  originals: ReadonlySet<string>;
  entriesByDate: ReadonlyMap<string, OverlayEntry[]>;
  /** Hours a day will have with the open proposal applied; null when no proposal moves load. */
  afterHours(date: string): number | null;
  alerts: DayAlert[];
  /** Key `${kind}:${date}` of the alert whose proposal is being asked for or is open. */
  pendingKey: string | null;
  onAlert(alert: DayAlert): void;
};

export const NO_OVERLAY: CalendarioOverlay = {
  proposal: null,
  checked: [],
  entries: [],
  originals: new Set(),
  entriesByDate: new Map(),
  afterHours: () => null,
  alerts: [],
  pendingKey: null,
  onAlert: () => undefined,
};

export const CalendarioOverlayContext = createContext<CalendarioOverlay>(NO_OVERLAY);

export function useCalendarioOverlay(): CalendarioOverlay {
  return useContext(CalendarioOverlayContext);
}
