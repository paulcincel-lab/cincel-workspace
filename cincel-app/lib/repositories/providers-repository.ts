import { getSupabaseClient } from "@/lib/supabase/client";
import { isSupabaseEnabled } from "@/lib/supabase/data-source";
import { SupabaseOperationError } from "@/lib/supabase/errors";
import { readStorage, writeStorage } from "@/lib/repositories/browser-state-repository";
import { contractors as baseContractors } from "@/lib/data/contractors";
import { colaboradores as baseColaboradores } from "@/lib/data/colaboradores";
import { tiendas as baseTiendas } from "@/lib/data/tiendas";
import type { Contractor } from "@/lib/types/contractor";
import type { Colaborador } from "@/lib/types/colaborador";
import type { Tienda } from "@/lib/types/tienda";

export type { Contractor, Colaborador, Tienda };

export const CONTRACTORS_STORAGE_KEY = "cincel.contractors.data.v2";
export const COLABORADORES_STORAGE_KEY = "cincel.colaboradores.data.v2";
export const TIENDAS_STORAGE_KEY = "cincel.tiendas.data.v2";

// ─────────────────────────────────────────────────────────────────────────────
// CONTRACTORS
// ─────────────────────────────────────────────────────────────────────────────

type SupabaseContractor = {
  id: string;
  legacy_id: number | null;
  company: string | null;
  provider: string;
  status: string | null;
  main_specialty: string | null;
  seniority: string | null;
  price_level: string | null;
  rating: number;
  web_page: string | null;
  contact: string | null;
  start_date: string | null;
  comments: string | null;
  core_contractor_categories: Array<{ category: string; sort_order: number }>;
};

function mapSupabaseContractor(row: SupabaseContractor): Contractor {
  const categories = row.core_contractor_categories
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((c) => c.category);

  return {
    id: row.legacy_id ?? 0,
    company: row.company ?? undefined,
    provider: row.provider,
    status: row.status ?? "Activo",
    categories,
    mainSpecialty: row.main_specialty ?? "",
    seniority: row.seniority ?? "",
    priceLevel: row.price_level ?? "",
    rating: row.rating,
    webPage: row.web_page ?? undefined,
    contact: row.contact ?? undefined,
    startDate: row.start_date ?? undefined,
    comments: row.comments ?? undefined,
  };
}

export function getContractorsSnapshot(): Contractor[] {
  if (typeof window === "undefined") return baseContractors;

  const stored = readStorage(CONTRACTORS_STORAGE_KEY);
  if (!stored) return baseContractors;

  try {
    const parsed = JSON.parse(stored) as Contractor[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : baseContractors;
  } catch {
    return baseContractors;
  }
}

export async function fetchContractors(): Promise<Contractor[]> {
  if (!isSupabaseEnabled()) return getContractorsSnapshot();

  const client = getSupabaseClient();
  if (!client) return getContractorsSnapshot();

  const { data, error } = await client
    .schema("core")
    .from("contractors")
    .select(
      `id, legacy_id, company, provider, status, main_specialty, seniority,
       price_level, rating, web_page, contact, start_date, comments,
       core_contractor_categories (category, sort_order)`
    )
    .is("deleted_at", null)
    .order("provider");

  if (error || !data) {
    throw new SupabaseOperationError(
      "fetchContractors",
      error?.message ?? "No se recibieron datos de core.contractors"
    );
  }

  const contractors = (data as unknown as SupabaseContractor[]).map(mapSupabaseContractor);

  return contractors;
}

export async function saveContractors(contractors: Contractor[]): Promise<void> {
  if (!isSupabaseEnabled()) {
    if (typeof window !== "undefined") {
      writeStorage(CONTRACTORS_STORAGE_KEY, JSON.stringify(contractors));
    }
    return;
  }

  const client = getSupabaseClient();

  if (!client) {
    if (typeof window !== "undefined") {
      writeStorage(CONTRACTORS_STORAGE_KEY, JSON.stringify(contractors));
    }
    return;
  }

  const rows = contractors.map((c) => ({
    legacy_id: c.id,
    company: c.company ?? null,
    provider: c.provider,
    status: c.status,
    main_specialty: c.mainSpecialty,
    seniority: c.seniority,
    price_level: c.priceLevel,
    rating: c.rating,
    web_page: c.webPage ?? null,
    contact: c.contact ?? null,
    start_date: c.startDate ?? null,
    comments: c.comments ?? null,
  }));

  const { error } = await client
    .schema("core")
    .from("contractors")
    .upsert(rows, { onConflict: "legacy_id" });

  if (error) {
    throw new SupabaseOperationError("saveContractors", error.message);
  }

}

// ─────────────────────────────────────────────────────────────────────────────
// COLABORADORES (proveedores externos)
// ─────────────────────────────────────────────────────────────────────────────

type SupabaseColaborador = {
  id: string;
  legacy_id: number | null;
  name: string;
  role: string | null;
  status: string | null;
  department: string | null;
  contact: string | null;
  email: string | null;
  seniority: string | null;
  price_level: string | null;
  availability: string | null;
  rating: number;
  start_date: string | null;
  comments: string | null;
  core_collaborator_categories: Array<{ category: string; sort_order: number }>;
  core_collaborator_skills: Array<{ skill: string; sort_order: number }>;
};

function mapSupabaseColaborador(row: SupabaseColaborador): Colaborador {
  const categories = row.core_collaborator_categories
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((c) => c.category);

  const skills = row.core_collaborator_skills
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((s) => s.skill);

  return {
    id: row.legacy_id ?? 0,
    name: row.name,
    role: row.role ?? "",
    status: row.status ?? "Activo",
    department: row.department ?? undefined,
    contact: row.contact ?? undefined,
    email: row.email ?? undefined,
    skills,
    categories,
    seniority: row.seniority ?? undefined,
    priceLevel: row.price_level ?? undefined,
    availability: row.availability ?? undefined,
    rating: row.rating,
    startDate: row.start_date ?? undefined,
    comments: row.comments ?? undefined,
  };
}

export function getColaboradoresSnapshot(): Colaborador[] {
  if (typeof window === "undefined") return baseColaboradores;

  const stored = readStorage(COLABORADORES_STORAGE_KEY);
  if (!stored) return baseColaboradores;

  try {
    const parsed = JSON.parse(stored) as Colaborador[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : baseColaboradores;
  } catch {
    return baseColaboradores;
  }
}

export async function fetchColaboradores(): Promise<Colaborador[]> {
  if (!isSupabaseEnabled()) return getColaboradoresSnapshot();

  const client = getSupabaseClient();
  if (!client) return getColaboradoresSnapshot();

  const { data, error } = await client
    .schema("core")
    .from("collaborator_providers")
    .select(
      `id, legacy_id, name, role, status, department, contact, email,
       seniority, price_level, availability, rating, start_date, comments,
       core_collaborator_categories (category, sort_order),
       core_collaborator_skills (skill, sort_order)`
    )
    .is("deleted_at", null)
    .order("name");

  if (error || !data) {
    throw new SupabaseOperationError(
      "fetchColaboradores",
      error?.message ?? "No se recibieron datos de core.collaborator_providers"
    );
  }

  const colaboradores = (data as unknown as SupabaseColaborador[]).map(mapSupabaseColaborador);

  return colaboradores;
}

export async function saveColaboradores(items: Colaborador[]): Promise<void> {
  if (!isSupabaseEnabled()) {
    if (typeof window !== "undefined") {
      writeStorage(COLABORADORES_STORAGE_KEY, JSON.stringify(items));
    }
    return;
  }

  const client = getSupabaseClient();

  if (!client) {
    if (typeof window !== "undefined") {
      writeStorage(COLABORADORES_STORAGE_KEY, JSON.stringify(items));
    }
    return;
  }

  const rows = items.map((c) => ({
    legacy_id: c.id,
    name: c.name,
    role: c.role,
    status: c.status,
    department: c.department ?? null,
    contact: c.contact ?? null,
    email: c.email ?? null,
    seniority: c.seniority ?? null,
    price_level: c.priceLevel ?? null,
    availability: c.availability ?? null,
    rating: c.rating,
    start_date: c.startDate ?? null,
    comments: c.comments ?? null,
  }));

  const { error } = await client
    .schema("core")
    .from("collaborator_providers")
    .upsert(rows, { onConflict: "legacy_id" });

  if (error) {
    throw new SupabaseOperationError("saveColaboradores", error.message);
  }

}

// ─────────────────────────────────────────────────────────────────────────────
// TIENDAS
// ─────────────────────────────────────────────────────────────────────────────

type SupabaseTienda = {
  id: string;
  legacy_id: number | null;
  name: string;
  company: string | null;
  status: string | null;
  store_type: string | null;
  main_specialty: string | null;
  location: string | null;
  contact: string | null;
  rating: number;
  price_level: string | null;
  start_date: string | null;
  comments: string | null;
  website: string | null;
  core_store_categories: Array<{ category: string }>;
};

function mapSupabaseTienda(row: SupabaseTienda): Tienda {
  const categories = row.core_store_categories.map((c) => c.category);

  return {
    id: row.legacy_id ?? 0,
    name: row.name,
    company: row.company ?? undefined,
    status: row.status ?? "Activa",
    type: row.store_type ?? "Física",
    mainSpecialty: row.main_specialty ?? undefined,
    categories,
    location: row.location ?? undefined,
    contact: row.contact ?? undefined,
    rating: row.rating,
    priceLevel: row.price_level ?? undefined,
    startDate: row.start_date ?? undefined,
    comments: row.comments ?? undefined,
    website: row.website ?? undefined,
  };
}

export function getTiendasSnapshot(): Tienda[] {
  if (typeof window === "undefined") return baseTiendas;

  const stored = readStorage(TIENDAS_STORAGE_KEY);
  if (!stored) return baseTiendas;

  try {
    const parsed = JSON.parse(stored) as Tienda[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : baseTiendas;
  } catch {
    return baseTiendas;
  }
}

export async function fetchTiendas(): Promise<Tienda[]> {
  if (!isSupabaseEnabled()) return getTiendasSnapshot();

  const client = getSupabaseClient();
  if (!client) return getTiendasSnapshot();

  const { data, error } = await client
    .schema("core")
    .from("stores")
    .select(
      `id, legacy_id, name, company, status, store_type, main_specialty,
       location, contact, rating, price_level, start_date, comments, website,
       core_store_categories (category)`
    )
    .is("deleted_at", null)
    .order("name");

  if (error || !data) {
    throw new SupabaseOperationError(
      "fetchTiendas",
      error?.message ?? "No se recibieron datos de core.stores"
    );
  }

  const tiendas = (data as unknown as SupabaseTienda[]).map(mapSupabaseTienda);

  return tiendas;
}

export async function saveTiendas(items: Tienda[]): Promise<void> {
  if (!isSupabaseEnabled()) {
    if (typeof window !== "undefined") {
      writeStorage(TIENDAS_STORAGE_KEY, JSON.stringify(items));
    }
    return;
  }

  const client = getSupabaseClient();

  if (!client) {
    if (typeof window !== "undefined") {
      writeStorage(TIENDAS_STORAGE_KEY, JSON.stringify(items));
    }
    return;
  }

  const rows = items.map((t) => ({
    legacy_id: t.id,
    name: t.name,
    company: t.company ?? null,
    status: t.status,
    store_type: t.type,
    main_specialty: t.mainSpecialty ?? null,
    location: t.location ?? null,
    contact: t.contact ?? null,
    rating: t.rating,
    price_level: t.priceLevel ?? null,
    start_date: t.startDate ?? null,
    comments: t.comments ?? null,
    website: t.website ?? null,
  }));

  const { error } = await client
    .schema("core")
    .from("stores")
    .upsert(rows, { onConflict: "legacy_id" });

  if (error) {
    throw new SupabaseOperationError("saveTiendas", error.message);
  }

}
