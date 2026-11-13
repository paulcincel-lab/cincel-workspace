"use client";

import { PhaseStepper, type PhaseStepperItem } from "@/components/v2/status/PhaseStepper";
import type { RecordTableData } from "@/lib/types/widgets";

import { RecordTable } from "./RecordTable";
import { StyleView } from "./StyleView";
import { WidgetCard } from "./WidgetCard";

/** One etapa of a project, in etapa order. */
export type EtapaStep = PhaseStepperItem & {
  /** ISO dates; null when the etapa has not started / closed. */
  start: string | null;
  end: string | null;
  /** Days between start and end (or today while current); null without dates. */
  durationDays: number | null;
};

export type EtapaStepperWidgetProps = { title: string; steps: EtapaStep[] };

const STATE_LABEL: Record<EtapaStep["state"], string> = {
  done: "Completado",
  current: "En curso",
  next: "Siguiente",
};

/** The Analítico table: etapa, inicio, fin, duración, estado. */
export function etapaStepsTable(steps: EtapaStep[]): RecordTableData {
  return {
    columns: [
      { key: "etapa", label: "Etapa" },
      { key: "inicio", label: "Inicio", format: "date" },
      { key: "fin", label: "Fin", format: "date" },
      { key: "duracion", label: "Duración", align: "right", mono: true, format: "days" },
      { key: "estado", label: "Estado" },
    ],
    rows: steps.map((step) => ({
      id: step.key,
      etapa: step.label,
      inicio: step.start ?? "",
      fin: step.end ?? "",
      duracion: step.durationDays ?? "",
      estado: STATE_LABEL[step.state],
    })),
  };
}

/**
 * A project's etapas in three styles (redesign FE §3.5, §4.10.2): the labelled
 * `PhaseStepper` (Visual), a text list with dates and state (Esencial), or a
 * table (Analítico).
 */
export function EtapaStepperWidget({ title, steps }: EtapaStepperWidgetProps) {
  if (steps.length === 0) return null;
  return (
    <WidgetCard title={title}>
      <StyleView
        visual={() => <PhaseStepper steps={steps.length} current={0} items={steps} label={title} />}
        esencial={() => (
          <ul className="flex flex-col divide-y divide-border">
            {steps.map((step) => (
              <li key={step.key} className="flex items-baseline justify-between gap-4 py-2">
                <span>
                  <span className="text-foreground">{step.label}</span>
                  {step.range ? <span className="ml-2 text-[13px] text-muted-foreground">{step.range}</span> : null}
                </span>
                <span className="text-[13px] text-muted-foreground">{STATE_LABEL[step.state]}</span>
              </li>
            ))}
          </ul>
        )}
        analitico={() => <RecordTable data={etapaStepsTable(steps)} density="compacta" />}
      />
    </WidgetCard>
  );
}
