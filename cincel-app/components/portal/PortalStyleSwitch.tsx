"use client";

import { usePathname, useSearchParams } from "next/navigation";

import { EstiloSwitch } from "@/components/shell/EstiloSwitch";
import { useStyle } from "@/components/shell/StyleProvider";
import { parsePortalProjectTab } from "@/lib/portal/project-tabs";

/** `/portal/proyectos/<id>` and nothing deeper. */
const PROJECT_PAGE = /^\/portal\/proyectos\/[^/]+\/?$/;

/** True where the portal renders data in the three styles: the project page's Resumen tab. */
export function isPortalStyledPage(pathname: string | null, tab: string | null): boolean {
  return !!pathname && PROJECT_PAGE.test(pathname) && parsePortalProjectTab(tab ?? undefined) === "resumen";
}

/**
 * `EstiloSwitch scope="portal"` inline in the portal top bar (FE §3.11, Portal Visual): a segmented radiogroup
 * whose active option is `primary`. It writes the `cincel-portal-style` cookie, which the portal layout reads
 * on the next load. Shown only on the pages that have the three styles (the project's Resumen); forms, files
 * and the project list ignore the style. Nothing when the organization fixed the style (`fixedByOrg`).
 */
export default function PortalStyleSwitch() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isFixed } = useStyle();
  if (isFixed) return null;
  if (!isPortalStyledPage(pathname, searchParams?.get("tab") ?? null)) return null;
  return (
    <div className="flex shrink-0 items-center" data-slot="portal-style-switch">
      <EstiloSwitch scope="portal" variant="segmented" />
    </div>
  );
}
