/**
 * Settings section registry (redesign FE §21.1): one file per section under
 * `lib/shell/settings-sections/<page>/<name>.tsx`. Each Ajustes page renders
 * its visible sections in `order` as `SettingsSection`s.
 */
import type { ComponentType } from "react";

import type { AuthenticatedUser } from "@/lib/auth/auth-service";

import { APARIENCIA_SECTIONS } from "./apariencia";
import { GENERAL_SECTIONS } from "./general";
import { HORARIO_SECTIONS } from "./horario";
import { INTEGRACIONES_SECTIONS } from "./integraciones";
import { NOTIFICACIONES_SECTIONS } from "./notificaciones";
import { PERFIL_SECTIONS } from "./perfil";
import { visibleSettingsSections } from "./visible";

export type SettingsPage = "perfil" | "apariencia" | "notificaciones" | "integraciones" | "general" | "horario";

export type SettingsSectionEntry = {
  page: SettingsPage;
  name: string;
  order: number;
  /** Capability / flag check; false = not rendered. */
  visible(user: AuthenticatedUser): boolean;
  Component: ComponentType;
};

/**
 * Every section of every page. Pages import their own list from
 * `./<page>` (and filter it with `./visible`) so a page bundle never carries
 * the other pages' section components.
 */
export const SETTINGS_SECTIONS: readonly SettingsSectionEntry[] = [
  ...NOTIFICACIONES_SECTIONS,
  ...INTEGRACIONES_SECTIONS,
  ...APARIENCIA_SECTIONS,
  ...HORARIO_SECTIONS,
  ...PERFIL_SECTIONS,
  ...GENERAL_SECTIONS,
];

/** The visible sections of one page, in order. */
export function settingsSectionsFor(page: SettingsPage, user: AuthenticatedUser): SettingsSectionEntry[] {
  return visibleSettingsSections(
    SETTINGS_SECTIONS.filter((s) => s.page === page),
    user,
  );
}
