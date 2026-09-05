import type { ContactType } from "@/lib/types/enums";
import type { ManualClient } from "@/lib/repositories/clients-repository";
import type { Colaborador, Contractor, Tienda } from "@/lib/repositories/providers-repository";

/**
 * Unified Directorio row — normalizes ManualClient/Contractor/Colaborador/
 * Tienda (four differently-shaped types with their own free-text status
 * vocabularies, see lib/types/{contractor,colaborador,tienda}.ts and
 * lib/repositories/clients-repository.ts) into one shape for a single
 * ContactType-filtered table, per the "Directorio" redesign.
 */
export interface DirectorioRow {
  id: string;
  type: ContactType;
  name: string;
  contact: string;
  category: string;
  status: string;
  rating?: number;
}

/** Heuristic active/inactive read on the source types' free-text statuses. */
export function directorioStatusVariant(status: string): "outline" | "secondary" {
  return /activ/i.test(status) ? "outline" : "secondary";
}

/** Recovers the numeric source-record id from a DirectorioRow's prefixed id (e.g. "contratista-42" -> 42). */
export function directorioRowSourceId(row: Pick<DirectorioRow, "id">): number {
  return Number(row.id.slice(row.id.indexOf("-") + 1));
}

export interface DirectorioSourceData {
  clients: ManualClient[];
  contractors: Contractor[];
  colaboradores: Colaborador[];
  tiendas: Tienda[];
}

/** Normalizes the four source arrays into one Directorio table's rows. */
export function toDirectorioRows({
  clients,
  contractors,
  colaboradores,
  tiendas,
}: DirectorioSourceData): DirectorioRow[] {
  return [
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
}
