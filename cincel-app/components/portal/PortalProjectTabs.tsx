"use client";

import type { MouseEvent } from "react";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/shadcn/tabs";
import { PORTAL_PROJECT_TABS, portalProjectTabHref, type PortalProjectTab } from "@/lib/portal/project-tabs";

/**
 * Pushes `href` onto the history without a server round trip: the page reads `?tab=` / `?folder=` with
 * `useSearchParams`, which follows `history.pushState`, and its data comes from the query cache. A click with a
 * modifier key (new tab, new window) keeps the browser's default.
 */
export function pushPortalHref(event: MouseEvent<HTMLAnchorElement> | null, href: string): void {
  if (event) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
  }
  window.history.pushState(null, "", href);
}

/**
 * Project tabs (FE §3.3) rendered as links, so the active tab lives in `?tab=`. Switching tabs stays on the
 * client: no RSC request; each tab's data is `portal.project(id, tab)`.
 */
export default function PortalProjectTabs({ projectId, active }: { projectId: string; active: PortalProjectTab }) {
  return (
    <nav aria-label="Secciones del proyecto" className="overflow-x-auto">
      <Tabs value={active}>
        <TabsList variant="line">
          {PORTAL_PROJECT_TABS.map(({ tab, label }) => {
            const href = portalProjectTabHref(projectId, tab);
            return (
              <TabsTrigger
                key={tab}
                value={tab}
                nativeButton={false}
                render={
                  <a
                    href={href}
                    aria-current={tab === active ? "page" : undefined}
                    onClick={(event) => pushPortalHref(event, href)}
                  />
                }
              >
                {label}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>
    </nav>
  );
}
