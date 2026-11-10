"use client";

import { useSuspenseQuery } from "@tanstack/react-query";

import { AdminPageHeading } from "@/components/ajustes/AdminFields";
import { GoogleGroupMappings } from "@/components/configuracion/GoogleGroupMappings";
import {
  GOOGLE_HEALTH_ERROR,
  GOOGLE_HEALTH_TITLE,
  GoogleAccessProgress,
  GoogleHealthStatus,
  googleNotConfigured,
} from "@/components/configuracion/GoogleHealthStatus";
import { GoogleSetupBanner } from "@/components/configuracion/GoogleSetupBanner";
import {
  PROJECT_FOLDERS_DESCRIPTION,
  PROJECT_FOLDERS_TITLE,
  ProjectFoldersBackfill,
} from "@/components/configuracion/ProjectFoldersBackfill";
import { SettingsSection } from "@/components/patterns/SettingsSection";
import { Alert, AlertDescription } from "@/components/ui/shadcn/alert";
import { ajustesGoogleOptions } from "@/lib/query/options/ajustes";

/**
 * Ajustes › Google (canvas `Ajustes-Google`): admin heading, then "Acceso
 * con Google" (progress ring and who is still missing), "Estado", "Grupos de
 * Google" (with member counts) and "Carpetas de proyectos". Same actions as
 * before; one layout for every presentation style. While Google isn't set
 * up, the setup banner takes the ring's place.
 *
 * Mappings, puestos and Estado are `qk.ajustes.page('google')`, hydrated by
 * the page; the mapping and folder mutations invalidate it, so the lists
 * update without a route refresh. `health` is null when its read failed.
 */
export function GoogleSettings() {
  const { mappings, positions, health } = useSuspenseQuery(ajustesGoogleOptions()).data;
  return (
    <div className="flex flex-col gap-4">
      <AdminPageHeading
        title="Google"
        description="Configuración de Google y avance del acceso con Google. Los roles y las áreas se administran en grupos de Google Workspace."
      />

      <SettingsSection title="Acceso con Google" level={3}>
        {!health ? (
          <Alert variant="destructive">
            <AlertDescription>{GOOGLE_HEALTH_ERROR}</AlertDescription>
          </Alert>
        ) : googleNotConfigured(health) ? (
          <GoogleSetupBanner />
        ) : (
          <GoogleAccessProgress health={health} />
        )}
      </SettingsSection>

      <SettingsSection title={GOOGLE_HEALTH_TITLE} level={3}>
        <GoogleHealthStatus health={health} bare />
      </SettingsSection>

      <GoogleGroupMappings mappings={mappings} positions={positions} section />

      <SettingsSection title={PROJECT_FOLDERS_TITLE} description={PROJECT_FOLDERS_DESCRIPTION} level={3}>
        {/* Health unknown (load failed): leave the button enabled; the action reports its own errors. */}
        <ProjectFoldersBackfill
          sharedDriveConfigured={health === null || health.sharedDriveId !== null}
          folderCounts={health ? { withoutFolder: health.projectsWithoutFolder, withFolder: health.projectsWithFolder } : null}
          bare
        />
      </SettingsSection>
    </div>
  );
}
