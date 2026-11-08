/**
 * Portal project tabs (FE §3.3), kept out of the `"use client"` tabs component so the server page can
 * parse `?tab=` itself: a function exported from a client module can't be called on the server.
 */

export type PortalProjectTab = "resumen" | "cronograma" | "archivos" | "enviar";

export const PORTAL_PROJECT_TABS: { tab: PortalProjectTab; label: string }[] = [
  { tab: "resumen", label: "Resumen" },
  { tab: "cronograma", label: "Cronograma" },
  { tab: "archivos", label: "Archivos" },
  { tab: "enviar", label: "Enviar archivos" },
];

/** `?tab=` value → tab; anything unknown (or missing) is Resumen. */
export function parsePortalProjectTab(value: string | string[] | undefined): PortalProjectTab {
  const raw = Array.isArray(value) ? value[0] : value;
  return PORTAL_PROJECT_TABS.some((t) => t.tab === raw) ? (raw as PortalProjectTab) : "resumen";
}

export function portalProjectTabHref(projectId: string, tab: PortalProjectTab): string {
  const base = `/portal/proyectos/${encodeURIComponent(projectId)}`;
  return tab === "resumen" ? base : `${base}?tab=${tab}`;
}

/** The Archivos tab opened on one folder (`?folder=`); null is the project's client folder. */
export function portalProjectFolderHref(projectId: string, folderId: string | null): string {
  const href = portalProjectTabHref(projectId, "archivos");
  return folderId ? `${href}&folder=${encodeURIComponent(folderId)}` : href;
}
