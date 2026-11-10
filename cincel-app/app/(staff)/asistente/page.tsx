import { notFound, redirect } from "next/navigation";

import { AsistentePageClient } from "@/components/asistente/AsistentePageClient";
import { assistantThreadsReady } from "@/lib/assistant/threads-ready";
import { getSession, requireCapabilityUser } from "@/lib/auth/session";
import { loadAsistentePageData } from "@/lib/loaders/asistente";
import { Hydrate } from "@/lib/query/hydrate";
import { asistenteThreadOptions, asistenteThreadsOptions } from "@/lib/query/options/asistente";
import { getQueryClient } from "@/lib/query/server";
import { UuidSchema } from "@/lib/validation/project-flow";

type AsistentePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * `/asistente` (redesign FE §3.9): the full page with server history, one
 * layout per presentation style, inside `AppShell`. 404 while any assistant thread
 * action is still a stub (FE §9 stubs rule; its nav item is hidden too).
 *
 * One page-data load (Query Migration Phase 10, #944) seeds
 * `asistente.threads()` and, for `?thread=`, `asistente.thread(id)`. Only the
 * caller's own threads are loaded: the dehydrated state is public HTML.
 * Switching threads later reads the cache, never this page again.
 */
export default async function AsistentePage({ searchParams }: AsistentePageProps = {}) {
  const session = await getSession();
  if (!session) redirect("/login");

  if (!assistantThreadsReady()) notFound();

  const params = (await searchParams) ?? {};
  const raw = typeof params.thread === "string" ? params.thread.trim() : "";
  const requested = raw === "" ? null : raw;
  // A `?thread=` that isn't a uuid can't name a thread: missing, without a read.
  const threadId = requested && UuidSchema.safeParse(requested).success ? requested.toLowerCase() : null;

  // `?proyecto=<id>` prefills the project chip; the client drops it when the project isn't visible.
  const rawProject = typeof params.proyecto === "string" ? params.proyecto.trim() : "";
  const projectId = rawProject && UuidSchema.safeParse(rawProject).success ? rawProject.toLowerCase() : null;

  const user = await requireCapabilityUser();
  const data = await loadAsistentePageData(user, { threadId });

  const qc = getQueryClient();
  qc.setQueryData(asistenteThreadsOptions().queryKey, data.threads);
  if (data.initialThread) qc.setQueryData(asistenteThreadOptions(data.initialThread.id).queryKey, data.initialThread);

  return (
    <Hydrate qc={qc}>
      <AsistentePageClient
        threadId={data.initialThread?.id ?? null}
        missingThread={requested !== null && data.initialThread === null}
        initialProjectId={projectId}
      />
    </Hydrate>
  );
}
