"use client";

import { useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FolderKanban, Plus } from "lucide-react";
import { toast } from "sonner";

import { FiltersBar } from "@/components/patterns/FiltersBar";
import { ListPage, type ListPageProps } from "@/components/patterns/ListPage";
import type { ProjectAdminValue } from "@/components/proyectos/ProjectAdminFields";
import { Button } from "@/components/ui/shadcn/button";
import { DistributionStripWidget } from "@/components/widgets/DistributionStripWidget";
import { EntityCardFooter } from "@/components/widgets/EntityCardFooter";
import { unwrapActionResult } from "@/lib/actions/action-result";
import { submitProjectCreateAction, updateProjectAction } from "@/lib/actions/projects-actions";
import { actionErrorText } from "@/lib/errors";
import type { ProjectCreateInput, ProjectListItem, WorkflowRef } from "@/lib/types/core";
import type { PortfolioRow } from "@/lib/types/redesign";
import type { EntityCard } from "@/lib/types/widgets";

import { NewProjectDialog } from "./NewProjectDialog";
import type { ProjectCreateAdminOptions } from "./project-create-form";
import {
  PROJECTS_BY_TRAMO_TITLE,
  PROJECTS_TITLE,
  TRAMO_EXTRA_COLUMNS,
  buildPortfolioTable,
  buildProjectCards,
  buildTramoSegments,
  listedProjects,
  orderedTramos,
  portfolioById,
  projectTeam,
  projectsDescription,
  searchProjects,
  tramoSteps,
} from "./projects-portfolio-data";

export type ProjectsPortfolioProps = {
  projects: ProjectListItem[];
  portfolio: PortfolioRow[];
  /** Tramos in order (`listTramos`); without them the tramos the projects carry. */
  tramos?: WorkflowRef[];
  /**
   * `canSeeAdminData` of the viewer, decided on the server: adds the
   * "Presup. ejercido" column and the client/origin fields of the dialog.
   */
  canSeeAdminData?: boolean;
  /** `projects.canCreateProject`: shows "Nuevo proyecto" and honors `?nuevo=1`. */
  canCreateProject?: boolean;
  /** Presale starts on its own when a project is created (dialog copy). */
  presaleAutoStart?: boolean;
  /** Clients and staff for the admin fields of the dialog (admins only). */
  adminOptions?: ProjectCreateAdminOptions | null;
};

export const EMPTY_PROJECTS_TITLE = "Aún no hay proyectos";
export const NEW_PROJECT_LABEL = "Nuevo proyecto";
export const SEARCH_PLACEHOLDER = "Buscar proyecto o lugar";

function hasAdminValues(admin: ProjectAdminValue | undefined): admin is ProjectAdminValue {
  return Boolean(admin && (admin.clientId || admin.origin || admin.originStaffId));
}

/**
 * /proyectos in three styles (redesign FE §3.5, §4.6): `ListPage` with
 * `spec.kind = "cards"` (`EntityCardGrid`: Visual cards with tinted head,
 * ring, tramo step bar and team; Esencial text cards / list; Analítico
 * portfolio table with totals) plus "Proyectos por tramo" (strip in Visual,
 * summary line or table in the other styles). Builds one set of data shapes;
 * every per-style difference lives in the widgets. "Nuevo proyecto" and
 * `?nuevo=1` open `NewProjectDialog`.
 */
export function ProjectsPortfolio({
  projects,
  portfolio,
  tramos,
  canSeeAdminData = false,
  canCreateProject = false,
  presaleAutoStart = false,
  adminOptions = null,
}: ProjectsPortfolioProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  // Set once a create navigates away, so closing the dialog doesn't replace that navigation.
  const navigating = useRef(false);

  const wantsNew = searchParams?.get("nuevo") === "1";
  // `?nuevo=1` opens the dialog; closing it hides it right away, before the URL drops the param.
  const [newDismissed, setNewDismissed] = useState(false);
  const [prevWantsNew, setPrevWantsNew] = useState(wantsNew);
  if (wantsNew !== prevWantsNew) {
    setPrevWantsNew(wantsNew);
    if (wantsNew) setNewDismissed(false);
  }
  const open = canCreateProject && (dialogOpen || (wantsNew && !newDismissed));

  const listed = useMemo(() => listedProjects(projects), [projects]);
  const visible = useMemo(() => searchProjects(listed, query), [listed, query]);
  const rows = useMemo(() => portfolioById(portfolio), [portfolio]);
  const tramoOrder = useMemo(() => orderedTramos(listed, tramos), [listed, tramos]);
  const byId = useMemo(() => new Map(visible.map((p) => [p.id, p])), [visible]);

  const items = useMemo(() => buildProjectCards(visible, rows), [visible, rows]);
  const table = useMemo(() => buildPortfolioTable(visible, rows, { canSeeAdminData }), [visible, rows, canSeeAdminData]);
  const segments = useMemo(() => buildTramoSegments(visible, rows, tramoOrder), [visible, rows, tramoOrder]);

  function openDialog() {
    setDialogOpen(true);
  }

  function handleOpenChange(next: boolean) {
    setDialogOpen(next);
    if (!next && wantsNew) setNewDismissed(true);
    if (!next && wantsNew && !navigating.current) {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      params.delete("nuevo");
      const search = params.toString();
      router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false });
    }
  }

  async function handleCreate(input: ProjectCreateInput, admin?: ProjectAdminValue) {
    const result = await submitProjectCreateAction(input);
    // The dialog maps the code to copy (FE §9).
    if (!result.ok) throw new Error(result.error);
    const id = result.project.id;
    if (canSeeAdminData && hasAdminValues(admin)) {
      try {
        unwrapActionResult(await updateProjectAction(id, admin));
      } catch (err) {
        // The project exists; the client and origin can be set from the ficha.
        toast.error(`Proyecto creado, pero no se guardaron el cliente y el origen. ${actionErrorText(err)}`);
        navigating.current = true;
        router.push(`/proyectos/${id}/ficha`);
        return;
      }
    }
    toast.success("Proyecto creado");
    navigating.current = true;
    router.push(`/proyectos/${id}`);
  }

  const footer = (item: EntityCard) => {
    const project = byId.get(item.id);
    if (!project) return null;
    return (
      <EntityCardFooter
        steps={tramoSteps(project, tramoOrder)}
        stepsLabel="Tramos"
        people={projectTeam(project)}
        peopleLabel="Equipo"
      />
    );
  };

  const empty: ListPageProps["empty"] =
    listed.length === 0
      ? {
          icon: FolderKanban,
          title: EMPTY_PROJECTS_TITLE,
          description: canCreateProject ? "Crea el primero para empezar a darle seguimiento." : undefined,
          action: canCreateProject ? { label: NEW_PROJECT_LABEL, onClick: openDialog } : undefined,
        }
      : { title: "Sin resultados", description: `Ningún proyecto coincide con «${query.trim()}».` };

  return (
    <>
      <ListPage
        header={{
          title: PROJECTS_TITLE,
          description: projectsDescription(listed.length),
          actions: canCreateProject ? (
            <Button type="button" onClick={openDialog}>
              <Plus aria-hidden="true" />
              {NEW_PROJECT_LABEL}
            </Button>
          ) : undefined,
        }}
        filters={
          listed.length > 0 ? (
            <div className="flex flex-col gap-4">
              <FiltersBar search={{ value: query, placeholder: SEARCH_PLACEHOLDER, onChange: setQuery }} />
              {visible.length > 0 ? (
                <DistributionStripWidget
                  title={PROJECTS_BY_TRAMO_TITLE}
                  segments={segments}
                  totalLabel="Proyectos"
                  extraColumns={TRAMO_EXTRA_COLUMNS}
                />
              ) : null}
            </div>
          ) : undefined
        }
        spec={{ kind: "cards", items, table, footer }}
        empty={empty}
      />
      {canCreateProject ? (
        <NewProjectDialog
          open={open}
          onOpenChange={handleOpenChange}
          onConfirm={handleCreate}
          presaleAutoStart={presaleAutoStart}
          adminOptions={canSeeAdminData ? adminOptions : null}
        />
      ) : null}
    </>
  );
}
