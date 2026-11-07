import type { ReactNode } from "react";

import type { ResolvedAppearance, TodayStatus } from "@/lib/types/redesign";
import type { NavModel } from "@/lib/ui/nav";

/**
 * The new staff shell (redesign FE §3.1, §4.1): `Sidebar`, `AssistantButton`,
 * `CommandPalette` and `BottomTabs` around the page. Mounted by
 * `app/(staff)/layout.tsx` only when the flag is on.
 *
 * Contract stub: renders the page bare.
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

export function AppShell({ children }: AppShellProps) {
  return <>{children}</>;
}
