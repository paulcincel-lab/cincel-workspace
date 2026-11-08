"use client";

import { usePathname } from "next/navigation";

import { IMPLEMENTED as TIME_TRACKING_IMPLEMENTED } from "@/lib/actions/time-tracking-actions.flags";
import type { TodayStatus } from "@/lib/types/redesign";
import { mobileTitleFor } from "@/lib/ui/mobile-nav";

import type { AppShellProps } from "./AppShell";
import { AvatarMenu } from "./AvatarMenu";
import { TimeClock } from "./TimeClock";
import { useMobileShell } from "./use-mobile-shell";

/**
 * Compact top bar of the mobile shell (redesign FE §3.1; frames `Movil*`):
 * logo mark, page title, the `TimeClock` compact slot (only while time
 * tracking is enabled for the viewer) and the avatar that opens the account
 * menu. Rendered below 768 px only; the sidebar takes over from there.
 * The pill reads the same `qk.me.today()` entry as the sidebar card (one
 * query, one poll for both).
 */
export type MobileTopBarProps = {
  session: AppShellProps["session"];
  /** The layout's seed, only to gate the pill; null when time tracking is disabled or the viewer is exempt. */
  today: TodayStatus | null;
  /** Overrides the section title derived from the route. */
  title?: string;
};

/** The compact clock shows only while clock-in is implemented and enabled for the viewer. */
export function showsCompactClock(today: TodayStatus | null): today is TodayStatus {
  return TIME_TRACKING_IMPLEMENTED.clockInAction && today !== null && today.enabled;
}

export function MobileTopBar({ session, today, title }: MobileTopBarProps) {
  const mobile = useMobileShell();
  const pathname = usePathname();

  if (!mobile) return null;

  const heading = title?.trim() || mobileTitleFor(pathname);

  return (
    <header
      data-slot="mobile-top-bar"
      className="sticky top-0 z-30 flex h-[calc(3.5rem+env(safe-area-inset-top))] min-w-0 items-center gap-2.5 bg-background px-4 pt-[env(safe-area-inset-top)] text-foreground md:hidden"
    >
      <span
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-primary text-sm font-semibold text-primary-foreground"
      >
        C
      </span>
      <span data-slot="mobile-top-bar-title" className="min-w-0 flex-1 truncate text-[17px] font-semibold">
        {heading}
      </span>
      {showsCompactClock(today) ? (
        <div data-slot="mobile-top-bar-clock" className="shrink-0">
          <TimeClock variant="compact" />
        </div>
      ) : null}
      <div
        data-slot="mobile-top-bar-avatar"
        className="flex shrink-0 items-center justify-center [&_[data-slot=dropdown-menu-trigger]]:size-11"
      >
        <AvatarMenu session={session} />
      </div>
    </header>
  );
}
