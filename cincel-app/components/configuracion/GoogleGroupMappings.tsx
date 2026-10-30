"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/ui/DataTable";
import { Alert, AlertDescription } from "@/components/ui/shadcn/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/shadcn/alert-dialog";
import { Button } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/shadcn/sheet";
import { createRowActionsColumn } from "@/components/v2/table/RowActionsMenu";
import {
  createGroupMappingAction,
  deleteGroupMappingAction,
  updateGroupMappingAction,
} from "@/lib/actions/workspace-access-actions";
import { OFFICIAL_CINCEL_ROLES } from "@/lib/data/roles";
import type { GroupMapping, GroupMappingError, GroupMappingKind } from "@/lib/types/workspace-access";

export const GROUP_MAPPING_ERROR_MESSAGES: Record<GroupMappingError, string> = {
  group_not_found: "El grupo no existe",
  duplicate: "Este grupo ya está asignado con ese tipo.",
  invalid: "Revisa los datos del grupo.",
  directory_error: "No pudimos consultar Google; intenta más tarde",
  forbidden: "No tienes permiso.",
};

const KIND_LABELS: Record<GroupMappingKind, string> = { role: "Rol", area: "Área" };

type AreaOption = { id: string; name: string };

type MappingDraft = {
  groupEmail: string;
  kind: GroupMappingKind;
  role: string;
  areaId: string;
  rank: string;
};

const EMPTY_DRAFT: MappingDraft = { groupEmail: "", kind: "role", role: "", areaId: "", rank: "0" };

function draftFromMapping(mapping: GroupMapping): MappingDraft {
  return {
    groupEmail: mapping.groupEmail,
    kind: mapping.kind,
    role: mapping.role ?? "",
    areaId: mapping.areaId ?? "",
    rank: String(mapping.rank),
  };
}

export type GoogleGroupMappingsProps = {
  mappings: GroupMapping[];
  areas: AreaOption[];
};

/** Configuración → Google, section 2 "Grupos de Google" (FE §2.5). */
export function GoogleGroupMappings({ mappings, areas }: GoogleGroupMappingsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<GroupMapping | null>(null);
  const [draft, setDraft] = useState<MappingDraft>(EMPTY_DRAFT);
  const [formError, setFormError] = useState("");
  const [deleting, setDeleting] = useState<GroupMapping | null>(null);
  const [listError, setListError] = useState("");

  function openCreate() {
    setEditing(null);
    setDraft(EMPTY_DRAFT);
    setFormError("");
    setSheetOpen(true);
  }

  function openEdit(mapping: GroupMapping) {
    setEditing(mapping);
    setDraft(draftFromMapping(mapping));
    setFormError("");
    setSheetOpen(true);
  }

  function save() {
    const rank = Number(draft.rank.trim() || "0");
    const input =
      draft.kind === "role"
        ? { groupEmail: draft.groupEmail, kind: "role" as const, role: draft.role || null, areaId: null, rank }
        : { groupEmail: draft.groupEmail, kind: "area" as const, role: null, areaId: draft.areaId || null, rank: 0 };
    setFormError("");
    startTransition(async () => {
      try {
        const result = editing
          ? await updateGroupMappingAction(editing.id, input)
          : await createGroupMappingAction(input);
        if (!result.ok) {
          setFormError(GROUP_MAPPING_ERROR_MESSAGES[result.error]);
          return;
        }
        setSheetOpen(false);
        setEditing(null);
        router.refresh();
      } catch {
        setFormError("No se pudo guardar el grupo.");
      }
    });
  }

  function confirmDelete() {
    const target = deleting;
    if (!target) return;
    setListError("");
    startTransition(async () => {
      try {
        const result = await deleteGroupMappingAction(target.id);
        if (!result.ok) {
          setListError(GROUP_MAPPING_ERROR_MESSAGES[result.error]);
        } else {
          router.refresh();
        }
      } catch {
        setListError("No se pudo eliminar el grupo.");
      } finally {
        setDeleting(null);
      }
    });
  }

  const columns = useMemo<ColumnDef<GroupMapping, unknown>[]>(
    () => [
      { accessorKey: "groupEmail", header: "Grupo" },
      { id: "kind", header: "Tipo", cell: ({ row }) => KIND_LABELS[row.original.kind] },
      {
        id: "value",
        header: "Valor",
        cell: ({ row }) => (row.original.kind === "role" ? row.original.role : row.original.areaName) ?? "—",
      },
      {
        id: "rank",
        header: "Rango",
        cell: ({ row }) => (row.original.kind === "role" ? row.original.rank : "—"),
      },
      createRowActionsColumn<GroupMapping>(() => [
        { label: "Editar", onSelect: (mapping) => openEdit(mapping) },
        {
          label: "Eliminar",
          separatorBefore: true,
          variant: "destructive",
          onSelect: (mapping) => setDeleting(mapping),
        },
      ]),
    ],
    [],
  );

  const roleItems = Object.fromEntries(OFFICIAL_CINCEL_ROLES.map((role) => [role, role]));
  const areaItems = Object.fromEntries(areas.map((area) => [area.id, area.name]));

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Grupos de Google</h2>
          <p className="mt-1 text-sm text-muted-foreground">Qué grupo de Google Workspace da cada rol o área.</p>
        </div>
        <Button onClick={openCreate}>Agregar grupo</Button>
      </div>

      {listError ? (
        <Alert variant="destructive">
          <AlertDescription>{listError}</AlertDescription>
        </Alert>
      ) : null}

      <DataTable columns={columns} data={mappings} getRowId={(row) => row.id} emptyMessage="No hay grupos asignados." />

      <Sheet open={sheetOpen} onOpenChange={(next) => (next ? setSheetOpen(true) : setSheetOpen(false))}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editing ? "Editar grupo" : "Agregar grupo"}</SheetTitle>
            <SheetDescription>El grupo se busca en Google Workspace al guardar.</SheetDescription>
          </SheetHeader>

          <form
            id="group-mapping-form"
            className="space-y-4 px-4"
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
            {formError ? (
              <Alert variant="destructive">
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="group-mapping-email">Correo del grupo</Label>
              <Input
                id="group-mapping-email"
                type="email"
                required
                placeholder="grupo@empresa.com"
                value={draft.groupEmail}
                onChange={(event) => setDraft((current) => ({ ...current, groupEmail: event.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select
                items={KIND_LABELS}
                value={draft.kind}
                onValueChange={(value) => setDraft((current) => ({ ...current, kind: value as GroupMappingKind }))}
              >
                <SelectTrigger className="w-full" aria-label="Tipo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="role">{KIND_LABELS.role}</SelectItem>
                  <SelectItem value="area">{KIND_LABELS.area}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {draft.kind === "role" ? (
              <>
                <div className="space-y-2">
                  <Label>Rol</Label>
                  <Select
                    items={roleItems}
                    value={draft.role || null}
                    onValueChange={(value) => setDraft((current) => ({ ...current, role: (value as string) ?? "" }))}
                  >
                    <SelectTrigger className="w-full" aria-label="Rol">
                      <SelectValue placeholder="Elige un rol" />
                    </SelectTrigger>
                    <SelectContent>
                      {OFFICIAL_CINCEL_ROLES.map((role) => (
                        <SelectItem key={role} value={role}>
                          {role}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="group-mapping-rank">Rango</Label>
                  <Input
                    id="group-mapping-rank"
                    type="number"
                    step={1}
                    value={draft.rank}
                    onChange={(event) => setDraft((current) => ({ ...current, rank: event.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Si alguien está en varios grupos de rol, gana el de rango más alto.
                  </p>
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <Label>Área</Label>
                <Select
                  items={areaItems}
                  value={draft.areaId || null}
                  onValueChange={(value) => setDraft((current) => ({ ...current, areaId: (value as string) ?? "" }))}
                >
                  <SelectTrigger className="w-full" aria-label="Área">
                    <SelectValue placeholder="Elige un área" />
                  </SelectTrigger>
                  <SelectContent>
                    {areas.map((area) => (
                      <SelectItem key={area.id} value={area.id}>
                        {area.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </form>

          <SheetFooter>
            <Button type="submit" form="group-mapping-form" disabled={isPending}>
              {isPending ? "Guardando…" : "Guardar"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setSheetOpen(false)}>
              Cancelar
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AlertDialog open={deleting !== null} onOpenChange={(next) => (next ? undefined : setDeleting(null))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este grupo?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting ? `${deleting.groupEmail} dejará de dar ${KIND_LABELS[deleting.kind].toLowerCase()}.` : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={isPending} onClick={confirmDelete}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
