import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { fetchResourceLinksAction } from "@/lib/actions/resources-actions";
import { RecursosV2Client } from "./RecursosV2Client";

export default async function RecursosV2Page() {
  let initialLinks: Awaited<ReturnType<typeof fetchResourceLinksAction>> = [];
  try {
    initialLinks = await fetchResourceLinksAction();
  } catch {
    // Not authorized / no session — the client falls back to hydrating itself.
  }

  return (
    <main className="flex min-h-screen bg-background text-foreground">
      <Sidebar />
      <section className="flex-1 overflow-y-auto p-10">
        <Header />
        <RecursosV2Client initialLinks={initialLinks} />
      </section>
    </main>
  );
}
