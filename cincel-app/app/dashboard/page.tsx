import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { fetchProjectsAction } from "@/lib/actions/projects-actions";
import { DashboardClient } from "./DashboardClient";

export default async function DashboardPage() {
  let initialProjects: Awaited<ReturnType<typeof fetchProjectsAction>> = [];
  try {
    initialProjects = await fetchProjectsAction();
  } catch {
    // Not authorized / no session — the client falls back to hydrating itself.
  }

  return (
    <main className="flex min-h-screen bg-background text-foreground">
      <Sidebar />
      <section className="flex-1 overflow-y-auto p-10">
        <Header variant="profile" />
        <DashboardClient initialProjects={initialProjects} />
      </section>
    </main>
  );
}
