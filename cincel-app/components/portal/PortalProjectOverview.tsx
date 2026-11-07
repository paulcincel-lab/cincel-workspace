"use client";

import { useId, type ReactNode } from "react";

import PortalProjectSummary from "@/components/portal/PortalProjectSummary";
import { AgendaWidget } from "@/components/widgets/AgendaWidget";
import { ProgressListWidget } from "@/components/widgets/ProgressListWidget";
import { RecordTable } from "@/components/widgets/RecordTable";
import { PhaseStepper } from "@/components/v2/status/PhaseStepper";
import { PORTAL_OVERVIEW_COPY, PORTAL_TRAMO_STATE_LABEL, type PortalOverviewData } from "@/lib/portal/overview";
import type { PortalProjectDTO } from "@/lib/types/portal";

/** Same URL the file browser uses (BE §B.4.5); kept here so this view doesn't load the browser. */
export function portalDocumentDownloadUrl(projectId: string, fileId: string): string {
  return `/api/portal/projects/${encodeURIComponent(projectId)}/files/${encodeURIComponent(fileId)}/download`;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-3">
      <h2 id={id} className="text-base font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

type PortalProjectOverviewProps = {
  project: PortalProjectDTO;
  data: PortalOverviewData;
};

/**
 * Resumen of the portal project page with the redesign on (FE §3.11, §4.10.2 "Portal proyecto"). Built only
 * from library widgets fed with one `PortalOverviewData`: `PhaseStepper` (tramos), `ProgressListWidget`
 * (avance), `AgendaWidget` (entregas) and `RecordTable` (documentos). The widgets decide how Visual, Esencial and
 * Analítico look; this view renders the same markup and data for all three and never reads the style.
 * Approvals, messages and payments have no portal data today, so they have no section.
 */
export default function PortalProjectOverview({ project, data }: PortalProjectOverviewProps) {
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PortalProjectSummary project={project} showProgress={false} />

      {data.stepper ? (
        <Section title={PORTAL_OVERVIEW_COPY.fases}>
          <PhaseStepper steps={data.stepper.steps} current={data.stepper.current} label={data.stepper.label} />
          <ol className="flex flex-col divide-y rounded-lg border">
            {data.tramos.map((tramo) => (
              <li key={tramo.key} className="flex min-w-0 items-center justify-between gap-3 px-4 py-3 text-sm">
                <span className="min-w-0 break-words">{tramo.name}</span>
                <span className="shrink-0 text-muted-foreground">{PORTAL_TRAMO_STATE_LABEL[tramo.state]}</span>
              </li>
            ))}
          </ol>
        </Section>
      ) : null}

      <ProgressListWidget title={PORTAL_OVERVIEW_COPY.avance} items={data.progress} variant="bars" />

      <AgendaWidget
        title={PORTAL_OVERVIEW_COPY.entregas}
        items={data.entregas}
        mode="month"
        groupBy="day"
        emptyText={PORTAL_OVERVIEW_COPY.entregasVacio}
      />

      {data.documentos ? (
        <Section title={PORTAL_OVERVIEW_COPY.documentos}>
          <RecordTable
            data={data.documentos}
            emptyState={{ title: PORTAL_OVERVIEW_COPY.documentosVacio }}
            renderCell={(columnKey, row) =>
              columnKey === "name" && typeof row.id === "string" ? (
                <a
                  href={portalDocumentDownloadUrl(project.id, row.id)}
                  className="break-words underline underline-offset-4"
                  aria-label={`${PORTAL_OVERVIEW_COPY.descargar} ${String(row.name)}`}
                >
                  {String(row.name)}
                </a>
              ) : undefined
            }
          />
        </Section>
      ) : null}
    </div>
  );
}
