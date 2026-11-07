"use client";

import type { TodayStatus } from "@/lib/types/redesign";
import type { NavItemKey, NavModel } from "@/lib/ui/nav";

import type { AppShellProps } from "./AppShell";

/**
 * Sidebar of the new shell (redesign FE §3.1, §4.1).
 *
 * Contract stub: renders nothing until its owning issue implements it.
 */
export type SidebarProps = {
  nav: NavModel;
  activeKey: NavItemKey | null;
  session: AppShellProps["session"];
  today: TodayStatus | null;
  onOpenSearch(): void;
};

export function Sidebar(props: SidebarProps) {
  void props;
  return null;
}
