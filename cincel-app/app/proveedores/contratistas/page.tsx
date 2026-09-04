"use client";

import { useState, useEffect } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { DataTable } from "@/components/ui/DataTable";
import { EditableCell } from "@/components/proveedores/EditableCell";
import { StarRating } from "@/components/proveedores/StarRating";
import { PillDropdown } from "@/components/proveedores/PillDropdown";
import { Button } from "@/components/ui/shadcn/button";
import { Checkbox } from "@/components/ui/shadcn/checkbox";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/shadcn/sheet";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/shadcn/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";
import { Textarea } from "@/components/ui/shadcn/textarea";
import { contractors as baseContractors } from "@/lib/data/contractors";
import type { Contractor, ContractorStatus, ContractorSeniority, PriceLevel } from "@/lib/types/contractor";
import { getContractorsSnapshot, saveContractors, fetchContractors } from "@/lib/repositories/providers-repository";
import { readStorage, writeStorage } from "@/lib/repositories/browser-state-repository";
import { RepositoryError, reportRepositoryError } from "@/lib/errors";

const OPTIONS_STORAGE_KEY = "cincel.contractors.options.v2";

const DEFAULT_STATUS_OPTIONS: string[] = [
  "Activo", "Pausado", "Lista Negra",
  "Sin actividad con nosotros", "Prospecto", "Inactivo",
];

const DEFAULT_CATEGORY_OPTIONS: string[] = [
  "Acústica","Albañilería","Cancelería","Carpintería",
  "Colocación Pisos Madera","Colocación y Acabados","Espejos",
  "Herrero","Iluminación","IE","IHS","Instalaciones Especiales",
  "HVAC","Macetas","Mármoles","Materiales de Construcción",
  "Mobiliario Habitacional","Mob Restaurante","Mob Oficina",
  "Paneles","Pisos","Soluciones de Ingeniería","Tapicería",
];

const DEFAULT_SENIORITY_OPTIONS: string[] = [
  "Excelente","Nivel Medio","Con detalles","Bajo","No trabajes con el",
];

const DEFAULT_PRICE_OPTIONS: string[] = [
  "Gama Alta","Nivel Medio","Medio-Bajo","Bajo","No Trabajes con el",
];

const COLORS_STORAGE_KEY = "cincel.contractors.colors.v1";
const COLUMN_ORDER_STORAGE_KEY = "cincel.contractors.column.order.v2";

const ALL_STATUS_VALUE = "__all_status__";
const ALL_SPECIALTY_VALUE = "__all_specialty__";
const ALL_SENIORITY_VALUE = "__all_seniority__";
const ALL_PROVIDER_VALUE = "__all_provider__";
const ALL_COMPANY_VALUE = "__all_company__";
const ALL_PRICE_LEVEL_VALUE = "__all_price_level__";
const NO_SPECIALTY_VALUE = "__no_specialty__";

type ColumnKey = "company" | "provider" | "status" | "mainSpecialty" | "categories" | "seniority" | "priceLevel" | "rating" | "contact" | "secondaryContacts" | "startDate" | "comments" | "webPage";

const DEFAULT_COLUMN_ORDER: ColumnKey[] = [
  "provider", "company", "status", "mainSpecialty", "categories", "seniority",
  "priceLevel", "rating", "contact", "secondaryContacts", "startDate", "comments", "webPage",
];

type LegacyContractor = Contractor & { name?: string };

function normalizeBaseContractors(): Contractor[] {
  return baseContractors.map((contractor) => {
    const legacy = contractor as LegacyContractor;

    return {
      ...contractor,
      provider: contractor.provider || legacy.name || "Sin proveedor",
    };
  });
}

function loadStoredContractors(): Contractor[] {
  const snapshot = getContractorsSnapshot();
  if (snapshot.length === 0) return normalizeBaseContractors();
  return snapshot;
}


const statusStyle = (s: string) => {
  const map: Record<string, string> = {
    "Activo": "bg-emerald-100 text-emerald-700",
    "Pausado": "bg-orange-100 text-orange-700",
    "Lista Negra": "bg-red-100 text-red-700",
    "Sin actividad con nosotros": "bg-gray-100 text-gray-700",
    "Prospecto": "bg-blue-100 text-blue-700",
    "Inactivo": "bg-gray-100 text-gray-700",
  };
  return map[s] ?? "bg-gray-100 text-gray-700";
};

const seniorityStyle = (s: string) => {
  const map: Record<string, string> = {
    "Excelente": "bg-emerald-100 text-emerald-700",
    "Nivel Medio": "bg-yellow-100 text-yellow-700",
    "Con detalles": "bg-orange-100 text-orange-700",
    "Bajo": "bg-red-100 text-red-700",
    "No trabajes con el": "bg-red-200 text-red-800",
  };
  return map[s] ?? "bg-gray-100 text-gray-700";
};

const priceStyle = (p: string) => {
  const map: Record<string, string> = {
    "Gama Alta": "bg-emerald-100 text-emerald-700",
    "Nivel Medio": "bg-yellow-100 text-yellow-700",
    "Medio-Bajo": "bg-orange-100 text-orange-700",
    "Bajo": "bg-red-100 text-red-700",
    "No Trabajes con el": "bg-red-200 text-red-800",
  };
  return map[p] ?? "bg-gray-100 text-gray-700";
};

const specialtyStyle = (s: string) => {
  const map: Record<string, string> = {
    "Albañilería": "bg-slate-100 text-slate-700",
    "IE": "bg-slate-100 text-slate-800",
    "Cancelería": "bg-cyan-100 text-cyan-700",
    "Carpintería": "bg-amber-100 text-amber-700",
    "Acústica": "bg-orange-100 text-orange-700",
    "Tapicería": "bg-purple-100 text-purple-700",
    "Colocación": "bg-stone-100 text-stone-700",
    "Herrería": "bg-gray-100 text-gray-700",
    "Pintura": "bg-slate-100 text-slate-700",
    "Limpieza": "bg-gray-100 text-gray-700",
    "Herrero": "bg-gray-100 text-gray-700",
    "General": "bg-gray-100 text-gray-700",
    "IHS": "bg-indigo-100 text-indigo-700",
    "HVAC": "bg-sky-100 text-sky-700",
    "Mármoles": "bg-stone-100 text-stone-700",
    "Pisos": "bg-amber-100 text-amber-700",
    "Paneles": "bg-teal-100 text-teal-700",
    "Colocación Pisos Madera": "bg-stone-100 text-stone-700",
    "Colocación y Acabados": "bg-stone-100 text-stone-700",
    "Mobiliario Habitacional": "bg-blue-100 text-blue-700",
    "Mob Restaurante": "bg-blue-100 text-blue-700",
    "Mob Oficina": "bg-blue-100 text-blue-700",
    "Espejos": "bg-cyan-100 text-cyan-700",
    "Iluminación": "bg-yellow-100 text-yellow-700",
    "Instalaciones Especiales": "bg-indigo-100 text-indigo-700",
    "Soluciones de Ingeniería": "bg-violet-100 text-violet-700",
    "Materiales de Construcción": "bg-stone-100 text-stone-700",
    "Macetas": "bg-lime-100 text-lime-700",
  };
  return map[s] ?? "bg-blue-100 text-blue-700";
};

// ── CategoryMultiSelect ──────────────────────────────────────────────────────

const CategoryMultiSelect = ({
  values, options, onSave, onAddOption,
}: {
  values: string[];
  options: string[];
  onSave: (v: string[]) => void;
  onAddOption?: (v: string) => void;
}) => {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newVal, setNewVal] = useState("");
  const MAX_VISIBLE = 2;

  const toggle = (opt: string) => {
    const next = values.includes(opt) ? values.filter((v) => v !== opt) : [...values, opt];
    onSave(next);
  };

  const visible = values.slice(0, MAX_VISIBLE);
  const extra = values.length - MAX_VISIBLE;

  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setAdding(false); }}>
      <PopoverTrigger className="flex flex-wrap gap-1 items-center">
        {values.length === 0 && (
          <span className="text-gray-300 text-xs italic hover:text-gray-400">+ agregar</span>
        )}
        {visible.map((v) => (
          <span key={v} className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded text-xs whitespace-nowrap">
            {v}
          </span>
        ))}
        {extra > 0 && (
          <span className="px-1.5 py-0.5 bg-gray-800 text-white rounded-full text-xs font-bold">+{extra}</span>
        )}
      </PopoverTrigger>

      <PopoverContent align="start" className="w-64 overflow-hidden p-0">
        <div className="max-h-56 overflow-y-auto">
          {options.map((opt) => (
            <label key={opt} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm">
              <Checkbox checked={values.includes(opt)} onCheckedChange={() => toggle(opt)} />
              {opt}
            </label>
          ))}
        </div>
        {onAddOption && (
          <div className="border-t border-gray-100 p-2">
            {!adding ? (
              <Button variant="link" className="h-auto w-full justify-start px-2 py-1 text-xs" onClick={() => setAdding(true)}>
                + Agregar categoría
              </Button>
            ) : (
              <div className="flex gap-1">
                <Input
                  autoFocus
                  type="text"
                  value={newVal}
                  onChange={(e) => setNewVal(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && newVal.trim()) { onAddOption(newVal.trim()); setNewVal(""); setAdding(false); } }}
                  placeholder="Nueva categoría…"
                  className="h-auto flex-1 px-2 py-1 text-xs"
                />
                <Button
                  className="h-auto px-2 py-1 text-xs"
                  onClick={() => { if (newVal.trim()) { onAddOption(newVal.trim()); setNewVal(""); setAdding(false); } }}
                >✓</Button>
              </div>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};

// ── AddContractorModal ───────────────────────────────────────────────────────

const AddContractorModal = ({
  onClose, onAdd, categoryOptions,
}: {
  onClose: () => void;
  onAdd: (c: Contractor) => void;
  categoryOptions: string[];
}) => {
  const [form, setForm] = useState({
    provider: "", status: "Activo", categories: [] as string[],
    mainSpecialty: "", seniority: "Nivel Medio", priceLevel: "Nivel Medio",
    rating: 3, contact: "", secondaryContacts: [] as string[], startDate: "", comments: "", webPage: "",
  });

  const set = (field: string, value: unknown) => setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.provider.trim()) return;
    onAdd({
      id: Date.now(),
      provider: form.provider.trim(),
      status: form.status as ContractorStatus,
      categories: form.categories,
      mainSpecialty: form.mainSpecialty,
      seniority: form.seniority as ContractorSeniority,
      priceLevel: form.priceLevel as PriceLevel,
      rating: form.rating,
      contact: form.contact,
      secondaryContacts: form.secondaryContacts.filter((c) => c.trim()),
      startDate: form.startDate,
      comments: form.comments,
      webPage: form.webPage,
    });
  };

  return (
    <Sheet open onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Agregar Proveedor</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-4">
          <div className="space-y-1">
            <Label htmlFor="add-contractor-provider">Nombre del proveedor *</Label>
            <Input
              id="add-contractor-provider"
              autoFocus
              type="text"
              required
              value={form.provider}
              onChange={(e) => set("provider", e.target.value)}
              placeholder="Ej. Carpintero Juan Pérez"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="add-contractor-status">Estado</Label>
              <Select value={form.status as string} onValueChange={(v) => set("status", v)}>
                <SelectTrigger id="add-contractor-status" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DEFAULT_STATUS_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="add-contractor-seniority">Seniority</Label>
              <Select value={form.seniority as string} onValueChange={(v) => set("seniority", v)}>
                <SelectTrigger id="add-contractor-seniority" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DEFAULT_SENIORITY_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="add-contractor-main-specialty">Ramo Principal</Label>
              <Select value={form.mainSpecialty || NO_SPECIALTY_VALUE} onValueChange={(v) => set("mainSpecialty", v === NO_SPECIALTY_VALUE ? "" : v)}>
                <SelectTrigger id="add-contractor-main-specialty" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_SPECIALTY_VALUE}>— Seleccionar —</SelectItem>
                  {DEFAULT_CATEGORY_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="add-contractor-price-level">Precios/Nivel</Label>
              <Select value={form.priceLevel as string} onValueChange={(v) => set("priceLevel", v)}>
                <SelectTrigger id="add-contractor-price-level" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DEFAULT_PRICE_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label>Categorías</Label>
            <div className="border border-gray-300 rounded-lg px-3 py-2 max-h-32 overflow-y-auto grid grid-cols-2 gap-1">
              {categoryOptions.map((o) => (
                <label key={o} className="flex items-center gap-1.5 text-xs cursor-pointer hover:text-blue-700">
                  <Checkbox
                    checked={form.categories.includes(o)}
                    onCheckedChange={() => set("categories", form.categories.includes(o) ? form.categories.filter((c) => c !== o) : [...form.categories, o])}
                  />
                  {o}
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="add-contractor-contact">Contacto / Teléfono</Label>
              <Input id="add-contractor-contact" type="text" value={form.contact} onChange={(e) => set("contact", e.target.value)} placeholder="+52 55 1234-5678" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="add-contractor-start-date">Fecha de inicio</Label>
              <Input id="add-contractor-start-date" type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Calificación inicial</Label>
            <StarRating rating={form.rating} onRate={(r) => set("rating", r)} />
          </div>

          <div className="space-y-1">
            <Label htmlFor="add-contractor-webpage">Página Web</Label>
            <Input id="add-contractor-webpage" type="text" value={form.webPage} onChange={(e) => set("webPage", e.target.value)} placeholder="https://..." />
          </div>

          <div className="space-y-1">
            <Label htmlFor="add-contractor-comments">Comentarios</Label>
            <Textarea id="add-contractor-comments" value={form.comments} onChange={(e) => set("comments", e.target.value)} rows={2} placeholder="Notas internas…" />
          </div>

          <SheetFooter className="mt-0 flex-row justify-end border-t-0 p-0 pt-1">
            <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button type="submit">Agregar proveedor</Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
};

// ── Main Page ────────────────────────────────────────────────────────────────

export default function ContratistasPage() {
  const [contractors, setContractors] = useState<Contractor[]>(() => normalizeBaseContractors());
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [showActiveOnly, setShowActiveOnly] = useState(false);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterSpecialty, setFilterSpecialty] = useState("");
  const [filterSeniority, setFilterSeniority] = useState("");
  const [filterMinRating, setFilterMinRating] = useState(0);
  const [filterProvider, setFilterProvider] = useState("");
  const [filterCompany, setFilterCompany] = useState("");
  const [filterPriceLevel, setFilterPriceLevel] = useState("");
  const [filterCategories, setFilterCategories] = useState<string[]>([]);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const [statusOptions, setStatusOptions] = useState<string[]>(DEFAULT_STATUS_OPTIONS);
  const [categoryOptions, setCategoryOptions] = useState<string[]>(DEFAULT_CATEGORY_OPTIONS);
  const [seniorityOptions, setSeniorityOptions] = useState<string[]>(DEFAULT_SENIORITY_OPTIONS);
  const [priceOptions, setPriceOptions] = useState<string[]>(DEFAULT_PRICE_OPTIONS);
  const [optionColors, setOptionColors] = useState<Record<string, { bg: string; text: string }>>({});
  const [columnOrder, setColumnOrder] = useState<ColumnKey[]>(DEFAULT_COLUMN_ORDER);
  const [draggedColumn, setDraggedColumn] = useState<ColumnKey | null>(null);

  useEffect(() => {
    const hydrate = async () => {
      try {
        setContractors(loadStoredContractors());

        const storedOpts = readStorage(OPTIONS_STORAGE_KEY);
        if (storedOpts) {
          const o = JSON.parse(storedOpts) as Partial<{
            statusOptions: string[];
            categoryOptions: string[];
            seniorityOptions: string[];
            priceOptions: string[];
          }>;

          if (o.statusOptions) setStatusOptions(o.statusOptions);
          if (o.categoryOptions) setCategoryOptions(o.categoryOptions);
          if (o.seniorityOptions) setSeniorityOptions(o.seniorityOptions);
          if (o.priceOptions) setPriceOptions(o.priceOptions);
        }

        const storedColors = readStorage(COLORS_STORAGE_KEY);
        if (storedColors) setOptionColors(JSON.parse(storedColors));

        const storedColumnOrder = readStorage(COLUMN_ORDER_STORAGE_KEY);
        if (storedColumnOrder) setColumnOrder(JSON.parse(storedColumnOrder));

        // Hidratación async desde Supabase (cuando está habilitado)
        const remote = await fetchContractors();
        setContractors(remote);
      } catch (err) {
        if (err instanceof RepositoryError) {
          reportRepositoryError(err);
        }
      } finally {
        setLoading(false);
      }
    };

    void hydrate();
  }, []);

  const save = (next: Contractor[]) => {
    setContractors(next);
    saveContractors(next).catch((err: unknown) => {
      if (err instanceof RepositoryError) reportRepositoryError(err);
    });
  };

  const saveOpts = (patch: Partial<{ statusOptions: string[]; categoryOptions: string[]; seniorityOptions: string[]; priceOptions: string[] }>) => {
    const merged = { statusOptions, categoryOptions, seniorityOptions, priceOptions, ...patch };
    if (patch.statusOptions) setStatusOptions(patch.statusOptions);
    if (patch.categoryOptions) setCategoryOptions(patch.categoryOptions);
    if (patch.seniorityOptions) setSeniorityOptions(patch.seniorityOptions);
    if (patch.priceOptions) setPriceOptions(patch.priceOptions);
    writeStorage(OPTIONS_STORAGE_KEY, JSON.stringify(merged));
  };

  const deleteOption = (arrayName: "statusOptions" | "categoryOptions" | "seniorityOptions" | "priceOptions", option: string) => {
    const updated = {
      statusOptions: arrayName === "statusOptions" ? statusOptions.filter((o) => o !== option) : statusOptions,
      categoryOptions: arrayName === "categoryOptions" ? categoryOptions.filter((o) => o !== option) : categoryOptions,
      seniorityOptions: arrayName === "seniorityOptions" ? seniorityOptions.filter((o) => o !== option) : seniorityOptions,
      priceOptions: arrayName === "priceOptions" ? priceOptions.filter((o) => o !== option) : priceOptions,
    };
    saveOpts(updated);
    // Remove option from all contractors
    const updated_contractors = contractors.map((c) => {
      const result = { ...c };
      if (arrayName === "statusOptions" && result.status === option) result.status = "";
      if (arrayName === "categoryOptions" && result.mainSpecialty === option) result.mainSpecialty = "";
      if (arrayName === "categoryOptions" && result.categories.includes(option)) 
        result.categories = result.categories.filter((cat) => cat !== option);
      if (arrayName === "seniorityOptions" && result.seniority === option) result.seniority = "";
      if (arrayName === "priceOptions" && result.priceLevel === option) result.priceLevel = "";
      return result;
    });
    save(updated_contractors);
  };

  const update = (id: number, field: keyof Contractor, value: unknown) =>
    save(contractors.map((c) => (c.id === id ? { ...c, [field]: value } : c)));

  const addContractor = (c: Contractor) => { save([...contractors, c]); setShowModal(false); };

  const deleteContractor = (id: number) => {
    save(contractors.filter((c) => c.id !== id));
    setDeletingId(null);
  };

  const setColor = (option: string, color: { bg: string; text: string }) => {
    const next = { ...optionColors, [option]: color };
    setOptionColors(next);
    writeStorage(COLORS_STORAGE_KEY, JSON.stringify(next));
  };

  const reorderColumn = (sourceKey: ColumnKey, targetKey: ColumnKey) => {
    const sourceIdx = columnOrder.indexOf(sourceKey);
    const targetIdx = columnOrder.indexOf(targetKey);
    if (sourceIdx === -1 || targetIdx === -1 || sourceIdx === targetIdx) return;
    
    const newOrder = [...columnOrder];
    newOrder.splice(sourceIdx, 1);
    
    // Adjust target index if source was before target
    const adjustedTargetIdx = sourceIdx < targetIdx ? targetIdx - 1 : targetIdx;
    newOrder.splice(adjustedTargetIdx, 0, sourceKey);
    
    setColumnOrder(newOrder);
    writeStorage(COLUMN_ORDER_STORAGE_KEY, JSON.stringify(newOrder));
  };

  const columnLabel = (key: ColumnKey): string => {
    const labels: Record<ColumnKey, string> = {
      company: "Empresa", provider: "Proveedor", status: "Estado", mainSpecialty: "Ramo Principal", 
      categories: "Categorías", seniority: "Seniority", priceLevel: "Precios/Nivel",
      rating: "Calificación", contact: "Contacto", secondaryContacts: "Contactos Secundarios",
      startDate: "Inicio", comments: "Comentarios", webPage: "Web",
    };
    return labels[key];
  };

  const columnMinWidth: Record<ColumnKey, string> = {
    provider: "min-w-[180px]", company: "min-w-[180px]", status: "min-w-[150px]", mainSpecialty: "min-w-[150px]",
    categories: "min-w-[180px]", seniority: "min-w-[130px]", priceLevel: "min-w-[130px]",
    rating: "min-w-[110px]", contact: "min-w-[140px]", secondaryContacts: "min-w-[140px]",
    startDate: "min-w-[110px]", comments: "min-w-[160px]", webPage: "min-w-[120px]",
  };

  const renderCell = (contractor: Contractor, key: ColumnKey) => {
    const c = contractor;
    switch (key) {
      case "company":
        return <EditableCell value={c.company ?? ""} onSave={(v) => update(c.id, "company", v)} />;
      case "provider":
        return <EditableCell value={c.provider} onSave={(v) => update(c.id, "provider", v)} />;
      case "status":
        return (
          <PillDropdown
            value={c.status} options={statusOptions} colorFn={statusStyle}
            onSave={(v) => update(c.id, "status", v)}
            onAddOption={(v) => saveOpts({ statusOptions: [...statusOptions, v] })}
            onDeleteOption={(v) => deleteOption("statusOptions", v)}
            optionColors={optionColors} onSetColor={setColor}
          />
        );
      case "mainSpecialty":
        return (
          <PillDropdown
            value={c.mainSpecialty} options={categoryOptions} colorFn={specialtyStyle}
            onSave={(v) => update(c.id, "mainSpecialty", v)}
            onAddOption={(v) => saveOpts({ categoryOptions: [...categoryOptions, v] })}
            onDeleteOption={(v) => deleteOption("categoryOptions", v)}
            optionColors={optionColors} onSetColor={setColor}
          />
        );
      case "categories":
        return (
          <CategoryMultiSelect
            values={c.categories} options={categoryOptions}
            onSave={(v) => update(c.id, "categories", v)}
            onAddOption={(v) => saveOpts({ categoryOptions: [...categoryOptions, v] })}
          />
        );
      case "seniority":
        return (
          <PillDropdown
            value={c.seniority} options={seniorityOptions} colorFn={seniorityStyle}
            onSave={(v) => update(c.id, "seniority", v)}
            onAddOption={(v) => saveOpts({ seniorityOptions: [...seniorityOptions, v] })}
            onDeleteOption={(v) => deleteOption("seniorityOptions", v)}
            optionColors={optionColors} onSetColor={setColor}
          />
        );
      case "priceLevel":
        return (
          <PillDropdown
            value={c.priceLevel} options={priceOptions} colorFn={priceStyle}
            onSave={(v) => update(c.id, "priceLevel", v)}
            onAddOption={(v) => saveOpts({ priceOptions: [...priceOptions, v] })}
            onDeleteOption={(v) => deleteOption("priceOptions", v)}
            optionColors={optionColors} onSetColor={setColor}
          />
        );
      case "rating":
        return <StarRating rating={c.rating} onRate={(v) => update(c.id, "rating", v)} />;
      case "contact":
        return <EditableCell value={c.contact ?? ""} onSave={(v) => update(c.id, "contact", v)} />;
      case "secondaryContacts":
        return (
          <div className="text-xs text-gray-600">
            {!c.secondaryContacts || c.secondaryContacts.length === 0 ? (
              <Button
                variant="link"
                className="h-auto p-0 text-blue-600 hover:text-blue-800"
                onClick={() => update(c.id, "secondaryContacts", [""])}
              >
                + Agregar
              </Button>
            ) : (
              <div className="space-y-1">
                {c.secondaryContacts.map((contact, idx) => (
                  <div key={idx} className="flex items-center gap-1">
                    <EditableCell
                      value={contact}
                      onSave={(v) => {
                        const updated = [...(c.secondaryContacts || [])];
                        updated[idx] = v;
                        update(c.id, "secondaryContacts", updated);
                      }}
                    />
                    <Button
                      variant="ghost"
                      className="h-auto p-0 text-xs text-red-400 hover:text-red-600"
                      onClick={() => {
                        const updated = (c.secondaryContacts || []).filter((_, i) => i !== idx);
                        update(c.id, "secondaryContacts", updated.length === 0 ? [] : updated);
                      }}
                    >
                      ✕
                    </Button>
                  </div>
                ))}
                <Button
                  variant="link"
                  className="h-auto p-0 text-xs text-blue-600 hover:text-blue-800"
                  onClick={() => update(c.id, "secondaryContacts", [...(c.secondaryContacts || []), ""])}
                >
                  + Agregar
                </Button>
              </div>
            )}
          </div>
        );
      case "startDate":
        return <EditableCell value={c.startDate ?? ""} type="date" onSave={(v) => update(c.id, "startDate", v)} />;
      case "comments":
        return <EditableCell value={c.comments ?? ""} type="textarea" onSave={(v) => update(c.id, "comments", v)} />;
      case "webPage":
        return <EditableCell value={c.webPage ?? ""} onSave={(v) => update(c.id, "webPage", v)} />;
      default:
        return null;
    }
  };

  const sortValue = (c: Contractor, key: ColumnKey): string | number => {
    switch (key) {
      case "company": return c.company ?? "";
      case "provider": return c.provider ?? "";
      case "status": return c.status ?? "";
      case "mainSpecialty": return c.mainSpecialty ?? "";
      case "categories": return (c.categories || []).join(", ");
      case "seniority": return c.seniority ?? "";
      case "priceLevel": return c.priceLevel ?? "";
      case "rating": return c.rating ?? 0;
      case "contact": return c.contact ?? "";
      case "secondaryContacts": return (c.secondaryContacts || []).join(", ");
      case "startDate": return c.startDate ?? "";
      case "comments": return c.comments ?? "";
      case "webPage": return c.webPage ?? "";
      default: return "";
    }
  };

  const columns: ColumnDef<Contractor, unknown>[] = [
    ...columnOrder.map((key): ColumnDef<Contractor, unknown> => ({
      id: key,
      accessorFn: (row) => sortValue(row, key),
      header: () => (
        <div
          draggable
          onDragStart={() => setDraggedColumn(key)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => {
            if (draggedColumn) reorderColumn(draggedColumn, key);
            setDraggedColumn(null);
          }}
          onDragEnd={() => setDraggedColumn(null)}
          className={`cursor-move ${draggedColumn === key ? "text-blue-600" : ""}`}
          title="Arrastra para reordenar"
        >
          {columnLabel(key)}
        </div>
      ),
      cell: ({ row }) => <div className={columnMinWidth[key]}>{renderCell(row.original, key)}</div>,
    })),
    {
      id: "actions",
      header: () => null,
      enableSorting: false,
      cell: ({ row }) => {
        const c = row.original;
        return deletingId === c.id ? (
          <div className="flex items-center gap-1 justify-end">
            <Button
              size="sm"
              variant="destructive"
              className="h-auto px-2 py-1 text-xs"
              onClick={() => deleteContractor(c.id)}
            >Eliminar</Button>
            <Button
              size="sm"
              variant="secondary"
              className="h-auto px-2 py-1 text-xs"
              onClick={() => setDeletingId(null)}
            >✕</Button>
          </div>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="h-auto px-1 py-0 opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 text-base"
            onClick={() => setDeletingId(c.id)}
            title="Eliminar proveedor"
          >🗑</Button>
        );
      },
    },
  ];

  const activeFiltersCount = [showActiveOnly, !!filterStatus, !!filterSpecialty, !!filterSeniority, filterMinRating > 0, !!filterProvider, !!filterCompany, !!filterPriceLevel, filterCategories.length > 0].filter(Boolean).length;

  const filtered = contractors.filter((c) => {
    if (showActiveOnly && c.status !== "Activo") return false;
    if (filterStatus && c.status !== filterStatus) return false;
    if (filterSpecialty && c.mainSpecialty !== filterSpecialty) return false;
    if (filterSeniority && c.seniority !== filterSeniority) return false;
    if (filterMinRating > 0 && (c.rating ?? 0) < filterMinRating) return false;
    if (filterProvider && !(c.provider ?? "").toLowerCase().includes(filterProvider.toLowerCase())) return false;
    if (filterCompany && !(c.company ?? "").toLowerCase().includes(filterCompany.toLowerCase())) return false;
    if (filterPriceLevel && c.priceLevel !== filterPriceLevel) return false;
    if (filterCategories.length > 0 && !c.categories.some((cat) => filterCategories.includes(cat))) return false;
    if (searchTerm && !(c.provider ?? "").toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex">
        <Sidebar /><div className="flex-1 flex flex-col"><Header />
          <div className="flex-1 flex items-center justify-center">
            <p className="text-gray-400 text-sm">Cargando…</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header />
        <main className="flex-1 overflow-auto p-6">

          {/* Header bar */}
          <div className="mb-5">
            <div className="flex items-center justify-between mb-3">
              <h1 className="text-2xl font-bold text-gray-900">Contratistas</h1>
              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  placeholder="Buscar proveedor…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-48"
                />
                <Button
                  variant={showActiveOnly ? "default" : "outline"}
                  className={showActiveOnly ? "bg-emerald-500 hover:bg-emerald-600 border-emerald-500" : ""}
                  onClick={() => setShowActiveOnly(!showActiveOnly)}
                >
                  ● Solo Activos
                </Button>
                <Button onClick={() => setShowModal(true)}>
                  + Agregar proveedor
                </Button>
              </div>
            </div>

            {/* Filtros */}
            <div className="flex items-center gap-2 flex-wrap bg-white border border-gray-200 rounded-lg px-4 py-2.5">
              <span className="text-xs font-medium text-gray-400 mr-1">Filtrar:</span>
              <Select value={filterStatus || ALL_STATUS_VALUE} onValueChange={(v) => setFilterStatus(v === ALL_STATUS_VALUE ? "" : (v as string))}>
                <SelectTrigger className="h-auto px-2 py-1 text-xs bg-gray-50"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_STATUS_VALUE}>Estado: Todos</SelectItem>
                  {statusOptions.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterSpecialty || ALL_SPECIALTY_VALUE} onValueChange={(v) => setFilterSpecialty(v === ALL_SPECIALTY_VALUE ? "" : (v as string))}>
                <SelectTrigger className="h-auto px-2 py-1 text-xs bg-gray-50"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_SPECIALTY_VALUE}>Ramo: Todos</SelectItem>
                  {categoryOptions.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterSeniority || ALL_SENIORITY_VALUE} onValueChange={(v) => setFilterSeniority(v === ALL_SENIORITY_VALUE ? "" : (v as string))}>
                <SelectTrigger className="h-auto px-2 py-1 text-xs bg-gray-50"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_SENIORITY_VALUE}>Seniority: Todos</SelectItem>
                  {seniorityOptions.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterMinRating.toString()} onValueChange={(v) => setFilterMinRating(Number(v))}>
                <SelectTrigger className="h-auto px-2 py-1 text-xs bg-gray-50"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Calificación: Todas</SelectItem>
                  <SelectItem value="5">★★★★★  5 estrellas</SelectItem>
                  <SelectItem value="4">★★★★+  4 o más</SelectItem>
                  <SelectItem value="3">★★★+  3 o más</SelectItem>
                  <SelectItem value="2">★★+  2 o más</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterProvider || ALL_PROVIDER_VALUE} onValueChange={(v) => setFilterProvider(v === ALL_PROVIDER_VALUE ? "" : (v as string))}>
                <SelectTrigger className="h-auto px-2 py-1 text-xs bg-gray-50"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_PROVIDER_VALUE}>Proveedor: Todos</SelectItem>
                  {Array.from(new Set(contractors.map((c) => c.provider))).sort().map((provider) => (
                    <SelectItem key={provider} value={provider}>{provider}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterCompany || ALL_COMPANY_VALUE} onValueChange={(v) => setFilterCompany(v === ALL_COMPANY_VALUE ? "" : (v as string))}>
                <SelectTrigger className="h-auto px-2 py-1 text-xs bg-gray-50"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_COMPANY_VALUE}>Empresa: Todos</SelectItem>
                  {Array.from(new Set(contractors.map((c) => c.company ?? "").filter(Boolean))).sort().map((company) => (
                    <SelectItem key={company} value={company}>{company}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterPriceLevel || ALL_PRICE_LEVEL_VALUE} onValueChange={(v) => setFilterPriceLevel(v === ALL_PRICE_LEVEL_VALUE ? "" : (v as string))}>
                <SelectTrigger className="h-auto px-2 py-1 text-xs bg-gray-50"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_PRICE_LEVEL_VALUE}>Precios: Todos</SelectItem>
                  {priceOptions.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
              {activeFiltersCount > 0 && (
                <Button
                  variant="ghost"
                  className="ml-auto h-auto px-2.5 py-1 text-xs text-red-500 hover:text-red-700 hover:bg-red-50"
                  onClick={() => {
                    setFilterStatus("");
                    setFilterSpecialty("");
                    setFilterSeniority("");
                    setFilterMinRating(0);
                    setShowActiveOnly(false);
                    setFilterProvider("");
                    setFilterCompany("");
                    setFilterPriceLevel("");
                    setFilterCategories([]);
                  }}
                >
                  ✕ Limpiar ({activeFiltersCount})
                </Button>
              )}
            </div>
          </div>

          {/* Table */}
          <DataTable
            columns={columns}
            data={filtered}
            getRowId={(c) => String(c.id)}
            rowClassName={() => "group"}
            emptyMessage={searchTerm ? "Sin resultados" : "No hay proveedores"}
          />

          <p className="text-xs text-gray-400 mt-3">{filtered.length} proveedor{filtered.length !== 1 ? "es" : ""}</p>
        </main>
      </div>

      {showModal && (
        <AddContractorModal
          onClose={() => setShowModal(false)}
          onAdd={addContractor}
          categoryOptions={categoryOptions}
        />
      )}
    </div>
  );
}
