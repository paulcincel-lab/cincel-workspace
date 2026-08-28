import ClientesPageClient from "./ClientesPageClient";
import { fetchClientsAction } from "@/lib/actions/clients-actions";
import { fetchProjectsAction } from "@/lib/actions/projects-actions";

export default async function ClientesPage() {
  // Server-rendered initial data — no client-side fetch waterfall on first paint.
  let initialClients: Awaited<ReturnType<typeof fetchClientsAction>> = [];
  let initialProjects: Awaited<ReturnType<typeof fetchProjectsAction>> = [];
  try {
    [initialClients, initialProjects] = await Promise.all([
      fetchClientsAction(),
      fetchProjectsAction(),
    ]);
  } catch {
    // Not authorized / no session — the client falls back to hydrating itself.
  }

  return (
    <ClientesPageClient
      initialClients={initialClients}
      initialProjects={initialProjects}
    />
  );
}
