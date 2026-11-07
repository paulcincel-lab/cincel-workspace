/**
 * Settings section "Enlaces del despacho" (Instagram, Sitio web, Correo) of
 * /ajustes/general (redesign FE §3.8, §21.1; Phase 6). The fields live in
 * `general_settings.company` and feed the avatar-menu links; the section edits
 * the page's shared General editor, so it renders inside `AjustesGeneralClient`.
 */
import { GeneralLinksSection } from "@/components/ajustes/GeneralLinksSection";
import { canManageGeneralSettings } from "@/lib/auth/permissions";
import type { SettingsSectionEntry } from "@/lib/shell/settings-sections";

export const generalEnlacesSection: SettingsSectionEntry = {
  page: "general",
  name: "enlaces",
  order: 10,
  visible: (user) => canManageGeneralSettings(user),
  Component: GeneralLinksSection,
};
