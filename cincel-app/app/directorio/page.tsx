import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { fetchClientsAction } from "@/lib/actions/clients-actions";
import {
  fetchColaboradoresAction,
  fetchContractorsAction,
  fetchTiendasAction,
} from "@/lib/actions/providers-actions";
import type { ManualClient } from "@/lib/repositories/clients-repository";
import type { Colaborador, Contractor, Tienda } from "@/lib/repositories/providers-repository";
import { DirectorioClient } from "./DirectorioClient";

export default async function DirectorioPage() {
  let clients: ManualClient[] = [];
  let contractors: Contractor[] = [];
  let colaboradores: Colaborador[] = [];
  let tiendas: Tienda[] = [];
  try {
    [clients, contractors, colaboradores, tiendas] = await Promise.all([
      fetchClientsAction(),
      fetchContractorsAction(),
      fetchColaboradoresAction(),
      fetchTiendasAction(),
    ]);
  } catch {
    // Not authorized / no session — the client falls back to hydrating itself.
  }

  return (
    <main className="flex min-h-screen bg-background text-foreground">
      <Sidebar />
      <section className="flex-1 overflow-y-auto p-10">
        <Header />
        <DirectorioClient
          initialClients={clients}
          initialContractors={contractors}
          initialColaboradores={colaboradores}
          initialTiendas={tiendas}
        />
      </section>
    </main>
  );
}
