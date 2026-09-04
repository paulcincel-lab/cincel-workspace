import { redirect } from "next/navigation";

import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { AssistantChat } from "@/components/asistente/AssistantChat";
import { getSession } from "@/lib/auth/session";

/**
 * Same AssistantChat engine as app/asistente/page.tsx — the redesign here is
 * a retheme (bg-blue-600 bubble → tokens, done in place in AssistantChat.tsx
 * and AssistantChartMessage.tsx since it's a pure color-token swap with no
 * behavior change) plus a bg-background shell, not a rewrite.
 */
export default async function AsistenteV2Page() {
  const session = await getSession();
  if (!session) redirect("/login");

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
