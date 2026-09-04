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
import { colaboradores as baseColaboradores } from "@/lib/data/colaboradores";
import type { Colaborador, ColaboradorRole, ColaboradorStatus, ColaboradorSeniority, ColaboradorPriceLevel } from "@/lib/types/colaborador";
import { getColaboradoresSnapshot, saveColaboradores, fetchColaboradores } from "@/lib/repositories/providers-repository";
import { readStorage, writeStorage } from "@/lib/repositories/browser-state-repository";
import { RepositoryError, reportRepositoryError } from "@/lib/errors";

const OPTIONS_STORAGE_KEY = "cincel.colaboradores.options.v2";
const COLUMN_ORDER_STORAGE_KEY = "cincel.colaboradores.column.order.v2";
const COLORS_STORAGE_KEY = "cincel.colaboradores.colors.v1";

const DEFAULT_ROLES: ColaboradorRole[] = ["Arquitecto", "Diseñador", "Ingeniero", "Administrativo", "Gestor de Proyecto"];
const DEFAULT_STATUS_OPTIONS: ColaboradorStatus[] = ["Activo", "Freelance", "Pasantía", "Inactivo"];
const DEFAULT_SENIORITY_OPTIONS: ColaboradorSeniority[] = ["Excelente", "Nivel Medio", "Con detalles", "Bajo", "No trabajes con el"];
const DEFAULT_PRICE_OPTIONS: ColaboradorPriceLevel[] = ["Gama Alta", "Nivel Medio", "Medio-Bajo", "Bajo"];

const ALL_ROLE_VALUE = "__all_role__";
const ALL_STATUS_VALUE = "__all_status__";
const ALL_AVAILABILITY_VALUE = "__all_availability__";

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
    <Sheet open onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Agregar Colaborador</SheetTitle>
        </SheetHeader>
        <form onSubmit={submit} className="space-y-4 px-6 py-4">
          <div className="space-y-1">
            <Label htmlFor="add-colaborador-name">Nombre *</Label>
            <Input id="add-colaborador-name" type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nombre" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="add-colaborador-role">Rol</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as ColaboradorRole })}>
                <SelectTrigger id="add-colaborador-role" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {roleOptions.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="add-colaborador-status">Estado</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as ColaboradorStatus })}>
                <SelectTrigger id="add-colaborador-status" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {statusOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="add-colaborador-department">Departamento</Label>
            <Input id="add-colaborador-department" type="text" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="Departamento" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="add-colaborador-contact">Contacto</Label>
            <Input id="add-colaborador-contact" type="text" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} placeholder="Teléfono" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="add-colaborador-email">Email</Label>
            <Input id="add-colaborador-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" />
          </div>
          <div className="space-y-1">
            <Label>Calificación</Label>
            <StarRating rating={form.rating} onRate={(r) => setForm({ ...form, rating: r })} />
          </div>
          <SheetFooter className="mt-0 flex-row justify-end border-t-0 p-0 pt-3">
            <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button type="submit">Agregar</Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
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
        if (err instanceof RepositoryError) {
          reportRepositoryError(err);
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
      if (err instanceof RepositoryError) reportRepositoryError(err);
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

  const sortValue = (c: Colaborador, key: ColumnKey): string | number => {
    switch (key) {
      case "name": return c.name ?? "";
      case "role": return c.role ?? "";
      case "status": return c.status ?? "";
      case "department": return c.department ?? "";
      case "contact": return c.contact ?? "";
      case "email": return c.email ?? "";
      case "skills": return (c.skills || []).join(", ");
      case "categories": return (c.categories || []).join(", ");
      case "seniority": return c.seniority ?? "";
      case "priceLevel": return c.priceLevel ?? "";
      case "secondaryContacts": return (c.secondaryContacts || []).join(", ");
      case "availability": return c.availability ?? "";
      case "rating": return c.rating ?? 0;
      case "startDate": return c.startDate ?? "";
      case "comments": return c.comments ?? "";
      default: return "";
    }
  };

  const columns: ColumnDef<Colaborador, unknown>[] = [
    ...columnOrder.map((key): ColumnDef<Colaborador, unknown> => ({
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
              onClick={() => deleteColaborador(c.id)}
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
            title="Eliminar colaborador"
          >🗑</Button>
        );
      },
    },
  ];

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
                <Button
                  variant={showActiveOnly ? "default" : "outline"}
                  className={showActiveOnly ? "bg-emerald-500 hover:bg-emerald-600 border-emerald-500" : ""}
                  onClick={() => setShowActiveOnly(!showActiveOnly)}
                >
                  ● Solo Activos
                </Button>
                <Button onClick={() => setShowModal(true)}>
                  + Agregar Colaborador
                </Button>
              </div>
            </div>
            <Input
              type="text"
              placeholder="Buscar colaborador…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white"
            />
          </div>

          {/* Filtros */}
          <div className="flex items-center gap-2 flex-wrap bg-white border border-gray-200 rounded-lg px-4 py-2.5">
            <span className="text-xs font-medium text-gray-400 mr-1">Filtrar:</span>
            <Select value={filterRole || ALL_ROLE_VALUE} onValueChange={(v) => setFilterRole(v === ALL_ROLE_VALUE ? "" : (v as string))}>
              <SelectTrigger className="h-auto px-2 py-1 text-xs bg-gray-50"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_ROLE_VALUE}>Rol: Todos</SelectItem>
                {DEFAULT_ROLES.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterStatus || ALL_STATUS_VALUE} onValueChange={(v) => setFilterStatus(v === ALL_STATUS_VALUE ? "" : (v as string))}>
              <SelectTrigger className="h-auto px-2 py-1 text-xs bg-gray-50"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_STATUS_VALUE}>Estado: Todos</SelectItem>
                {statusOptions.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterAvailability || ALL_AVAILABILITY_VALUE} onValueChange={(v) => setFilterAvailability(v === ALL_AVAILABILITY_VALUE ? "" : (v as string))}>
              <SelectTrigger className="h-auto px-2 py-1 text-xs bg-gray-50"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_AVAILABILITY_VALUE}>Disponibilidad: Todas</SelectItem>
                <SelectItem value="Disponible">Disponible</SelectItem>
                <SelectItem value="Parcial">Parcial</SelectItem>
                <SelectItem value="Ocupado">Ocupado</SelectItem>
              </SelectContent>
            </Select>
            <Popover>
              <PopoverTrigger
                className={`px-2 py-1 text-xs border rounded-md bg-gray-50 text-gray-700 ${filterSkills.length > 0 ? "border-blue-400 bg-blue-50 text-blue-700 font-semibold" : "border-gray-200"}`}
              >
                Habilidades {filterSkills.length > 0 && `(${filterSkills.length})`}
              </PopoverTrigger>
              <PopoverContent align="start" className="w-56 space-y-2 max-h-64 overflow-y-auto">
                {allSkills.map((skill) => (
                  <label key={skill} className="flex items-center gap-2 cursor-pointer text-sm hover:bg-gray-50 p-1 rounded">
                    <Checkbox
                      checked={filterSkills.includes(skill)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setFilterSkills([...filterSkills, skill]);
                        } else {
                          setFilterSkills(filterSkills.filter((s) => s !== skill));
                        }
                      }}
                    />
                    <span>{skill}</span>
                  </label>
                ))}
              </PopoverContent>
            </Popover>
            <Select value={filterMinRating.toString()} onValueChange={(v) => setFilterMinRating(Number(v))}>
              <SelectTrigger className="h-auto px-2 py-1 text-xs bg-gray-50"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Calificación: Todas</SelectItem>
                <SelectItem value="5">★★★★★  5 estrellas</SelectItem>
                <SelectItem value="4">★★★★+  4 o más</SelectItem>
                <SelectItem value="3">★★★+  3 o más</SelectItem>
              </SelectContent>
            </Select>
            {activeFiltersCount > 0 && (
              <Button
                variant="ghost"
                className="ml-auto h-auto px-2.5 py-1 text-xs text-red-500 hover:text-red-700 hover:bg-red-50"
                onClick={() => {
                  setFilterRole("");
                  setFilterStatus("");
                  setFilterAvailability("");
                  setFilterSkills([]);
                  setFilterMinRating(0);
                  setSearchTerm("");
                  setShowActiveOnly(false);
                }}
              >
                ✕ Limpiar ({activeFiltersCount})
              </Button>
            )}
          </div>

          {/* Table */}
          <div className="mt-4">
            <DataTable
              columns={columns}
              data={filtered}
              getRowId={(c) => String(c.id)}
              rowClassName={() => "group"}
              emptyMessage={searchTerm ? "Sin resultados" : "No hay colaboradores"}
            />
          </div>

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
