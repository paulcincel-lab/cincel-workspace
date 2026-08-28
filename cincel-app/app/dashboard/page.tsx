import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import InteractiveDashboard from "@/components/dashboard/InteractiveDashboard";
import { fetchProjectsAction } from "@/lib/actions/projects-actions";
import { fetchActivitiesAction } from "@/lib/actions/activities-actions";

export default async function Home() {
  let initialData;
  try {
    const [projects, presale, diseno, operativas] = await Promise.all([
      fetchProjectsAction(),
      fetchActivitiesAction("Presale"),
      fetchActivitiesAction("Diseño"),
      fetchActivitiesAction("Construcción"),
    ]);
    initialData = { projects, activities: { presale, diseno, operativas } };
  } catch {
    // Not authorized / no session — the client hydrates itself.
  }

  return (
    <main className="flex min-h-screen bg-slate-100">

      <Sidebar />

      <section className="flex-1 p-10 overflow-y-auto">

        <Header variant="profile" />

        <InteractiveDashboard initialData={initialData} />

      </section>

    </main>
  );
}
