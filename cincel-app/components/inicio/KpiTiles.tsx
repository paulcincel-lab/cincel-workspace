"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/shadcn/button";
import { KpiWidget, type KpiWidgetProps } from "@/components/widgets/KpiWidget";
import { isInicioKpiKey, useInicioDashboard } from "@/lib/stores/inicio-dashboard-store";

export type KpiTilesProps = Omit<KpiWidgetProps, "selectedKey" | "onSelect">;

/**
 * Inicio KPIs (redesign FE §4.3): an instance of `KpiWidget`. The widget draws
 * the Visual tiles, the Esencial numbers and the Analítico table from the same
 * items and filters `visibleIn` itself; the page never picks the style.
 *
 * The KPIs are toggle buttons over `useInicioDashboard.selectedKpi`
 * (zustand.md §2.5): selecting the pressed one again clears it. The selected
 * KPI's destination (`KpiDatum.href`) is the "Ver …" link right after the
 * KPIs, so every destination stays reachable by keyboard (select, then the
 * link). A selection whose KPI is no longer in the data shows as none.
 */
export function KpiTiles(props: KpiTilesProps) {
  const selectedKpi = useInicioDashboard((s) => s.selectedKpi);
  const toggleKpi = useInicioDashboard((s) => s.toggleKpi);
  const selected = selectedKpi ? props.items.find((item) => item.key === selectedKpi) : undefined;

  return (
    <div className="flex flex-col gap-2">
      <KpiWidget
        {...props}
        selectedKey={selected?.key ?? null}
        onSelect={(key) => {
          if (isInicioKpiKey(key)) toggleKpi(key);
        }}
      />
      {selected?.href ? (
        <Link
          href={selected.href}
          data-slot="kpi-selected-link"
          className={buttonVariants({ variant: "link", size: "sm", className: "self-start" })}
        >
          Ver {selected.label.toLocaleLowerCase("es-MX")}
          <ArrowRight aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  );
}
