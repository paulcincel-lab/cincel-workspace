"use client";

import Link from "next/link";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/shadcn/tabs";
import { PORTAL_PROJECT_TABS, portalProjectTabHref, type PortalProjectTab } from "@/lib/portal/project-tabs";

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
