import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { fetchClientsAction } from "@/lib/actions/clients-actions";
import {
  fetchColaboradoresAction,
  fetchContractorsAction,
  fetchTiendasAction,
} from "@/lib/actions/providers-actions";
import type { DirectorioRow } from "@/lib/directorio/types";
import { DirectorioV2Client } from "./DirectorioV2Client";

export default async function DirectorioV2Page() {
  let initialRows: DirectorioRow[] = [];
  try {
    const [clients, contractors, colaboradores, tiendas] = await Promise.all([
      fetchClientsAction(),
      fetchContractorsAction(),
      fetchColaboradoresAction(),
      fetchTiendasAction(),
    ]);

    initialRows = [
      ...clients.map(
        (c): DirectorioRow => ({
          id: `cliente-${c.id}`,
          type: "Cliente",
          name: c.name,
          contact: c.emails[0] ?? c.phone ?? "—",
          category: c.kind,
          status: c.hasActiveProject ? "Activo" : "Sin proyecto activo",
        })
      ),
      ...contractors.map(
        (c): DirectorioRow => ({
          id: `contratista-${c.id}`,
          type: "Contratista",
          name: c.provider,
          contact: c.contact ?? "—",
          category: c.mainSpecialty,
          status: c.status,
          rating: c.rating,
        })
      ),
      ...colaboradores.map(
        (c): DirectorioRow => ({
          id: `colaborador-${c.id}`,
          type: "Colaborador",
          name: c.name,
          contact: c.contact ?? c.email ?? "—",
          category: c.role,
          status: c.status,
          rating: c.rating,
        })
      ),
      ...tiendas.map(
        (t): DirectorioRow => ({
          id: `tienda-${t.id}`,
          type: "Tienda",
          name: t.name,
          contact: t.contact ?? "—",
          category: t.mainSpecialty ?? t.type,
          status: t.status,
          rating: t.rating,
        })
      ),
    ];
  } catch {
    // Not authorized / no session — the client renders an empty state.
  }

  return (
    <main className="flex min-h-screen bg-background text-foreground">
      <Sidebar />
      <section className="flex-1 overflow-y-auto p-10">
        <Header />
        <DirectorioV2Client initialRows={initialRows} />
      </section>
    </main>
  );
}
