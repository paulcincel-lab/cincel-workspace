import { notFound, redirect } from "next/navigation";

import { AjustesNav } from "@/components/ajustes/AjustesNav";
import { NotificacionesClient } from "@/components/ajustes/NotificacionesClient";
import { PageHeader } from "@/components/shell/PageHeader";
import { fetchNotificationPreferencesAction } from "@/lib/actions/notifications-actions";
import { getSessionAccess, requireCapabilityUser } from "@/lib/auth/session";
import { isAdministratorRole } from "@/lib/data/roles";
import { withNotificationDefaults } from "@/lib/notifications/preferences";
import { NOTIFICACIONES_SECTIONS } from "@/lib/shell/settings-sections/notificaciones";
import { visibleSettingsSections } from "@/lib/shell/settings-sections/visible";

export const dynamic = "force-dynamic";

/**
 * Ajustes › Notificaciones (redesign FE §3.8): personal page (staff session
 * only, no admin guard). 404 while the preference actions are stubs.
 */
export default async function AjustesNotificacionesPage() {

  const access = await getSessionAccess();
  if (!access.user) redirect("/login");
  const user = await requireCapabilityUser();

  const sections = visibleSettingsSections(NOTIFICACIONES_SECTIONS, user);
  if (sections.length === 0) notFound();

  const initial = withNotificationDefaults(await fetchNotificationPreferencesAction());

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Ajustes" description="Tus preferencias y, si eres administrador, las de la organización." />
      <div className="flex flex-col gap-6 md:flex-row">
        <aside className="md:w-60 md:shrink-0">
          <AjustesNav active="notificaciones" isAdmin={isAdministratorRole(user.access)} />
        </aside>
        <div className="min-w-0 flex-1">
          <NotificacionesClient initial={initial}>
            {sections.map(({ name, Component }) => (
              <Component key={name} />
            ))}
          </NotificacionesClient>
        </div>
      </div>
    </div>
  );
}
