import CronogramaView from "@/components/cronograma/cronograma-view";
import { ProjectTabs } from "@/components/proyectos/ProjectTabs";
import { EstiloSwitch } from "@/components/shell/EstiloSwitch";
import { StyleProvider } from "@/components/shell/StyleProvider";
import { fetchScheduleAction, type ScheduleViewData } from "@/lib/actions/schedule-actions";
import { requireCapabilityUser } from "@/lib/auth/session";
import { loadProjectTabShell } from "@/lib/projects/project-tab-shell";
import { getResolvedAppearance } from "@/lib/ui/preferences-server";
import { PresentationStyleSchema } from "@/lib/validation/redesign";

type CapabilityUser = Awaited<ReturnType<typeof requireCapabilityUser>>;

/** The signed-in staff member; null without a usable session. Redirects propagate. */
async function loadUser(): Promise<CapabilityUser | null> {
  try {
    return await requireCapabilityUser();
  } catch (error) {
    if (error instanceof Error && (error.message === "UNAUTHENTICATED" || error.message === "FORBIDDEN")) return null;
    throw error;
  }
}

export default async function CronogramaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ estilo?: string | string[] }>;
}) {
  const { id: projectId } = await params;

  let initialView: ScheduleViewData | null = null;
  try {
    initialView = await fetchScheduleAction(projectId);
  } catch {
    // Not authorized / no session — the client falls back to hydrating itself.
  }

  const appearance = await getResolvedAppearance();
  if (!appearance.redesignEnabled) {
    return <CronogramaView projectId={projectId} initialView={initialView} />;
  }

  // New shell (redesign FE §3.5): `AppShell` comes from the staff layout; the
  // page renders the project header + tabs and the Cronograma tab, whose three
  // styles live in `CronogramaWidget`.
  const { estilo: rawEstilo } = await searchParams;
  const estilo = PresentationStyleSchema.safeParse(Array.isArray(rawEstilo) ? rawEstilo[0] : rawEstilo);
  const user = await loadUser();
  const shell = user ? await loadProjectTabShell(projectId, user) : null;

  return (
    <StyleProvider style={estilo.success ? estilo.data : appearance.style} scope="staff" isOverridden={estilo.success}>
      <div className="flex flex-col gap-4">
        {shell ? (
          <ProjectTabs
            project={shell.project}
            active="cronograma"
            counts={shell.counts}
            canManagePortal={shell.canManagePortal}
          />
        ) : null}
        <div className="flex justify-end">
          <EstiloSwitch />
        </div>
        <CronogramaView
          projectId={projectId}
          initialView={initialView}
          layout="redesign"
          contractEnd={shell?.detail.endDate ?? null}
        />
      </div>
    </StyleProvider>
  );
}
