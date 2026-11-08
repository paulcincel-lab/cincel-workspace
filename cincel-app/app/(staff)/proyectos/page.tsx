import { notFound } from "next/navigation";

import { ProjectsPortfolio } from "@/components/proyectos/ProjectsPortfolio";
import type { ProjectCreateAdminOptions } from "@/components/proyectos/project-create-form";
import { StyleProvider } from "@/components/shell/StyleProvider";
import { fetchContactsAction } from "@/lib/actions/contacts-actions";
import { fetchProjectsAction, fetchProjectsPortfolioAction } from "@/lib/actions/projects-actions";
import { IMPLEMENTED as PROJECTS_IMPLEMENTED } from "@/lib/actions/projects-actions.flags";
import { fetchStaffAction } from "@/lib/actions/staff-actions";
import { fetchWorkflowsAction } from "@/lib/actions/workflows-actions";
import { resolveProjectsCapabilities } from "@/lib/auth/permissions";
import { requireCapabilityUser } from "@/lib/auth/session";
import { canSeeAdminData, listTramos } from "@/lib/tramos/compat";
import type { ContactListItem, Staff, WorkflowRef } from "@/lib/types/core";
import type { PortfolioRow, PresentationStyle } from "@/lib/types/redesign";
import { getResolvedAppearance } from "@/lib/ui/preferences-server";

type SearchParams = Record<string, string | string[] | undefined>;

const STYLES: readonly PresentationStyle[] = ["visual", "esencial", "analitico"];

/** `?estilo=` overrides the style for this render only (FE §4.2). */
function estiloOverride(raw: SearchParams): PresentationStyle | null {
  const value = Array.isArray(raw.estilo) ? raw.estilo[0] : raw.estilo;
  return value && (STYLES as readonly string[]).includes(value) ? (value as PresentationStyle) : null;
}

type Workflows = Awaited<ReturnType<typeof fetchWorkflowsAction>>;

/** The create sheet says Presale starts on its own only while that setting is on. */
function presaleAutoStartOf(workflows: Workflows): boolean {
  return workflows.some((w) => w.key === "presale" && w.active && w.autoStart === "on_create");
}

function settled<T>(result: PromiseSettledResult<T>, fallback: T, label: string): T {
  if (result.status === "fulfilled") return result.value;
  console.error(`[proyectos] ${label}`, result.reason);
  return fallback;
}

/**
 * `/proyectos` (FE §3.5): the three-style portfolio. Projects + portfolio metrics
 * (while `fetchProjectsPortfolioAction` is implemented), the tramos, and for
 * admins the clients and staff of the dialog's admin fields. The `(staff)`
 * layout mounts `AppShell` around it.
 */
export default async function ProyectosPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [query, appearance] = await Promise.all([searchParams, getResolvedAppearance()]);
  const user = await requireCapabilityUser();
  const capabilities = resolveProjectsCapabilities(user);
  if (!capabilities.canViewProjects) notFound();
  const isAdmin = canSeeAdminData(user);

  const [projectsResult, portfolioResult, workflowsResult, tramosResult, contactsResult, staffResult] =
    await Promise.allSettled([
      fetchProjectsAction(),
      PROJECTS_IMPLEMENTED.fetchProjectsPortfolioAction ? fetchProjectsPortfolioAction() : Promise.resolve([] as PortfolioRow[]),
      fetchWorkflowsAction(),
      listTramos(),
      isAdmin ? fetchContactsAction({ type: "cliente" }) : Promise.resolve([] as ContactListItem[]),
      isAdmin ? fetchStaffAction() : Promise.resolve([] as Staff[]),
    ]);

  // Without the projects the page has nothing to show: the route's error state takes over.
  if (projectsResult.status === "rejected") throw projectsResult.reason;
  const projects = projectsResult.value;
  const portfolio = settled(portfolioResult, [] as PortfolioRow[], "portfolio");
  const workflows = settled(workflowsResult, [] as Workflows, "workflows");
  const fromCompat = settled(tramosResult, [] as WorkflowRef[], "tramos");
  const tramos: WorkflowRef[] =
    fromCompat.length > 0
      ? fromCompat
      : workflows
          .filter((w) => w.active)
          .map((w) => ({ id: w.id, key: w.key, name: w.name, sortOrder: w.sortOrder }))
          .sort((a, b) => a.sortOrder - b.sortOrder);

  const adminOptions: ProjectCreateAdminOptions | null = isAdmin
    ? {
        clients: settled(contactsResult, [] as ContactListItem[], "clients")
          .filter((c) => c.type === "cliente")
          .map((c) => ({ id: c.id, name: c.name })),
        staff: settled(staffResult, [] as Staff[], "staff")
          .filter((s) => s.active)
          .map((s) => ({ id: s.id, name: [s.name, s.lastName].filter(Boolean).join(" ") })),
      }
    : null;

  const override = estiloOverride(query);

  return (
    <StyleProvider style={override ?? appearance.style} scope="staff" isOverridden={override !== null}>
      <ProjectsPortfolio
        projects={projects}
        portfolio={portfolio}
        tramos={tramos}
        canSeeAdminData={isAdmin}
        canCreateProject={capabilities.canCreateProject}
        presaleAutoStart={presaleAutoStartOf(workflows)}
        adminOptions={adminOptions}
      />
    </StyleProvider>
  );
}
