/**
 * Personas · Clientes / Contratistas / Proveedores (redesign FE §3.6): the
 * pure data side of the external directory tabs. The Personas loader
 * (`lib/loaders/personas.ts`) reads each tab's own contact types in SQL and
 * sanitizes the rows with `toPersonasContact` (origin only for
 * `canSeeAdminData`), and the client builds the `ListPage` spec from the
 * result with the helpers below. Client-safe: no server imports.
 */
import type { ContactListItem, ContactType, ProviderStatus, ProviderSubtype } from "@/lib/types/core";
import type { PresentationStyle } from "@/lib/types/redesign";
import type { EntityCard, RecordColumn, RecordTableData, Tone } from "@/lib/types/widgets";

export type PersonasContactsTab = "clientes" | "contratistas" | "proveedores";

/** Sub-filter chips of the Proveedores tab (`?tipo=`). */
export type ProveedoresSubfilter = "colaboradores" | "contratistas" | "tiendas";

export const PROVEEDORES_SUBFILTERS: ProveedoresSubfilter[] = ["colaboradores", "contratistas", "tiendas"];

const SUBFILTER_SUBTYPE: Record<ProveedoresSubfilter, ProviderSubtype> = {
  colaboradores: "colaborador",
  contratistas: "contratista",
  tiendas: "tienda",
};

const SUBFILTER_LABEL: Record<ProveedoresSubfilter, string> = {
  colaboradores: "Colaboradores",
  contratistas: "Contratistas",
  tiendas: "Tiendas",
};

export const PROVIDER_SUBTYPE_LABEL: Record<ProviderSubtype, string> = {
  contratista: "Contratista",
  colaborador: "Colaborador",
  tienda: "Tienda",
};

const PROVIDER_STATUS_LABEL: Record<ProviderStatus, string> = {
  activo: "Activo",
  inactivo: "Inactivo",
  pausado: "Pausado",
  prospecto: "Prospecto",
  lista_negra: "Lista negra",
};

const PROVIDER_STATUS_TONE: Record<ProviderStatus, Tone> = {
  activo: "ok",
  inactivo: "default",
  pausado: "warn",
  prospecto: "default",
  lista_negra: "critical",
};

export const PERSONAS_CONTACTS_PATH: Record<PersonasContactsTab, string> = {
  clientes: "/personas/clientes",
  contratistas: "/personas/contratistas",
  proveedores: "/personas/proveedores",
};

/** Empty state per tab (FE §3.6): "Aún no hay {…}" + "Agregar". */
export const PERSONAS_EMPTY_TITLE: Record<PersonasContactsTab, string> = {
  clientes: "Aún no hay clientes",
  contratistas: "Aún no hay contratistas",
  proveedores: "Aún no hay proveedores",
};

/**
 * Supplier activity a contact may carry (Analítico only). Nothing records
 * quotes or delivery times yet, so the columns stay omitted until a source
 * fills these fields.
 */
export type ContactSupplyStats = {
  /** Quotes received in the last 90 days. */
  quotes90d?: number | null;
  /** Average delivery time in days. */
  leadTimeDays?: number | null;
};

/** What the Personas contact tabs receive: serializable, already filtered by the server. */
export type PersonasContact = {
  id: string;
  type: ContactType;
  kind: ContactListItem["kind"];
  name: string;
  phone: string | null;
  email: string | null;
  location: string | null;
  /** Acquisition channel; null unless the viewer passes `canSeeAdminData`. */
  origin: string | null;
  primaryPerson: string | null;
  createdAt: string;
  updatedAt: string;
  provider: {
    subtype: ProviderSubtype;
    status: ProviderStatus | null;
    specialty: string | null;
    rating: number | null;
    priceLevel: string | null;
    availability: string | null;
  } | null;
  quotes90d: number | null;
  leadTimeDays: number | null;
};

/** Server-side projection: drops admin-only origin data for non-admins. */
export function toPersonasContact(
  contact: ContactListItem & ContactSupplyStats,
  viewer: { canSeeAdminData: boolean },
): PersonasContact {
  const provider = contact.providerProfile;
  return {
    id: contact.id,
    type: contact.type,
    kind: contact.kind,
    name: contact.name,
    phone: contact.primaryPerson?.phone ?? contact.phone ?? null,
    email: contact.primaryPerson?.email ?? contact.email ?? null,
    location: contact.location ?? null,
    origin: viewer.canSeeAdminData ? (contact.acquisitionChannel ?? null) : null,
    primaryPerson: contact.primaryPerson?.name ?? null,
    createdAt: contact.createdAt,
    updatedAt: contact.updatedAt,
    provider: provider
      ? {
          subtype: provider.subtype,
          status: provider.status,
          specialty: provider.mainSpecialty,
          rating: provider.rating,
          priceLevel: provider.priceLevel,
          availability: provider.availability,
        }
      : null,
    quotes90d: typeof contact.quotes90d === "number" ? contact.quotes90d : null,
    leadTimeDays: typeof contact.leadTimeDays === "number" ? contact.leadTimeDays : null,
  };
}

/** Reads `?tipo=` into a known sub-filter, or null ("Todos"). */
export function parseProveedoresSubfilter(value: string | string[] | undefined | null): ProveedoresSubfilter | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return PROVEEDORES_SUBFILTERS.includes(raw as ProveedoresSubfilter) ? (raw as ProveedoresSubfilter) : null;
}

function isTabMember(contact: PersonasContact, tab: PersonasContactsTab): boolean {
  if (tab === "clientes") return contact.type === "cliente";
  if (contact.type !== "proveedor") return false;
  if (tab === "contratistas") return contact.provider?.subtype === "contratista";
  return true;
}

/** The contacts one tab lists (Proveedores narrowed by its sub-filter and the search text). */
export function contactsForTab(
  contacts: PersonasContact[],
  tab: PersonasContactsTab,
  options: { subfilter?: ProveedoresSubfilter | null; search?: string } = {},
): PersonasContact[] {
  const subtype = tab === "proveedores" && options.subfilter ? SUBFILTER_SUBTYPE[options.subfilter] : null;
  const query = normalize(options.search ?? "");
  return contacts
    .filter((c) => isTabMember(c, tab))
    .filter((c) => !subtype || c.provider?.subtype === subtype)
    .filter((c) => !query || matchesSearch(c, query));
}

/** Chips of the Proveedores filters row: Todos + Colaboradores / Contratistas / Tiendas, as links. */
export function proveedoresChips(
  contacts: PersonasContact[],
  active: ProveedoresSubfilter | null,
  estilo: PresentationStyle | null = null,
): { key: string; label: string; count: number; pressed: boolean; href: string }[] {
  const providers = contacts.filter((c) => isTabMember(c, "proveedores"));
  return [
    { key: "todos", label: "Todos", count: providers.length, pressed: active === null, href: tabHref("proveedores", { estilo }) },
    ...PROVEEDORES_SUBFILTERS.map((key) => ({
      key,
      label: SUBFILTER_LABEL[key],
      count: providers.filter((c) => c.provider?.subtype === SUBFILTER_SUBTYPE[key]).length,
      pressed: active === key,
      href: tabHref("proveedores", { subfilter: key, estilo }),
    })),
  ];
}

export type PersonasHrefOptions = { subfilter?: ProveedoresSubfilter | null; estilo?: PresentationStyle | null };

function tabHref(tab: PersonasContactsTab, options: PersonasHrefOptions & { contacto?: string }): string {
  const params = new URLSearchParams();
  if (tab === "proveedores" && options.subfilter) params.set("tipo", options.subfilter);
  if (options.estilo) params.set("estilo", options.estilo);
  if (options.contacto) params.set("contacto", options.contacto);
  const qs = params.toString();
  return qs ? `${PERSONAS_CONTACTS_PATH[tab]}?${qs}` : PERSONAS_CONTACTS_PATH[tab];
}

/** Link that opens the contact's sheet on the current tab (`?contacto=<id>`), keeping the sub-filter and `?estilo=`. */
export function contactSheetHref(tab: PersonasContactsTab, id: string, options: PersonasHrefOptions = {}): string {
  return tabHref(tab, { ...options, contacto: id });
}

const ANALITICO_ONLY: RecordColumn["hideOn"] = ["visual", "esencial"];

function supplyColumns(rows: PersonasContact[]): RecordColumn[] {
  const columns: RecordColumn[] = [];
  if (rows.some((r) => r.quotes90d !== null)) {
    columns.push({ key: "quotes90d", label: "Cotizaciones 90 d", align: "right", mono: true, format: "count", hideOn: ANALITICO_ONLY });
  }
  if (rows.some((r) => r.leadTimeDays !== null)) {
    columns.push({ key: "leadTimeDays", label: "Tiempo de entrega", align: "right", mono: true, format: "days", hideOn: ANALITICO_ONLY });
  }
  return columns;
}

function providerRow(c: PersonasContact): Record<string, unknown> {
  return {
    id: c.id,
    name: c.name,
    subtype: c.provider ? PROVIDER_SUBTYPE_LABEL[c.provider.subtype] : "",
    specialty: c.provider?.specialty ?? "",
    status: c.provider?.status ? PROVIDER_STATUS_LABEL[c.provider.status] : "",
    rating: c.provider?.rating ?? null,
    contact: c.phone ?? c.email ?? "",
    priceLevel: c.provider?.priceLevel ?? "",
    availability: c.provider?.availability ?? "",
    quotes90d: c.quotes90d,
    leadTimeDays: c.leadTimeDays,
    updatedAt: c.updatedAt,
  };
}

/**
 * The tab's table (FE §3.6, frames `Personas{Clientes,Contratistas,Proveedores}*`):
 * Analítico-only columns carry `hideOn`; the "Origen" column exists only when
 * the server sent origin data, and the supply columns only when any row has it.
 */
export function personasContactsTable(tab: PersonasContactsTab, rows: PersonasContact[]): RecordTableData {
  if (tab === "clientes") {
    const columns: RecordColumn[] = [
      { key: "name", label: "Cliente" },
      { key: "kind", label: "Tipo" },
      { key: "primaryPerson", label: "Contacto principal", hideOn: ["visual"] },
      { key: "contact", label: "Contacto" },
      { key: "location", label: "Ubicación", hideOn: ["esencial"] },
    ];
    if (rows.some((r) => r.origin !== null)) {
      columns.push({ key: "origin", label: "Origen", hideOn: ANALITICO_ONLY });
    }
    columns.push(
      { key: "createdAt", label: "Alta", format: "date", mono: true, hideOn: ANALITICO_ONLY },
      { key: "updatedAt", label: "Última actualización", format: "date", mono: true, hideOn: ["esencial"] },
    );
    return {
      columns,
      rows: rows.map((c) => ({
        id: c.id,
        name: c.name,
        kind: c.kind === "empresa" ? "Empresa" : "Particular",
        primaryPerson: c.primaryPerson ?? "",
        contact: c.phone ?? c.email ?? "",
        location: c.location ?? "",
        origin: c.origin ?? "",
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
    };
  }

  const columns: RecordColumn[] = [
    { key: "name", label: tab === "contratistas" ? "Contratista" : "Proveedor" },
  ];
  if (tab === "proveedores") columns.push({ key: "subtype", label: "Tipo" });
  columns.push(
    { key: "specialty", label: tab === "contratistas" ? "Especialidad" : "Categoría" },
    { key: "status", label: "Estado" },
    { key: "rating", label: "Calificación", align: "right", mono: true, format: "count" },
    { key: "contact", label: "Contacto", hideOn: ["analitico"] },
    { key: "priceLevel", label: "Nivel de precio", hideOn: ANALITICO_ONLY },
    { key: "availability", label: "Disponibilidad", hideOn: ["visual"] },
    ...supplyColumns(rows),
    { key: "updatedAt", label: "Última actualización", format: "date", mono: true, hideOn: ANALITICO_ONLY },
  );
  return { columns, rows: rows.map(providerRow) };
}

/** Contratistas cards (Visual): name, specialty, status badge, rating and contact meta. */
export function contratistasCards(rows: PersonasContact[], options: PersonasHrefOptions = {}): EntityCard[] {
  return rows.map((c) => {
    const meta: { label: string; value: string }[] = [];
    if (c.provider?.rating) meta.push({ label: "Calificación", value: `${c.provider.rating} de 5` });
    if (c.phone ?? c.email) meta.push({ label: "Contacto", value: (c.phone ?? c.email) as string });
    if (c.provider?.availability) meta.push({ label: "Disponibilidad", value: c.provider.availability });
    return {
      id: c.id,
      title: c.name,
      subtitle: c.provider?.specialty ?? "Contratista",
      href: contactSheetHref("contratistas", c.id, options),
      iconName: "HardHat",
      badges: c.provider?.status
        ? [{ label: PROVIDER_STATUS_LABEL[c.provider.status], tone: PROVIDER_STATUS_TONE[c.provider.status] }]
        : [],
      meta,
    };
  });
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function matchesSearch(c: PersonasContact, query: string): boolean {
  return [c.name, c.primaryPerson, c.email, c.phone, c.location, c.provider?.specialty]
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .some((v) => normalize(v).includes(query));
}
