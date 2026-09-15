"use client";

import type { Dispatch, SetStateAction } from "react";

import { Button } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/shadcn/sheet";
import { StarRating } from "@/components/proveedores/StarRating";
import { Textarea } from "@/components/ui/shadcn/textarea";
import { CONTACT_TYPE_LABEL, PROVIDER_STATUS_LABEL } from "@/lib/directorio/types";
import type {
  ContactInput,
  ContactKind,
  ContactPersonInput,
  ContactType,
  ProviderStatus,
  ProviderSubtype,
} from "@/lib/types/core";

const CONTACT_TYPES: ContactType[] = ["cliente", "socio", "proveedor"];
const PROVIDER_SUBTYPES: ProviderSubtype[] = ["contratista", "colaborador", "tienda"];
const PROVIDER_SUBTYPE_LABEL: Record<ProviderSubtype, string> = {
  contratista: "Contratista",
  colaborador: "Colaborador",
  tienda: "Tienda",
};
const PROVIDER_STATUSES: ProviderStatus[] = ["activo", "inactivo", "pausado", "prospecto", "lista_negra"];

const emptyPerson: ContactPersonInput = { name: "", role: "", phone: "", email: "", isPrimary: false };

/**
 * A single flat draft shape covering `ContactInput` plus the provider-only
 * fields (only sent when `type === "proveedor"`). Since `Contact` unifies
 * clientes/socios/proveedores into one row, one form now covers what used to
 * be four differently-shaped editors.
 */
export type ContactDraft = {
  type: ContactType;
  kind: ContactKind;
  name: string;
  phone: string;
  email: string;
  website: string;
  location: string;
  acquisitionChannel: string;
  notes: string;
  people: ContactPersonInput[];
  categoriaTagsText: string;
  habilidadTagsText: string;
  // Proveedor only
  providerSubtype: ProviderSubtype;
  providerStatus: ProviderStatus;
  mainSpecialty: string;
  department: string;
  seniority: string;
  priceLevel: string;
  availability: string;
  comments: string;
  rating: number;
  startDate: string;
};

export const emptyContactDraft: ContactDraft = {
  type: "cliente",
  kind: "particular",
  name: "",
  phone: "",
  email: "",
  website: "",
  location: "",
  acquisitionChannel: "",
  notes: "",
  people: [],
  categoriaTagsText: "",
  habilidadTagsText: "",
  providerSubtype: "contratista",
  providerStatus: "activo",
  mainSpecialty: "",
  department: "",
  seniority: "",
  priceLevel: "",
  availability: "",
  comments: "",
  rating: 0,
  startDate: "",
};

/** Builds the payload for createContactAction/updateContactAction from a draft. */
export function draftToContactInput(draft: ContactDraft): ContactInput {
  const tags = [
    ...draft.categoriaTagsText
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean)
      .map((value) => ({ kind: "categoria" as const, value })),
    ...draft.habilidadTagsText
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean)
      .map((value) => ({ kind: "habilidad" as const, value })),
  ];

  return {
    type: draft.type,
    kind: draft.kind,
    name: draft.name.trim(),
    phone: draft.phone.trim() || null,
    email: draft.email.trim() || null,
    website: draft.website.trim() || null,
    location: draft.location.trim() || null,
    acquisitionChannel: draft.acquisitionChannel.trim() || null,
    notes: draft.notes.trim() || null,
    people: draft.people.filter((p) => p.name.trim()),
    tags,
    providerProfile:
      draft.type === "proveedor"
        ? {
            subtype: draft.providerSubtype,
            status: draft.providerStatus,
            mainSpecialty: draft.mainSpecialty.trim() || null,
            department: draft.department.trim() || null,
            seniority: draft.seniority.trim() || null,
            priceLevel: draft.priceLevel.trim() || null,
            availability: draft.availability.trim() || null,
            comments: draft.comments.trim() || null,
            rating: draft.rating || null,
            startDate: draft.startDate || null,
            // No staff picker wired up here yet — providers linked to an
            // internal staff record stay unlinked until that UI exists.
            staffId: null,
          }
        : null,
  };
}

interface ContactEditorSheetProps {
  show: boolean;
  onClose: () => void;
  editingId: string | null;
  draft: ContactDraft;
  onChangeDraft: Dispatch<SetStateAction<ContactDraft>>;
  formError: string;
  onSave: () => void;
}

function set<K extends keyof ContactDraft>(
  onChangeDraft: Dispatch<SetStateAction<ContactDraft>>,
  key: K,
  value: ContactDraft[K]
) {
  onChangeDraft((d) => ({ ...d, [key]: value }));
}

/** Create/edit Sheet for a Directorio contact — one shared form, provider-only fields shown conditionally. */
export function ContactEditorSheet({
  show,
  onClose,
  editingId,
  draft,
  onChangeDraft,
  formError,
  onSave,
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-2 block">Tipo de contacto</Label>
              <Select
                value={draft.type}
                onValueChange={(v) => set(onChangeDraft, "type", v as ContactType)}
                disabled={isEditing}
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONTACT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{CONTACT_TYPE_LABEL[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-2 block">Empresa o particular</Label>
              <Select value={draft.kind} onValueChange={(v) => set(onChangeDraft, "kind", v as ContactKind)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="particular">Particular</SelectItem>
                  <SelectItem value="empresa">Empresa</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="mb-2 block">Nombre</Label>
            <Input
              value={draft.name}
              onChange={(e) => set(onChangeDraft, "name", e.target.value)}
              placeholder={draft.type === "cliente" ? "Familia Gómez" : "Nombre o razón social"}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-2 block">Teléfono</Label>
              <Input value={draft.phone} onChange={(e) => set(onChangeDraft, "phone", e.target.value)} />
            </div>
            <div>
              <Label className="mb-2 block">Email</Label>
              <Input type="email" value={draft.email} onChange={(e) => set(onChangeDraft, "email", e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-2 block">Página web</Label>
              <Input value={draft.website} onChange={(e) => set(onChangeDraft, "website", e.target.value)} placeholder="https://..." />
            </div>
            <div>
              <Label className="mb-2 block">Ubicación</Label>
              <Input value={draft.location} onChange={(e) => set(onChangeDraft, "location", e.target.value)} />
            </div>
          </div>

          <div>
            <Label className="mb-2 block">Canal de adquisición</Label>
            <Input value={draft.acquisitionChannel} onChange={(e) => set(onChangeDraft, "acquisitionChannel", e.target.value)} />
          </div>

          <div>
            <Label className="mb-2 block">Notas</Label>
            <Textarea value={draft.notes} onChange={(e) => set(onChangeDraft, "notes", e.target.value)} rows={2} />
          </div>

          <div>
            <Label className="mb-2 block">Categorías</Label>
            <Input
              value={draft.categoriaTagsText}
              onChange={(e) => set(onChangeDraft, "categoriaTagsText", e.target.value)}
              placeholder="Categoría 1, Categoría 2"
            />
          </div>
          <div>
            <Label className="mb-2 block">Habilidades</Label>
            <Input
              value={draft.habilidadTagsText}
              onChange={(e) => set(onChangeDraft, "habilidadTagsText", e.target.value)}
              placeholder="Habilidad 1, Habilidad 2"
            />
          </div>

          {draft.type === "proveedor" ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="mb-2 block">Subtipo</Label>
                  <Select value={draft.providerSubtype} onValueChange={(v) => set(onChangeDraft, "providerSubtype", v as ProviderSubtype)}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PROVIDER_SUBTYPES.map((s) => <SelectItem key={s} value={s}>{PROVIDER_SUBTYPE_LABEL[s]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="mb-2 block">Estado</Label>
                  <Select value={draft.providerStatus} onValueChange={(v) => set(onChangeDraft, "providerStatus", v as ProviderStatus)}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PROVIDER_STATUSES.map((s) => <SelectItem key={s} value={s}>{PROVIDER_STATUS_LABEL[s]}</SelectItem>)}
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
                  <Label className="mb-2 block">Departamento</Label>
                  <Input value={draft.department} onChange={(e) => set(onChangeDraft, "department", e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="mb-2 block">Seniority</Label>
                  <Input value={draft.seniority} onChange={(e) => set(onChangeDraft, "seniority", e.target.value)} />
                </div>
                <div>
                  <Label className="mb-2 block">Precio/Nivel</Label>
                  <Input value={draft.priceLevel} onChange={(e) => set(onChangeDraft, "priceLevel", e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="mb-2 block">Disponibilidad</Label>
                  <Input value={draft.availability} onChange={(e) => set(onChangeDraft, "availability", e.target.value)} />
                </div>
                <div>
                  <Label className="mb-2 block">Fecha de inicio</Label>
                  <Input type="date" value={draft.startDate} onChange={(e) => set(onChangeDraft, "startDate", e.target.value)} />
                </div>
              </div>
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

          <div>
            <div className="flex items-center justify-between gap-2">
              <Label className="block">Personas de contacto</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-auto px-3 py-1.5 text-xs"
                onClick={() => set(onChangeDraft, "people", [...draft.people, { ...emptyPerson }])}
              >
                Agregar persona
              </Button>
            </div>
            <div className="mt-2 space-y-3">
              {draft.people.map((person, index) => (
                <div key={index} className="rounded-xl border border-border bg-muted p-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      value={person.name}
                      placeholder="Nombre"
                      onChange={(e) => {
                        const next = [...draft.people];
                        next[index] = { ...next[index], name: e.target.value };
                        set(onChangeDraft, "people", next);
                      }}
                    />
                    <Input
                      value={person.role ?? ""}
                      placeholder="Rol"
                      onChange={(e) => {
                        const next = [...draft.people];
                        next[index] = { ...next[index], role: e.target.value };
                        set(onChangeDraft, "people", next);
                      }}
                    />
                    <Input
                      value={person.phone ?? ""}
                      placeholder="Teléfono"
                      onChange={(e) => {
                        const next = [...draft.people];
                        next[index] = { ...next[index], phone: e.target.value };
                        set(onChangeDraft, "people", next);
                      }}
                    />
                    <Input
                      value={person.email ?? ""}
                      placeholder="Correo electrónico"
                      onChange={(e) => {
                        const next = [...draft.people];
                        next[index] = { ...next[index], email: e.target.value };
                        set(onChangeDraft, "people", next);
                      }}
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <input
                        type="radio"
                        name="primary-person"
                        checked={person.isPrimary}
                        onChange={() =>
                          set(
                            onChangeDraft,
                            "people",
                            draft.people.map((p, i) => ({ ...p, isPrimary: i === index }))
                          )
                        }
                      />
                      Contacto principal
                    </label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-auto px-2 py-1 text-xs"
                      onClick={() => set(onChangeDraft, "people", draft.people.filter((_, i) => i !== index))}
                    >
                      Quitar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <SheetFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={onSave} disabled={!draft.name.trim()}>Guardar</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
