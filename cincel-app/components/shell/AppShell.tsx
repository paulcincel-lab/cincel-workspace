import { Suspense, type ReactNode } from "react";

import { AssistantLauncher } from "@/components/asistente/AssistantLauncher";
import { bandejaBadgeSlot } from "@/lib/shell/sidebar-slots/bandeja-badge";
import type { SidebarSlotNodes } from "@/lib/shell/sidebar-slots";
import { timeClockSlot } from "@/lib/shell/sidebar-slots/time-clock";
import { isBandejaBadgeVisible, isTimeClockVisible } from "@/lib/shell/visibility";
import type { TodayStatus } from "@/lib/types/redesign";
import type { NavModel } from "@/lib/ui/nav";
import { toClientNavModel } from "@/lib/ui/nav-client";

import { AppShellClient } from "./AppShellClient";
import { ClockInPrompt } from "./ClockInPrompt";

/**
 * The new staff shell (redesign FE §3.1, §4.1): `Sidebar`, `AssistantButton`,
 * `CommandPalette` and `BottomTabs` around the page. Mounted by
 * `app/(staff)/layout.tsx` for every active session.
 *
 * Server part: decides which sidebar slots mount and hands a serializable
 * nav model to the client part. The live parts (badges, clock, avatar) read
 * the query cache the layout hydrates (`qk.shell.badges()`, `qk.me.today()`,
 * `qk.me.profile()`).
 *
 * The presentation style comes from the `useAppearance` store the root
 * layout seeds, `fixedByOrg` included (`EstiloSwitch` hides and `?estilo=`
 * is ignored when the organization fixes the style); there is no nested
 * style provider in the shell or its pages.
 *
 * Below 768 px the client part renders the compact top bar (`MobileTopBar`)
 * and pads the page so the fixed `BottomTabs` never cover it.
 */
export type AppShellProps = {
  children: ReactNode;
  session: { staffId: string; name: string; role: string; isAdmin: boolean; photoUrl: string | null };
  /** From `buildNavModel(session)` in `lib/ui/nav.ts`. */
  nav: NavModel;
  /** The layout's `TodayStatus` seed; null when time tracking is disabled or the viewer is exempt. */
  today: TodayStatus | null;
  /** True on /asistente. */
  hideAssistant?: boolean;
};

/** The slot nodes; a slot stays out while its gate is closed. */
export function renderSidebarSlots(today: TodayStatus | null): SidebarSlotNodes {
  const slots: SidebarSlotNodes = {};
  if (isTimeClockVisible(today)) {
    const TimeClockSlot = timeClockSlot.Component;
    slots["time-clock"] = <TimeClockSlot />;
  }
  if (isBandejaBadgeVisible()) {
    const BandejaBadgeSlot = bandejaBadgeSlot.Component;
    slots["bandeja-badge"] = <BandejaBadgeSlot />;
  }
  return slots;
}

export function AppShell({ children, session, nav, today, hideAssistant }: AppShellProps) {
  return (
    <>
      <AppShellClient
        nav={toClientNavModel(nav)}
        session={session}
        today={today}
        hideAssistant={hideAssistant}
        slots={renderSidebarSlots(today)}
      >
        {children}
      </AppShellClient>
      <Suspense fallback={null}>
        <AssistantLauncher hidden={hideAssistant} />
      </Suspense>
      {today ? <ClockInPrompt now={new Date()} name={session.name} /> : null}
    </>
  );
}
