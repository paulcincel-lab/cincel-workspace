import { Suspense, type ReactNode } from "react";

import { AssistantLauncher } from "@/components/asistente/AssistantLauncher";
import { bandejaBadgeSlot } from "@/lib/shell/sidebar-slots/bandeja-badge";
import type { SidebarSlotNodes } from "@/lib/shell/sidebar-slots";
import { timeClockSlot } from "@/lib/shell/sidebar-slots/time-clock";
import { isBandejaBadgeVisible, isTimeClockVisible } from "@/lib/shell/visibility";
import type { ResolvedAppearance, TodayStatus } from "@/lib/types/redesign";
import type { NavModel } from "@/lib/ui/nav";
import { toClientNavModel } from "@/lib/ui/nav-client";

import { AppShellClient } from "./AppShellClient";
import { ClockInPrompt } from "./ClockInPrompt";
import { SidebarSlotOutlet } from "./SidebarSlotOutlet";
import { StyleProvider } from "./StyleProvider";

/**
 * The new staff shell (redesign FE §3.1, §4.1): `Sidebar`, `AssistantButton`,
 * `CommandPalette` and `BottomTabs` around the page. Mounted by
 * `app/(staff)/layout.tsx` only when the flag is on.
 *
 * Server part: renders the sidebar slots (`lib/shell/sidebar-slots/*`) and
 * hands a serializable nav model to the client part.
 *
 * Below 768 px the client part renders the compact top bar (`MobileTopBar`)
 * and pads the page so the fixed `BottomTabs` never cover it.
 */
export type AppShellProps = {
  children: ReactNode;
  appearance: ResolvedAppearance;
  session: { staffId: string; name: string; role: string; isAdmin: boolean; photoUrl: string | null };
  /** From `buildNavModel(session)` in `lib/ui/nav.ts`. */
  nav: NavModel;
  /** Null when time tracking is disabled or the viewer is exempt. */
  today: TodayStatus | null;
  /** True on /asistente. */
  hideAssistant?: boolean;
};

/** Server-rendered slot nodes; a slot stays out while its gate is closed. */
export function renderSidebarSlots(session: AppShellProps["session"], today: TodayStatus | null): SidebarSlotNodes {
  const slots: SidebarSlotNodes = {};
  if (today && isTimeClockVisible(today)) {
    const TimeClockSlot = timeClockSlot.Component;
    slots["time-clock"] = <TimeClockSlot data={today} />;
  }
  if (isBandejaBadgeVisible()) {
    slots["bandeja-badge"] = <SidebarSlotOutlet slot={bandejaBadgeSlot} session={session} />;
  }
  return slots;
}

export function AppShell({ children, appearance, session, nav, today, hideAssistant }: AppShellProps) {
  return (
    <StyleProvider style={appearance.style} scope="staff">
      <AppShellClient
        nav={toClientNavModel(nav)}
        session={session}
        today={today}
        hideAssistant={hideAssistant}
        slots={renderSidebarSlots(session, today)}
      >
        {children}
      </AppShellClient>
      <Suspense fallback={null}>
        <AssistantLauncher hidden={hideAssistant} />
      </Suspense>
      {today ? (
        <ClockInPrompt status={today} requiredFrom={today.requiredFrom} now={new Date()} name={session.name} />
      ) : null}
    </StyleProvider>
  );
}
