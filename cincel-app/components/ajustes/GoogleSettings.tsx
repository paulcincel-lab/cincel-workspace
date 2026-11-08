"use client";

import { useSuspenseQuery } from "@tanstack/react-query";

import { GOOGLE_GROUPS_DESCRIPTION, GOOGLE_GROUPS_TITLE, GoogleGroupMappings } from "@/components/configuracion/GoogleGroupMappings";
import { GOOGLE_HEALTH_DESCRIPTION, GOOGLE_HEALTH_TITLE, GoogleHealthStatus } from "@/components/configuracion/GoogleHealthStatus";
import {
  PROJECT_FOLDERS_DESCRIPTION,
  PROJECT_FOLDERS_TITLE,
  ProjectFoldersBackfill,
} from "@/components/configuracion/ProjectFoldersBackfill";
import { SettingsSection } from "@/components/patterns/SettingsSection";
import { Alert, AlertDescription } from "@/components/ui/shadcn/alert";
import { ajustesGoogleOptions } from "@/lib/query/options/ajustes";

/**
 * Ajustes › Google (redesign FE §3.8): the existing Google settings (Estado,
 * Grupos de Google, Carpetas de proyectos) as `SettingsSection`s. Same
 * components and actions as Configuración → Google; only the frame changes.
 *
 * Mappings, puestos and Estado are `qk.ajustes.page('google')`, hydrated by
 * the page; the mapping and folder mutations invalidate it, so the lists
 * update without a route refresh. `health` is null when its read failed.
 */
export function GoogleSettings() {
  const { mappings, positions, health } = useSuspenseQuery(ajustesGoogleOptions()).data;
  return (
    <>
      <Alert>
        <AlertDescription>Los roles y las áreas se administran en grupos de Google Workspace.</AlertDescription>
      </Alert>

      <SettingsSection title={GOOGLE_HEALTH_TITLE} description={GOOGLE_HEALTH_DESCRIPTION}>
        <GoogleHealthStatus health={health} bare />
      </SettingsSection>

      <SettingsSection title={GOOGLE_GROUPS_TITLE} description={GOOGLE_GROUPS_DESCRIPTION}>
        <GoogleGroupMappings mappings={mappings} positions={positions} bare />
      </SettingsSection>

      <SettingsSection title={PROJECT_FOLDERS_TITLE} description={PROJECT_FOLDERS_DESCRIPTION}>
        {/* Health unknown (load failed): leave the button enabled; the action reports its own errors. */}
        <ProjectFoldersBackfill sharedDriveConfigured={health === null || health.sharedDriveId !== null} bare />
      </SettingsSection>
    </>
  );
}
