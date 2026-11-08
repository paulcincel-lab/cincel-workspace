"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { ChartColumn, ChevronDown, ChevronUp, FolderKanban, LayoutGrid, Plus, Table2, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";

import { FiltersBar } from "@/components/patterns/FiltersBar";
import { ListPage, type ListPageProps } from "@/components/patterns/ListPage";
import type { ProjectAdminValue } from "@/components/proyectos/ProjectAdminFields";
import { Button } from "@/components/ui/shadcn/button";
import { DistributionStripWidget } from "@/components/widgets/DistributionStripWidget";
import { EntityCardFooter } from "@/components/widgets/EntityCardFooter";
import { submitProjectCreateAction, updateProjectAction } from "@/lib/actions/projects-actions";
import { isStrippedActionError, useActionMutation } from "@/lib/query/mutation";
import { qk } from "@/lib/query/keys";
import { catalogOptions } from "@/lib/query/options/catalog";
import { proyectosPageOptions } from "@/lib/query/options/proyectos";
import type { WidgetView } from "@/lib/stores/dashboard-store";
import {
  selectSelectedTramo,
  selectTramoStripCollapsed,
  useProyectosDashboard,
  useProyectosWidgetView,
} from "@/lib/stores/proyectos-dashboard-store";
import type { ProjectCreateInput, ProjectInput } from "@/lib/types/core";
import type { EntityCard } from "@/lib/types/widgets";

import { NewProjectDialog } from "./NewProjectDialog";
import type { ProjectCreateAdminOptions } from "./project-create-form";
import {
  NO_TRAMO_LABEL,
  PROJECTS_BY_TRAMO_TITLE,
  PROJECTS_TITLE,
  TRAMO_EXTRA_COLUMNS,
  buildPortfolioTable,
  buildProjectCards,
  buildTramoSegments,
  currentTramoOf,
  filterByTramo,
  listedProjects,
  orderedTramos,
  portfolioById,
  projectTeam,
  projectsDescription,
  searchProjects,
  tramoSteps,
} from "./projects-portfolio-data";

export const EMPTY_PROJECTS_TITLE = "Aún no hay proyectos";
export const NEW_PROJECT_LABEL = "Nuevo proyecto";
export const SEARCH_PLACEHOLDER = "Buscar proyecto o lugar";

/** The URL param of the portfolio search. */
export const SEARCH_PARAM = "q";
/** The URL param that opens the create dialog. */
export const NEW_PROJECT_PARAM = "nuevo";
/** How long typing waits before the search reaches the URL. */
export const SEARCH_DEBOUNCE_MS = 300;

export const STRIP_VIEW_LABEL = `Vista de ${PROJECTS_BY_TRAMO_TITLE}`;
export const PORTFOLIO_VIEW_LABEL = "Vista de proyectos";
export const COLLAPSE_STRIP_LABEL = `Contraer ${PROJECTS_BY_TRAMO_TITLE}`;
export const EXPAND_STRIP_LABEL = `Expandir ${PROJECTS_BY_TRAMO_TITLE}`;
export const CLEAR_TRAMO_LABEL = "Ver todos los tramos";

type ViewOption = { view: WidgetView; label: string; icon: LucideIcon };

const STRIP_VIEWS: ViewOption[] = [
  { view: "chart", label: "Gráfica", icon: ChartColumn },
  { view: "table", label: "Tabla", icon: Table2 },
];
const PORTFOLIO_VIEWS: ViewOption[] = [
  { view: "chart", label: "Tarjetas", icon: LayoutGrid },
  { view: "table", label: "Tabla", icon: Table2 },
];

/** Chart/table toggle of one widget: pressed buttons in a labelled group. */
function ViewToggle({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: ViewOption[];
  value: WidgetView;
  onChange(view: WidgetView): void;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex items-center gap-1">
      {options.map(({ view, label: optionLabel, icon: Icon }) => (
        <Button
          key={view}
          type="button"
          size="sm"
          variant={value === view ? "secondary" : "ghost"}
          aria-pressed={value === view}
          onClick={() => onChange(view)}
        >
          <Icon aria-hidden="true" />
          {optionLabel}
        </Button>
      ))}
    </div>
  );
}

function hasAdminValues(admin: ProjectAdminValue | undefined): admin is ProjectAdminValue {
  return Boolean(admin && (admin.clientId || admin.origin || admin.originStaffId));
}

/**
 * Sets (or removes) one search param of the current URL with
 * `history.replaceState`: the App Router mirrors it into `useSearchParams`
 * without a server render.
 */
function replaceSearchParam(pathname: string, key: string, value: string | null): void {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  if (value) params.set(key, value);
  else params.delete(key);
  const search = params.toString();
  window.history.replaceState(window.history.state, "", `${pathname}${search ? `?${search}` : ""}${window.location.hash}`);
}

type UpdateVars = { id: string; patch: Partial<ProjectInput> };

/**
 * /proyectos in three styles (redesign FE §3.5, §4.6): `ListPage` with
 * `spec.kind = "cards"` (`EntityCardGrid`: Visual cards with tinted head,
 * ring, tramo step bar and team; Esencial text cards / list; Analítico
 * portfolio table with totals) plus "Proyectos por tramo" (strip in Visual,
 * summary line or table in the other styles). Reads `qk.proyectos.list()`
 * (prefetched by the page). The search lives in `?q=` (written with
 * `history.replaceState` after a short debounce, so it survives opening a
 * project and going back); "Nuevo proyecto" and `?nuevo=1` open
 * `NewProjectDialog`, whose admin options load only while it is open.
 *
 * Dashboard interactions (`useProyectosDashboard`, zustand.md §2.5): a tramo
 * segment filters the cards and the table to that tramo (session only; it
 * clears when the tramo has no listed project), the strip can be collapsed,
 * and the strip and the portfolio each have a per-style chart/table
 * override. A widget gets a `view` only when the user's pick differs from
 * what its style shows by default, so without a pick the page renders as
 * before. None of it reaches the server.
 */
export function ProjectsPortfolio() {
  const { data } = useSuspenseQuery(proyectosPageOptions());
  const { projects, portfolio, tramos, canSeeAdminData, canCreateProject, presaleAutoStart } = data;

  const router = useRouter();
  const pathname = usePathname() ?? "/proyectos";
  const searchParams = useSearchParams();
  // The local draft filters right away; the URL follows after the debounce.
  const [query, setQuery] = useState(() => searchParams?.get(SEARCH_PARAM) ?? "");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  // Set once a create navigates away, so closing the dialog doesn't touch the URL of that navigation.
  const navigating = useRef(false);

  useEffect(
    () => () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    },
    [],
  );

  const wantsNew = searchParams?.get(NEW_PROJECT_PARAM) === "1";
  // `?nuevo=1` opens the dialog; closing it hides it right away, before the URL drops the param.
  const [newDismissed, setNewDismissed] = useState(false);
  const [prevWantsNew, setPrevWantsNew] = useState(wantsNew);
  if (wantsNew !== prevWantsNew) {
    setPrevWantsNew(wantsNew);
    if (wantsNew) setNewDismissed(false);
  }
  const open = canCreateProject && (dialogOpen || (wantsNew && !newDismissed));

  // Admin create options: lazy catalog queries, only for admins and only while the dialog is open.
  const loadAdminOptions = open && canSeeAdminData;
  const clientsQuery = useQuery({ ...catalogOptions.contacts("cliente"), enabled: loadAdminOptions });
  const staffQuery = useQuery({ ...catalogOptions.staff(), enabled: loadAdminOptions });
  const adminOptions = useMemo<ProjectCreateAdminOptions | null>(
    () =>
      canSeeAdminData
        ? {
            clients: (clientsQuery.data ?? []).map((c) => ({ id: c.id, name: c.name })),
            staff: (staffQuery.data ?? []).map((s) => ({ id: s.id, name: s.name })),
          }
        : null,
    [canSeeAdminData, clientsQuery.data, staffQuery.data],
  );

  // The dialog shows create errors inline (its own copy), so the mutation shows no toast.
  const createProject = useActionMutation(submitProjectCreateAction, {
    invalidate: [qk.proyectos.list(), qk.catalog.projectOptions(), qk.inicio()],
    onFormError: () => undefined,
  });
  const updateProject = useActionMutation(({ id, patch }: UpdateVars) => updateProjectAction(id, patch), {
    invalidate: ({ id, patch }) => [
      qk.proyectos.detail(id),
      qk.proyectos.list(),
      qk.catalog.projectOptions(),
      qk.inicio(),
      // A client set on the new project changes its Clientes tab.
      ...(patch.clientId ? [qk.proyectos.tab(id, "clientes")] : []),
    ],
    errorContext: { entity: "project" },
    // The project exists; the client and origin can be set from the ficha.
    onFormError: (text) => toast.error(`Proyecto creado, pero no se guardaron el cliente y el origen. ${text}`),
  });

  // Dashboard UI state: one primitive selector per value, the actions as one shallow bundle; the
  // per-style views come from the store's hook, so the page never reads the style.
  const selectedTramo = useProyectosDashboard(selectSelectedTramo);
  const stripCollapsed = useProyectosDashboard(selectTramoStripCollapsed);
  const [toggleKpi, selectKpi, toggleCollapsed] = useProyectosDashboard(
    useShallow((s) => [s.toggleKpi, s.selectKpi, s.toggleCollapsed] as const),
  );
  const stripView = useProyectosWidgetView("tramoStrip");
  const portfolioView = useProyectosWidgetView("portfolio");
  const stripId = useId();

  const listed = useMemo(() => listedProjects(projects), [projects]);
  // The selection applies only while its tramo still has listed projects.
  const tramoMembers = useMemo(
    () => (selectedTramo === null ? [] : filterByTramo(listed, selectedTramo)),
    [listed, selectedTramo],
  );
  const tramoListed = tramoMembers.length > 0;
  const activeTramo = tramoListed ? selectedTramo : null;
  const activeTramoLabel = tramoListed ? (currentTramoOf(tramoMembers[0])?.name ?? NO_TRAMO_LABEL) : null;
  useEffect(() => {
    if (selectedTramo !== null && !tramoListed) selectKpi(null);
  }, [selectedTramo, tramoListed, selectKpi]);

  const visible = useMemo(() => searchProjects(listed, query), [listed, query]);
  const shown = useMemo(() => filterByTramo(visible, activeTramo), [visible, activeTramo]);
  const rows = useMemo(() => portfolioById(portfolio), [portfolio]);
  const tramoOrder = useMemo(() => orderedTramos(listed, tramos), [listed, tramos]);
  const byId = useMemo(() => new Map(shown.map((p) => [p.id, p])), [shown]);

  const items = useMemo(() => buildProjectCards(shown, rows), [shown, rows]);
  const table = useMemo(() => buildPortfolioTable(shown, rows, { canSeeAdminData }), [shown, rows, canSeeAdminData]);
  // The strip keeps every tramo of the search, so another segment can be picked.
  const segments = useMemo(() => buildTramoSegments(visible, rows, tramoOrder), [visible, rows, tramoOrder]);

  function handleSearch(value: string) {
    setQuery(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      searchTimer.current = null;
      replaceSearchParam(pathname, SEARCH_PARAM, value.trim() || null);
    }, SEARCH_DEBOUNCE_MS);
  }

  function openDialog() {
    setDialogOpen(true);
  }

  function handleOpenChange(next: boolean) {
    setDialogOpen(next);
    if (!next && wantsNew) setNewDismissed(true);
    // Dropping `?nuevo` is a URL change only: no server render.
    if (!next && wantsNew && !navigating.current) replaceSearchParam(pathname, NEW_PROJECT_PARAM, null);
  }

  async function handleCreate(input: ProjectCreateInput, admin?: ProjectAdminValue) {
    let result: Awaited<ReturnType<typeof createProject.mutateAsync>>;
    try {
      // An `{ ok: false, error }` result is thrown as `Error(error)` by the mutation.
      result = await createProject.mutateAsync(input);
    } catch (err) {
      // The dialog maps the code to copy (FE §9); a production-stripped message gets the generic copy.
      throw isStrippedActionError(err) ? new Error("") : err;
    }
    const id = result.project.id;
    if (canSeeAdminData && hasAdminValues(admin)) {
      try {
        await updateProject.mutateAsync({ id, patch: admin });
      } catch {
        // The error toast is shown by the mutation; the ficha has the fields.
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
      : visible.length > 0 && activeTramo
        ? {
            title: "Sin resultados",
            description: `Ningún proyecto de «${activeTramoLabel}» coincide con «${query.trim()}».`,
            action: { label: CLEAR_TRAMO_LABEL, onClick: () => selectKpi(null) },
          }
        : { title: "Sin resultados", description: `Ningún proyecto coincide con «${query.trim()}».` };

  return (
    <>
      <ListPage
        header={{
          title: PROJECTS_TITLE,
          // With a tramo selected the count is the filtered list's.
          description: projectsDescription(activeTramo ? shown.length : listed.length),
          actions:
            listed.length > 0 || canCreateProject ? (
              <>
                {listed.length > 0 ? (
                  <ViewToggle
                    label={PORTFOLIO_VIEW_LABEL}
                    options={PORTFOLIO_VIEWS}
                    value={portfolioView.view}
                    onChange={portfolioView.setView}
                  />
                ) : null}
                {canCreateProject ? (
                  <Button type="button" onClick={openDialog}>
                    <Plus aria-hidden="true" />
                    {NEW_PROJECT_LABEL}
                  </Button>
                ) : null}
              </>
            ) : undefined,
        }}
        filters={
          listed.length > 0 ? (
            <div className="flex flex-col gap-4">
              <FiltersBar search={{ value: query, placeholder: SEARCH_PLACEHOLDER, onChange: handleSearch }} />
              {visible.length > 0 ? (
                <div className="flex flex-col gap-2" data-slot="tramo-strip">
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {stripCollapsed ? (
                      <span className="mr-auto text-[13px] font-medium text-muted-foreground">{PROJECTS_BY_TRAMO_TITLE}</span>
                    ) : (
                      <ViewToggle
                        label={STRIP_VIEW_LABEL}
                        options={STRIP_VIEWS}
                        value={stripView.view}
                        onChange={stripView.setView}
                      />
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-expanded={!stripCollapsed}
                      aria-controls={stripId}
                      aria-label={stripCollapsed ? EXPAND_STRIP_LABEL : COLLAPSE_STRIP_LABEL}
                      title={stripCollapsed ? EXPAND_STRIP_LABEL : COLLAPSE_STRIP_LABEL}
                      onClick={() => toggleCollapsed("tramoStrip")}
                    >
                      {stripCollapsed ? <ChevronDown aria-hidden="true" /> : <ChevronUp aria-hidden="true" />}
                    </Button>
                  </div>
                  <div id={stripId} hidden={stripCollapsed}>
                    {stripCollapsed ? null : (
                      <DistributionStripWidget
                        title={PROJECTS_BY_TRAMO_TITLE}
                        segments={segments}
                        totalLabel="Proyectos"
                        extraColumns={TRAMO_EXTRA_COLUMNS}
                        selectedKey={activeTramo}
                        onSelect={toggleKpi}
                        view={stripView.override}
                      />
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          ) : undefined
        }
        spec={{ kind: "cards", items, table, footer, view: portfolioView.override }}
        empty={empty}
      />
      {canCreateProject ? (
        <NewProjectDialog
          open={open}
          onOpenChange={handleOpenChange}
          onConfirm={handleCreate}
          presaleAutoStart={presaleAutoStart}
          adminOptions={adminOptions}
        />
      ) : null}
    </>
  );
}
