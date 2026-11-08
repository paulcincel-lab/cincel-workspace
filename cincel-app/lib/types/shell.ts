/**
 * Shell data types shared across phases (Query Migration plan §5 Phase 1b).
 * Client-safe: type-only imports.
 */
import type { BandejaBadgeData } from "@/lib/shell/sidebar-slots/bandeja-badge-view";

/**
 * `qk.shell.badges()` data: the sidebar counters. Frozen in 1b; Phase 2 builds
 * `getShellBadgesAction`, the GET route and the poll.
 */
export type ShellBadges = { tareasOpen: number; bandeja: BandejaBadgeData };

/** `qk.me.profile()` data: the caller's own avatar block, never anyone else's. */
export type MyProfile = { id: string; name: string; photoUrl: string | null };
