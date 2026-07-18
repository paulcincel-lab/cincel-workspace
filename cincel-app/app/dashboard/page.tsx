import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import InteractiveDashboard from "@/components/dashboard/InteractiveDashboard";

export default function Home() {
  return (
    <main className="flex min-h-screen bg-slate-100">

      <Sidebar />

      <section className="flex-1 p-10 overflow-y-auto">

        <Header />

        <InteractiveDashboard />

      </section>

    </main>
  );
}