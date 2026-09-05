"use client";

import type { Dispatch, SetStateAction } from "react";

import { Button } from "@/components/ui/shadcn/button";
import { Checkbox } from "@/components/ui/shadcn/checkbox";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/shadcn/sheet";
import { StarRating } from "@/components/proveedores/StarRating";
import { Textarea } from "@/components/ui/shadcn/textarea";
import { CONTACT_TYPES, type ContactType } from "@/lib/types/enums";

/** Every scalar field across the 4 contact types — branch by `type` when rendering. */
export type ContactDraft = {
  type: ContactType;
  name: string;
  contact: string;
  status: string;
  rating: number;
  startDate: string;
  comments: string;
  // Cliente
  kind: "Empresa" | "Particular";
  phone: string;
  emailsText: string;
  acquisitionChannel: string;
  totalSpent: number;
  hasActiveProject: boolean;
  projectName: string;
  projectType: string;
  totalProjectsWorked: number;
  firstWorkDate: string;
  // Contratista
  company: string;
  mainSpecialty: string;
  categories: string[];
  seniority: string;
  priceLevel: string;
  secondaryContacts: string[];
  webPage: string;
  // Colaborador
  role: string;
  department: string;
  email: string;
  availability: string;
  // Tienda
  tiendaType: "Física" | "Online" | "Híbrida";
  location: string;
};

export const emptyContactDraft: ContactDraft = {
  type: "Cliente",
  name: "",
  contact: "",
  status: "Activo",
  rating: 3,
  startDate: "",
  comments: "",
  kind: "Particular",
  phone: "",
  emailsText: "",
  acquisitionChannel: "Sin registro",
  totalSpent: 0,
  hasActiveProject: false,
  projectName: "",
  projectType: "Otro",
  totalProjectsWorked: 1,
  firstWorkDate: "",
  company: "",
  mainSpecialty: "",
  categories: [],
  seniority: "Nivel Medio",
  priceLevel: "Nivel Medio",
  secondaryContacts: [],
  webPage: "",
  role: "Arquitecto",
  department: "",
  email: "",
  availability: "Disponible",
  tiendaType: "Física",
  location: "",
};

const PROJECT_TYPE_OPTIONS = ["Habitacional", "Oficina", "Mobiliario", "Comercial", "Mantenimiento", "Otro"];
const ROLE_OPTIONS = ["Arquitecto", "Diseñador", "Ingeniero", "Administrativo", "Gestor de Proyecto"];
const AVAILABILITY_OPTIONS = ["Disponible", "Parcial", "Ocupado"];

export interface DirectorioVocab {
  contratista: { status: string[]; category: string[]; seniority: string[]; price: string[] };
  colaborador: { status: string[]; seniority: string[]; price: string[] };
  tienda: { status: string[]; type: string[]; price: string[] };
}

interface ContactEditorSheetProps {
  show: boolean;
  onClose: () => void;
  editingId: string | null;
  draft: ContactDraft;
  onChangeDraft: Dispatch<SetStateAction<ContactDraft>>;
  formError: string;
  onSave: () => void;
  vocab: DirectorioVocab;
}

function set<K extends keyof ContactDraft>(
  onChangeDraft: Dispatch<SetStateAction<ContactDraft>>,
  key: K,
  value: ContactDraft[K]
) {
  onChangeDraft((d) => ({ ...d, [key]: value }));
}

/** Create/edit Sheet for all 4 directorio contact types — one shared form, type-specific fields. */
export function ContactEditorSheet({
  show,
  onClose,
  editingId,
  draft,
  onChangeDraft,
  formError,
  onSave,
  vocab,
}: ContactEditorSheetProps) {
  const isEditing = editingId !== null;

  return (
    <Sheet open={show} onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent className="w-[560px] max-w-[560px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEditing ? "Editar contacto" : "Nuevo contacto"}</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 px-6 py-4">
          {formError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {formError}
            </div>
          ) : null}

          <div>
            <Label className="mb-2 block">Tipo de contacto</Label>
            <Select
              value={draft.type}
              onValueChange={(v) => set(onChangeDraft, "type", v as ContactType)}
              disabled={isEditing}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONTACT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="mb-2 block">Nombre</Label>
            <Input
              value={draft.name}
              onChange={(e) => set(onChangeDraft, "name", e.target.value)}
              placeholder={draft.type === "Cliente" ? "Familia Gómez" : "Nombre o razón social"}
            />
          </div>

          {draft.type === "Cliente" ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="mb-2 block">Tipo</Label>
                  <Select value={draft.kind} onValueChange={(v) => set(onChangeDraft, "kind", v as ContactDraft["kind"])}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Particular">Particular</SelectItem>
                      <SelectItem value="Empresa">Empresa</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="mb-2 block">Proyecto activo</Label>
                  <Select
                    value={draft.hasActiveProject ? "si" : "no"}
                    onValueChange={(v) => set(onChangeDraft, "hasActiveProject", v === "si")}
                  >
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="si">Sí</SelectItem>
                      <SelectItem value="no">Ya terminó</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="mb-2 block">Teléfono</Label>
                  <Input value={draft.phone} onChange={(e) => set(onChangeDraft, "phone", e.target.value)} />
                </div>
                <div>
                  <Label className="mb-2 block">Email(s)</Label>
                  <Input
                    value={draft.emailsText}
                    onChange={(e) => set(onChangeDraft, "emailsText", e.target.value)}
                    placeholder="correo1@dominio.com, correo2@dominio.com"
                  />
                </div>
              </div>
              <div>
                <Label className="mb-2 block">Nombre del proyecto</Label>
                <Input value={draft.projectName} onChange={(e) => set(onChangeDraft, "projectName", e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="mb-2 block">Tipo de proyecto</Label>
                  <Select value={draft.projectType} onValueChange={(v) => set(onChangeDraft, "projectType", v as string)}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PROJECT_TYPE_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="mb-2 block"># proyectos con nosotros</Label>
                  <Input
                    type="number"
                    min={1}
                    value={draft.totalProjectsWorked}
                    onChange={(e) => set(onChangeDraft, "totalProjectsWorked", Number(e.target.value) || 1)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="mb-2 block">Fecha de primer trabajo</Label>
                  <Input type="date" value={draft.firstWorkDate} onChange={(e) => set(onChangeDraft, "firstWorkDate", e.target.value)} />
                </div>
                <div>
                  <Label className="mb-2 block">Canal de adquisición</Label>
                  <Input value={draft.acquisitionChannel} onChange={(e) => set(onChangeDraft, "acquisitionChannel", e.target.value)} />
                </div>
              </div>
              <div>
                <Label className="mb-2 block">Total gastado</Label>
                <Input
                  type="number"
                  min={0}
                  value={draft.totalSpent}
                  onChange={(e) => set(onChangeDraft, "totalSpent", Number(e.target.value) || 0)}
                />
              </div>
            </>
          ) : null}

          {draft.type === "Contratista" ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="mb-2 block">Empresa</Label>
                  <Input value={draft.company} onChange={(e) => set(onChangeDraft, "company", e.target.value)} />
                </div>
                <div>
                  <Label className="mb-2 block">Contacto</Label>
                  <Input value={draft.contact} onChange={(e) => set(onChangeDraft, "contact", e.target.value)} placeholder="+52 55 1234-5678" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="mb-2 block">Estado</Label>
                  <Select value={draft.status} onValueChange={(v) => set(onChangeDraft, "status", v as string)}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {vocab.contratista.status.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="mb-2 block">Ramo principal</Label>
                  <Select value={draft.mainSpecialty} onValueChange={(v) => set(onChangeDraft, "mainSpecialty", v as string)}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {vocab.contratista.category.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="mb-2 block">Seniority</Label>
                  <Select value={draft.seniority} onValueChange={(v) => set(onChangeDraft, "seniority", v as string)}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {vocab.contratista.seniority.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="mb-2 block">Precios/Nivel</Label>
                  <Select value={draft.priceLevel} onValueChange={(v) => set(onChangeDraft, "priceLevel", v as string)}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {vocab.contratista.price.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="mb-2 block">Categorías</Label>
                <div className="grid max-h-32 grid-cols-2 gap-1 overflow-y-auto rounded-lg border border-border px-3 py-2">
                  {vocab.contratista.category.map((o) => (
                    <label key={o} className="flex items-center gap-1.5 text-xs">
                      <Checkbox
                        checked={draft.categories.includes(o)}
                        onCheckedChange={() =>
                          set(
                            onChangeDraft,
                            "categories",
                            draft.categories.includes(o)
                              ? draft.categories.filter((c) => c !== o)
                              : [...draft.categories, o]
                          )
                        }
                      />
                      {o}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <Label className="mb-2 block">Contactos secundarios</Label>
                <div className="space-y-1">
                  {draft.secondaryContacts.map((c, i) => (
                    <div key={i} className="flex gap-1">
                      <Input
                        value={c}
                        onChange={(e) => {
                          const next = [...draft.secondaryContacts];
                          next[i] = e.target.value;
                          set(onChangeDraft, "secondaryContacts", next);
                        }}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => set(onChangeDraft, "secondaryContacts", draft.secondaryContacts.filter((_, idx) => idx !== i))}
                      >
                        ✕
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto p-0 text-xs"
                    onClick={() => set(onChangeDraft, "secondaryContacts", [...draft.secondaryContacts, ""])}
                  >
                    + Agregar contacto
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="mb-2 block">Fecha de inicio</Label>
                  <Input type="date" value={draft.startDate} onChange={(e) => set(onChangeDraft, "startDate", e.target.value)} />
                </div>
                <div>
                  <Label className="mb-2 block">Página web</Label>
                  <Input value={draft.webPage} onChange={(e) => set(onChangeDraft, "webPage", e.target.value)} placeholder="https://..." />
                </div>
              </div>
            </>
          ) : null}

          {draft.type === "Colaborador" ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="mb-2 block">Rol</Label>
                  <Select value={draft.role} onValueChange={(v) => set(onChangeDraft, "role", v as string)}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="mb-2 block">Estado</Label>
                  <Select value={draft.status} onValueChange={(v) => set(onChangeDraft, "status", v as string)}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {vocab.colaborador.status.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="mb-2 block">Departamento</Label>
                <Input value={draft.department} onChange={(e) => set(onChangeDraft, "department", e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="mb-2 block">Contacto</Label>
                  <Input value={draft.contact} onChange={(e) => set(onChangeDraft, "contact", e.target.value)} placeholder="Teléfono" />
                </div>
                <div>
                  <Label className="mb-2 block">Email</Label>
                  <Input type="email" value={draft.email} onChange={(e) => set(onChangeDraft, "email", e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="mb-2 block">Seniority</Label>
                  <Select value={draft.seniority} onValueChange={(v) => set(onChangeDraft, "seniority", v as string)}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {vocab.colaborador.seniority.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="mb-2 block">Precios/Nivel</Label>
                  <Select value={draft.priceLevel} onValueChange={(v) => set(onChangeDraft, "priceLevel", v as string)}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {vocab.colaborador.price.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="mb-2 block">Disponibilidad</Label>
                <Select value={draft.availability} onValueChange={(v) => set(onChangeDraft, "availability", v as string)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {AVAILABILITY_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-2 block">Fecha de inicio</Label>
                <Input type="date" value={draft.startDate} onChange={(e) => set(onChangeDraft, "startDate", e.target.value)} />
              </div>
            </>
          ) : null}

          {draft.type === "Tienda" ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="mb-2 block">Empresa</Label>
                  <Input value={draft.company} onChange={(e) => set(onChangeDraft, "company", e.target.value)} />
                </div>
                <div>
                  <Label className="mb-2 block">Contacto</Label>
                  <Input value={draft.contact} onChange={(e) => set(onChangeDraft, "contact", e.target.value)} placeholder="Teléfono/Email" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="mb-2 block">Estado</Label>
                  <Select value={draft.status} onValueChange={(v) => set(onChangeDraft, "status", v as string)}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {vocab.tienda.status.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="mb-2 block">Tipo</Label>
                  <Select value={draft.tiendaType} onValueChange={(v) => set(onChangeDraft, "tiendaType", v as ContactDraft["tiendaType"])}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {vocab.tienda.type.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="mb-2 block">Ramo principal</Label>
                  <Input value={draft.mainSpecialty} onChange={(e) => set(onChangeDraft, "mainSpecialty", e.target.value)} />
                </div>
                <div>
                  <Label className="mb-2 block">Precios/Nivel</Label>
                  <Select value={draft.priceLevel} onValueChange={(v) => set(onChangeDraft, "priceLevel", v as string)}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {vocab.tienda.price.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="mb-2 block">Ubicación</Label>
                <Input value={draft.location} onChange={(e) => set(onChangeDraft, "location", e.target.value)} />
              </div>
              <div>
                <Label className="mb-2 block">Fecha de inicio</Label>
                <Input type="date" value={draft.startDate} onChange={(e) => set(onChangeDraft, "startDate", e.target.value)} />
              </div>
            </>
          ) : null}

          {draft.type !== "Cliente" ? (
            <>
              <div>
                <Label className="mb-2 block">Calificación</Label>
                <StarRating rating={draft.rating} onRate={(r) => set(onChangeDraft, "rating", r)} />
              </div>
              <div>
                <Label className="mb-2 block">Comentarios</Label>
                <Textarea value={draft.comments} onChange={(e) => set(onChangeDraft, "comments", e.target.value)} rows={2} />
              </div>
            </>
          ) : null}
        </div>

        <SheetFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={onSave} disabled={!draft.name.trim()}>Guardar</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
