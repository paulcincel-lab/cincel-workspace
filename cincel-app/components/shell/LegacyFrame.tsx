import type { ReactNode } from "react";

/**
 * Flag-off branch of a restyled page (redesign FE §2.3): mounts the legacy
 * `Sidebar` + `Header` around the page. Deleted in Phase 9.
 *
 * Contract stub: renders the page bare.
 */
export type LegacyFrameProps = { children: ReactNode };

export function LegacyFrame({ children }: LegacyFrameProps) {
  return <>{children}</>;
}
