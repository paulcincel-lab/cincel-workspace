"use client";

import { useState, useEffect } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { tiendas as baseTiendas } from "@/lib/data/tiendas";
import type { Tienda, TiendaStatus, TiendaType, TiendaPriceLevel } from "@/lib/types/tienda";
import { getTiendasSnapshot, saveTiendas, fetchTiendas } from "@/lib/repositories/providers-repository";
import { readStorage, writeStorage } from "@/lib/repositories/browser-state-repository";
import { SupabaseOperationError, reportSupabaseError } from "@/lib/supabase/errors";

const OPTIONS_STORAGE_KEY = "cincel.tiendas.options.v2";
const COLUMN_ORDER_STORAGE_KEY = "cincel.tiendas.column.order.v2";
const COLORS_STORAGE_KEY = "cincel.tiendas.colors.v1";

const DEFAULT_STATUS_OPTIONS: TiendaStatus[] = ["Activa", "Inactiva", "Cerrada", "Próximo Abierto"];
const DEFAULT_TYPE_OPTIONS: TiendaType[] = ["Física", "Online", "Híbrida"];
const DEFAULT_SPECIALTY_OPTIONS: string[] = ["Retail", "E-commerce", "Eventos", "Retail Omnichannel"];
const DEFAULT_PRICE_OPTIONS: TiendaPriceLevel[] = ["Gama Alta", "Nivel Medio", "Medio-Bajo", "Bajo"];

const COLOR_PALETTE: { label: string; bg: string; text: string }[] = [
  { label: "Verde",         bg: "#10b981", text: "#ffffff" },
  { label: "Verde oscuro",  bg: "#065f46", text: "#ffffff" },
  { label: "Azul",          bg: "#3b82f6", text: "#ffffff" },
  { label: "Azul marino",   bg: "#1e3a5f", text: "#ffffff" },
  { label: "Cyan",          bg: "#06b6d4", text: "#1f2937" },
  { label: "Naranja",       bg: "#f97316", text: "#ffffff" },
  { label: "Rojo",          bg: "#ef4444", text: "#ffffff" },
  { label: "Púrpura",       bg: "#a855f7", text: "#ffffff" },
];

type ColumnKey = "name" | "company" | "status" | "type" | "mainSpecialty" | "categories" | "location" | "contact" | "secondaryContacts" | "priceLevel" | "rating" | "startDate" | "comments" | "website";

const DEFAULT_COLUMN_ORDER: ColumnKey[] = [
  "name", "company", "status", "type", "mainSpecialty", "categories", "location", "contact", "secondaryContacts", "priceLevel", "rating", "startDate", "comments", "website",
];

const statusStyle = (s: TiendaStatus) => {
  const map: Record<TiendaStatus, string> = {
    "Activa": "bg-emerald-100 text-emerald-700",
    "Inactiva": "bg-gray-100 text-gray-700",
    "Cerrada": "bg-red-100 text-red-700",
    "Próximo Abierto": "bg-blue-100 text-blue-700",
  };
  return map[s] ?? "bg-gray-100 text-gray-700";
};

const typeStyle = (t: TiendaType) => {
  const map: Record<TiendaType, string> = {
    "Física": "bg-slate-100 text-slate-700",
    "Online": "bg-cyan-100 text-cyan-700",
    "Híbrida": "bg-indigo-100 text-indigo-700",
  };
  return map[t] ?? "bg-gray-100 text-gray-700";
};

const priceStyle = (p: string) => {
  const map: Record<string, string> = {
    "Gama Alta": "bg-emerald-100 text-emerald-700",
    "Nivel Medio": "bg-yellow-100 text-yellow-700",
    "Medio-Bajo": "bg-orange-100 text-orange-700",
    "Bajo": "bg-red-100 text-red-700",
  };
  return map[p] ?? "bg-gray-100 text-gray-700";
};

// ── EditableCell ──────────────────────────────────────────────────────────────

const EditableCell = ({ value, onSave, type = "text" }: {
  value: string; onSave: (v: string) => void; type?: "text" | "date" | "textarea";
}) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const save = () => { onSave(draft); setEditing(false); };

  if (editing) {
    return (
      <div className="flex gap-1 min-w-[100px]">
        {type === "textarea" ? (
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="flex-1 text-xs border border-blue-400 rounded px-2 py-1 resize-none"
            rows={2}
          />
        ) : (
          <input
            autoFocus
            type={type}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            className="flex-1 text-xs border border-blue-400 rounded px-2 py-1 min-w-[90px]"
          />
        )}
        <button onClick={save} className="text-emerald-600 font-bold text-sm">✓</button>
        <button onClick={() => { setDraft(value); setEditing(false); }} className="text-gray-400 text-sm">✕</button>
      </div>
    );
  }

  return (
    <div
      onClick={() => { setDraft(value); setEditing(true); }}
      className="cursor-pointer group flex items-center gap-1 min-h-[26px]"
    >
      <span className="text-xs text-gray-700">{value || <span className="text-gray-300">—</span>}</span>
      <span className="opacity-0 group-hover:opacity-60 text-gray-400 text-xs">✎</span>
    </div>
  );
};

// ── StarRating ────────────────────────────────────────────────────────────────

const StarRating = ({ rating, onRate }: { rating: number; onRate: (v: number) => void }) => {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          onClick={() => onRate(star)}
          onMouseEnter={() => setHover(star)}
          onMouseLeave={() => setHover(0)}
          className={`text-base leading-none transition-colors ${star <= (hover || rating) ? "text-orange-400" : "text-gray-200"}`}
        >★</button>
      ))}
    </div>
  );
};

// ── PillDropdown ──────────────────────────────────────────────────────────────

const PillDropdown = ({
  value, options, colorFn, onSave, onAddOption, onDeleteOption,
  optionColors, onSetColor,
}: {
  value: string;
  options: string[];
  colorFn: (v: string) => string;
  onSave: (v: string) => void;
  onAddOption?: (v: string) => void;
  onDeleteOption?: (v: string) => void;
  optionColors?: Record<string, { bg: string; text: string }>;
  onSetColor?: (option: string, color: { bg: string; text: string }) => void;
}) => {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newVal, setNewVal] = useState("");
  const [newColor, setNewColor] = useState<{ bg: string; text: string } | null>(null);
  const [pickingFor, setPickingFor] = useState<string | null>(null);

  const effectiveStyle = (opt: string): { className?: string; style?: React.CSSProperties } => {
    const custom = optionColors?.[opt];
    if (custom) return { style: { backgroundColor: custom.bg, color: custom.text } };
    return { className: colorFn(opt) };
  };

  const pillStyle = effectiveStyle(value);
  const close = () => { setOpen(false); setAdding(false); setPickingFor(null); setNewColor(null); };

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen(!open)}
        className={`px-3 py-1 rounded-md text-xs font-semibold whitespace-nowrap cursor-pointer hover:opacity-80 transition ${pillStyle.className ?? ""}`}
        style={pillStyle.style}
      >
        {value || "—"}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={close} />
          <div className="absolute left-0 top-full mt-1 z-50 min-w-[220px] bg-white border border-gray-200 rounded-md shadow-lg overflow-hidden">

            {pickingFor && onSetColor ? (
              <div className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-gray-600 truncate max-w-[130px]">{pickingFor}</span>
                  <button onClick={() => setPickingFor(null)} className="text-gray-400 hover:text-gray-600 text-xs">← Atrás</button>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {COLOR_PALETTE.map((c) => (
                    <button
                      key={c.bg}
                      title={c.label}
                      onClick={() => { onSetColor(pickingFor, { bg: c.bg, text: c.text }); setPickingFor(null); }}
                      className="w-8 h-8 rounded-md border-2 border-white hover:border-gray-400 transition shadow-sm"
                      style={{ backgroundColor: c.bg }}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <>
                <div className="max-h-52 overflow-y-auto">
                  {options.map((opt) => {
                    const s = effectiveStyle(opt);
                    return (
                      <div key={opt} className={`flex items-center group px-2 py-1.5 hover:bg-gray-50 ${value === opt ? "bg-gray-50" : ""}`}>
                        <button
                          onClick={() => { onSave(opt); close(); }}
                          className="flex-1 text-left text-sm flex items-center gap-2"
                        >
                          <span
                            className={`w-3 h-3 rounded-sm flex-shrink-0 ${s.className ? s.className.split(" ")[0] : ""}`}
                            style={s.style ? { backgroundColor: s.style.backgroundColor as string } : undefined}
                          />
                          <span className={value === opt ? "font-semibold" : ""}>{opt}</span>
                        </button>
                        {onSetColor && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setPickingFor(opt); }}
                            className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-blue-500 text-xs px-0.5 transition"
                            title="Cambiar color"
                          >🎨</button>
                        )}
                        {onDeleteOption && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onDeleteOption(opt); }}
                            className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 text-xs px-0.5 transition"
                            title="Eliminar opción"
                          >✕</button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {onAddOption && (
                  <div className="border-t border-gray-100 p-2">
                    {!adding ? (
                      <button onClick={() => setAdding(true)} className="w-full text-left text-xs text-blue-600 hover:text-blue-800 px-2 py-1">
                        + Agregar opción
                      </button>
                    ) : (
                      <div className="space-y-2">
                        <input
                          autoFocus
                          type="text"
                          value={newVal}
                          onChange={(e) => setNewVal(e.target.value)}
                          placeholder="Nueva opción…"
                          className="w-full text-xs border border-gray-300 rounded px-2 py-1.5"
                        />
                        <div className="flex flex-wrap gap-1">
                          {COLOR_PALETTE.map((c) => (
                            <button
                              key={c.bg}
                              title={c.label}
                              onClick={() => setNewColor(c)}
                              className="w-5 h-5 rounded-sm border-2 transition"
                              style={{
                                backgroundColor: c.bg,
                                borderColor: newColor?.bg === c.bg ? "#1d4ed8" : "transparent",
                              }}
                            />
                          ))}
                        </div>
                        <div className="flex gap-1">
                          {newColor && (
                            <span className="px-2 py-0.5 rounded-md text-xs font-semibold"
                              style={{ backgroundColor: newColor.bg, color: newColor.text }}>
                              {newVal || "Vista previa"}
                            </span>
                          )}
                          <div className="flex gap-1 ml-auto">
                            <button
                              onClick={() => {
                                if (newVal.trim()) {
                                  onAddOption(newVal.trim());
                                  if (newColor && onSetColor) onSetColor(newVal.trim(), newColor);
                                  setNewVal(""); setAdding(false); setNewColor(null);
                                }
                              }}
                              className="px-2 py-1 bg-blue-600 text-white rounded text-xs"
                            >✓</button>
                            <button onClick={() => { setAdding(false); setNewColor(null); setNewVal(""); }}
                              className="px-2 py-1 bg-gray-200 text-gray-600 rounded text-xs">✕</button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
};

// ── AddTiendaModal ────────────────────────────────────────────────────────────

const AddTiendaModal = ({ onClose, onAdd, statusOptions, typeOptions, specialtyOptions, priceOptions }: {
  onClose: () => void; 
  onAdd: (t: Tienda) => void;
  statusOptions: TiendaStatus[]; 
  typeOptions: TiendaType[];
  specialtyOptions: string[];
  priceOptions: TiendaPriceLevel[];
}) => {
  const [form, setForm] = useState({
    name: "", 
    company: "", 
    status: statusOptions[0] as TiendaStatus, 
    type: typeOptions[0] as TiendaType,
    mainSpecialty: specialtyOptions[0] || "",
    priceLevel: priceOptions[0] || "Nivel Medio",
    location: "", 
    contact: "", 
    rating: 3, 
    startDate: "",
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    const newTienda: Tienda = {
      id: Math.max(...baseTiendas.map((t) => t.id), 0) + 1,
      name: form.name,
      company: form.company || undefined,
      status: form.status,
      type: form.type,
      mainSpecialty: form.mainSpecialty || undefined,
      priceLevel: form.priceLevel as TiendaPriceLevel || undefined,
      location: form.location || undefined,
      contact: form.contact || undefined,
      rating: form.rating,
      startDate: form.startDate || undefined,
    };
    onAdd(newTienda);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-[90%]">
        <h2 className="text-lg font-bold mb-4 text-gray-900">Agregar Tienda</h2>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nombre *</label>
            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400" placeholder="Nombre de tienda" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Empresa</label>
            <input type="text" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400" placeholder="Empresa" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Estado</label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as TiendaStatus })} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400">
                {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tipo</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as TiendaType })} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400">
                {typeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Ramo Principal</label>
            <select value={form.mainSpecialty} onChange={(e) => setForm({ ...form, mainSpecialty: e.target.value })} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400">
              {specialtyOptions.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Ubicación</label>
            <input type="text" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400" placeholder="Ubicación" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Contacto</label>
            <input type="text" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400" placeholder="Teléfono/Email" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Calificación</label>
            <StarRating rating={form.rating} onRate={(r) => setForm({ ...form, rating: r })} />
          </div>
          <div className="flex justify-end gap-3 pt-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-800">Cancelar</button>
            <button type="submit" className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition shadow-sm">Agregar Tienda</button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function TiendasPage() {
  const [tiendas, setTiendas] = useState<Tienda[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterMinRating, setFilterMinRating] = useState(0);
  const [showActiveOnly, setShowActiveOnly] = useState(false);
  const [statusOptions, setStatusOptions] = useState<TiendaStatus[]>(DEFAULT_STATUS_OPTIONS);
  const [typeOptions, setTypeOptions] = useState<TiendaType[]>(DEFAULT_TYPE_OPTIONS);
  const [specialtyOptions, setSpecialtyOptions] = useState<string[]>(DEFAULT_SPECIALTY_OPTIONS);
  const [priceOptions, setPriceOptions] = useState<TiendaPriceLevel[]>(DEFAULT_PRICE_OPTIONS);
  const [optionColors, setOptionColors] = useState<Record<string, { bg: string; text: string }>>({});
  const [columnOrder, setColumnOrder] = useState<ColumnKey[]>(DEFAULT_COLUMN_ORDER);
  const [draggedColumn, setDraggedColumn] = useState<ColumnKey | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    const hydrate = async () => {
      try {
        const snapshot = getTiendasSnapshot();
        setTiendas(snapshot.length > 0 ? snapshot : baseTiendas);

        const storedOpts = readStorage(OPTIONS_STORAGE_KEY);
        if (storedOpts) {
          const o = JSON.parse(storedOpts) as Partial<{
            statusOptions: TiendaStatus[];
            typeOptions: TiendaType[];
            specialtyOptions: string[];
            priceOptions: TiendaPriceLevel[];
          }>;

          if (o.statusOptions) setStatusOptions(o.statusOptions);
          if (o.typeOptions) setTypeOptions(o.typeOptions);
          if (o.specialtyOptions) setSpecialtyOptions(o.specialtyOptions);
          if (o.priceOptions) setPriceOptions(o.priceOptions);
        }

        const storedColors = readStorage(COLORS_STORAGE_KEY);
        if (storedColors) setOptionColors(JSON.parse(storedColors));

        const storedColumnOrder = readStorage(COLUMN_ORDER_STORAGE_KEY);
        if (storedColumnOrder) setColumnOrder(JSON.parse(storedColumnOrder));

        // Hidratación async desde Supabase (cuando está habilitado)
        const remote = await fetchTiendas();
        setTiendas(remote.length > 0 ? remote : baseTiendas);
      } catch (err) {
        if (err instanceof SupabaseOperationError) {
          reportSupabaseError(err);
        }
      } finally {
        setLoading(false);
      }
    };

    void hydrate();
  }, []);

  const save = (next: Tienda[]) => {
    setTiendas(next);
    saveTiendas(next).catch((err: unknown) => {
      if (err instanceof SupabaseOperationError) reportSupabaseError(err);
    });
  };

  const saveOptions = () => {
    writeStorage(OPTIONS_STORAGE_KEY, JSON.stringify({ statusOptions, typeOptions, specialtyOptions, priceOptions }));
  };

  const saveColors = () => {
    writeStorage(COLORS_STORAGE_KEY, JSON.stringify(optionColors));
  };

  const update = (id: number, field: keyof Tienda, value: unknown) =>
    save(tiendas.map((t) => (t.id === id ? { ...t, [field]: value } : t)));

  const addTienda = (t: Tienda) => { save([...tiendas, t]); setShowModal(false); };

  const deleteTienda = (id: number) => {
    save(tiendas.filter((t) => t.id !== id));
    setDeletingId(null);
  };

  const addStatusOption = (val: string) => {
    if (!statusOptions.includes(val as TiendaStatus)) {
      setStatusOptions([...statusOptions, val as TiendaStatus]);
      saveOptions();
    }
  };

  const deleteStatusOption = (val: string) => {
    const next = statusOptions.filter((o) => o !== val);
    setStatusOptions(next);
    saveOptions();
  };

  const setStatusColor = (option: string, color: { bg: string; text: string }) => {
    setOptionColors({ ...optionColors, [option]: color });
    saveColors();
  };

  const addTypeOption = (val: string) => {
    if (!typeOptions.includes(val as TiendaType)) {
      setTypeOptions([...typeOptions, val as TiendaType]);
      saveOptions();
    }
  };

  const deleteTypeOption = (val: string) => {
    const next = typeOptions.filter((o) => o !== val);
    setTypeOptions(next);
    saveOptions();
  };

  const setTypeColor = (option: string, color: { bg: string; text: string }) => {
    setOptionColors({ ...optionColors, [option]: color });
    saveColors();
  };

  const addPriceOption = (val: string) => {
    if (!priceOptions.includes(val as TiendaPriceLevel)) {
      setPriceOptions([...priceOptions, val as TiendaPriceLevel]);
      saveOptions();
    }
  };

  const deletePriceOption = (val: string) => {
    const next = priceOptions.filter((o) => o !== val);
    setPriceOptions(next);
    saveOptions();
  };

  const setPriceColor = (option: string, color: { bg: string; text: string }) => {
    setOptionColors({ ...optionColors, [option]: color });
    saveColors();
  };

  const reorderColumn = (sourceKey: ColumnKey, targetKey: ColumnKey) => {
    const sourceIdx = columnOrder.indexOf(sourceKey);
    const targetIdx = columnOrder.indexOf(targetKey);
    if (sourceIdx === -1 || targetIdx === -1 || sourceIdx === targetIdx) return;
    
    const newOrder = [...columnOrder];
    newOrder.splice(sourceIdx, 1);
    const adjustedTargetIdx = sourceIdx < targetIdx ? targetIdx - 1 : targetIdx;
    newOrder.splice(adjustedTargetIdx, 0, sourceKey);
    
    setColumnOrder(newOrder);
    writeStorage(COLUMN_ORDER_STORAGE_KEY, JSON.stringify(newOrder));
  };

  const columnLabel = (key: ColumnKey): string => {
    const labels: Record<ColumnKey, string> = {
      name: "Nombre", 
      company: "Empresa", 
      status: "Estado", 
      type: "Tipo", 
      mainSpecialty: "Ramo Principal",
      categories: "Categorías",
      location: "Ubicación",
      contact: "Contacto", 
      secondaryContacts: "Contactos Sec.", 
      priceLevel: "Precios/Nivel",
      rating: "Cal.", 
      startDate: "Inicio",
      comments: "Comentarios", 
      website: "Web",
    };
    return labels[key];
  };

  const columnMinWidth: Record<ColumnKey, string> = {
    name: "min-w-[160px]", 
    company: "min-w-[160px]", 
    status: "min-w-[140px]", 
    type: "min-w-[130px]",
    mainSpecialty: "min-w-[140px]",
    categories: "min-w-[140px]",
    location: "min-w-[140px]", 
    contact: "min-w-[140px]", 
    secondaryContacts: "min-w-[140px]",
    priceLevel: "min-w-[140px]",
    rating: "min-w-[110px]", 
    startDate: "min-w-[110px]", 
    comments: "min-w-[160px]", 
    website: "min-w-[100px]",
  };

  const renderCell = (tienda: Tienda, key: ColumnKey) => {
    const t = tienda;
    switch (key) {
      case "name":
        return <EditableCell value={t.name ?? ""} onSave={(v) => update(t.id, "name", v)} />;
      case "company":
        return <EditableCell value={t.company ?? ""} onSave={(v) => update(t.id, "company", v)} />;
      case "status":
        return (
          <PillDropdown 
            value={t.status} 
            options={statusOptions} 
            colorFn={statusStyle} 
            onSave={(v) => update(t.id, "status", v as TiendaStatus)}
            onAddOption={addStatusOption}
            onDeleteOption={deleteStatusOption}
            optionColors={optionColors}
            onSetColor={setStatusColor}
          />
        );
      case "type":
        return (
          <PillDropdown 
            value={t.type} 
            options={typeOptions} 
            colorFn={typeStyle} 
            onSave={(v) => update(t.id, "type", v as TiendaType)}
            onAddOption={addTypeOption}
            onDeleteOption={deleteTypeOption}
            optionColors={optionColors}
            onSetColor={setTypeColor}
          />
        );
      case "mainSpecialty":
        return <EditableCell value={t.mainSpecialty ?? ""} onSave={(v) => update(t.id, "mainSpecialty", v)} />;
      case "categories":
        return <span className="text-xs text-gray-500">{(t.categories || []).join(", ") || "—"}</span>;
      case "location":
        return <EditableCell value={t.location ?? ""} onSave={(v) => update(t.id, "location", v)} />;
      case "contact":
        return <EditableCell value={t.contact ?? ""} onSave={(v) => update(t.id, "contact", v)} />;
      case "secondaryContacts":
        return <span className="text-xs text-gray-500">{(t.secondaryContacts || []).join(", ") || "—"}</span>;
      case "priceLevel":
        return (
          <PillDropdown 
            value={t.priceLevel ?? ""} 
            options={priceOptions} 
            colorFn={priceStyle} 
            onSave={(v) => update(t.id, "priceLevel", v as TiendaPriceLevel)}
            onAddOption={addPriceOption}
            onDeleteOption={deletePriceOption}
            optionColors={optionColors}
            onSetColor={setPriceColor}
          />
        );
      case "rating":
        return <StarRating rating={t.rating} onRate={(v) => update(t.id, "rating", v)} />;
      case "startDate":
        return <EditableCell value={t.startDate ?? ""} type="date" onSave={(v) => update(t.id, "startDate", v)} />;
      case "comments":
        return <EditableCell value={t.comments ?? ""} type="textarea" onSave={(v) => update(t.id, "comments", v)} />;
      case "website":
        return t.website ? <a href={t.website} target="_blank" rel="noopener" className="text-blue-600 hover:underline text-xs">Visitar</a> : <span className="text-gray-300">—</span>;
      default:
        return null;
    }
  };

  const activeFiltersCount = [!!filterStatus, !!filterType, filterMinRating > 0, !!searchTerm, showActiveOnly].filter(Boolean).length;

  const filtered = tiendas.filter((t) => {
    if (showActiveOnly && t.status !== "Activa") return false;
    if (filterStatus && t.status !== filterStatus) return false;
    if (filterType && t.type !== filterType) return false;
    if (filterMinRating > 0 && (t.rating ?? 0) < filterMinRating) return false;
    if (searchTerm && !(t.name ?? "").toLowerCase().includes(searchTerm.toLowerCase())) return false;
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
              <h1 className="text-2xl font-bold text-gray-900">Tiendas</h1>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowActiveOnly(!showActiveOnly)}
                  className={`px-3 py-2 text-sm font-medium rounded-lg transition border ${
                    showActiveOnly
                      ? "bg-emerald-500 text-white border-emerald-500"
                      : "bg-white text-gray-600 border-gray-300 hover:border-emerald-400 hover:text-emerald-600"
                  }`}
                >
                  ● Solo Activas
                </button>
                <button
                  onClick={() => setShowModal(true)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition shadow-sm"
                >
                  + Agregar Tienda
                </button>
              </div>
            </div>
            <input
              type="text"
              placeholder="Buscar tienda…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
            />
          </div>

          {/* Filtros */}
          <div className="flex items-center gap-2 flex-wrap bg-white border border-gray-200 rounded-lg px-4 py-2.5">
            <span className="text-xs font-medium text-gray-400 mr-1">Filtrar:</span>
            <div className="relative group">
              <button className="px-2 py-1 text-xs border border-gray-200 rounded-md bg-gray-50 hover:border-blue-400 text-gray-700">
                Estado
              </button>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as TiendaStatus)}
                className="absolute left-0 top-full hidden group-hover:block mt-0.5 px-2 py-1 text-xs border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-700 z-10 w-40"
              >
                <option value="">Estado: Todos</option>
                {statusOptions.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as TiendaType)}
              className="px-2 py-1 text-xs border border-gray-200 rounded-md bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-700"
            >
              <option value="">Tipo: Todos</option>
              {typeOptions.map((o) => <option key={o} value={o}>{o}</option>)}
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
            </select>
            {activeFiltersCount > 0 && (
              <button
                onClick={() => {
                  setFilterStatus("");
                  setFilterType("");
                  setFilterMinRating(0);
                  setSearchTerm("");
                  setShowActiveOnly(false);
                }}
                className="ml-auto px-2.5 py-1 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 rounded-md transition"
              >
                ✕ Limpiar ({activeFiltersCount})
              </button>
            )}
          </div>

          {/* Table */}
          {filtered.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-xl border border-gray-200 mt-4">
              <p className="text-gray-400">{searchTerm ? "Sin resultados" : "No hay tiendas"}</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto mt-4">
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
                  {filtered.map((t) => (
                    <tr key={t.id} className="hover:bg-blue-50/30 transition-colors group">
                      {columnOrder.map((colKey) => (
                        <td key={colKey} className={`px-4 py-3 ${columnMinWidth[colKey]}`}>
                          {renderCell(t, colKey)}
                        </td>
                      ))}
                      <td className="px-2 py-3 text-right">
                        {deletingId === t.id ? (
                          <div className="flex items-center gap-1 justify-end">
                            <button
                              onClick={() => deleteTienda(t.id)}
                              className="px-2 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700 whitespace-nowrap"
                            >Eliminar</button>
                            <button
                              onClick={() => setDeletingId(null)}
                              className="px-2 py-1 bg-gray-200 text-gray-600 rounded text-xs hover:bg-gray-300"
                            >✕</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeletingId(t.id)}
                            className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition text-base px-1"
                            title="Eliminar tienda"
                          >🗑</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-xs text-gray-400 mt-3">{filtered.length} tienda{filtered.length !== 1 ? "s" : ""}</p>
        </main>
      </div>

      {showModal && (
        <AddTiendaModal
          onClose={() => setShowModal(false)}
          onAdd={addTienda}
          statusOptions={statusOptions}
          typeOptions={typeOptions}
          specialtyOptions={specialtyOptions}
          priceOptions={priceOptions}
        />
      )}
    </div>
  );
}
