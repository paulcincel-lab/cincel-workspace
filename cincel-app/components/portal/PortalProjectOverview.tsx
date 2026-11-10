"use client";

import { PageStyleLayout } from "@/components/widgets/PageStyleLayout";
import { PortalAnalitico } from "@/components/widgets/portal/PortalAnalitico";
import { PortalEsencial } from "@/components/widgets/portal/PortalEsencial";
import { PortalVisual } from "@/components/widgets/portal/PortalVisual";
import type { PortalOverviewData } from "@/lib/portal/overview";
import { portalDocumentDownloadUrl } from "@/lib/portal/project-tabs";
import type { PortalProjectDTO } from "@/lib/types/portal";

/** Same URL the file browser uses (BE §B.4.5); re-exported for the widgets that import it from here. */
export { portalDocumentDownloadUrl };

type PortalProjectOverviewProps = {
  project: PortalProjectDTO;
  data: PortalOverviewData;
};

/**
 * Resumen of the portal project page (FE §3.11, ADR 0004): one `PortalOverviewData` handed to the layout of the
 * active style through `PageStyleLayout`: `PortalVisual`, `PortalEsencial` or `PortalAnalitico`. Each layout
 * sets its own width. The style comes from `cincel-portal-style` through `StyleProvider scope="portal"` (the
 * organization's fixed style wins); this view never reads it.
 */
export default function PortalProjectOverview({ project, data }: PortalProjectOverviewProps) {
  return (
    <PageStyleLayout
      visual={() => <PortalVisual project={project} data={data} />}
      esencial={() => <PortalEsencial project={project} data={data} />}
      analitico={() => <PortalAnalitico project={project} data={data} />}
    />
  );
}
