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
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/shadcn/sheet";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";
import { tiendas as baseTiendas } from "@/lib/data/tiendas";
import type { Tienda, TiendaStatus, TiendaType, TiendaPriceLevel } from "@/lib/types/tienda";
import { getTiendasSnapshot, saveTiendas, fetchTiendas } from "@/lib/repositories/providers-repository";
import { readStorage, writeStorage } from "@/lib/repositories/browser-state-repository";
import { RepositoryError, reportRepositoryError } from "@/lib/errors";

const OPTIONS_STORAGE_KEY = "cincel.tiendas.options.v2";
const COLUMN_ORDER_STORAGE_KEY = "cincel.tiendas.column.order.v2";
const COLORS_STORAGE_KEY = "cincel.tiendas.colors.v1";

/** shadcn Select (base-ui) doesn't support an empty-string item value. */
const ALL_STATUS_VALUE = "__all_status__";
const ALL_TYPE_VALUE = "__all_type__";

const DEFAULT_STATUS_OPTIONS: TiendaStatus[] = ["Activa", "Inactiva", "Cerrada", "Próximo Abierto"];
const DEFAULT_TYPE_OPTIONS: TiendaType[] = ["Física", "Online", "Híbrida"];
const DEFAULT_SPECIALTY_OPTIONS: string[] = ["Retail", "E-commerce", "Eventos", "Retail Omnichannel"];
const DEFAULT_PRICE_OPTIONS: TiendaPriceLevel[] = ["Gama Alta", "Nivel Medio", "Medio-Bajo", "Bajo"];

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
    <Sheet open onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Agregar Tienda</SheetTitle>
        </SheetHeader>
        <form onSubmit={submit} className="space-y-4 px-6 py-4">
          <Label className="text-xs font-medium text-gray-600">
            Nombre *
            <Input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1" placeholder="Nombre de tienda" />
          </Label>
          <Label className="text-xs font-medium text-gray-600">
            Empresa
            <Input type="text" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} className="mt-1" placeholder="Empresa" />
          </Label>
          <div className="grid grid-cols-2 gap-3">
            <Label className="text-xs font-medium text-gray-600">
              Estado
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as TiendaStatus })}>
                <SelectTrigger className="mt-1 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </Label>
            <Label className="text-xs font-medium text-gray-600">
              Tipo
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as TiendaType })}>
                <SelectTrigger className="mt-1 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {typeOptions.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </Label>
          </div>
          <Label className="text-xs font-medium text-gray-600">
            Ramo Principal
            <Select value={form.mainSpecialty} onValueChange={(v) => setForm({ ...form, mainSpecialty: v as string })}>
              <SelectTrigger className="mt-1 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {specialtyOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </Label>
          <Label className="text-xs font-medium text-gray-600">
            Ubicación
            <Input type="text" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="mt-1" placeholder="Ubicación" />
          </Label>
          <Label className="text-xs font-medium text-gray-600">
            Contacto
            <Input type="text" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} className="mt-1" placeholder="Teléfono/Email" />
          </Label>
          <Label className="text-xs font-medium text-gray-600">
            Calificación
            <div className="mt-1">
              <StarRating rating={form.rating} onRate={(r) => setForm({ ...form, rating: r })} />
            </div>
          </Label>
          <SheetFooter className="mt-0 flex-row justify-end border-t-0 p-0 pt-3">
            <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button type="submit">Agregar Tienda</Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
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
        if (err instanceof RepositoryError) {
          reportRepositoryError(err);
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
      if (err instanceof RepositoryError) reportRepositoryError(err);
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

  const sortValue = (t: Tienda, key: ColumnKey): string | number => {
    switch (key) {
      case "name": return t.name ?? "";
      case "company": return t.company ?? "";
      case "status": return t.status ?? "";
      case "type": return t.type ?? "";
      case "mainSpecialty": return t.mainSpecialty ?? "";
      case "categories": return (t.categories || []).join(", ");
      case "location": return t.location ?? "";
      case "contact": return t.contact ?? "";
      case "secondaryContacts": return (t.secondaryContacts || []).join(", ");
      case "priceLevel": return t.priceLevel ?? "";
      case "rating": return t.rating ?? 0;
      case "startDate": return t.startDate ?? "";
      case "comments": return t.comments ?? "";
      case "website": return t.website ?? "";
      default: return "";
    }
  };

  const columns: ColumnDef<Tienda, unknown>[] = [
    ...columnOrder.map((key): ColumnDef<Tienda, unknown> => ({
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
        const t = row.original;
        return deletingId === t.id ? (
          <div className="flex items-center gap-1 justify-end">
            <Button
              variant="destructive"
              size="sm"
              onClick={() => deleteTienda(t.id)}
              className="h-auto whitespace-nowrap px-2 py-1 text-xs"
            >Eliminar</Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setDeletingId(null)}
              className="h-auto px-2 py-1 text-xs"
            >✕</Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDeletingId(t.id)}
            className="h-auto px-1 text-base text-gray-300 opacity-0 transition group-hover:opacity-100 hover:text-red-500"
            title="Eliminar tienda"
          >🗑</Button>
        );
      },
    },
  ];

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
                <Button
                  variant={showActiveOnly ? "default" : "outline"}
                  onClick={() => setShowActiveOnly(!showActiveOnly)}
                  className={showActiveOnly ? "bg-emerald-500 hover:bg-emerald-600" : ""}
                >
                  ● Solo Activas
                </Button>
                <Button onClick={() => setShowModal(true)}>
                  + Agregar Tienda
                </Button>
              </div>
            </div>
            <Input
              type="text"
              placeholder="Buscar tienda…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Filtros */}
          <div className="flex items-center gap-2 flex-wrap bg-white border border-gray-200 rounded-lg px-4 py-2.5">
            <span className="text-xs font-medium text-gray-400 mr-1">Filtrar:</span>
            <Select
              value={filterStatus || ALL_STATUS_VALUE}
              onValueChange={(v) => setFilterStatus(v === ALL_STATUS_VALUE ? "" : (v as TiendaStatus))}
            >
              <SelectTrigger className="h-auto w-auto px-2 py-1 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_STATUS_VALUE}>Estado: Todos</SelectItem>
                {statusOptions.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select
              value={filterType || ALL_TYPE_VALUE}
              onValueChange={(v) => setFilterType(v === ALL_TYPE_VALUE ? "" : (v as TiendaType))}
            >
              <SelectTrigger className="h-auto w-auto px-2 py-1 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_TYPE_VALUE}>Tipo: Todos</SelectItem>
                {typeOptions.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select
              value={filterMinRating.toString()}
              onValueChange={(v) => setFilterMinRating(Number(v))}
            >
              <SelectTrigger className="h-auto w-auto px-2 py-1 text-xs">
                <SelectValue />
              </SelectTrigger>
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
                size="sm"
                onClick={() => {
                  setFilterStatus("");
                  setFilterType("");
                  setFilterMinRating(0);
                  setSearchTerm("");
                  setShowActiveOnly(false);
                }}
                className="ml-auto h-auto px-2.5 py-1 text-xs text-red-500 hover:text-red-700 hover:bg-red-50"
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
              getRowId={(t) => String(t.id)}
              rowClassName={() => "group"}
              emptyMessage={searchTerm ? "Sin resultados" : "No hay tiendas"}
            />
          </div>

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
