"use server";

import { revalidatePath } from "next/cache";
import { asc, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  collaboratorCategories,
  collaboratorProviders,
  collaboratorSkills,
  contractorCategories,
  contractors,
  storeCategories,
  stores,
} from "@/lib/db/schema";
import { requireSessionAccess } from "@/lib/auth/session";
import type { Contractor } from "@/lib/types/contractor";
import type { Colaborador } from "@/lib/types/colaborador";
import type { Tienda } from "@/lib/types/tienda";

async function requireProvidersAccess() {
  // No dedicated capability module for providers — any active system user may
  // manage them (matches the pre-Phase-2 behaviour, which had no gating).
  await requireSessionAccess();
}

function ratingInt(rating: number): number {
  return Math.round(Number(rating) || 0);
}

function cleanList(items: string[] | undefined): string[] {
  return (items ?? []).filter(Boolean);
}

async function replaceContractorCategories(
  contractorId: string,
  categories: string[] | undefined
): Promise<void> {
  await db
    .delete(contractorCategories)
    .where(eq(contractorCategories.contractorId, contractorId));
  const list = cleanList(categories);
  if (list.length > 0) {
    await db.insert(contractorCategories).values(
      list.map((category, i) => ({ contractorId, category, sortOrder: i }))
    );
  }
}

async function replaceCollaboratorCategories(
  collaboratorId: string,
  categories: string[] | undefined
): Promise<void> {
  await db
    .delete(collaboratorCategories)
    .where(eq(collaboratorCategories.collaboratorId, collaboratorId));
  const list = cleanList(categories);
  if (list.length > 0) {
    await db.insert(collaboratorCategories).values(
      list.map((category, i) => ({ collaboratorId, category, sortOrder: i }))
    );
  }
}

async function replaceStoreCategories(
  storeId: string,
  categories: string[] | undefined
): Promise<void> {
  await db
    .delete(storeCategories)
    .where(eq(storeCategories.storeId, storeId));
  const list = cleanList(categories);
  if (list.length > 0) {
    await db.insert(storeCategories).values(
      list.map((category, i) => ({ storeId, category, sortOrder: i }))
    );
  }
}

// ── Contractors ────────────────────────────────────────────────────────────

export async function fetchContractorsAction(): Promise<Contractor[]> {
  await requireProvidersAccess();
  const rows = await db.query.contractors.findMany({
    where: isNull(contractors.deletedAt),
    orderBy: asc(contractors.provider),
    with: { categories: true },
  });
  return rows.map((r) => ({
    id: r.legacyId ?? 0,
    company: r.company ?? undefined,
    provider: r.provider,
    status: r.status ?? "Activo",
    categories: r.categories
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((c) => c.category),
    mainSpecialty: r.mainSpecialty ?? "",
    seniority: r.seniority ?? "",
    priceLevel: r.priceLevel ?? "",
    rating: r.rating,
    webPage: r.webPage ?? undefined,
    contact: r.contact ?? undefined,
    startDate: r.startDate ?? undefined,
    comments: r.comments ?? undefined,
  }));
}

export async function saveContractorsAction(list: Contractor[]): Promise<void> {
  await requireProvidersAccess();
  for (const c of list) {
    const values = {
      company: c.company ?? null,
      provider: c.provider,
      status: c.status ?? null,
      mainSpecialty: c.mainSpecialty ?? null,
      seniority: c.seniority ?? null,
      priceLevel: c.priceLevel ?? null,
      rating: ratingInt(c.rating),
      webPage: c.webPage ?? null,
      contact: c.contact ?? null,
      startDate: c.startDate || null,
      comments: c.comments ?? null,
    };
    const [row] = await db
      .insert(contractors)
      .values({ legacyId: c.id, ...values })
      .onConflictDoUpdate({ target: contractors.legacyId, set: values })
      .returning({ id: contractors.id });
    await replaceContractorCategories(row.id, c.categories);
  }
  revalidatePath("/directorio");
}

// ── Collaborator providers ─────────────────────────────────────────────────

export async function fetchColaboradoresAction(): Promise<Colaborador[]> {
  await requireProvidersAccess();
  const rows = await db.query.collaboratorProviders.findMany({
    where: isNull(collaboratorProviders.deletedAt),
    orderBy: asc(collaboratorProviders.name),
    with: { categories: true, skills: true },
  });
  return rows.map((r) => ({
    id: r.legacyId ?? 0,
    name: r.name,
    role: r.role ?? "",
    status: r.status ?? "Activo",
    department: r.department ?? undefined,
    contact: r.contact ?? undefined,
    email: r.email ?? undefined,
    skills: r.skills
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((s) => s.skill),
    categories: r.categories
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((c) => c.category),
    seniority: r.seniority ?? undefined,
    priceLevel: r.priceLevel ?? undefined,
    availability: r.availability ?? undefined,
    rating: r.rating,
    startDate: r.startDate ?? undefined,
    comments: r.comments ?? undefined,
  }));
}

export async function saveColaboradoresAction(
  list: Colaborador[]
): Promise<void> {
  await requireProvidersAccess();
  for (const c of list) {
    const values = {
      name: c.name,
      role: c.role ?? null,
      status: c.status ?? null,
      department: c.department ?? null,
      contact: c.contact ?? null,
      email: c.email ?? null,
      seniority: c.seniority ?? null,
      priceLevel: c.priceLevel ?? null,
      availability: c.availability ?? null,
      rating: ratingInt(c.rating),
      startDate: c.startDate || null,
      comments: c.comments ?? null,
    };
    const [row] = await db
      .insert(collaboratorProviders)
      .values({ legacyId: c.id, ...values })
      .onConflictDoUpdate({
        target: collaboratorProviders.legacyId,
        set: values,
      })
      .returning({ id: collaboratorProviders.id });
    await replaceCollaboratorCategories(row.id, c.categories);
    await db
      .delete(collaboratorSkills)
      .where(eq(collaboratorSkills.collaboratorId, row.id));
    const skills = (c.skills ?? []).filter(Boolean);
    if (skills.length > 0) {
      await db.insert(collaboratorSkills).values(
        skills.map((skill, i) => ({
          collaboratorId: row.id,
          skill,
          sortOrder: i,
        }))
      );
    }
  }
  revalidatePath("/directorio");
}

// ── Stores ─────────────────────────────────────────────────────────────────

export async function fetchTiendasAction(): Promise<Tienda[]> {
  await requireProvidersAccess();
  const rows = await db.query.stores.findMany({
    where: isNull(stores.deletedAt),
    orderBy: asc(stores.name),
    with: { categories: true },
  });
  return rows.map((r) => ({
    id: r.legacyId ?? 0,
    name: r.name,
    company: r.company ?? undefined,
    status: r.status ?? "Activa",
    type: r.storeType ?? "Física",
    mainSpecialty: r.mainSpecialty ?? undefined,
    categories: r.categories
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((c) => c.category),
    location: r.location ?? undefined,
    contact: r.contact ?? undefined,
    rating: r.rating,
    priceLevel: r.priceLevel ?? undefined,
    startDate: r.startDate ?? undefined,
    comments: r.comments ?? undefined,
    website: r.website ?? undefined,
  }));
}

export async function saveTiendasAction(list: Tienda[]): Promise<void> {
  await requireProvidersAccess();
  for (const t of list) {
    const values = {
      name: t.name,
      company: t.company ?? null,
      status: t.status ?? null,
      storeType: t.type ?? null,
      mainSpecialty: t.mainSpecialty ?? null,
      location: t.location ?? null,
      contact: t.contact ?? null,
      rating: ratingInt(t.rating),
      priceLevel: t.priceLevel ?? null,
      startDate: t.startDate || null,
      comments: t.comments ?? null,
      website: t.website ?? null,
    };
    const [row] = await db
      .insert(stores)
      .values({ legacyId: t.id, ...values })
      .onConflictDoUpdate({ target: stores.legacyId, set: values })
      .returning({ id: stores.id });
    await replaceStoreCategories(row.id, t.categories);
  }
  revalidatePath("/directorio");
}
