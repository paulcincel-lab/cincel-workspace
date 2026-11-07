import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { fetchContactsAction } from "@/lib/actions/contacts-actions";
import type { ContactListItem } from "@/lib/types/core";
import { DirectorioClient } from "./DirectorioClient";

export default async function DirectorioPage() {
  let contacts: ContactListItem[] = [];
  try {
    contacts = await fetchContactsAction();
  } catch {
    // Not authorized / no session — the client falls back to hydrating itself.
  }

  return (
    <main className="flex min-h-screen bg-background text-foreground">
      <Sidebar />
      <section className="flex-1 overflow-y-auto p-10">
        <Header />
        <DirectorioClient initialContacts={contacts} />
      </section>
    </main>
  );
}
