/** Shared fixtures of the `NewTaskDialog` tests. */
import type { ProjectListItem, WorkflowDetail, WorkflowPhase, WorkflowTaskTemplate } from "@/lib/types/core";
import type { StaffOption } from "@/lib/types/redesign";

function phase(id: string, name: string, sortOrder: number, active = true): WorkflowPhase {
  return { id, name, sortOrder, workflowId: "w-diseno", active, templateCount: 0 };
}

function template(id: string, phaseId: string, title: string, sortOrder: number, active = true): WorkflowTaskTemplate {
  return {
    id,
    workflowId: "w-diseno",
    phaseId,
    phaseName: "",
    title,
    notes: null,
    defaultPriority: "media",
    commitmentOffsetDays: null,
    reviewOffsetDays: null,
    deliveryOffsetDays: null,
    sortOrder,
    active,
  };
}

export const DISENO: WorkflowDetail = {
  id: "w-diseno",
  key: "diseno",
  name: "Diseño",
  description: null,
  active: true,
  sortOrder: 2,
  autoStart: "manual",
  readiness: null,
  phases: [phase("f-ejecutivo", "Ejecutivo", 2), phase("f-ante", "Anteproyecto", 1), phase("f-old", "Archivada", 3, false)],
  templates: [
    template("t-2", "f-ante", "Medidas del sitio", 2),
    template("t-1", "f-ante", "Levantamiento", 1),
    template("t-3", "f-ejecutivo", "Planos de conjunto", 1),
    template("t-4", "f-ante", "Vieja", 3, false),
  ],
};

export const PRESALE: WorkflowDetail = {
  id: "w-presale",
  key: "presale",
  name: "Presale",
  description: null,
  active: true,
  sortOrder: 1,
  autoStart: "manual",
  readiness: null,
  phases: [],
  templates: [],
};

export const WORKFLOWS: WorkflowDetail[] = [DISENO, PRESALE];

export const PROJECTS = [
  { id: "p-roble", name: "Casa Roble", currentWorkflowId: "w-diseno" },
  { id: "p-norte", name: "Torre Norte", currentWorkflowId: "w-presale" },
] as unknown as ProjectListItem[];

export const STAFF: StaffOption[] = [
  { id: "s-luis", name: "Luis", lastName: "Mora", suggested: false },
  { id: "s-ana", name: "Ana", lastName: "López", suggested: true },
] as unknown as StaffOption[];
