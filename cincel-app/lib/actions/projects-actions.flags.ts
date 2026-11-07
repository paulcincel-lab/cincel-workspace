/**
 * Redesign actions of `projects-actions.ts` and whether they are implemented
 * (redesign BE §9.10, §15). The file's existing actions predate the flags and
 * are not listed. Client-safe.
 */
export const IMPLEMENTED = {
  fetchProjectsPortfolioAction: true,
} as const;
