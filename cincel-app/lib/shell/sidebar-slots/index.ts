/**
 * Sidebar slot registry (redesign FE §21.1): each slot is a client component
 * the sidebar renders in its place. Slots read their data from the query
 * cache (`qk.me.today()`, `qk.shell.badges()`), which the `(staff)` layout
 * hydrates; the shell decides which slots mount.
 */
import type { ComponentType, ReactNode } from "react";

import { bandejaBadgeSlot } from "./bandeja-badge";
import { timeClockSlot } from "./time-clock";

export type SidebarSlotName = "time-clock" | "bandeja-badge";

export type SidebarSlot = {
  name: SidebarSlotName;
  Component: ComponentType;
};

export const SIDEBAR_SLOTS = [timeClockSlot, bandejaBadgeSlot] as const;

/** Rendered slots handed to the client `Sidebar`. */
export type SidebarSlotNodes = Partial<Record<SidebarSlotName, ReactNode>>;
