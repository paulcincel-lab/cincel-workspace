"use client";

import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/shadcn/sheet";
import { Switch } from "@/components/ui/shadcn/switch";
import { Textarea } from "@/components/ui/shadcn/textarea";
import TeamMultiSelect from "@/components/ui/TeamMultiSelect";
import type { AreasCapabilities } from "@/lib/auth/permissions";
import type { AreaDetail } from "@/lib/types/core";

const NO_LEAD_VALUE = "__none__";

export type AreaDraft = {
  name: string;
  description: string;
  leadId: string | null;
  active: boolean;
};

interface AreaEditorDrawerProps {
  show: boolean;
  onClose: () => void;
  editingArea: AreaDetail | null;
  draft: AreaDraft;
  onChangeDraft: React.Dispatch<React.SetStateAction<AreaDraft>>;
  formError: string;
  onSaveBasic: () => void;
  isSaving: boolean;
  staffOptions: Array<{ id: string; name: string }>;
  workflowOptions: Array<{ id: string; name: string }>;
  memberNames: string[];
  onChangeMemberNames: (names: string[]) => void;
  onSaveMembers: () => void;
  workflowNames: string[];
  onChangeWorkflowNames: (names: string[]) => void;
  onSaveWorkflows: () => void;
  capabilities: AreasCapabilities;
}

/** Slide-in form for creating/editing an area, and — once it exists — managing
 * its members and workflow assignments. Mirrors MemberEditorDrawer's shape. */
export function AreaEditorDrawer({
  show,
  onClose,
  editingArea,
  draft,
  onChangeDraft,
  formError,
  onSaveBasic,
  isSaving,
  staffOptions,
  workflowOptions,
  memberNames,
  onChangeMemberNames,
  onSaveMembers,
  workflowNames,
  onChangeWorkflowNames,
  onSaveWorkflows,
  capabilities,
}: AreaEditorDrawerProps) {
  const canManage = capabilities.canManageAreas;
  const isCreating = editingArea === null;

  return (
    <Sheet open={show} onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent className="w-[700px] max-w-[700px] overflow-y-auto text-foreground">
        <SheetHeader>
          <SheetTitle>{isCreating ? "Nueva área" : "Editar área"}</SheetTitle>
        </SheetHeader>

        <div className="space-y-6 px-6 py-4">
          {formError ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {formError}
            </div>
          ) : null}

          <section className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-sm font-semibold text-foreground">Información general</h3>

            <div className="mt-4 space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">Nombre</label>
                <Input
                  type="text"
                  value={draft.name}
                  disabled={!canManage}
                  onChange={(event) => onChangeDraft((current) => ({ ...current, name: event.target.value }))}
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">Descripción</label>
                <Textarea
                  value={draft.description}
                  disabled={!canManage}
                  onChange={(event) => onChangeDraft((current) => ({ ...current, description: event.target.value }))}
                  rows={3}
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">Responsable</label>
                <Select
                  value={draft.leadId ?? NO_LEAD_VALUE}
                  disabled={!canManage}
                  onValueChange={(value) =>
                    onChangeDraft((current) => ({
                      ...current,
                      leadId: value === NO_LEAD_VALUE ? null : (value as string),
                    }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_LEAD_VALUE}>Sin responsable</SelectItem>
                    {staffOptions.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <label className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-muted p-4">
                <div>
                  <span className="block text-sm font-medium text-foreground">Área activa</span>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Un área inactiva deja de aparecer como opción para nuevas asignaciones.
                  </p>
                </div>
                <Switch
                  checked={draft.active}
                  disabled={!canManage}
                  onCheckedChange={(checked) => onChangeDraft((current) => ({ ...current, active: checked }))}
                />
              </label>
            </div>

            {canManage ? (
              <div className="mt-4 flex justify-end">
                <Button size="sm" onClick={onSaveBasic} disabled={isSaving || !draft.name.trim()}>
                  {isCreating ? "Crear área" : "Guardar cambios"}
                </Button>
              </div>
            ) : null}
          </section>

          <section className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-foreground">Miembros</h3>
              <Badge variant="outline">{memberNames.length} integrantes</Badge>
            </div>

            {isCreating ? (
              <p className="mt-3 text-xs text-muted-foreground">Crea el área para poder asignar miembros.</p>
            ) : (
              <div className="mt-3 space-y-3">
                <TeamMultiSelect
                  options={staffOptions.map((option) => option.name)}
                  selected={memberNames}
                  onChange={onChangeMemberNames}
                  placeholder="Buscar colaborador..."
                />
                {canManage ? (
                  <div className="flex justify-end">
                    <Button size="sm" variant="outline" onClick={onSaveMembers}>
                      Guardar miembros
                    </Button>
                  </div>
                ) : null}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-foreground">Workflows asignados</h3>
              <Badge variant="outline">{workflowNames.length} workflows</Badge>
            </div>

            {isCreating ? (
              <p className="mt-3 text-xs text-muted-foreground">Crea el área para poder asignar workflows.</p>
            ) : (
              <div className="mt-3 space-y-3">
                <TeamMultiSelect
                  options={workflowOptions.map((option) => option.name)}
                  selected={workflowNames}
                  onChange={onChangeWorkflowNames}
                  placeholder="Buscar workflow..."
                />
                {canManage ? (
                  <div className="flex justify-end">
                    <Button size="sm" variant="outline" onClick={onSaveWorkflows}>
                      Guardar workflows
                    </Button>
                  </div>
                ) : null}
              </div>
            )}
          </section>
        </div>

        <SheetFooter>
          <Button variant="outline" onClick={onClose}>
            Cerrar
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
