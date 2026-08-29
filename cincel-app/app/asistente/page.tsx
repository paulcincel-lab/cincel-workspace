import { redirect } from "next/navigation";

import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { AssistantChat } from "@/components/asistente/AssistantChat";
import { getSession } from "@/lib/auth/session";

export default async function AsistentePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <main className="flex min-h-screen bg-slate-100">
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
