import type { ContactType } from "@/lib/types/enums";

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
