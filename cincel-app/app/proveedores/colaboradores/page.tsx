"use client";

import { useState, useEffect } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { EditableCell } from "@/components/proveedores/EditableCell";
import { StarRating } from "@/components/proveedores/StarRating";
import { PillDropdown } from "@/components/proveedores/PillDropdown";
import { colaboradores as baseColaboradores } from "@/lib/data/colaboradores";
import type { Colaborador, ColaboradorRole, ColaboradorStatus, ColaboradorSeniority, ColaboradorPriceLevel } from "@/lib/types/colaborador";
import { getColaboradoresSnapshot, saveColaboradores, fetchColaboradores } from "@/lib/repositories/providers-repository";
import { readStorage, writeStorage } from "@/lib/repositories/browser-state-repository";
import { SupabaseOperationError, reportSupabaseError } from "@/lib/supabase/errors";

const OPTIONS_STORAGE_KEY = "cincel.colaboradores.options.v2";
const COLUMN_ORDER_STORAGE_KEY = "cincel.colaboradores.column.order.v2";
const COLORS_STORAGE_KEY = "cincel.colaboradores.colors.v1";

const DEFAULT_ROLES: ColaboradorRole[] = ["Arquitecto", "Diseñador", "Ingeniero", "Administrativo", "Gestor de Proyecto"];
const DEFAULT_STATUS_OPTIONS: ColaboradorStatus[] = ["Activo", "Freelance", "Pasantía", "Inactivo"];
const DEFAULT_SENIORITY_OPTIONS: ColaboradorSeniority[] = ["Excelente", "Nivel Medio", "Con detalles", "Bajo", "No trabajes con el"];
const DEFAULT_PRICE_OPTIONS: ColaboradorPriceLevel[] = ["Gama Alta", "Nivel Medio", "Medio-Bajo", "Bajo"];

type ColumnKey = "name" | "role" | "status" | "department" | "contact" | "email" | "skills" | "categories" | "seniority" | "priceLevel" | "secondaryContacts" | "availability" | "rating" | "startDate" | "comments";

const DEFAULT_COLUMN_ORDER: ColumnKey[] = [
  "name", "role", "status", "department", "contact", "email", "skills", "categories", "seniority", "priceLevel", "secondaryContacts", "availability", "rating", "startDate", "comments",
];

const roleStyle = (r: ColaboradorRole) => {
  const map: Record<string, string> = {
    "Arquitecto": "bg-purple-100 text-purple-700",
    "Diseñador": "bg-pink-100 text-pink-700",
    "Ingeniero": "bg-blue-100 text-blue-700",
    "Administrativo": "bg-slate-100 text-slate-700",
    "Gestor de Proyecto": "bg-cyan-100 text-cyan-700",
  };
  return map[r] ?? "bg-gray-100 text-gray-700";
};

const statusStyle = (s: ColaboradorStatus) => {
  const map: Record<string, string> = {
    "Activo": "bg-emerald-100 text-emerald-700",
    "Freelance": "bg-blue-100 text-blue-700",
    "Pasantía": "bg-yellow-100 text-yellow-700",
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
  };
  return map[p] ?? "bg-gray-100 text-gray-700";
};

const availabilityStyle = (a?: string) => {
  const map: Record<string, string> = {
    "Disponible": "bg-emerald-100 text-emerald-700",
    "Parcial": "bg-orange-100 text-orange-700",
    "Ocupado": "bg-red-100 text-red-700",
  };
  return map[a ?? ""] ?? "bg-gray-100 text-gray-700";
};

// ── AddColaboradorModal ───────────────────────────────────────────────────────

const AddColaboradorModal = ({ onClose, onAdd, roleOptions, statusOptions }: {
  onClose: () => void; 
  onAdd: (c: Colaborador) => void;
  roleOptions: ColaboradorRole[];
  statusOptions: ColaboradorStatus[];
}) => {
  const [form, setForm] = useState({
    name: "", 
    role: roleOptions[0] as ColaboradorRole,
    status: statusOptions[0] as ColaboradorStatus, 
    department: "", 
    contact: "", 
    email: "", 
    rating: 3,
    startDate: "",
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    const newColaborador: Colaborador = {
      id: Math.max(...baseColaboradores.map((c) => c.id), 0) + 1,
      name: form.name,
      role: form.role,
      status: form.status,
      department: form.department || undefined,
      contact: form.contact || undefined,
      email: form.email || undefined,
      rating: form.rating,
      startDate: form.startDate || undefined,
    };
    onAdd(newColaborador);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-[90%]">
        <h2 className="text-lg font-bold mb-4 text-gray-900">Agregar Colaborador</h2>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nombre *</label>
            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400" placeholder="Nombre" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Rol</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as ColaboradorRole })} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400">
                {roleOptions.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Estado</label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ColaboradorStatus })} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400">
                {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Departamento</label>
            <input type="text" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400" placeholder="Departamento" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Contacto</label>
            <input type="text" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400" placeholder="Teléfono" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400" placeholder="Email" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Calificación</label>
            <StarRating rating={form.rating} onRate={(r) => setForm({ ...form, rating: r })} />
          </div>
          <div className="flex justify-end gap-3 pt-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-800">Cancelar</button>
            <button type="submit" className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition shadow-sm">Agregar</button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ColaboradoresPage() {
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterRole, setFilterRole] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterAvailability, setFilterAvailability] = useState("");
  const [filterSkills, setFilterSkills] = useState<string[]>([]);
  const [filterMinRating, setFilterMinRating] = useState(0);
  const [showActiveOnly, setShowActiveOnly] = useState(false);
  const [statusOptions, setStatusOptions] = useState<ColaboradorStatus[]>(DEFAULT_STATUS_OPTIONS);
  const [seniorityOptions, setSeniorityOptions] = useState<ColaboradorSeniority[]>(DEFAULT_SENIORITY_OPTIONS);
  const [priceOptions, setPriceOptions] = useState<ColaboradorPriceLevel[]>(DEFAULT_PRICE_OPTIONS);
  const [optionColors, setOptionColors] = useState<Record<string, { bg: string; text: string }>>({});
  const [columnOrder, setColumnOrder] = useState<ColumnKey[]>(DEFAULT_COLUMN_ORDER);
  const [draggedColumn, setDraggedColumn] = useState<ColumnKey | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    const hydrate = async () => {
      try {
        const snapshot = getColaboradoresSnapshot();
        setColaboradores(snapshot.length > 0 ? snapshot : baseColaboradores);

        const storedOpts = readStorage(OPTIONS_STORAGE_KEY);
        if (storedOpts) {
          const o = JSON.parse(storedOpts) as Partial<{
            statusOptions: ColaboradorStatus[];
            seniorityOptions: ColaboradorSeniority[];
            priceOptions: ColaboradorPriceLevel[];
          }>;

          if (o.statusOptions) setStatusOptions(o.statusOptions);
          if (o.seniorityOptions) setSeniorityOptions(o.seniorityOptions);
          if (o.priceOptions) setPriceOptions(o.priceOptions);
        }

        const storedColors = readStorage(COLORS_STORAGE_KEY);
        if (storedColors) setOptionColors(JSON.parse(storedColors));

        const storedColumnOrder = readStorage(COLUMN_ORDER_STORAGE_KEY);
        if (storedColumnOrder) setColumnOrder(JSON.parse(storedColumnOrder));

        // Hidratación async desde Supabase (cuando está habilitado)
        const remote = await fetchColaboradores();
        setColaboradores(remote.length > 0 ? remote : baseColaboradores);
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

  const save = (next: Colaborador[]) => {
    setColaboradores(next);
    saveColaboradores(next).catch((err: unknown) => {
      if (err instanceof SupabaseOperationError) reportSupabaseError(err);
    });
  };

  const saveOptions = () => {
    writeStorage(OPTIONS_STORAGE_KEY, JSON.stringify({ statusOptions, seniorityOptions, priceOptions }));
  };

  const saveColors = () => {
    writeStorage(COLORS_STORAGE_KEY, JSON.stringify(optionColors));
  };

  const update = (id: number, field: keyof Colaborador, value: unknown) =>
    save(colaboradores.map((c) => (c.id === id ? { ...c, [field]: value } : c)));

  const addColaborador = (c: Colaborador) => { save([...colaboradores, c]); setShowModal(false); };

  const deleteColaborador = (id: number) => {
    save(colaboradores.filter((c) => c.id !== id));
    setDeletingId(null);
  };

  const addStatusOption = (val: string) => {
    if (!statusOptions.includes(val as ColaboradorStatus)) {
      setStatusOptions([...statusOptions, val as ColaboradorStatus]);
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

  const addSeniorityOption = (val: string) => {
    if (!seniorityOptions.includes(val as ColaboradorSeniority)) {
      setSeniorityOptions([...seniorityOptions, val as ColaboradorSeniority]);
      saveOptions();
    }
  };

  const deleteSeniorityOption = (val: string) => {
    const next = seniorityOptions.filter((o) => o !== val);
    setSeniorityOptions(next);
    saveOptions();
  };

  const setSeniorityColor = (option: string, color: { bg: string; text: string }) => {
    setOptionColors({ ...optionColors, [option]: color });
    saveColors();
  };

  const addPriceOption = (val: string) => {
    if (!priceOptions.includes(val as ColaboradorPriceLevel)) {
      setPriceOptions([...priceOptions, val as ColaboradorPriceLevel]);
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

  const getAllSkills = (): string[] => {
    const skills = new Set<string>();
    colaboradores.forEach((c) => {
      (c.skills || []).forEach((s) => skills.add(s));
    });
    return Array.from(skills).sort();
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
      role: "Rol", 
      status: "Estado", 
      department: "Departamento", 
      contact: "Contacto", 
      email: "Email", 
      skills: "Habilidades",
      categories: "Categorías",
      seniority: "Seniority",
      priceLevel: "Precios/Nivel",
      secondaryContacts: "Contactos Sec.",
      availability: "Disponibilidad", 
      rating: "Cal.", 
      startDate: "Inicio",
      comments: "Comentarios",
    };
    return labels[key];
  };

  const columnMinWidth: Record<ColumnKey, string> = {
    name: "min-w-[160px]", 
    role: "min-w-[140px]", 
    status: "min-w-[130px]", 
    department: "min-w-[130px]", 
    contact: "min-w-[140px]", 
    email: "min-w-[160px]", 
    skills: "min-w-[160px]",
    categories: "min-w-[140px]",
    seniority: "min-w-[130px]",
    priceLevel: "min-w-[140px]",
    secondaryContacts: "min-w-[140px]",
    availability: "min-w-[130px]", 
    rating: "min-w-[110px]", 
    startDate: "min-w-[110px]", 
    comments: "min-w-[160px]",
  };

  const renderCell = (colaborador: Colaborador, key: ColumnKey) => {
    const c = colaborador;
    switch (key) {
      case "name":
        return <EditableCell value={c.name ?? ""} onSave={(v) => update(c.id, "name", v)} />;
      case "role":
        return (
          <PillDropdown 
            value={c.role} 
            options={DEFAULT_ROLES} 
            colorFn={roleStyle} 
            onSave={(v) => update(c.id, "role", v as ColaboradorRole)}
            optionColors={optionColors}
          />
        );
      case "status":
        return (
          <PillDropdown 
            value={c.status} 
            options={statusOptions} 
            colorFn={statusStyle} 
            onSave={(v) => update(c.id, "status", v as ColaboradorStatus)}
            onAddOption={addStatusOption}
            onDeleteOption={deleteStatusOption}
            optionColors={optionColors}
            onSetColor={setStatusColor}
          />
        );
      case "department":
        return <EditableCell value={c.department ?? ""} onSave={(v) => update(c.id, "department", v)} />;
      case "contact":
        return <EditableCell value={c.contact ?? ""} onSave={(v) => update(c.id, "contact", v)} />;
      case "email":
        return c.email ? <a href={`mailto:${c.email}`} className="text-blue-600 hover:underline text-xs">{c.email}</a> : <span className="text-gray-300">—</span>;
      case "skills":
        return <span className="text-xs text-gray-500">{(c.skills || []).join(", ") || "—"}</span>;
      case "categories":
        return <span className="text-xs text-gray-500">{(c.categories || []).join(", ") || "—"}</span>;
      case "seniority":
        return c.seniority ? (
          <PillDropdown 
            value={c.seniority} 
            options={seniorityOptions} 
            colorFn={seniorityStyle} 
            onSave={(v) => update(c.id, "seniority", v as ColaboradorSeniority)}
            onAddOption={addSeniorityOption}
            onDeleteOption={deleteSeniorityOption}
            optionColors={optionColors}
            onSetColor={setSeniorityColor}
          />
        ) : <span className="text-gray-300">—</span>;
      case "priceLevel":
        return c.priceLevel ? (
          <PillDropdown 
            value={c.priceLevel} 
            options={priceOptions} 
            colorFn={priceStyle} 
            onSave={(v) => update(c.id, "priceLevel", v as ColaboradorPriceLevel)}
            onAddOption={addPriceOption}
            onDeleteOption={deletePriceOption}
            optionColors={optionColors}
            onSetColor={setPriceColor}
          />
        ) : <span className="text-gray-300">—</span>;
      case "secondaryContacts":
        return <span className="text-xs text-gray-500">{(c.secondaryContacts || []).join(", ") || "—"}</span>;
      case "availability":
        return c.availability ? (
          <PillDropdown 
            value={c.availability} 
            options={["Disponible", "Parcial", "Ocupado"]} 
            colorFn={availabilityStyle} 
            onSave={(v) => update(c.id, "availability", v)}
          />
        ) : <span className="text-gray-300">—</span>;
      case "rating":
        return <StarRating rating={c.rating} onRate={(v) => update(c.id, "rating", v)} />;
      case "startDate":
        return <EditableCell value={c.startDate ?? ""} type="date" onSave={(v) => update(c.id, "startDate", v)} />;
      case "comments":
        return <EditableCell value={c.comments ?? ""} type="textarea" onSave={(v) => update(c.id, "comments", v)} />;
      default:
        return null;
    }
  };

  const activeFiltersCount = [!!filterRole, !!filterStatus, !!filterAvailability, filterSkills.length > 0, filterMinRating > 0, !!searchTerm, showActiveOnly].filter(Boolean).length;

  const filtered = colaboradores.filter((c) => {
    if (showActiveOnly && c.status !== "Activo") return false;
    if (filterRole && c.role !== filterRole) return false;
    if (filterStatus && c.status !== filterStatus) return false;
    if (filterAvailability && c.availability !== filterAvailability) return false;
    if (filterSkills.length > 0 && !(c.skills || []).some((s) => filterSkills.includes(s))) return false;
    if (filterMinRating > 0 && (c.rating ?? 0) < filterMinRating) return false;
    if (searchTerm && !(c.name ?? "").toLowerCase().includes(searchTerm.toLowerCase())) return false;
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

  const allSkills = getAllSkills();

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header />
        <main className="flex-1 overflow-auto p-6">
          {/* Header bar */}
          <div className="mb-5">
            <div className="flex items-center justify-between mb-3">
              <h1 className="text-2xl font-bold text-gray-900">Colaboradores</h1>
              <div className="flex gap-2">
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
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition shadow-sm"
                >
                  + Agregar Colaborador
                </button>
              </div>
            </div>
            <input
              type="text"
              placeholder="Buscar colaborador…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
            />
          </div>

          {/* Filtros */}
          <div className="flex items-center gap-2 flex-wrap bg-white border border-gray-200 rounded-lg px-4 py-2.5">
            <span className="text-xs font-medium text-gray-400 mr-1">Filtrar:</span>
            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              className="px-2 py-1 text-xs border border-gray-200 rounded-md bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-700"
            >
              <option value="">Rol: Todos</option>
              {DEFAULT_ROLES.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-2 py-1 text-xs border border-gray-200 rounded-md bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-700"
            >
              <option value="">Estado: Todos</option>
              {statusOptions.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            <select
              value={filterAvailability}
              onChange={(e) => setFilterAvailability(e.target.value)}
              className="px-2 py-1 text-xs border border-gray-200 rounded-md bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-700"
            >
              <option value="">Disponibilidad: Todas</option>
              <option value="Disponible">Disponible</option>
              <option value="Parcial">Parcial</option>
              <option value="Ocupado">Ocupado</option>
            </select>
            <div className="relative group">
              <button className={`px-2 py-1 text-xs border rounded-md bg-gray-50 text-gray-700 ${filterSkills.length > 0 ? "border-blue-400 bg-blue-50 text-blue-700 font-semibold" : "border-gray-200"}`}>
                Habilidades {filterSkills.length > 0 && `(${filterSkills.length})`}
              </button>
              <div className="absolute left-0 top-full hidden group-hover:block mt-0.5 z-50 w-56 bg-white border border-gray-200 rounded-lg shadow-lg p-3 space-y-2 max-h-64 overflow-y-auto">
                {allSkills.map((skill) => (
                  <label key={skill} className="flex items-center gap-2 cursor-pointer text-sm hover:bg-gray-50 p-1 rounded">
                    <input
                      type="checkbox"
                      checked={filterSkills.includes(skill)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setFilterSkills([...filterSkills, skill]);
                        } else {
                          setFilterSkills(filterSkills.filter((s) => s !== skill));
                        }
                      }}
                      className="accent-blue-600"
                    />
                    <span>{skill}</span>
                  </label>
                ))}
              </div>
            </div>
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
                  setFilterRole("");
                  setFilterStatus("");
                  setFilterAvailability("");
                  setFilterSkills([]);
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
              <p className="text-gray-400">{searchTerm ? "Sin resultados" : "No hay colaboradores"}</p>
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
                  {filtered.map((c) => (
                    <tr key={c.id} className="hover:bg-blue-50/30 transition-colors group">
                      {columnOrder.map((colKey) => (
                        <td key={colKey} className={`px-4 py-3 ${columnMinWidth[colKey]}`}>
                          {renderCell(c, colKey)}
                        </td>
                      ))}
                      <td className="px-2 py-3 text-right">
                        {deletingId === c.id ? (
                          <div className="flex items-center gap-1 justify-end">
                            <button
                              onClick={() => deleteColaborador(c.id)}
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
                            title="Eliminar colaborador"
                          >🗑</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-xs text-gray-400 mt-3">{filtered.length} colaborador{filtered.length !== 1 ? "es" : ""}</p>
        </main>
      </div>

      {showModal && (
        <AddColaboradorModal
          onClose={() => setShowModal(false)}
          onAdd={addColaborador}
          roleOptions={DEFAULT_ROLES}
          statusOptions={statusOptions}
        />
      )}
    </div>
  );
}
