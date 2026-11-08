import { notFound, redirect } from "next/navigation";

import { AsistentePageClient, type AsistentePageThread } from "@/components/asistente/AsistentePageClient";
import { fetchAssistantThreadAction, fetchAssistantThreadsAction } from "@/lib/actions/assistant-actions";
import { assistantThreadsReady } from "@/lib/assistant/threads-ready";
import { getSession } from "@/lib/auth/session";

type AsistentePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * `/asistente` (redesign FE §3.9): the full page with server history and the
 * Herramientas panel, inside `AppShell`. 404 while any assistant thread
 * action is still a stub (FE §9 stubs rule; its nav item is hidden too).
 */
export default async function AsistentePage({ searchParams }: AsistentePageProps = {}) {
  const session = await getSession();
  if (!session) redirect("/login");

  if (!assistantThreadsReady()) notFound();

  const params = (await searchParams) ?? {};
  const requested = typeof params.thread === "string" && params.thread.trim() !== "" ? params.thread.trim() : null;

  const [threads, initialThread] = await Promise.all([
    fetchAssistantThreadsAction(),
    requested ? loadThread(requested) : Promise.resolve(null),
  ]);

  return (
    <AsistentePageClient
      threads={threads}
      initialThread={initialThread}
      missingThread={requested !== null && initialThread === null}
    />
  );
}

async function loadThread(id: string): Promise<AsistentePageThread | null> {
  try {
    const { thread, messages } = await fetchAssistantThreadAction(id);
    return { id: thread.id, title: thread.title, messages };
  } catch {
    return null;
  }
}
