/**
 * Shell data types shared across phases (Query Migration plan §5 Phase 1b).
 * Client-safe: type-only imports.
 */
import type { BandejaBadgeData } from "@/lib/shell/sidebar-slots/bandeja-badge-view";

/**
 * `qk.shell.badges()` data: the sidebar counters. Frozen in 1b; Phase 2 builds
 * the loader (`lib/shell/badges.ts`), the GET route and the poll.
 */
export type ShellBadges = { tareasOpen: number; bandeja: BandejaBadgeData };

/** `qk.me.profile()` data: the caller's own avatar block, never anyone else's. */
export type MyProfile = { id: string; name: string; photoUrl: string | null };

/** One row of the sidebar "Proyectos" submenu. */
export type ShellProject = {
  id: string;
  name: string;
  status: "activo" | "pausado" | "completado" | "cancelado";
  /** CSS color of the current etapa (`var(--chart-n)`, or the neutral gray). */
  colorVar: string;
};

/** `qk.shell.projects()` data: the projects the viewer can see, by name. */
export type ShellProjects = ShellProject[];
