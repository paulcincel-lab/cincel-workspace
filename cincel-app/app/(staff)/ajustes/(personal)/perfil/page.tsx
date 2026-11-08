import { PerfilClient } from "@/components/ajustes/PerfilClient";
import { requireCapabilityUser } from "@/lib/auth/session";
import { loadAjustesPerfil } from "@/lib/loaders/ajustes";
import { getStaffPhotoUrl } from "@/lib/profile-photo/photo-url";
import { Hydrate } from "@/lib/query/hydrate";
import { ajustesPerfilOptions } from "@/lib/query/options/ajustes";
import { meProfileOptions } from "@/lib/query/options/me";
import { getQueryClient, prefetch } from "@/lib/query/server";
import { PERFIL_SECTIONS } from "@/lib/shell/settings-sections/perfil";
import { visibleSettingsSections } from "@/lib/shell/settings-sections/visible";
import type { MyProfile } from "@/lib/types/shell";

export const dynamic = "force-dynamic";

/**
 * The caller's `me.profile`. `getStaffPhotoUrl` is cached per request and the
 * staff layout already read it, so this adds no query; a failure leaves the
 * photo empty.
 */
async function loadMyProfile(user: Awaited<ReturnType<typeof requireCapabilityUser>>): Promise<MyProfile> {
  const id = user.member.id;
  let photoUrl: string | null = null;
  try {
    photoUrl = await getStaffPhotoUrl(id);
  } catch (error) {
    console.error("[ajustes/perfil] photo", error);
  }
  return { id, name: user.member.name, photoUrl };
}

/**
 * Ajustes › Perfil (redesign FE §3.8): photo, "Mis horas esta semana",
 * datos personales, firma, idioma y región, "Cambiar contraseña". Personal
 * page (staff session only); the Ajustes layout renders the header and
 * `AjustesNav`. Prefetches `qk.ajustes.page('perfil')` and `qk.me.profile()`
 * (the photo every avatar reads).
 */
export default async function AjustesPerfilPage() {
  const user = await requireCapabilityUser();
  const qc = getQueryClient();
  await Promise.all([
    prefetch(qc, ajustesPerfilOptions(), () => loadAjustesPerfil(user)),
    prefetch(qc, meProfileOptions(), () => loadMyProfile(user)),
  ]);
  const sections = visibleSettingsSections(PERFIL_SECTIONS, user);

  return (
    <Hydrate qc={qc}>
      <PerfilClient>
        {sections.map(({ name, Component }) => (
          <Component key={name} />
        ))}
      </PerfilClient>
    </Hydrate>
  );
}
