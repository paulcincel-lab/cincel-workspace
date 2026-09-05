import { presaleTemplate } from "@/lib/templates/presale";
import { disenoTemplate } from "@/lib/templates/diseno";
import { operativasTemplate } from "@/lib/templates/operativas";
import { decoracionTemplate } from "@/lib/templates/decoracion";
import type { WorkflowType } from "@/lib/types/task";
import type { ProjectStage } from "@/lib/types/enums";

export interface TemplateItem {
  phase: string;
  description: string;
}

/**
 * The firm's internal departments — Presale → Diseño → Construcción →
 * Decoración — each keyed by its URL slug.
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
    workflow: "Decoración",
    label: "Decoración",
    description: "Flujo de selección de mobiliario, adquisición e instalación final.",
    template: decoracionTemplate,
  },
];

export function getDepartamento(slug: string) {
  return DEPARTMENTOS.find((d) => d.slug === slug);
}

/**
 * Best-guess departamento slug for a project's `stage` field (which can hold
 * several slash-separated stages, e.g. "Presale/Diseño") — used to deep-link
 * from a project into its activities. Picks the last (most current) stage
 * that matches a known departamento, falling back to "presale".
 */
export function departamentoSlugForStage(stage: string): string {
  const stages = stage.split("/").map((s) => s.trim().toLowerCase()).filter(Boolean);
  for (let i = stages.length - 1; i >= 0; i -= 1) {
    const match = DEPARTMENTOS.find((d) => d.stage.toLowerCase() === stages[i]);
    if (match) return match.slug;
  }
  return "presale";
}

/** Departamento slug for a task's workflow — used to deep-link from a task into its activities page. */
export function departamentoSlugForWorkflow(workflow: WorkflowType): string {
  return DEPARTMENTOS.find((d) => d.workflow === workflow)?.slug ?? "presale";
}

/** Ordered, deduped phase sequence for a department's template — drives PhaseStepper. */
export function phasesFor(template: readonly TemplateItem[]): string[] {
  return Array.from(new Set(template.map((t) => t.phase)));
}
