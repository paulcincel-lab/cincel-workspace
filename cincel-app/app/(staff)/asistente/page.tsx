import { redirect } from "next/navigation";

import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { AssistantChat } from "@/components/asistente/AssistantChat";
import { AsistentePageClient, type AsistentePageThread } from "@/components/asistente/AsistentePageClient";
import { fetchAssistantThreadAction, fetchAssistantThreadsAction } from "@/lib/actions/assistant-actions";
import { assistantThreadsReady } from "@/lib/assistant/threads-ready";
import { getSession } from "@/lib/auth/session";
import { getResolvedAppearance } from "@/lib/ui/preferences-server";

type AsistentePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * `/asistente` (redesign FE §2.3, §3.9). Exists in both worlds and never
 * redirects: with the redesign off it renders today's page (legacy shell and
 * the localStorage chat); with it on it renders inside `AppShell` as the full
 * page with server history and the Herramientas panel. While the assistant
 * thread actions are still stubs the new shell shows the current chat.
 */
export default async function AsistentePage({ searchParams }: AsistentePageProps = {}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const appearance = await getResolvedAppearance();

  if (!appearance.redesignEnabled) {
    return (
      <main className="flex min-h-screen bg-background text-foreground">
        <Sidebar />
        <section className="flex flex-1 flex-col overflow-hidden p-10">
          <Header />
          <div className="mt-4 flex min-h-0 flex-1 flex-col">
            <AssistantChat />
          </div>
        </section>
      </main>
    );
  }

  if (!assistantThreadsReady()) {
    return (
      <div className="flex min-h-0 flex-1 flex-col p-4 lg:px-7">
        <AssistantChat />
      </div>
    );
  }

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
