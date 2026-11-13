"use client";

import Link from "next/link";
import { useMemo } from "react";
import { FileText, ListChecks, Users, Wallet } from "lucide-react";

import { EntityCardGrid } from "@/components/widgets/EntityCardGrid";
import { KpiWidget } from "@/components/widgets/KpiWidget";
import { ProgressListWidget } from "@/components/widgets/ProgressListWidget";
import { RecordTable } from "@/components/widgets/RecordTable";
import { EtapaStepperWidget } from "@/components/widgets/EtapaStepperWidget";
import { WidgetCard } from "@/components/widgets/WidgetCard";
import { buildProjectSummary, type ProjectSummaryInput } from "@/lib/proyectos/project-summary";

/** Cutto chat link of a staff contact: opens cutto.cloudketer.dev in a new tab, never embedded (FE §4.9). */
function renderContactCell(columnKey: string, row: Record<string, unknown>) {
  if (columnKey !== "chat") return undefined;
  const url = typeof row.chatUrl === "string" ? row.chatUrl : "";
  if (!url) return null;
  const name = typeof row.nombre === "string" ? row.nombre : "";
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener"
      aria-label={`Abrir chat en Cutto con ${name}`}
      className="text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      Abrir chat en Cutto
    </a>
  );
}

/**
 * The Resumen as one composition of library widgets fed the same data
 * (redesign FE §3.5, §4.10.2): etapas (`EtapaStepperWidget`), avance and
 * presupuesto (`ProgressListWidget`), indicators (`KpiWidget`), partidas,
 * recent files (`EntityCardGrid`), ficha and contacts (`RecordTable`). The
 * budget is absent without `showBudget`; "Cliente y contactos" is absent
 * without `showClientContacts` (the team alone shows under "Equipo"). Each
 * style of the Resumen tab now has its own layout (`ProjectSummaryContent`);
 * this composition is kept for the places that embed the summary widgets.
 */
export function ProjectSummaryWidgets({ data: input }: { data: ProjectSummaryInput }) {
  // Keyed on the query data: a re-render with the same cached object reuses the build.
  const data = useMemo(() => buildProjectSummary(input), [input]);
  const archivosHref = `/proyectos/${encodeURIComponent(input.project.id)}/archivos`;
  const cronogramaHref = `/proyectos/${encodeURIComponent(input.project.id)}/cronograma`;

  return (
    <div className="flex flex-col gap-4">
      <EtapaStepperWidget title="Etapas" steps={data.etapas} />

      <div className="grid gap-4 lg:grid-cols-3">
        <ProgressListWidget title="Avance" items={data.avance} variant="rings" />
        {data.budget ? <ProgressListWidget title="Presupuesto" items={data.budget} variant="bars" /> : null}
        <div className={data.budget ? undefined : "lg:col-span-2"}>
          <KpiWidget items={data.kpis} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
          {data.partidas.length > 0 ? (
            <ProgressListWidget title="Cronograma de obra" items={data.partidas} variant="bars" />
          ) : null}
          {data.partidas.length > 0 ? (
            <Link href={cronogramaHref} className="self-start text-sm font-medium text-primary underline-offset-4 hover:underline">
              Ver cronograma completo
            </Link>
          ) : null}

          {data.recentFiles ? (
            <WidgetCard
              title="Archivos recientes"
              icon={FileText}
              actions={
                data.recentFiles.total > 0 ? (
                  <Link href={archivosHref} className="text-sm font-medium text-primary underline-offset-4 hover:underline">
                    Ver los {data.recentFiles.total}
                  </Link>
                ) : undefined
              }
            >
              <EntityCardGrid
                items={data.recentFiles.items}
                table={data.recentFiles.table}
                minWidth={160}
                emptyState={{
                  icon: FileText,
                  title: "Este proyecto aún no tiene archivos",
                  action: { label: "Subir archivos", href: archivosHref },
                }}
              />
            </WidgetCard>
          ) : null}

          {data.budgetTable ? (
            <WidgetCard title="Presupuesto por pago" icon={Wallet}>
              <RecordTable data={data.budgetTable} />
            </WidgetCard>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <WidgetCard title="Ficha" icon={ListChecks}>
            <RecordTable data={data.ficha} />
          </WidgetCard>
          <WidgetCard title={data.contacts.title} icon={Users}>
            <RecordTable
              data={data.contacts.table}
              renderCell={renderContactCell}
              emptyState={{ icon: Users, title: "Este proyecto aún no tiene contactos" }}
            />
          </WidgetCard>
        </div>
      </div>
    </div>
  );
}
