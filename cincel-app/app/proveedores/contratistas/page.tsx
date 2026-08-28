"use client";

import { useState, useEffect } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { EditableCell } from "@/components/proveedores/EditableCell";
import { StarRating } from "@/components/proveedores/StarRating";
import { PillDropdown } from "@/components/proveedores/PillDropdown";
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
    <div className="relative">
      <div className="flex flex-wrap gap-1 items-center cursor-pointer" onClick={() => setOpen(!open)}>
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
      </div>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => { setOpen(false); setAdding(false); }} />
          <div className="absolute left-0 top-full mt-1 z-50 w-64 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
            <div className="max-h-56 overflow-y-auto">
              {options.map((opt) => (
                <label key={opt} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    checked={values.includes(opt)}
                    onChange={() => toggle(opt)}
                    className="accent-blue-600"
                  />
                  {opt}
                </label>
              ))}
            </div>
            {onAddOption && (
              <div className="border-t border-gray-100 p-2">
                {!adding ? (
                  <button onClick={() => setAdding(true)} className="w-full text-left text-xs text-blue-600 hover:text-blue-800 px-2 py-1">
                    + Agregar categoría
                  </button>
                ) : (
                  <div className="flex gap-1">
                    <input
                      autoFocus
                      type="text"
                      value={newVal}
                      onChange={(e) => setNewVal(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && newVal.trim()) { onAddOption(newVal.trim()); setNewVal(""); setAdding(false); } }}
                      placeholder="Nueva categoría…"
                      className="flex-1 text-xs border border-gray-300 rounded px-2 py-1"
                    />
                    <button
                      onClick={() => { if (newVal.trim()) { onAddOption(newVal.trim()); setNewVal(""); setAdding(false); } }}
                      className="px-2 py-1 bg-blue-600 text-white rounded text-xs"
                    >✓</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">Agregar Proveedor</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nombre del proveedor *</label>
            <input
              autoFocus
              type="text"
              required
              value={form.provider}
              onChange={(e) => set("provider", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Ej. Carpintero Juan Pérez"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Estado</label>
              <select value={form.status} onChange={(e) => set("status", e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {DEFAULT_STATUS_OPTIONS.map((o) => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Seniority</label>
              <select value={form.seniority} onChange={(e) => set("seniority", e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {DEFAULT_SENIORITY_OPTIONS.map((o) => <option key={o}>{o}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Ramo Principal</label>
              <select value={form.mainSpecialty} onChange={(e) => set("mainSpecialty", e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">— Seleccionar —</option>
                {DEFAULT_CATEGORY_OPTIONS.map((o) => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Precios/Nivel</label>
              <select value={form.priceLevel} onChange={(e) => set("priceLevel", e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {DEFAULT_PRICE_OPTIONS.map((o) => <option key={o}>{o}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Categorías</label>
            <div className="border border-gray-300 rounded-lg px-3 py-2 max-h-32 overflow-y-auto grid grid-cols-2 gap-1">
              {categoryOptions.map((o) => (
                <label key={o} className="flex items-center gap-1.5 text-xs cursor-pointer hover:text-blue-700">
                  <input type="checkbox" checked={form.categories.includes(o)}
                    onChange={() => set("categories", form.categories.includes(o) ? form.categories.filter((c) => c !== o) : [...form.categories, o])}
                    className="accent-blue-600" />
                  {o}
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Contacto / Teléfono</label>
              <input type="text" value={form.contact} onChange={(e) => set("contact", e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="+52 55 1234-5678" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Fecha de inicio</label>
              <input type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Calificación inicial</label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button key={star} type="button" onClick={() => set("rating", star)}
                  className={`text-2xl leading-none transition-colors ${star <= form.rating ? "text-orange-400" : "text-gray-200"}`}>★</button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Página Web</label>
            <input type="text" value={form.webPage} onChange={(e) => set("webPage", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="https://..." />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Comentarios</label>
            <textarea value={form.comments} onChange={(e) => set("comments", e.target.value)} rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="Notas internas…" />
          </div>

          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-800">
              Cancelar
            </button>
            <button type="submit"
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition shadow-sm">
              Agregar proveedor
            </button>
          </div>
        </form>
      </div>
    </div>
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
              <button
                onClick={() => update(c.id, "secondaryContacts", [""])}
                className="text-blue-600 hover:text-blue-800 underline"
              >
                + Agregar
              </button>
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
                    <button
                      onClick={() => {
                        const updated = (c.secondaryContacts || []).filter((_, i) => i !== idx);
                        update(c.id, "secondaryContacts", updated.length === 0 ? [] : updated);
                      }}
                      className="text-red-400 hover:text-red-600 text-xs"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => update(c.id, "secondaryContacts", [...(c.secondaryContacts || []), ""])}
                  className="text-blue-600 hover:text-blue-800 text-xs underline"
                >
                  + Agregar
                </button>
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
                <input
                  type="text"
                  placeholder="Buscar proveedor…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
                />
                <button
                  onClick={() => setShowActiveOnly(!showActiveOnly)}
                  className={`px-3 py-2 text-sm font-medium rounded-lg transition border ${
                    showActiveOnly
                      ? "bg-emerald-500 text-white border-emerald-500"
                      : "bg-white text-gray-600 border-gray-300 hover:border-emerald-400 hover:text-emerald-600"
                  }`}
                >
                  ● Solo Activos
                </button>
                <button
                  onClick={() => setShowModal(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition shadow-sm"
                >
                  <span className="text-base leading-none font-bold">+</span>
                  Agregar proveedor
                </button>
              </div>
            </div>

            {/* Filtros */}
            <div className="flex items-center gap-2 flex-wrap bg-white border border-gray-200 rounded-lg px-4 py-2.5">
              <span className="text-xs font-medium text-gray-400 mr-1">Filtrar:</span>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-2 py-1 text-xs border border-gray-200 rounded-md bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-700"
              >
                <option value="">Estado: Todos</option>
                {statusOptions.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
              <select
                value={filterSpecialty}
                onChange={(e) => setFilterSpecialty(e.target.value)}
                className="px-2 py-1 text-xs border border-gray-200 rounded-md bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-700"
              >
                <option value="">Ramo: Todos</option>
                {categoryOptions.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
              <select
                value={filterSeniority}
                onChange={(e) => setFilterSeniority(e.target.value)}
                className="px-2 py-1 text-xs border border-gray-200 rounded-md bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-700"
              >
                <option value="">Seniority: Todos</option>
                {seniorityOptions.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
              <select
                value={filterMinRating.toString()}
                onChange={(e) => setFilterMinRating(Number(e.target.value))}
                className="px-2 py-1 text-xs border border-gray-200 rounded-md bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-700"
              >
                <option value="0">Calificación: Todas</option>
                <option value="5">★★★★★  5 estrellas</option>
                <option value="4">★★★★+  4 o más</option>
                <option value="3">★★★+  3 o más</option>
                <option value="2">★★+  2 o más</option>
              </select>
              <select
                value={filterProvider}
                onChange={(e) => setFilterProvider(e.target.value)}
                className="px-2 py-1 text-xs border border-gray-200 rounded-md bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-700"
              >
                <option value="">Proveedor: Todos</option>
                {Array.from(new Set(contractors.map((c) => c.provider))).sort().map((provider) => (
                  <option key={provider} value={provider}>{provider}</option>
                ))}
              </select>
              <select
                value={filterCompany}
                onChange={(e) => setFilterCompany(e.target.value)}
                className="px-2 py-1 text-xs border border-gray-200 rounded-md bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-700"
              >
                <option value="">Empresa: Todos</option>
                {Array.from(new Set(contractors.map((c) => c.company ?? "").filter(Boolean))).sort().map((company) => (
                  <option key={company} value={company}>{company}</option>
                ))}
              </select>
              <select
                value={filterPriceLevel}
                onChange={(e) => setFilterPriceLevel(e.target.value)}
                className="px-2 py-1 text-xs border border-gray-200 rounded-md bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-700"
              >
                <option value="">Precios: Todos</option>
                {priceOptions.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
              {activeFiltersCount > 0 && (
                <button
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
                  className="ml-auto px-2.5 py-1 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 rounded-md transition flex items-center gap-1"
                >
                  ✕ Limpiar ({activeFiltersCount})
                </button>
              )}
            </div>
          </div>

          {/* Table */}
          {filtered.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
              <p className="text-gray-400">{searchTerm ? "Sin resultados" : "No hay proveedores"}</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {columnOrder.map((colKey) => (
                      <th
                        key={colKey}
                        draggable
                        onDragStart={() => setDraggedColumn(colKey)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => {
                          if (draggedColumn) reorderColumn(draggedColumn, colKey);
                          setDraggedColumn(null);
                        }}
                        onDragEnd={() => setDraggedColumn(null)}
                        className={`px-4 py-3 text-left ${columnMinWidth[colKey]} cursor-move hover:bg-gray-100 transition ${
                          draggedColumn === colKey ? "bg-blue-100" : ""
                        }`}
                        title="Arrastra para reordenar"
                      >
                        {columnLabel(colKey)}
                      </th>
                    ))}
                    <th className="px-2 py-3 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map((c) => (
                    <tr key={c.id} className="hover:bg-blue-50/30 transition-colors group">
                      {columnOrder.map((colKey) => (
                        <td key={colKey} className={`px-4 py-3 ${columnMinWidth[colKey]}`}>
                          {renderCell(c, colKey)}
                        </td>
                      ))}

                      {/* Eliminar */}
                      <td className="px-2 py-3 text-right">
                        {deletingId === c.id ? (
                          <div className="flex items-center gap-1 justify-end">
                            <button
                              onClick={() => deleteContractor(c.id)}
                              className="px-2 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700 whitespace-nowrap"
                            >Eliminar</button>
                            <button
                              onClick={() => setDeletingId(null)}
                              className="px-2 py-1 bg-gray-200 text-gray-600 rounded text-xs hover:bg-gray-300"
                            >✕</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeletingId(c.id)}
                            className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition text-base px-1"
                            title="Eliminar proveedor"
                          >🗑</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

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
