/**
 * Sidebar slot registry (redesign FE §21.1): each slot is a server loader plus
 * the component the sidebar renders with its data. A slot whose loader returns
 * null is not rendered.
 */
import type { ComponentType } from "react";

import type { NavSession } from "@/lib/ui/nav";

import { bandejaBadgeSlot } from "./bandeja-badge";
import { timeClockSlot } from "./time-clock";

export type SidebarSlotName = "time-clock" | "bandeja-badge";

export type SidebarSlot<T> = {
  name: SidebarSlotName;
  /** Server loader; null = slot hidden. */
  load(session: NavSession): Promise<T | null>;
  Component: ComponentType<{ data: T }>;
};

export const SIDEBAR_SLOTS = [timeClockSlot, bandejaBadgeSlot] as const;
