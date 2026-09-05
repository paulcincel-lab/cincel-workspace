"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/ui/DataTable";
import { PageHeader } from "@/components/v2/layout/PageHeader";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import ExportMenu from "@/components/ui/ExportMenu";
import { Input } from "@/components/ui/shadcn/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/shadcn/tabs";
import { createSelectionColumn } from "@/components/v2/table/bulk-select";
import { BulkActionBar } from "@/components/v2/table/BulkActionBar";
import { createRowActionsColumn, type RowAction } from "@/components/v2/table/RowActionsMenu";
import { EditableCell } from "@/components/proveedores/EditableCell";
import { PillDropdown } from "@/components/proveedores/PillDropdown";
import { StarRating } from "@/components/proveedores/StarRating";
import { ContactEditorSheet, emptyContactDraft, type ContactDraft, type DirectorioVocab } from "@/components/directorio/ContactEditorSheet";
import { ClientDetailSheet } from "@/components/directorio/ClientDetailSheet";
import { CONTACT_TYPES, type ContactType } from "@/lib/types/enums";
import { directorioRowSourceId, directorioStatusVariant, toDirectorioRows, type DirectorioRow } from "@/lib/directorio/types";
import { getCurrentAuthenticatedUser } from "@/lib/auth/auth-service";
import { resolveClientsCapabilities } from "@/lib/auth/permissions";
import { saveClients, deleteClientAndLinkedProjects, type ManualClient } from "@/lib/repositories/clients-repository";
import {
  saveColaboradores,
  saveContractors,
  saveTiendas,
  type Colaborador,
  type Contractor,
  type Tienda,
} from "@/lib/repositories/providers-repository";
import { readStorage, writeStorage } from "@/lib/repositories/browser-state-repository";
import { RepositoryError, reportRepositoryError } from "@/lib/errors";
import { useProjectsData } from "@/lib/proyectos/use-projects-data";
import { loadGeneralSettings } from "@/lib/settings/general-settings";
import { exportTableData, type ExportColumn } from "@/lib/utils/export-service";

interface DirectorioV2ClientProps {
  initialClients: ManualClient[];
  initialContractors: Contractor[];
  initialColaboradores: Colaborador[];
  initialTiendas: Tienda[];
}

const FILTERS: Array<"Todos" | ContactType> = ["Todos", ...CONTACT_TYPES];

// ── Reused-verbatim legacy storage keys (do not change — existing users' saved
// vocab/colors live under these). ──────────────────────────────────────────
const CONTRACTOR_OPTIONS_KEY = "cincel.contractors.options.v2";
const CONTRACTOR_COLORS_KEY = "cincel.contractors.colors.v1";
const COLABORADOR_OPTIONS_KEY = "cincel.colaboradores.options.v2";
const COLABORADOR_COLORS_KEY = "cincel.colaboradores.colors.v1";
const TIENDA_OPTIONS_KEY = "cincel.tiendas.options.v2";
const TIENDA_COLORS_KEY = "cincel.tiendas.colors.v1";

const DEFAULT_CONTRACTOR_STATUS = ["Activo", "Pausado", "Lista Negra", "Sin actividad con nosotros", "Prospecto", "Inactivo"];
const DEFAULT_CONTRACTOR_CATEGORY = [
  "Acústica", "Albañilería", "Cancelería", "Carpintería", "Colocación Pisos Madera", "Colocación y Acabados",
  "Espejos", "Herrero", "Iluminación", "IE", "IHS", "Instalaciones Especiales", "HVAC", "Macetas", "Mármoles",
  "Materiales de Construcción", "Mobiliario Habitacional", "Mob Restaurante", "Mob Oficina", "Paneles", "Pisos",
  "Soluciones de Ingeniería", "Tapicería",
];
const DEFAULT_SENIORITY = ["Excelente", "Nivel Medio", "Con detalles", "Bajo", "No trabajes con el"];
const DEFAULT_PRICE_CONTRATISTA = ["Gama Alta", "Nivel Medio", "Medio-Bajo", "Bajo", "No Trabajes con el"];
const DEFAULT_PRICE = ["Gama Alta", "Nivel Medio", "Medio-Bajo", "Bajo"];
const DEFAULT_COLABORADOR_STATUS = ["Activo", "Freelance", "Pasantía", "Inactivo"];
const DEFAULT_TIENDA_STATUS = ["Activa", "Inactiva", "Cerrada", "Próximo Abierto"];
const DEFAULT_TIENDA_TYPE = ["Física", "Online", "Híbrida"];
const DEFAULT_ROLES = ["Arquitecto", "Diseñador", "Ingeniero", "Administrativo", "Gestor de Proyecto"];

type OptionColors = Record<string, { bg: string; text: string }>;

function loadColors(key: string): OptionColors {
  const stored = readStorage(key);
  if (!stored) return {};
  try {
    return JSON.parse(stored) as OptionColors;
  } catch {
    return {};
  }
}

function loadContractorOptions(): Partial<{
  statusOptions: string[]; categoryOptions: string[]; seniorityOptions: string[]; priceOptions: string[];
}> {
  const stored = readStorage(CONTRACTOR_OPTIONS_KEY);
  if (!stored) return {};
  try {
    return JSON.parse(stored);
  } catch {
    return {};
  }
}

function loadColaboradorOptions(): Partial<{ statusOptions: string[]; seniorityOptions: string[]; priceOptions: string[] }> {
  const stored = readStorage(COLABORADOR_OPTIONS_KEY);
  if (!stored) return {};
  try {
    return JSON.parse(stored);
  } catch {
    return {};
  }
}

function loadTiendaOptions(): Partial<{ statusOptions: string[]; typeOptions: string[]; priceOptions: string[] }> {
  const stored = readStorage(TIENDA_OPTIONS_KEY);
  if (!stored) return {};
  try {
    return JSON.parse(stored);
  } catch {
    return {};
  }
}

const contratistaStatusStyle = (s: string): string =>
  ({
    Activo: "bg-emerald-100 text-emerald-700",
    Pausado: "bg-orange-100 text-orange-700",
    "Lista Negra": "bg-red-100 text-red-700",
    "Sin actividad con nosotros": "bg-gray-100 text-gray-700",
    Prospecto: "bg-blue-100 text-blue-700",
    Inactivo: "bg-gray-100 text-gray-700",
  })[s] ?? "bg-gray-100 text-gray-700";

const colaboradorStatusStyle = (s: string): string =>
  ({
    Activo: "bg-emerald-100 text-emerald-700",
    Freelance: "bg-blue-100 text-blue-700",
    Pasantía: "bg-yellow-100 text-yellow-700",
    Inactivo: "bg-gray-100 text-gray-700",
  })[s] ?? "bg-gray-100 text-gray-700";

const tiendaStatusStyle = (s: string): string =>
  ({
    Activa: "bg-emerald-100 text-emerald-700",
    Inactiva: "bg-gray-100 text-gray-700",
    Cerrada: "bg-red-100 text-red-700",
    "Próximo Abierto": "bg-blue-100 text-blue-700",
  })[s] ?? "bg-gray-100 text-gray-700";

const specialtyStyle = (): string => "bg-blue-100 text-blue-700";
const roleStyle = (r: string): string =>
  ({
    Arquitecto: "bg-purple-100 text-purple-700",
    Diseñador: "bg-pink-100 text-pink-700",
    Ingeniero: "bg-blue-100 text-blue-700",
    Administrativo: "bg-slate-100 text-slate-700",
    "Gestor de Proyecto": "bg-cyan-100 text-cyan-700",
  })[r] ?? "bg-gray-100 text-gray-700";

function nextId(items: Array<{ id: number }>): number {
  return Math.max(0, ...items.map((i) => i.id)) + 1;
}

const RATING_FILTER_OPTIONS = [
  { value: "0", label: "Calificación: Todas" },
  { value: "5", label: "★★★★★  5 estrellas" },
  { value: "4", label: "★★★★+  4 o más" },
  { value: "3", label: "★★★+  3 o más" },
  { value: "2", label: "★★+  2 o más" },
];

const emptyFilters = { status: "", category: "", minRating: 0, activeOnly: false };

export function DirectorioV2Client({
  initialClients,
  initialContractors,
  initialColaboradores,
  initialTiendas,
}: DirectorioV2ClientProps) {
  const [clients, setClients] = useState(initialClients);
  const [contractors, setContractors] = useState(initialContractors);
  const [colaboradores, setColaboradores] = useState(initialColaboradores);
  const [tiendas, setTiendas] = useState(initialTiendas);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("Todos");
  const [selected, setSelected] = useState<Set<string | number>>(new Set());
  const [showEditor, setShowEditor] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detailRowId, setDetailRowId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ContactDraft>(emptyContactDraft);
  const [formError, setFormError] = useState("");
  const [filters, setFilters] = useState(emptyFilters);

  const [contractorStatusOpts, setContractorStatusOpts] = useState<string[]>(
    () => loadContractorOptions().statusOptions ?? DEFAULT_CONTRACTOR_STATUS
  );
  const [contractorCategoryOpts, setContractorCategoryOpts] = useState<string[]>(
    () => loadContractorOptions().categoryOptions ?? DEFAULT_CONTRACTOR_CATEGORY
  );
  const [contractorSeniorityOpts, setContractorSeniorityOpts] = useState<string[]>(
    () => loadContractorOptions().seniorityOptions ?? DEFAULT_SENIORITY
  );
  const [contractorPriceOpts, setContractorPriceOpts] = useState<string[]>(
    () => loadContractorOptions().priceOptions ?? DEFAULT_PRICE_CONTRATISTA
  );
  const [contractorColors, setContractorColors] = useState<OptionColors>(() => loadColors(CONTRACTOR_COLORS_KEY));

  const [colaboradorStatusOpts, setColaboradorStatusOpts] = useState<string[]>(
    () => loadColaboradorOptions().statusOptions ?? DEFAULT_COLABORADOR_STATUS
  );
  const [colaboradorSeniorityOpts, setColaboradorSeniorityOpts] = useState<string[]>(
    () => loadColaboradorOptions().seniorityOptions ?? DEFAULT_SENIORITY
  );
  const [colaboradorPriceOpts, setColaboradorPriceOpts] = useState<string[]>(
    () => loadColaboradorOptions().priceOptions ?? DEFAULT_PRICE
  );
  const [colaboradorColors, setColaboradorColors] = useState<OptionColors>(() => loadColors(COLABORADOR_COLORS_KEY));

  const [tiendaStatusOpts, setTiendaStatusOpts] = useState<string[]>(
    () => loadTiendaOptions().statusOptions ?? DEFAULT_TIENDA_STATUS
  );
  const [tiendaTypeOpts, setTiendaTypeOpts] = useState<string[]>(
    () => loadTiendaOptions().typeOptions ?? DEFAULT_TIENDA_TYPE
  );
  const [tiendaPriceOpts, setTiendaPriceOpts] = useState<string[]>(
    () => loadTiendaOptions().priceOptions ?? DEFAULT_PRICE
  );
  const [tiendaColors, setTiendaColors] = useState<OptionColors>(() => loadColors(TIENDA_COLORS_KEY));

  const [authenticatedUser] = useState(() => getCurrentAuthenticatedUser());
  const clientsCapabilities = useMemo(() => resolveClientsCapabilities(authenticatedUser), [authenticatedUser]);

  const { projectsData } = useProjectsData();

  const vocab: DirectorioVocab = {
    contratista: { status: contractorStatusOpts, category: contractorCategoryOpts, seniority: contractorSeniorityOpts, price: contractorPriceOpts },
    colaborador: { status: colaboradorStatusOpts, seniority: colaboradorSeniorityOpts, price: colaboradorPriceOpts },
    tienda: { status: tiendaStatusOpts, type: tiendaTypeOpts, price: tiendaPriceOpts },
  };

  function persist<T>(setState: (v: T[]) => void, save: (v: T[]) => Promise<void>, next: T[]) {
    setState(next);
    save(next).catch((err: unknown) => {
      if (err instanceof RepositoryError) reportRepositoryError(err);
    });
  }

  const updateClient = (id: number, patch: Partial<ManualClient>) =>
    persist(setClients, saveClients, clients.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const updateContractor = (id: number, patch: Partial<Contractor>) =>
    persist(setContractors, saveContractors, contractors.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const updateColaborador = (id: number, patch: Partial<Colaborador>) =>
    persist(setColaboradores, saveColaboradores, colaboradores.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const updateTienda = (id: number, patch: Partial<Tienda>) =>
    persist(setTiendas, saveTiendas, tiendas.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  function addOptionForContratista(field: "status" | "category" | "seniority" | "price", value: string) {
    const merged = {
      statusOptions: field === "status" ? [...contractorStatusOpts, value] : contractorStatusOpts,
      categoryOptions: field === "category" ? [...contractorCategoryOpts, value] : contractorCategoryOpts,
      seniorityOptions: field === "seniority" ? [...contractorSeniorityOpts, value] : contractorSeniorityOpts,
      priceOptions: field === "price" ? [...contractorPriceOpts, value] : contractorPriceOpts,
    };
    setContractorStatusOpts(merged.statusOptions);
    setContractorCategoryOpts(merged.categoryOptions);
    setContractorSeniorityOpts(merged.seniorityOptions);
    setContractorPriceOpts(merged.priceOptions);
    writeStorage(CONTRACTOR_OPTIONS_KEY, JSON.stringify(merged));
  }

  function deleteOptionForContratista(field: "status" | "category" | "seniority" | "price", value: string) {
    const merged = {
      statusOptions: field === "status" ? contractorStatusOpts.filter((o) => o !== value) : contractorStatusOpts,
      categoryOptions: field === "category" ? contractorCategoryOpts.filter((o) => o !== value) : contractorCategoryOpts,
      seniorityOptions: field === "seniority" ? contractorSeniorityOpts.filter((o) => o !== value) : contractorSeniorityOpts,
      priceOptions: field === "price" ? contractorPriceOpts.filter((o) => o !== value) : contractorPriceOpts,
    };
    setContractorStatusOpts(merged.statusOptions);
    setContractorCategoryOpts(merged.categoryOptions);
    setContractorSeniorityOpts(merged.seniorityOptions);
    setContractorPriceOpts(merged.priceOptions);
    writeStorage(CONTRACTOR_OPTIONS_KEY, JSON.stringify(merged));
  }

  function setContratistaColor(option: string, color: { bg: string; text: string }) {
    const next = { ...contractorColors, [option]: color };
    setContractorColors(next);
    writeStorage(CONTRACTOR_COLORS_KEY, JSON.stringify(next));
  }

  function addOptionForColaborador(field: "status" | "seniority" | "price", value: string) {
    const merged = {
      statusOptions: field === "status" ? [...colaboradorStatusOpts, value] : colaboradorStatusOpts,
      seniorityOptions: field === "seniority" ? [...colaboradorSeniorityOpts, value] : colaboradorSeniorityOpts,
      priceOptions: field === "price" ? [...colaboradorPriceOpts, value] : colaboradorPriceOpts,
    };
    setColaboradorStatusOpts(merged.statusOptions);
    setColaboradorSeniorityOpts(merged.seniorityOptions);
    setColaboradorPriceOpts(merged.priceOptions);
    writeStorage(COLABORADOR_OPTIONS_KEY, JSON.stringify(merged));
  }

  function deleteOptionForColaborador(field: "status" | "seniority" | "price", value: string) {
    const merged = {
      statusOptions: field === "status" ? colaboradorStatusOpts.filter((o) => o !== value) : colaboradorStatusOpts,
      seniorityOptions: field === "seniority" ? colaboradorSeniorityOpts.filter((o) => o !== value) : colaboradorSeniorityOpts,
      priceOptions: field === "price" ? colaboradorPriceOpts.filter((o) => o !== value) : colaboradorPriceOpts,
    };
    setColaboradorStatusOpts(merged.statusOptions);
    setColaboradorSeniorityOpts(merged.seniorityOptions);
    setColaboradorPriceOpts(merged.priceOptions);
    writeStorage(COLABORADOR_OPTIONS_KEY, JSON.stringify(merged));
  }

  function setColaboradorColor(option: string, color: { bg: string; text: string }) {
    const next = { ...colaboradorColors, [option]: color };
    setColaboradorColors(next);
    writeStorage(COLABORADOR_COLORS_KEY, JSON.stringify(next));
  }

  function addOptionForTienda(field: "status" | "type" | "price", value: string) {
    const merged = {
      statusOptions: field === "status" ? [...tiendaStatusOpts, value] : tiendaStatusOpts,
      typeOptions: field === "type" ? [...tiendaTypeOpts, value] : tiendaTypeOpts,
      priceOptions: field === "price" ? [...tiendaPriceOpts, value] : tiendaPriceOpts,
    };
    setTiendaStatusOpts(merged.statusOptions);
    setTiendaTypeOpts(merged.typeOptions);
    setTiendaPriceOpts(merged.priceOptions);
    writeStorage(TIENDA_OPTIONS_KEY, JSON.stringify(merged));
  }

  function deleteOptionForTienda(field: "status" | "type" | "price", value: string) {
    const merged = {
      statusOptions: field === "status" ? tiendaStatusOpts.filter((o) => o !== value) : tiendaStatusOpts,
      typeOptions: field === "type" ? tiendaTypeOpts.filter((o) => o !== value) : tiendaTypeOpts,
      priceOptions: field === "price" ? tiendaPriceOpts.filter((o) => o !== value) : tiendaPriceOpts,
    };
    setTiendaStatusOpts(merged.statusOptions);
    setTiendaTypeOpts(merged.typeOptions);
    setTiendaPriceOpts(merged.priceOptions);
    writeStorage(TIENDA_OPTIONS_KEY, JSON.stringify(merged));
  }

  function setTiendaColor(option: string, color: { bg: string; text: string }) {
    const next = { ...tiendaColors, [option]: color };
    setTiendaColors(next);
    writeStorage(TIENDA_COLORS_KEY, JSON.stringify(next));
  }

  const rows = useMemo(
    () => toDirectorioRows({ clients, contractors, colaboradores, tiendas }),
    [clients, contractors, colaboradores, tiendas]
  );

  const visible = useMemo(() => {
    return rows
      .filter((r) => filter === "Todos" || r.type === filter)
      .filter((r) => !filters.activeOnly || directorioStatusVariant(r.status) === "outline")
      .filter((r) => r.rating === undefined || filters.minRating === 0 || r.rating >= filters.minRating)
      .filter((r) => !filters.status || r.status === filters.status)
      .filter((r) => !filters.category || r.category.toLowerCase().includes(filters.category.toLowerCase()) || r.category === filters.category);
  }, [rows, filter, filters]);

  function toggle(id: string | number) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll(ids: (string | number)[]) {
    setSelected((cur) => {
      const allSelected = ids.every((id) => cur.has(id));
      return allSelected ? new Set() : new Set(ids);
    });
  }

  function bulkCopyContacts() {
    const text = rows
      .filter((r) => selected.has(r.id))
      .map((r) => `${r.name} — ${r.contact}`)
      .join("\n");
    void navigator.clipboard.writeText(text);
  }

  function openCreate() {
    setFormError("");
    setEditingId(null);
    setDraft({ ...emptyContactDraft, type: filter === "Todos" ? "Cliente" : filter });
    setShowEditor(true);
  }

  function openEdit(row: DirectorioRow) {
    const id = directorioRowSourceId(row);
    setFormError("");
    setEditingId(row.id);

    if (row.type === "Cliente") {
      const c = clients.find((x) => x.id === id);
      if (!c) return;
      setDraft({
        ...emptyContactDraft,
        type: "Cliente",
        name: c.name,
        kind: c.kind,
        phone: c.phone,
        emailsText: c.emails.join(", "),
        acquisitionChannel: c.acquisitionChannel,
        totalSpent: c.totalSpent,
        hasActiveProject: c.hasActiveProject,
        projectName: c.projectName,
        projectType: c.projectType,
        totalProjectsWorked: c.totalProjectsWorked,
        firstWorkDate: c.firstWorkDate,
        contacts: c.contacts,
        completedProjectsText: c.completedProjects.join(", "),
      });
    } else if (row.type === "Contratista") {
      const c = contractors.find((x) => x.id === id);
      if (!c) return;
      setDraft({
        ...emptyContactDraft,
        type: "Contratista",
        name: c.provider,
        company: c.company ?? "",
        status: c.status,
        mainSpecialty: c.mainSpecialty,
        categories: c.categories,
        seniority: c.seniority,
        priceLevel: c.priceLevel,
        rating: c.rating,
        contact: c.contact ?? "",
        secondaryContacts: c.secondaryContacts ?? [],
        startDate: c.startDate ?? "",
        comments: c.comments ?? "",
        webPage: c.webPage ?? "",
      });
    } else if (row.type === "Colaborador") {
      const c = colaboradores.find((x) => x.id === id);
      if (!c) return;
      setDraft({
        ...emptyContactDraft,
        type: "Colaborador",
        name: c.name,
        role: c.role,
        status: c.status,
        department: c.department ?? "",
        contact: c.contact ?? "",
        email: c.email ?? "",
        seniority: c.seniority ?? DEFAULT_SENIORITY[1],
        priceLevel: c.priceLevel ?? DEFAULT_PRICE[1],
        availability: c.availability ?? "Disponible",
        rating: c.rating,
        startDate: c.startDate ?? "",
        comments: c.comments ?? "",
      });
    } else {
      const t = tiendas.find((x) => x.id === id);
      if (!t) return;
      setDraft({
        ...emptyContactDraft,
        type: "Tienda",
        name: t.name,
        company: t.company ?? "",
        status: t.status,
        tiendaType: (t.type as ContactDraft["tiendaType"]) ?? "Física",
        mainSpecialty: t.mainSpecialty ?? "",
        priceLevel: t.priceLevel ?? DEFAULT_PRICE[1],
        location: t.location ?? "",
        contact: t.contact ?? "",
        rating: t.rating,
        startDate: t.startDate ?? "",
        comments: t.comments ?? "",
      });
    }
    setShowEditor(true);
  }

  function closeEditor() {
    setShowEditor(false);
    setFormError("");
  }

  async function saveDraft() {
    const name = draft.name.trim();
    if (!name) {
      setFormError("El nombre es obligatorio.");
      return;
    }

    if (editingId !== null) {
      const id = directorioRowSourceId({ id: editingId });
      if (draft.type === "Cliente") {
        updateClient(id, {
          name,
          kind: draft.kind,
          phone: draft.phone.trim(),
          emails: draft.emailsText.split(",").map((e) => e.trim()).filter(Boolean),
          acquisitionChannel: draft.acquisitionChannel.trim(),
          totalSpent: draft.totalSpent,
          hasActiveProject: draft.hasActiveProject,
          projectName: draft.projectName.trim(),
          projectType: draft.projectType,
          totalProjectsWorked: Math.max(1, draft.totalProjectsWorked),
          firstWorkDate: draft.firstWorkDate,
          contacts: draft.contacts
            .map((c) => ({ name: c.name.trim(), role: c.role.trim(), phone: c.phone.trim(), email: c.email.trim() }))
            .filter((c) => c.name || c.role || c.phone || c.email),
          completedProjects: draft.completedProjectsText.split(",").map((p) => p.trim()).filter(Boolean),
        });
      } else if (draft.type === "Contratista") {
        updateContractor(id, {
          provider: name,
          company: draft.company.trim() || undefined,
          status: draft.status,
          mainSpecialty: draft.mainSpecialty,
          categories: draft.categories,
          seniority: draft.seniority,
          priceLevel: draft.priceLevel,
          rating: draft.rating,
          contact: draft.contact.trim() || undefined,
          secondaryContacts: draft.secondaryContacts.filter((c) => c.trim()),
          startDate: draft.startDate || undefined,
          comments: draft.comments || undefined,
          webPage: draft.webPage.trim() || undefined,
        });
      } else if (draft.type === "Colaborador") {
        updateColaborador(id, {
          name,
          role: draft.role,
          status: draft.status,
          department: draft.department.trim() || undefined,
          contact: draft.contact.trim() || undefined,
          email: draft.email.trim() || undefined,
          seniority: draft.seniority,
          priceLevel: draft.priceLevel,
          availability: draft.availability,
          rating: draft.rating,
          startDate: draft.startDate || undefined,
          comments: draft.comments || undefined,
        });
      } else {
        updateTienda(id, {
          name,
          company: draft.company.trim() || undefined,
          status: draft.status,
          type: draft.tiendaType,
          mainSpecialty: draft.mainSpecialty.trim() || undefined,
          priceLevel: draft.priceLevel,
          location: draft.location.trim() || undefined,
          contact: draft.contact.trim() || undefined,
          rating: draft.rating,
          startDate: draft.startDate || undefined,
          comments: draft.comments || undefined,
        });
      }
      setShowEditor(false);
      return;
    }

    switch (draft.type) {
      case "Cliente": {
        const created: ManualClient = {
          id: nextId(clients),
          name,
          emails: draft.emailsText.split(",").map((e) => e.trim()).filter(Boolean),
          phone: draft.phone.trim(),
          kind: draft.kind,
          contacts: draft.contacts
            .map((c) => ({ name: c.name.trim(), role: c.role.trim(), phone: c.phone.trim(), email: c.email.trim() }))
            .filter((c) => c.name || c.role || c.phone || c.email),
          completedProjects: draft.completedProjectsText.split(",").map((p) => p.trim()).filter(Boolean),
          acquisitionChannel: draft.acquisitionChannel.trim() || "Sin registro",
          totalSpent: draft.totalSpent,
          hasActiveProject: draft.hasActiveProject,
          projectName: draft.projectName.trim(),
          projectType: draft.projectType,
          totalProjectsWorked: Math.max(1, draft.totalProjectsWorked),
          firstWorkDate: draft.firstWorkDate,
        };
        persist(setClients, saveClients, [...clients, created]);
        break;
      }
      case "Contratista": {
        const created: Contractor = {
          id: nextId(contractors),
          provider: name,
          company: draft.company.trim() || undefined,
          status: draft.status,
          categories: draft.categories,
          mainSpecialty: draft.mainSpecialty,
          seniority: draft.seniority,
          priceLevel: draft.priceLevel,
          rating: draft.rating,
          contact: draft.contact.trim() || undefined,
          secondaryContacts: draft.secondaryContacts.filter((c) => c.trim()),
          startDate: draft.startDate || undefined,
          comments: draft.comments || undefined,
          webPage: draft.webPage.trim() || undefined,
        };
        persist(setContractors, saveContractors, [...contractors, created]);
        break;
      }
      case "Colaborador": {
        const created: Colaborador = {
          id: nextId(colaboradores),
          name,
          role: draft.role,
          status: draft.status,
          department: draft.department.trim() || undefined,
          contact: draft.contact.trim() || undefined,
          email: draft.email.trim() || undefined,
          seniority: draft.seniority,
          priceLevel: draft.priceLevel,
          availability: draft.availability,
          rating: draft.rating,
          startDate: draft.startDate || undefined,
          comments: draft.comments || undefined,
        };
        persist(setColaboradores, saveColaboradores, [...colaboradores, created]);
        break;
      }
      case "Tienda": {
        const created: Tienda = {
          id: nextId(tiendas),
          name,
          company: draft.company.trim() || undefined,
          status: draft.status,
          type: draft.tiendaType,
          mainSpecialty: draft.mainSpecialty.trim() || undefined,
          priceLevel: draft.priceLevel,
          location: draft.location.trim() || undefined,
          contact: draft.contact.trim() || undefined,
          rating: draft.rating,
          startDate: draft.startDate || undefined,
          comments: draft.comments || undefined,
        };
        persist(setTiendas, saveTiendas, [...tiendas, created]);
        break;
      }
    }

    setShowEditor(false);
  }

  const detailClient = detailRowId
    ? clients.find((c) => c.id === directorioRowSourceId({ id: detailRowId })) ?? null
    : null;
  const detailLinkedProjects = detailClient
    ? projectsData.filter((p) => p.client.id === detailClient.id)
    : [];

  async function deleteRow(row: DirectorioRow) {
    if (!window.confirm(`¿Eliminar "${row.name}"? Esta acción no se puede deshacer.`)) return;
    const id = directorioRowSourceId(row);

    if (row.type === "Cliente") {
      const linkedProjectIds = projectsData.filter((p) => p.client.id === id).map((p) => p.id);
      setClients(clients.filter((c) => c.id !== id));
      try {
        await deleteClientAndLinkedProjects(id, linkedProjectIds);
      } catch (err) {
        if (err instanceof RepositoryError) reportRepositoryError(err);
      }
    } else if (row.type === "Contratista") {
      persist(setContractors, saveContractors, contractors.filter((c) => c.id !== id));
    } else if (row.type === "Colaborador") {
      persist(setColaboradores, saveColaboradores, colaboradores.filter((c) => c.id !== id));
    } else {
      persist(setTiendas, saveTiendas, tiendas.filter((t) => t.id !== id));
    }
  }

  const exportColumns = useMemo<ExportColumn<DirectorioRow>[]>(
    () => [
      { key: "name", header: "Nombre", getValue: (r) => r.name },
      { key: "type", header: "Tipo", getValue: (r) => r.type },
      { key: "category", header: "Categoría", getValue: (r) => r.category },
      { key: "contact", header: "Contacto", getValue: (r) => r.contact },
      { key: "status", header: "Estado", getValue: (r) => r.status },
      { key: "rating", header: "Calificación", getValue: (r) => r.rating ?? "" },
    ],
    []
  );

  async function exportDirectorio(format: "xlsx" | "pdf") {
    const { settings } = loadGeneralSettings();
    await exportTableData({
      moduleName: "Directorio",
      fileName: `directorio-${filter}-${Date.now()}`,
      format,
      companyName: settings.company.tradeName || settings.company.legalName,
      columns: exportColumns,
      rows: visible,
      landscape: true,
    });
  }

  const categoryFilterOptions =
    filter === "Cliente" ? ["Empresa", "Particular"]
    : filter === "Contratista" ? contractorCategoryOpts
    : filter === "Colaborador" ? DEFAULT_ROLES
    : [];

  const statusFilterOptions =
    filter === "Cliente" ? ["Activo", "Sin proyecto activo"]
    : filter === "Contratista" ? contractorStatusOpts
    : filter === "Colaborador" ? colaboradorStatusOpts
    : filter === "Tienda" ? tiendaStatusOpts
    : [];

  const activeFiltersCount = [filters.status, filters.category, filters.activeOnly, filters.minRating > 0].filter(Boolean).length;

  const columns = useMemo<ColumnDef<DirectorioRow, unknown>[]>(
    () => [
      createSelectionColumn<DirectorioRow>({
        getId: (r) => r.id,
        selectedIds: selected,
        onToggle: toggle,
        onToggleAll: toggleAll,
      }),
      { accessorKey: "name", header: "Nombre", cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
      {
        accessorKey: "type",
        header: "Tipo",
        cell: ({ row }) => <Badge variant="secondary">{row.original.type}</Badge>,
      },
      {
        accessorKey: "category",
        header: "Categoría",
        cell: ({ row }) => {
          const r = row.original;
          const id = directorioRowSourceId(r);
          if (r.type === "Contratista") {
            return (
              <PillDropdown
                value={r.category} options={contractorCategoryOpts} colorFn={specialtyStyle}
                onSave={(v) => updateContractor(id, { mainSpecialty: v })}
                onAddOption={(v) => addOptionForContratista("category", v)}
                onDeleteOption={(v) => deleteOptionForContratista("category", v)}
                optionColors={contractorColors} onSetColor={setContratistaColor}
              />
            );
          }
          if (r.type === "Colaborador") {
            return (
              <PillDropdown
                value={r.category} options={DEFAULT_ROLES} colorFn={roleStyle}
                onSave={(v) => updateColaborador(id, { role: v })}
                optionColors={colaboradorColors}
              />
            );
          }
          if (r.type === "Tienda") {
            return <EditableCell value={r.category} onSave={(v) => updateTienda(id, { mainSpecialty: v })} />;
          }
          return (
            <Select value={r.category} onValueChange={(v) => updateClient(id, { kind: v as ManualClient["kind"] })}>
              <SelectTrigger className="h-auto border-0 bg-transparent px-1 py-1 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Particular">Particular</SelectItem>
                <SelectItem value="Empresa">Empresa</SelectItem>
              </SelectContent>
            </Select>
          );
        },
      },
      {
        accessorKey: "contact",
        header: "Contacto",
        cell: ({ row }) => {
          const r = row.original;
          const id = directorioRowSourceId(r);
          if (r.type === "Cliente") return <EditableCell value={r.contact} onSave={(v) => updateClient(id, { phone: v })} />;
          if (r.type === "Contratista") return <EditableCell value={r.contact} onSave={(v) => updateContractor(id, { contact: v })} />;
          if (r.type === "Colaborador") return <EditableCell value={r.contact} onSave={(v) => updateColaborador(id, { contact: v })} />;
          return <EditableCell value={r.contact} onSave={(v) => updateTienda(id, { contact: v })} />;
        },
      },
      {
        accessorKey: "status",
        header: "Estado",
        cell: ({ row }) => {
          const r = row.original;
          const id = directorioRowSourceId(r);
          if (r.type === "Cliente") {
            return (
              <Select value={r.status === "Activo" ? "si" : "no"} onValueChange={(v) => updateClient(id, { hasActiveProject: v === "si" })}>
                <SelectTrigger className="h-auto border-0 bg-transparent px-1 py-1 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="si">Activo</SelectItem>
                  <SelectItem value="no">Sin proyecto activo</SelectItem>
                </SelectContent>
              </Select>
            );
          }
          if (r.type === "Contratista") {
            return (
              <PillDropdown
                value={r.status} options={contractorStatusOpts} colorFn={contratistaStatusStyle}
                onSave={(v) => updateContractor(id, { status: v })}
                onAddOption={(v) => addOptionForContratista("status", v)}
                onDeleteOption={(v) => deleteOptionForContratista("status", v)}
                optionColors={contractorColors} onSetColor={setContratistaColor}
              />
            );
          }
          if (r.type === "Colaborador") {
            return (
              <PillDropdown
                value={r.status} options={colaboradorStatusOpts} colorFn={colaboradorStatusStyle}
                onSave={(v) => updateColaborador(id, { status: v })}
                onAddOption={(v) => addOptionForColaborador("status", v)}
                onDeleteOption={(v) => deleteOptionForColaborador("status", v)}
                optionColors={colaboradorColors} onSetColor={setColaboradorColor}
              />
            );
          }
          return (
            <PillDropdown
              value={r.status} options={tiendaStatusOpts} colorFn={tiendaStatusStyle}
              onSave={(v) => updateTienda(id, { status: v })}
              onAddOption={(v) => addOptionForTienda("status", v)}
              onDeleteOption={(v) => deleteOptionForTienda("status", v)}
              optionColors={tiendaColors} onSetColor={setTiendaColor}
            />
          );
        },
      },
      {
        accessorKey: "rating",
        header: "Calificación",
        cell: ({ row }) => {
          const r = row.original;
          const id = directorioRowSourceId(r);
          if (r.type === "Cliente") return <span className="text-muted-foreground">—</span>;
          if (r.type === "Contratista") return <StarRating rating={r.rating ?? 0} onRate={(v) => updateContractor(id, { rating: v })} />;
          if (r.type === "Colaborador") return <StarRating rating={r.rating ?? 0} onRate={(v) => updateColaborador(id, { rating: v })} />;
          return <StarRating rating={r.rating ?? 0} onRate={(v) => updateTienda(id, { rating: v })} />;
        },
      },
      createRowActionsColumn<DirectorioRow>((row) => {
        const isCliente = row.type === "Cliente";
        const canEdit = !isCliente || clientsCapabilities.canEditClient;
        const canDelete = !isCliente || clientsCapabilities.canDeleteClient;
        const actions: RowAction<DirectorioRow>[] = [];
        if (isCliente && clientsCapabilities.canViewClients) {
          actions.push({ label: "Ver ficha", onSelect: (r: DirectorioRow) => setDetailRowId(r.id) });
        }
        if (canEdit) actions.push({ label: "Editar", onSelect: (r: DirectorioRow) => openEdit(r) });
        if (canDelete) {
          actions.push({
            label: "Eliminar",
            variant: "destructive" as const,
            separatorBefore: true,
            onSelect: (r: DirectorioRow) => { void deleteRow(r); },
          });
        }
        return actions;
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      selected, contractorCategoryOpts, contractorStatusOpts, contractorColors,
      colaboradorStatusOpts, colaboradorColors, tiendaStatusOpts, tiendaColors,
      clientsCapabilities,
    ]
  );

  return (
    <div>
      <PageHeader
        title="Directorio"
        description="Clientes, contratistas, colaboradores y tiendas — todo en un lugar."
        actions={
          <>
            <Tabs
              value={filter}
              onValueChange={(v) => {
                setFilter(v as typeof filter);
                setSelected(new Set());
                setFilters(emptyFilters);
              }}
            >
              <TabsList>
                {FILTERS.map((f) => (
                  <TabsTrigger key={f} value={f}>
                    {f}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <ExportMenu onExport={exportDirectorio} disabled={!clientsCapabilities.canExportData && filter === "Cliente"} />
            <Button
              onClick={openCreate}
              disabled={filter === "Cliente" && !clientsCapabilities.canCreateClient}
              title={filter === "Cliente" && !clientsCapabilities.canCreateClient ? "No tienes permiso para crear clientes" : ""}
            >
              + Nuevo contacto
            </Button>
          </>
        }
      />

      {filter !== "Todos" ? (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 px-4 py-2.5">
          <span className="mr-1 text-xs font-medium text-muted-foreground">Filtrar:</span>
          {statusFilterOptions.length > 0 ? (
            <Select value={filters.status || "__all__"} onValueChange={(v) => setFilters((f) => ({ ...f, status: v === "__all__" ? "" : (v as string) }))}>
              <SelectTrigger className="h-auto w-auto px-2 py-1 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Estado: Todos</SelectItem>
                {statusFilterOptions.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          ) : null}
          {filter === "Tienda" ? (
            <Input
              value={filters.category}
              onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}
              placeholder="Ramo principal…"
              className="h-auto w-40 px-2 py-1 text-xs"
            />
          ) : categoryFilterOptions.length > 0 ? (
            <Select value={filters.category || "__all__"} onValueChange={(v) => setFilters((f) => ({ ...f, category: v === "__all__" ? "" : (v as string) }))}>
              <SelectTrigger className="h-auto w-auto px-2 py-1 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Categoría: Todas</SelectItem>
                {categoryFilterOptions.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          ) : null}
          {filter !== "Cliente" ? (
            <Select value={filters.minRating.toString()} onValueChange={(v) => setFilters((f) => ({ ...f, minRating: Number(v) }))}>
              <SelectTrigger className="h-auto w-auto px-2 py-1 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {RATING_FILTER_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          ) : null}
          <Button
            variant={filters.activeOnly ? "default" : "outline"}
            size="sm"
            className="h-auto px-3 py-1 text-xs"
            onClick={() => setFilters((f) => ({ ...f, activeOnly: !f.activeOnly }))}
          >
            ● Solo Activos
          </Button>
          {activeFiltersCount > 0 ? (
            <Button variant="ghost" size="sm" className="ml-auto h-auto px-2.5 py-1 text-xs text-destructive" onClick={() => setFilters(emptyFilters)}>
              ✕ Limpiar ({activeFiltersCount})
            </Button>
          ) : null}
        </div>
      ) : null}

      <BulkActionBar
        selectedCount={selected.size}
        itemLabel="contactos"
        actions={[{ label: "Copiar contactos", onClick: bulkCopyContacts }]}
      />
      <DataTable
        columns={columns}
        data={visible}
        getRowId={(row) => row.id}
        searchPlaceholder="Buscar en el directorio…"
        wrapperClassName={selected.size > 0 ? "rounded-t-none border-t-0" : undefined}
        emptyMessage="No hay contactos para este filtro."
      />

      <ContactEditorSheet
        show={showEditor}
        onClose={closeEditor}
        editingId={editingId}
        draft={draft}
        onChangeDraft={setDraft}
        formError={formError}
        onSave={() => { void saveDraft(); }}
        vocab={vocab}
      />

      {detailClient ? (
        <ClientDetailSheet
          client={detailClient}
          linkedProjects={detailLinkedProjects}
          onClose={() => setDetailRowId(null)}
          onEdit={() => {
            const row = rows.find((r) => r.id === detailRowId);
            setDetailRowId(null);
            if (row) openEdit(row);
          }}
          onDelete={() => {
            const row = rows.find((r) => r.id === detailRowId);
            setDetailRowId(null);
            if (row) void deleteRow(row);
          }}
          canEdit={clientsCapabilities.canEditClient}
          canDelete={clientsCapabilities.canDeleteClient}
        />
      ) : null}
    </div>
  );
}
