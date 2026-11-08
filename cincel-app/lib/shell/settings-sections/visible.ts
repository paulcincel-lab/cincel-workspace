/**
 * Visibility filter shared by the settings pages. Kept apart from the
 * registry index so a page can filter its own section list
 * (`lib/shell/settings-sections/<page>`) without importing every page's
 * section components.
 */
import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import type { SettingsSectionEntry } from "@/lib/shell/settings-sections";

/** The sections of `sections` the user can see, in `order`. */
export function visibleSettingsSections(
  sections: readonly SettingsSectionEntry[],
  user: AuthenticatedUser,
): SettingsSectionEntry[] {
  return sections.filter((s) => s.visible(user)).sort((a, b) => a.order - b.order);
}
