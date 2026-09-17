import type { ContactListItem, ContactType, ProviderStatus } from "@/lib/types/core";

/**
 * Unified Directorio row. The old model had four separate entity shapes
 * (ManualClient/Contractor/Colaborador/Tienda) normalized into one row here;
 * the new `core.contacts` model already unifies clientes/socios/proveedores
 * into one `Contact`, so this is now a straight projection of
 * `ContactListItem` instead of a four-way merge.
 */
export interface DirectorioRow {
  id: string;
  type: ContactType;
  name: string;
  contact: string;
  category: string;
  status: string;
  rating: number | null;
}

export const CONTACT_TYPE_LABEL: Record<ContactType, string> = {
  cliente: "Cliente",
  socio: "Socio",
  proveedor: "Proveedor",
};

export const PROVIDER_STATUS_LABEL: Record<ProviderStatus, string> = {
  activo: "Activo",
  inactivo: "Inactivo",
  pausado: "Pausado",
  prospecto: "Prospecto",
  lista_negra: "Lista negra",
};

/** Heuristic active/inactive read on the row's display status. */
export function directorioStatusVariant(status: string): "outline" | "secondary" {
  return /activ/i.test(status) ? "outline" : "secondary";
}

/** Projects the unified Contact list into the Directorio table's rows. */
export function toDirectorioRows(contacts: ContactListItem[]): DirectorioRow[] {
  return contacts.map((c) => {
    const provider = c.providerProfile;
    const category = provider
      ? (provider.mainSpecialty ?? provider.subtype)
      : c.kind === "empresa"
        ? "Empresa"
        : "Particular";
    return {
      id: c.id,
      type: c.type,
      name: c.name,
      contact: c.primaryPerson?.phone ?? c.primaryPerson?.email ?? c.phone ?? c.email ?? "—",
      category,
      status: provider?.status ? PROVIDER_STATUS_LABEL[provider.status] : "—",
      rating: provider?.rating ?? null,
    };
  });
}
