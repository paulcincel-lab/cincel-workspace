"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";

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
import { SettingsSection } from "@/components/patterns/SettingsSection";
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
import {
  createGroupMappingAction,
  deleteGroupMappingAction,
  updateGroupMappingAction,
} from "@/lib/actions/workspace-access-actions";
import { OFFICIAL_CINCEL_ROLES } from "@/lib/data/roles";
import { qk } from "@/lib/query/keys";
import { useActionMutation } from "@/lib/query/mutation";
import type {
  GroupMapping,
  GroupMappingError,
  GroupMappingInput,
  GroupMappingKind,
  GroupMappingResult,
} from "@/lib/types/workspace-access";

export const GROUP_MAPPING_ERROR_MESSAGES: Record<GroupMappingError, string> = {
  group_not_found: "El grupo no existe",
  duplicate: "Este grupo ya está asignado con ese tipo.",
  invalid: "Revisa los datos del grupo.",
  directory_error: "No pudimos consultar Google; intenta más tarde",
  forbidden: "No tienes permiso.",
};

const KIND_LABELS: Record<GroupMappingKind, string> = { role: "Rol", position: "Puesto" };

/**
 * What a mapping change touches (plan §3, Google): the Google page itself,
 * Puestos (`googleManaged`) and the staff catalog (roles from groups).
 */
export const GROUP_MAPPING_INVALIDATIONS = [qk.ajustes.page("google"), qk.ajustes.page("puestos"), qk.catalog.staff()];

/**
 * The copy of a failed mapping mutation: the action's `{ ok: false, error }`
 * code (thrown by `useActionMutation`) or, for anything else (a stripped
 * production error), `fallback`.
 */
export function groupMappingErrorText(err: unknown, fallback: string): string {
  const code = err instanceof Error ? err.message : "";
  return Object.hasOwn(GROUP_MAPPING_ERROR_MESSAGES, code)
    ? GROUP_MAPPING_ERROR_MESSAGES[code as GroupMappingError]
    : fallback;
}

/** Create or update one mapping; the result's failure codes keep their own copy. */
async function saveGroupMapping(vars: { id: string | null; input: GroupMappingInput }): Promise<GroupMappingResult> {
  return vars.id ? updateGroupMappingAction(vars.id, vars.input) : createGroupMappingAction(vars.input);
}

/** The copy is shown by the caller (`onError` of `mutate`), never as a toast. */
const SILENT = () => undefined;

type PositionOption = { id: string; name: string };

type MappingDraft = {
  groupEmail: string;
  kind: GroupMappingKind;
  role: string;
  positionId: string;
  rank: string;
};

const EMPTY_DRAFT: MappingDraft = { groupEmail: "", kind: "role", role: "", positionId: "", rank: "0" };

function draftFromMapping(mapping: GroupMapping): MappingDraft {
  return {
    groupEmail: mapping.groupEmail,
    kind: mapping.kind,
    role: mapping.role ?? "",
    positionId: mapping.positionId ?? "",
    rank: String(mapping.rank),
  };
}

export type GoogleGroupMappingsProps = {
  mappings: GroupMapping[];
  positions: PositionOption[];
  /**
   * As an Ajustes `SettingsSection` (canvas `Ajustes-Google`): the "Grupos de
   * Google" heading (h3) with an outline "Agregar grupo" on the right.
   * Otherwise its own card (the Google setup wizard).
   */
  section?: boolean;
};

export const GOOGLE_GROUPS_TITLE = "Grupos de Google";
export const GOOGLE_GROUPS_DESCRIPTION = "Qué grupo de Google Workspace da cada rol o puesto.";
export const GOOGLE_GROUPS_EMPTY = "Aún no hay grupos.";
export const GROUP_LOOKUP_NOTE = "El grupo se busca en Google Workspace al guardar.";

const TH = "whitespace-nowrap border-b border-border bg-muted px-3 py-2 text-left font-mono text-[11px] font-medium tracking-wider text-muted-foreground uppercase";
const TD = "border-b border-accent px-3 py-2 text-[13px]";

/** "Miembros": the Directory count, "El grupo no existe" (destructive) or "—" while unchecked. */
function MembersCell({ mapping }: { mapping: GroupMapping }) {
  if (mapping.exists === false) return <span className="text-destructive">{GROUP_MAPPING_ERROR_MESSAGES.group_not_found}</span>;
  return <span className="font-mono">{mapping.memberCount ?? "—"}</span>;
}

/**
 * "Grupos de Google" (FE §2.5, canvas `Ajustes-Google`): the mapped groups
 * with their Directory member count ("El grupo no existe" when `groups.get`
 * no longer finds one), and the create / edit sheet (delete from the sheet).
 */
export function GoogleGroupMappings({ mappings, positions, section = false }: GoogleGroupMappingsProps) {
  const saveMutation = useActionMutation(saveGroupMapping, {
    invalidate: GROUP_MAPPING_INVALIDATIONS,
    onFormError: SILENT,
  });
  const deleteMutation = useActionMutation(deleteGroupMappingAction, {
    invalidate: GROUP_MAPPING_INVALIDATIONS,
    onFormError: SILENT,
  });
  const isPending = saveMutation.isPending || deleteMutation.isPending;
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
        ? { groupEmail: draft.groupEmail, kind: "role" as const, role: draft.role || null, positionId: null, rank }
        : {
            groupEmail: draft.groupEmail,
            kind: "position" as const,
            role: null,
            positionId: draft.positionId || null,
            rank: 0,
          };
    setFormError("");
    saveMutation.mutate(
      { id: editing?.id ?? null, input },
      {
        onSuccess: () => {
          setSheetOpen(false);
          setEditing(null);
        },
        onError: (err) => setFormError(groupMappingErrorText(err, "No se pudo guardar el grupo.")),
      },
    );
  }

  function confirmDelete() {
    const target = deleting;
    if (!target) return;
    setListError("");
    deleteMutation.mutate(target.id, {
      onError: (err) => setListError(groupMappingErrorText(err, "No se pudo eliminar el grupo.")),
      onSettled: () => setDeleting(null),
    });
  }

  const roleItems = Object.fromEntries(OFFICIAL_CINCEL_ROLES.map((role) => [role, role]));
  const positionItems = Object.fromEntries(positions.map((position) => [position.id, position.name]));

  const body = (
    <>
      {listError ? (
        <Alert variant="destructive">
          <AlertDescription>{listError}</AlertDescription>
        </Alert>
      ) : null}

      {mappings.length === 0 ? (
        <div className="flex flex-col items-start gap-2 rounded-[10px] border border-dashed border-border px-4 py-5">
          <p className="text-[13px] text-muted-foreground">{GOOGLE_GROUPS_EMPTY}</p>
          <Button type="button" variant="outline" size="sm" onClick={openCreate}>
            Agregar grupo
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[10px] border border-border">
          <table className="w-full min-w-[640px] border-collapse">
            <caption className="sr-only">{GOOGLE_GROUPS_TITLE}</caption>
            <thead>
              <tr>
                <th scope="col" className={TH}>
                  Correo del grupo
                </th>
                <th scope="col" className={TH}>
                  Tipo
                </th>
                <th scope="col" className={TH}>
                  Rango
                </th>
                <th scope="col" className={TH}>
                  Puesto
                </th>
                <th scope="col" className={`${TH} text-right`}>
                  Miembros
                </th>
                <th scope="col" className={`${TH} text-right`}>
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody>
              {mappings.map((mapping) => (
                <tr key={mapping.id} data-mapping={mapping.id}>
                  <th scope="row" className={`${TD} text-left font-mono font-normal text-foreground`}>
                    {mapping.groupEmail}
                  </th>
                  <td className={TD}>{KIND_LABELS[mapping.kind]}</td>
                  <td className={TD}>{mapping.kind === "role" ? (mapping.role ?? "—") : "—"}</td>
                  <td className={TD}>{mapping.kind === "position" ? (mapping.positionName ?? "—") : "—"}</td>
                  <td className={`${TD} text-right`}>
                    <MembersCell mapping={mapping} />
                  </td>
                  <td className={`${TD} text-right`}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Editar ${mapping.groupEmail}`}
                      onClick={() => openEdit(mapping)}
                    >
                      <Pencil aria-hidden="true" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[12.5px] text-muted-foreground">{GROUP_LOOKUP_NOTE}</p>

      <Sheet open={sheetOpen} onOpenChange={(next) => (next ? setSheetOpen(true) : setSheetOpen(false))}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editing ? "Editar grupo" : "Agregar grupo"}</SheetTitle>
            <SheetDescription>{GROUP_LOOKUP_NOTE}</SheetDescription>
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
                  <SelectItem value="position">{KIND_LABELS.position}</SelectItem>
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
                <Label>Puesto</Label>
                <Select
                  items={positionItems}
                  value={draft.positionId || null}
                  onValueChange={(value) => setDraft((current) => ({ ...current, positionId: (value as string) ?? "" }))}
                >
                  <SelectTrigger className="w-full" aria-label="Puesto">
                    <SelectValue placeholder="Elige un puesto" />
                  </SelectTrigger>
                  <SelectContent>
                    {positions.map((position) => (
                      <SelectItem key={position.id} value={position.id}>
                        {position.name}
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
            {editing ? (
              <Button
                type="button"
                variant="destructive"
                disabled={isPending}
                onClick={() => {
                  const target = editing;
                  setSheetOpen(false);
                  setEditing(null);
                  setDeleting(target);
                }}
              >
                Eliminar grupo
              </Button>
            ) : null}
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
    </>
  );

  if (section) {
    return (
      <SettingsSection
        title={GOOGLE_GROUPS_TITLE}
        description={GOOGLE_GROUPS_DESCRIPTION}
        level={3}
        actions={
          <Button type="button" variant="outline" size="sm" onClick={openCreate}>
            Agregar grupo
          </Button>
        }
      >
        {body}
      </SettingsSection>
    );
  }

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground">{GOOGLE_GROUPS_TITLE}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{GOOGLE_GROUPS_DESCRIPTION}</p>
        </div>
        <Button onClick={openCreate}>Agregar grupo</Button>
      </div>
      {body}
    </section>
  );
}
