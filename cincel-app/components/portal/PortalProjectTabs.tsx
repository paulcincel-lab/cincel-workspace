"use client";

import Link from "next/link";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/shadcn/tabs";

export type PortalProjectTab = "resumen" | "cronograma";

export const PORTAL_PROJECT_TABS: { tab: PortalProjectTab; label: string }[] = [
  { tab: "resumen", label: "Resumen" },
  { tab: "cronograma", label: "Cronograma" },
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

/** Project tabs (FE §3.3) rendered as links, so the active tab lives in `?tab=`. */
export default function PortalProjectTabs({ projectId, active }: { projectId: string; active: PortalProjectTab }) {
  return (
    <nav aria-label="Secciones del proyecto" className="overflow-x-auto">
      <Tabs value={active}>
        <TabsList variant="line">
          {PORTAL_PROJECT_TABS.map(({ tab, label }) => (
            <TabsTrigger
              key={tab}
              value={tab}
              nativeButton={false}
              render={<Link href={portalProjectTabHref(projectId, tab)} aria-current={tab === active ? "page" : undefined} />}
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </nav>
  );
}
