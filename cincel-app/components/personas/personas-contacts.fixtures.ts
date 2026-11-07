import type { PersonasContact } from "@/lib/personas/contacts";
import type { ProviderSubtype } from "@/lib/types/core";

function base(id: string, name: string, overrides: Partial<PersonasContact> = {}): PersonasContact {
  return {
    id,
    type: "cliente",
    kind: "particular",
    name,
    phone: "55 1234 5678",
    email: `${id}@ejemplo.mx`,
    location: "Ciudad de México",
    origin: null,
    primaryPerson: null,
    createdAt: "2026-09-01T12:00:00.000Z",
    updatedAt: "2026-11-02T12:00:00.000Z",
    provider: null,
    quotes90d: null,
    leadTimeDays: null,
    ...overrides,
  };
}

function provider(id: string, name: string, subtype: ProviderSubtype, specialty: string): PersonasContact {
  return base(id, name, {
    type: "proveedor",
    kind: "empresa",
    provider: {
      subtype,
      status: "activo",
      specialty,
      rating: 4,
      priceLevel: "Medio",
      availability: "Inmediata",
    },
  });
}

/** Two clients, one socio, two contratistas, one colaborador and one tienda. */
export function personasContactsFixture(): PersonasContact[] {
  return [
    base("c-platzi", "Cliente Platzi", { kind: "empresa", primaryPerson: "Laura Méndez" }),
    base("c-lomas", "Cliente Lomas"),
    base("s-socio", "Socio Arquitectos", { type: "socio" }),
    provider("p-herreria", "Herrería del Valle", "contratista", "Herrería"),
    provider("p-cancel", "Cancelería Moderna", "contratista", "Cancelería"),
    provider("p-render", "Estudio de Render", "colaborador", "Renders"),
    provider("p-pisos", "Proveedor de pisos A", "tienda", "Pisos"),
  ];
}

export const PERSONAS_COUNTS = { equipo: 5, clientes: 2, contratistas: 2, proveedores: 4 };
