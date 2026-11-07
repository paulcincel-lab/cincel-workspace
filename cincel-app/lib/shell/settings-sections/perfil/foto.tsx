/**
 * Settings section "Foto" of /ajustes/perfil (redesign FE §3.8, §21.1; Phase 6).
 *
 * Upload through `POST /api/staff/me/photo` after a client re-encode, remove
 * with `removeMyPhotoAction`. Hidden while the photo route and action are
 * Phase 1 stubs (`removeMyPhotoAction` ships with the route). Renders inside
 * `PerfilClient`, which holds the photo URL.
 */
import { PerfilFoto } from "@/components/ajustes/PerfilClient";
import { IMPLEMENTED } from "@/lib/actions/profile-photo-actions.flags";
import type { SettingsSectionEntry } from "@/lib/shell/settings-sections";

export const perfilFotoSection: SettingsSectionEntry = {
  page: "perfil",
  name: "foto",
  order: 10,
  visible: () => IMPLEMENTED.removeMyPhotoAction,
  Component: PerfilFoto,
};
