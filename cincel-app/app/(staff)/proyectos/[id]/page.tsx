import Link from "next/link";
import { redirect } from "next/navigation";

import { ProjectSummary } from "@/components/proyectos/ProjectSummary";
import { ProjectTabs } from "@/components/proyectos/ProjectTabs";
import { StyleProvider } from "@/components/shell/StyleProvider";
import { buttonVariants } from "@/components/ui/shadcn/button";
import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { requireCapabilityUser } from "@/lib/auth/session";
import { loadProjectResumen } from "@/lib/proyectos/project-resumen";
import type { PresentationStyle } from "@/lib/types/redesign";
import { getResolvedAppearance } from "@/lib/ui/preferences-server";

const STYLES: readonly PresentationStyle[] = ["visual", "esencial", "analitico"];

/** `?estilo=visual|esencial|analitico` overrides the style for this render only (FE §4.2). */
function estiloOverride(value: string | string[] | undefined): PresentationStyle | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return STYLES.find((style) => style === raw) ?? null;
}

/** The signed-in staff member; null without a usable session. Redirects propagate. */
async function loadUser(): Promise<AuthenticatedUser | null> {
  try {
    return await requireCapabilityUser();
  } catch (error) {
    if (error instanceof Error && (error.message === "UNAUTHENTICATED" || error.message === "FORBIDDEN")) return null;
    throw error;
  }
}

function StateCard({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-6 text-card-foreground">
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="text-sm text-muted-foreground">{message}</p>
      <div>
        <Link href="/proyectos" className={buttonVariants({ variant: "outline" })}>
          Volver a proyectos
        </Link>
      </div>
    </div>
  );
}

/**
 * `/proyectos/<id>`. Flag off: opens the project's Ficha, exactly as before.
 * Flag on (redesign FE §2.3, §3.5): the project header + tabs and the Resumen
 * tab, inside the `AppShell` the staff layout mounts.
 */
export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ estilo?: string | string[] }>;
}) {
  const [{ id }, query, appearance] = await Promise.all([params, searchParams, getResolvedAppearance()]);
  if (!appearance.redesignEnabled) redirect(`/proyectos/${encodeURIComponent(id)}/ficha`);

  const user = await loadUser();
  if (!user) return <StateCard title="Sin permiso" message="Inicia sesión para ver el proyecto." />;

  const resumen = await loadProjectResumen(id, user);
  if (!resumen) return <StateCard title="Proyecto no encontrado" message="El proyecto no existe o ya no tienes acceso." />;

  const estilo = estiloOverride(query.estilo);
  return (
    <StyleProvider style={estilo ?? appearance.style} isOverridden={estilo !== null} scope="staff">
      <div className="flex flex-col gap-4">
        <ProjectTabs {...resumen.tabs} active="resumen" showEstilo />
        <ProjectSummary {...resumen.summary} />
      </div>
    </StyleProvider>
  );
}
