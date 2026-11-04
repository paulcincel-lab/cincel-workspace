import PortalProjectCard, { PORTAL_NO_PROJECTS_MESSAGE } from "@/components/portal/PortalProjectCard";
import { Card, CardContent } from "@/components/ui/shadcn/card";
import { listPortalProjects } from "@/lib/portal/queries";
import { requirePortalUser } from "@/lib/portal/session";

/** Portal landing page (FE §3.2): one card per project the signed-in client can see, or the empty state. */
export default async function PortalHomePage() {
  const user = await requirePortalUser();
  const projects = await listPortalProjects(user.id);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold tracking-tight">Mis proyectos</h1>
      {projects.length === 0 ? (
        <Card>
          <CardContent>
            <p className="text-sm text-muted-foreground">{PORTAL_NO_PROJECTS_MESSAGE}</p>
          </CardContent>
        </Card>
      ) : (
        <ul className="flex flex-col gap-4" aria-label="Proyectos">
          {projects.map((project) => (
            <li key={project.id}>
              <PortalProjectCard project={project} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
