"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";

import { buttonVariants } from "@/components/ui/shadcn/button";
import { GroupedTable, type Group, type HeatRule } from "@/components/widgets/GroupedTable";
import { KpiStrip, type KpiStripItem } from "@/components/widgets/KpiStrip";
import {
  buildPortalEntregables,
  buildPortalFilesByFolder,
  buildPortalKpis,
  buildPortalPhaseTable,
  formatPortalDesvio,
  PORTAL_ANALITICO_COPY,
  portalDayMonth,
  portalDayMonthYear,
  portalFilesTotals,
  portalFolderGroupsOf,
  portalNextEntregable,
  portalPhaseTotals,
  portalScheduleHasRealDates,
  portalUpdatedAt,
  type PortalOverviewData,
  type PortalEntregableRow,
  type PortalFileRow,
  type PortalKpis,
  type PortalPhaseRow,
} from "@/lib/portal/overview";
import { portalDocumentDownloadUrl } from "@/lib/portal/project-tabs";
import type { PortalProjectDTO } from "@/lib/types/portal";
import type { RecordColumn } from "@/lib/types/widgets";
import { cn } from "@/lib/utils";

/**
 * Portal Resumen in Analítico (frame `Portal-Analitico`): title row, KPI strip, "Ir a" chips and three
 * collapsible tables (Fases por tramo, Entregables, Archivos por carpeta). Everything comes from the portal
 * DTOs; columns and KPIs without data (real dates, monthly delta) are left out. The open sections live in
 * `?abiertos=` (all open when the param is absent).
 */

export const PORTAL_SECTIONS = ["fases", "entregables", "archivos"] as const;
export type PortalSectionKey = (typeof PORTAL_SECTIONS)[number];

const SECTION_LABEL: Record<PortalSectionKey, string> = {
  fases: "Fases",
  entregables: "Entregables",
  archivos: "Archivos",
};
const SECTION_TITLE: Record<PortalSectionKey, string> = {
  fases: "Fases por etapa",
  entregables: "Entregables",
  archivos: "Archivos por carpeta",
};
/** Group id of each section's card inside its table (the wrapper carries the anchor id). */
const SECTION_GROUP_ID: Record<PortalSectionKey, string> = {
  fases: "seccion-fases",
  entregables: "seccion-entregables",
  archivos: "seccion-archivos",
};

export const ABIERTOS_PARAM = "abiertos";

/** `?abiertos=fases,archivos` → those sections; absent → all; empty → none. Unknown names are ignored. */
export function parseAbiertos(value: string | null | undefined): PortalSectionKey[] {
  if (value === null || value === undefined) return [...PORTAL_SECTIONS];
  const names = new Set(value.split(",").map((v) => v.trim()));
  return PORTAL_SECTIONS.filter((s) => names.has(s));
}

function writeAbiertos(open: PortalSectionKey[]): void {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  params.delete(ABIERTOS_PARAM);
  const rest = params.toString();
  const value = PORTAL_SECTIONS.filter((s) => open.includes(s)).join(",");
  const search = `?${rest ? `${rest}&` : ""}${ABIERTOS_PARAM}=${value}`;
  window.history.replaceState(window.history.state, "", `${window.location.pathname}${search}${window.location.hash}`);
}

/** Scrolls a section into view (instant, no motion) and focuses its header button, else the section itself. */
function focusSection(section: PortalSectionKey): void {
  const wrapper = document.getElementById(section);
  if (!wrapper) return;
  wrapper.scrollIntoView?.({ block: "start" });
  (wrapper.querySelector<HTMLElement>(`button[aria-controls]`) ?? wrapper).focus();
}

const LONG_TEXT = "block max-w-[360px] truncate";

function desvioCell(value: number | null): ReactNode {
  if (value === null) return "—";
  return value < 0 ? <span className="text-success">{formatPortalDesvio(value)}</span> : formatPortalDesvio(value);
}

function kpiItems(k: PortalKpis): KpiStripItem[] {
  const items: KpiStripItem[] = [
    {
      key: "avance",
      label: PORTAL_ANALITICO_COPY.avanceGeneral,
      value: `${k.avance} %`,
      ...(k.avanceDelta !== null
        ? {
            delta: {
              label: `${k.avanceDelta > 0 ? "+" : k.avanceDelta < 0 ? "−" : ""}${Math.abs(k.avanceDelta)} pts este mes`,
              tone: k.avanceDelta > 0 ? ("good" as const) : k.avanceDelta < 0 ? ("bad" as const) : ("neutral" as const),
            },
          }
        : {}),
    },
  ];
  if (k.tramo) {
    items.push({
      key: "tramo",
      label: PORTAL_ANALITICO_COPY.tramoActual,
      value: k.tramo.name,
      delta: { label: `${k.tramo.pct} %`, tone: "neutral" },
    });
  }
  items.push({
    key: "entregables",
    label: PORTAL_ANALITICO_COPY.entregables,
    value: k.entregables.done,
    secondary: `de ${k.entregables.total}`,
    delta: { label: "entregados", tone: "neutral" },
  });
  if (k.desvio !== null) {
    items.push({
      key: "desvio",
      label: PORTAL_ANALITICO_COPY.desvio,
      value: `${formatPortalDesvio(k.desvio)} d`,
      delta: { label: "vs. plan", tone: k.desvio > 0 ? "bad" : k.desvio < 0 ? "good" : "neutral" },
    });
  }
  items.push({
    key: "documentos",
    label: PORTAL_ANALITICO_COPY.documentos,
    value: k.documentos.total,
    delta: {
      label: `${k.documentos.nuevosSemana} ${k.documentos.nuevosSemana === 1 ? "nuevo" : "nuevos"} esta semana`,
      tone: "neutral",
    },
  });
  return items;
}

/** A section card with only a header and a message: no schedule, no files yet. */
function EmptySection({ title, message }: { title: string; message: string }) {
  return (
    <section aria-label={title} className="overflow-hidden rounded-[14px] border bg-card">
      <h2 className="px-4 py-3 text-[15px] font-semibold">{title}</h2>
      <p className="border-t px-4 py-6 text-[12.5px] text-muted-foreground">{message}</p>
    </section>
  );
}

export type PortalAnaliticoProps = { project: PortalProjectDTO; data: PortalOverviewData };

export function PortalAnalitico({ project, data: overview }: PortalAnaliticoProps): ReactNode {
  // `today` is Mexico City's `YYYY-MM-DD`; without `updatedAt` the "Actualizado" line is left out.
  const data = overview.analitico;
  const { today, updatedAt } = data;
  const searchParams = useSearchParams();
  const abiertosParam = searchParams?.get(ABIERTOS_PARAM) ?? null;
  const [open, setOpen] = useState<PortalSectionKey[]>(() => parseAbiertos(abiertosParam));
  const [collapsedGroups, setCollapsedGroups] = useState<string[]>([]);
  const [seenParam, setSeenParam] = useState(abiertosParam);
  const pendingFocus = useRef<PortalSectionKey | null>(null);

  // Back / forward or a link changed `?abiertos=`: follow it.
  if (seenParam !== abiertosParam) {
    setSeenParam(abiertosParam);
    setOpen(parseAbiertos(abiertosParam));
  }

  const schedule = data.schedule ?? null;
  const hasSchedule = (schedule?.sections.length ?? 0) > 0;
  const hasReal = portalScheduleHasRealDates(schedule);

  const kpis = useMemo(() => buildPortalKpis(data, today), [data, today]);
  const phaseGroups = useMemo(() => buildPortalPhaseTable(schedule, today, data.tramos), [schedule, today, data.tramos]);
  const phaseTotals = useMemo(() => portalPhaseTotals(phaseGroups), [phaseGroups]);
  const entregables = useMemo(() => buildPortalEntregables(schedule, today, data.tramos), [schedule, today, data.tramos]);
  const nextEntregable = useMemo(() => portalNextEntregable(schedule, today), [schedule, today]);
  const fileGroups = useMemo(() => buildPortalFilesByFolder(portalFolderGroupsOf(data)), [data]);
  const fileTotals = useMemo(() => (fileGroups ? portalFilesTotals(fileGroups) : null), [fileGroups]);

  const childIds = useMemo(
    () => [...phaseGroups.map((g) => g.id), ...(fileGroups ?? []).map((g) => g.id)],
    [phaseGroups, fileGroups]
  );
  const expanded = useMemo(
    () => [
      ...open.map((s) => SECTION_GROUP_ID[s]),
      ...childIds.filter((id) => !collapsedGroups.includes(id)),
    ],
    [open, childIds, collapsedGroups]
  );

  const changeOpen = useCallback(
    (next: PortalSectionKey[]) => {
      const ordered = PORTAL_SECTIONS.filter((s) => next.includes(s));
      if (ordered.length === open.length && ordered.every((s) => open.includes(s))) return;
      writeAbiertos(ordered);
      setOpen(ordered);
    },
    [open]
  );

  /** One table reported its expanded ids: update only its own section and its own second-level groups. */
  const onTableExpanded = (section: PortalSectionKey, ownChildIds: string[]) => (ids: string[]) => {
    const isOpen = ids.includes(SECTION_GROUP_ID[section]);
    if (isOpen !== open.includes(section)) {
      changeOpen(isOpen ? [...open, section] : open.filter((s) => s !== section));
    }
    setCollapsedGroups((current) => [
      ...current.filter((id) => !ownChildIds.includes(id)),
      ...ownChildIds.filter((id) => !ids.includes(id)),
    ]);
  };

  // After an "Ir a" chip opened its section and it rendered: bring it into view and focus its header.
  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    focusSection(target);
  });

  const goTo = (section: PortalSectionKey) => (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    if (open.includes(section)) {
      focusSection(section);
      return;
    }
    pendingFocus.current = section;
    changeOpen([...open, section]);
  };

  const phaseColumns: RecordColumn[] = [
    { key: "fase", label: "Fase" },
    { key: "plan", label: "Plan", mono: true },
    ...(hasReal ? [{ key: "real", label: "Real", mono: true }] : []),
    { key: "estado", label: "Estado" },
    { key: "avance", label: "Avance", align: "right", mono: true, format: "percent" },
    ...(hasReal ? [{ key: "desvio", label: "Desvío (días)", align: "right" as const, mono: true }] : []),
  ];
  const entregableColumns: RecordColumn[] = [
    { key: "entregable", label: "Entregable" },
    { key: "tramo", label: "Etapa" },
    { key: "fechaPlan", label: "Fecha plan", mono: true },
    ...(hasReal ? [{ key: "fechaReal", label: "Fecha real", mono: true }] : []),
    { key: "estado", label: "Estado" },
    ...(hasReal ? [{ key: "desvio", label: "Desvío (días)", align: "right" as const, mono: true }] : []),
  ];
  const fileColumns: RecordColumn[] = [
    { key: "name", label: "Archivo" },
    { key: "tipo", label: "Tipo", mono: true },
    { key: "tamano", label: "Tamaño", align: "right", mono: true },
    { key: "modifiedAt", label: "Actualizado", mono: true, format: "date" },
    { key: "subidoPor", label: "Subido por" },
    { key: "accion", label: "Acción" },
  ];
  const desvioHeat: HeatRule[] = hasReal ? [{ key: "desvio", warnAt: 2, critAt: Number.POSITIVE_INFINITY }] : [];

  const phaseTable: Group<PortalPhaseRow> = {
    id: SECTION_GROUP_ID.fases,
    label: SECTION_TITLE.fases,
    caption: `${phaseGroups.length} ${phaseGroups.length === 1 ? "etapa" : "etapas"} · ${phaseTotals.fases} ${phaseTotals.fases === 1 ? "fase" : "fases"}`,
    metrics: [
      { key: "avance", label: "Avance", value: `${phaseTotals.avance} %` },
      ...(phaseTotals.desvio !== null
        ? [{ key: "desvio", label: "desvío", value: `${formatPortalDesvio(phaseTotals.desvio)} d` }]
        : []),
    ],
    children: phaseGroups,
    footer: {
      fase: `Total · ${phaseTotals.fases} ${phaseTotals.fases === 1 ? "fase" : "fases"}`,
      avance: `${phaseTotals.avance} %`,
      ...(phaseTotals.desvio !== null ? { desvio: formatPortalDesvio(phaseTotals.desvio) } : {}),
    },
  };
  const delivered = entregables.filter((e) => e.estado === "Entregado").length;
  const entregablesTable: Group<PortalEntregableRow> = {
    id: SECTION_GROUP_ID.entregables,
    label: SECTION_TITLE.entregables,
    caption: `${entregables.length} · ${delivered} ${delivered === 1 ? "entregado" : "entregados"}`,
    metrics: nextEntregable ? [{ key: "proximo", label: "Próximo", value: portalDayMonth(nextEntregable) }] : [],
    rows: entregables,
  };
  const filesTable: Group<PortalFileRow> | null =
    fileGroups && fileTotals && fileGroups.length > 0
      ? {
          id: SECTION_GROUP_ID.archivos,
          label: SECTION_TITLE.archivos,
          caption: `${fileTotals.carpetas} ${fileTotals.carpetas === 1 ? "carpeta" : "carpetas"} · ${fileTotals.archivos} ${fileTotals.archivos === 1 ? "archivo" : "archivos"} · ${fileTotals.tamano}`,
          metrics: [],
          children: fileGroups,
        }
      : null;

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-[1240px] flex-col gap-5 px-4 pt-7 pb-12 sm:px-8">
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h1 className="min-w-0 break-words text-[28px] font-semibold tracking-tight">{project.name}</h1>
        {typeof updatedAt === "number" && updatedAt > 0 ? (
          <p className="font-mono text-[12.5px] tabular-nums text-muted-foreground">Actualizado {portalUpdatedAt(updatedAt)}</p>
        ) : null}
      </div>

      <KpiStrip items={kpiItems(kpis)} />

      <nav aria-label="Ir a sección" className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Ir a</span>
        {PORTAL_SECTIONS.map((section) => (
          <a
            key={section}
            href={`#${section}`}
            onClick={goTo(section)}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "text-[12.5px]")}
          >
            {SECTION_LABEL[section]}
          </a>
        ))}
      </nav>

      <div id="fases" tabIndex={-1} className="min-w-0 scroll-mt-4 outline-none">
        {hasSchedule ? (
          <GroupedTable<PortalPhaseRow>
            label={SECTION_TITLE.fases}
            columns={phaseColumns}
            groups={[phaseTable]}
            expanded={expanded}
            onExpandedChange={onTableExpanded("fases", phaseGroups.map((g) => g.id))}
            heat={desvioHeat}
            getRowId={(row) => row.key}
            renderCell={(key, row) => {
              if (key === "fase") return <span className={LONG_TEXT} title={row.fase}>{row.fase}</span>;
              if (key === "avance") return `${row.avance} %`;
              if (key === "desvio") return desvioCell(row.desvio);
              if (key === "real") return row.real ?? "—";
              return undefined;
            }}
          />
        ) : (
          <EmptySection title={SECTION_TITLE.fases} message={PORTAL_ANALITICO_COPY.sinCronograma} />
        )}
      </div>

      <div id="entregables" tabIndex={-1} className="min-w-0 scroll-mt-4 outline-none">
        {hasSchedule ? (
          <GroupedTable<PortalEntregableRow>
            label={SECTION_TITLE.entregables}
            columns={entregableColumns}
            groups={[entregablesTable]}
            expanded={expanded}
            onExpandedChange={onTableExpanded("entregables", [])}
            heat={desvioHeat}
            getRowId={(row) => row.key}
            renderCell={(key, row) => {
              if (key === "entregable") return <span className={LONG_TEXT} title={row.entregable}>{row.entregable}</span>;
              if (key === "desvio") return desvioCell(row.desvio);
              if (key === "fechaReal") return row.fechaReal ?? "—";
              if (key === "tramo") return row.tramo ?? "—";
              return undefined;
            }}
          />
        ) : (
          <EmptySection title={SECTION_TITLE.entregables} message={PORTAL_ANALITICO_COPY.sinCronograma} />
        )}
      </div>

      <div id="archivos" tabIndex={-1} className="min-w-0 scroll-mt-4 outline-none">
        {filesTable ? (
          <GroupedTable<PortalFileRow>
            label={SECTION_TITLE.archivos}
            columns={fileColumns}
            groups={[filesTable]}
            expanded={expanded}
            onExpandedChange={onTableExpanded("archivos", (fileGroups ?? []).map((g) => g.id))}
            getRowId={(row) => row.id}
            renderCell={(key, row) => {
              if (key === "name") return <span className={LONG_TEXT} title={row.name}>{row.name}</span>;
              if (key === "modifiedAt") return row.modifiedAt ? portalDayMonthYear(row.modifiedAt) : "—";
              if (key === "accion") {
                return (
                  <a
                    href={portalDocumentDownloadUrl(project.id, row.id)}
                    aria-label={`Descargar ${row.name}`}
                    className="font-medium text-secondary-foreground underline-offset-4 hover:underline"
                  >
                    Descargar
                  </a>
                );
              }
              return undefined;
            }}
          />
        ) : (
          <EmptySection
            title={SECTION_TITLE.archivos}
            message={fileGroups === null ? PORTAL_ANALITICO_COPY.archivosPendientes : PORTAL_ANALITICO_COPY.sinDocumentos}
          />
        )}
      </div>
    </div>
  );
}

export default PortalAnalitico;
