/** Which actions of `org-appearance-actions.ts` are implemented (redesign BE §9.10). Client-safe. */
export const IMPLEMENTED = {
  fetchOrgAppearanceAction: true,
  saveOrgAppearanceAction: false,
  resetOrgAppearanceAction: false,
} as const;
