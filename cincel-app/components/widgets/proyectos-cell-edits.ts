import type { QueryClient, QueryKey } from "@tanstack/react-query";

import { moveProjectToEtapa } from "@/components/proyectos/projects-portfolio-data";
import type { PortfolioTableRow } from "@/components/proyectos/projects-portfolio-data";
import { CLEAR_LABEL, LOCK_REASON, type CellEdit, type CellOption } from "@/components/widgets/editable-cell";
import { setProjectCurrentEtapaAction, updateProjectAction } from "@/lib/actions/projects-actions";
import type { ProyectosPageData } from "@/lib/loaders/proyectos";
import { qk } from "@/lib/query/keys";
import { etapaColorVar } from "@/lib/etapas/compat";
import type { ProjectListItem, WorkflowRef } from "@/lib/types/core";
import type { ActionResult } from "@/lib/types/schedule";
import type { RecordColumn } from "@/lib/types/widgets";

/**
 * Editable columns of the Proyectos portfolio (#1026): Proyectos Analítico's
 * Etapa actual and Responsable. (Resumen Analítico "Tareas por etapa" edits
 * through `useTaskCellEdits`, over its `qk.tareas.list` pages.) Each commit
 * patches its page query first (a project that changes etapa moves to that
 * group at once) and puts the cache back when the server refuses; the
 * page's `CellCommitProvider` invalidates the page keys on settle, and the
 * other views are invalidated here on success. Every other column is
 * calculated and stays inert.
 */

/** Patches the cached `key` with `patch`, runs `run`, and restores the cache on failure (or calls `onSuccess`). */
async function optimistic<T>(
  qc: QueryClient,
  key: QueryKey,
  patch: (cached: T) => T,
  run: () => Promise<ActionResult<unknown>>,
  onSuccess?: () => void,
): Promise<ActionResult<unknown>> {
  await qc.cancelQueries({ queryKey: key });
  const before = qc.getQueryData<T>(key);
  if (before !== undefined && before !== null) qc.setQueryData<T>(key, patch(before));
  let result: ActionResult<unknown>;
  try {
    result = await run();
  } catch (err) {
    if (before !== undefined) qc.setQueryData<T>(key, before);
    throw err;
  }
  if (!result.ok) {
    if (before !== undefined) qc.setQueryData<T>(key, before);
    return result;
  }
  onSuccess?.();
  return result;
}

function invalidate(qc: QueryClient, keys: QueryKey[]): void {
  for (const queryKey of keys) void qc.invalidateQueries({ queryKey });
}

// ── Proyectos Analítico ─────────────────────────────────────────────────────

/** Keys the portfolio's `CellCommitProvider` invalidates on settle. */
export const PORTFOLIO_COMMIT_KEYS: QueryKey[] = [qk.proyectos.list()];

export const PORTFOLIO_ETAPA_LABEL = "Etapa actual";
export const PORTFOLIO_MANAGER_LABEL = "Responsable";

export type PortfolioEditDeps = {
  qc: QueryClient;
  /** Every project of the page, by id (the rows carry only what the table shows). */
  projects: Map<string, ProjectListItem>;
  /** The etapa catalog (`ProyectosPageData.etapas`). */
  etapas: WorkflowRef[];
  /** People for Responsable (the staff catalog, or the projects' teams while it loads). */
  staff: { id: string; name: string }[];
  canChangeProjectStage: boolean;
  canEditProjectGeneral: boolean;
  /** An admin may give an etapa to a project without one ("Asignar etapa"). */
  canSeeAdminData: boolean;
};

function etapaOption(etapa: Pick<WorkflowRef, "id" | "key" | "name">): CellOption {
  return { value: etapa.id, label: etapa.name, color: etapaColorVar(etapa.key) };
}

/** The etapa a project can move to: its started etapas; an admin assigns any etapa to a project without one. */
export function projectEtapaOptions(project: ProjectListItem | undefined, etapas: WorkflowRef[], isAdmin: boolean): CellOption[] {
  if (!project) return [];
  if (project.needsEtapa && isAdmin) return etapas.map(etapaOption);
  return project.etapas.map(etapaOption);
}

/** The page data after giving project `id` the manager `staff` (null clears it). */
export function setProjectManager(data: ProyectosPageData, id: string, staff: { id: string; name: string } | null): ProyectosPageData {
  return {
    ...data,
    projects: data.projects.map((p) => (p.id === id ? { ...p, managerId: staff?.id ?? null, manager: staff } : p)),
  };
}

/**
 * The Analítico portfolio columns with Etapa actual and Responsable after
 * Proyecto. Both lock with "Solo un admin puede cambiar este proyecto." for a
 * viewer the actions would refuse (`canChangeProjectStage`,
 * `canEditProjectGeneral`).
 */
export function portfolioEditColumns(base: RecordColumn[], deps: PortfolioEditDeps): RecordColumn<PortfolioTableRow>[] {
  const { qc, projects, etapas, staff, canChangeProjectStage, canEditProjectGeneral, canSeeAdminData } = deps;
  const key = qk.proyectos.list();
  const projectViews = (id: string): QueryKey[] => [qk.proyectos.detail(id), qk.inicio()];

  const etapa: CellEdit<PortfolioTableRow> = {
    kind: "select",
    options: (row) => projectEtapaOptions(projects.get(row.id), etapas, canSeeAdminData),
    value: (row) => {
      const project = projects.get(row.id);
      if (!project || project.needsEtapa) return null;
      return project.currentWorkflow?.id ?? project.etapas.find((t) => t.current)?.id ?? null;
    },
    commit: async (row, v) => {
      // A project always keeps an etapa once it has one.
      if (v === null) return { ok: false, error: "INVALID" };
      return optimistic<ProyectosPageData>(
        qc,
        key,
        (data) => moveProjectToEtapa(data, row.id, v),
        () => setProjectCurrentEtapaAction(row.id, v),
        () => invalidate(qc, projectViews(row.id)),
      );
    },
  };

  const staffById = new Map(staff.map((s) => [s.id, s]));
  const manager: CellEdit<PortfolioTableRow> = {
    kind: "person",
    clearable: true,
    options: () => [
      { value: null, label: CLEAR_LABEL.person },
      ...staff.map((s) => ({ value: s.id, label: s.name, avatar: { name: s.name } })),
    ],
    value: (row) => projects.get(row.id)?.manager?.id ?? null,
    commit: (row, v) => {
      const project = projects.get(row.id);
      const person = v === null ? null : (staffById.get(v) ?? (project?.manager?.id === v ? project.manager : null) ?? { id: v, name: "" });
      return optimistic<ProyectosPageData>(
        qc,
        key,
        (data) => setProjectManager(data, row.id, person),
        () => updateProjectAction(row.id, { managerId: v }),
        () => invalidate(qc, projectViews(row.id)),
      );
    },
  };

  const lock = (allowed: boolean) => (): true | string => (allowed ? true : LOCK_REASON.project);
  const editable: RecordColumn<PortfolioTableRow>[] = [
    { key: "etapa", label: PORTFOLIO_ETAPA_LABEL, width: 160, edit: etapa, canEdit: lock(canChangeProjectStage) },
    { key: "manager", label: PORTFOLIO_MANAGER_LABEL, width: 170, edit: manager, canEdit: lock(canEditProjectGeneral) },
  ];
  const columns = base as RecordColumn<PortfolioTableRow>[];
  const at = columns.findIndex((c) => c.key === "name") + 1;
  return [...columns.slice(0, at), ...editable, ...columns.slice(at)];
}
