import { presaleTemplate } from "@/lib/templates/presale";
import { disenoTemplate } from "@/lib/templates/diseno";
import { operativasTemplate } from "@/lib/templates/operativas";
import type { WorkflowType } from "@/lib/types/task";
import type { ProjectStage } from "@/lib/types/enums";

export interface TemplateItem {
  phase: string;
  description: string;
}

/**
 * The firm's internal departments — Presale → Diseño → Construcción →
 * Decoración — each keyed by its URL slug. Decoración has no template/data
 * yet (see the plan's note on the pending `workflow_type` migration); its
 * page renders a "próximamente" state instead of an empty table.
 */
export const DEPARTMENTOS: Array<{
  slug: string;
  stage: ProjectStage;
  workflow: WorkflowType | null;
  label: string;
  description: string;
  template: readonly TemplateItem[];
}> = [
  {
    slug: "presale",
    stage: "Presale",
    workflow: "Presale",
    label: "Presale",
    description: "Flujo de prospección, presentación y cierre.",
    template: presaleTemplate,
  },
  {
    slug: "diseno",
    stage: "Diseño",
    workflow: "Diseño",
    label: "Taller de Diseño",
    description: "Flujo de anteproyecto, proyecto arquitectónico y ejecutivo.",
    template: disenoTemplate,
  },
  {
    slug: "construccion",
    stage: "Construcción",
    workflow: "Construcción",
    label: "Construcción",
    description: "Flujo de residencia de obra y postventa.",
    template: operativasTemplate,
  },
  {
    slug: "decoracion",
    stage: "Decoración",
    workflow: null,
    label: "Decoración",
    description: "Próximamente — pendiente de plantilla y migración de esquema.",
    template: [],
  },
];

export function getDepartamento(slug: string) {
  return DEPARTMENTOS.find((d) => d.slug === slug);
}

/** Ordered, deduped phase sequence for a department's template — drives PhaseStepper. */
export function phasesFor(template: readonly TemplateItem[]): string[] {
  return Array.from(new Set(template.map((t) => t.phase)));
}
