"use client";

import { useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";

import { Alert, AlertDescription } from "@/components/ui/shadcn/alert";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/shadcn/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/shadcn/dialog";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";
import { Switch } from "@/components/ui/shadcn/switch";
import { createFlowAction, setDefaultFlowAction, updateFlowAction } from "@/lib/actions/flows-actions";
import { FLOW_INVALIDATIONS } from "@/lib/etapas/invalidations";
import { etapasErrorText } from "@/lib/etapas/etapas-error-text";
import {
  addTramo,
  draftFromFlow,
  draftToInput,
  emptyFlowDraft,
  gateOptions,
  gateValue,
  moveTramo,
  removeTramo,
  setTramoGate,
  type FlowDraft,
} from "@/lib/project-flow/flow-draft";
import { useActionMutation } from "@/lib/query/mutation";
import { ajustesFlujosOptions } from "@/lib/query/options/ajustes";
import type { FlowAdminRow, FlowEtapaOption, FlowInput } from "@/lib/types/flows-admin";

const NO_GATE = "__none__";

/** "Diseño · se habilita al completar Cobro de Presale", or just the etapa name. Inactive etapas keep their key as the fase. */
function tramoSummary(flow: FlowAdminRow, index: number, etapas: FlowEtapaOption[]): string {
  const tramo = flow.tramos[index];
  const after = tramo.afterWorkflowId ? flow.tramos.find((t) => t.workflowId === tramo.afterWorkflowId) : null;
  if (!after || !tramo.gatePhaseKey) return tramo.workflowName;
  const phase = etapas.find((e) => e.id === after.workflowId)?.phases.find((p) => p.key === tramo.gatePhaseKey);
  return `${tramo.workflowName} · se habilita al completar ${phase?.name ?? tramo.gatePhaseKey} de ${after.workflowName}`;
}

/**
 * Ajustes › Flujos (#1035): the flows catalog. Each flow lists its etapas in
 * order; the editor sets the name, which etapas it has, their order and the
 * fase that opens each etapa. One flow is the default (projects without a
 * flow follow it). Reads `qk.ajustes.page('flujos')`, hydrated by the page.
 */
export function FlujosClient() {
  const { flows, etapas } = useSuspenseQuery(ajustesFlujosOptions()).data;
  const [draft, setDraft] = useState<FlowDraft | null>(null);
  const [formError, setFormError] = useState("");
  const [pageError, setPageError] = useState("");

  const saveMutation = useActionMutation(
    (vars: { id: string | null; input: FlowInput }) =>
      vars.id ? updateFlowAction(vars.id, vars.input) : createFlowAction(vars.input),
    { invalidate: FLOW_INVALIDATIONS, onFormError: () => undefined },
  );
  const defaultMutation = useActionMutation((id: string) => setDefaultFlowAction(id), {
    invalidate: FLOW_INVALIDATIONS,
    onFormError: () => undefined,
  });

  function openEditor(next: FlowDraft) {
    setFormError("");
    setDraft(next);
  }

  async function save() {
    if (!draft) return;
    const input = draftToInput(draft);
    if (!input) {
      setFormError(draft.name.trim() ? "Agrega al menos una etapa al flujo." : "Escribe un nombre.");
      return;
    }
    try {
      await saveMutation.mutateAsync({ id: draft.id, input });
      setDraft(null);
    } catch (err) {
      setFormError(etapasErrorText(err));
    }
  }

  async function makeDefault(flow: FlowAdminRow) {
    setPageError("");
    try {
      await defaultMutation.mutateAsync(flow.id);
    } catch (err) {
      setPageError(etapasErrorText(err));
    }
  }

  return (
    <section className="space-y-4" aria-labelledby="flujos-title">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 id="flujos-title" className="text-xl font-semibold text-foreground">
            Flujos
          </h1>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            Un flujo es el orden de las etapas de un proyecto y la fase que habilita cada una. Los proyectos sin flujo
            siguen el predeterminado.
          </p>
        </div>
        <Button onClick={() => openEditor(emptyFlowDraft())}>Nuevo flujo</Button>
      </header>

      {pageError ? (
        <Alert variant="destructive">
          <AlertDescription>{pageError}</AlertDescription>
        </Alert>
      ) : null}

      {flows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aún no hay flujos. Crea el primero.</p>
      ) : (
        <ul className="space-y-3" aria-label="Flujos">
          {flows.map((flow) => (
            <li key={flow.id}>
              <Card>
                <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
                  <CardTitle className="flex flex-wrap items-center gap-2">
                    {flow.name}
                    {flow.isDefault ? <Badge>Predeterminado</Badge> : null}
                    {flow.active ? null : <Badge variant="secondary">Inactivo</Badge>}
                  </CardTitle>
                  <div className="flex gap-2">
                    {flow.isDefault || !flow.active ? null : (
                      <Button variant="outline" size="sm" onClick={() => makeDefault(flow)}>
                        Marcar como predeterminado
                      </Button>
                    )}
                    <Button variant="secondary" size="sm" onClick={() => openEditor(draftFromFlow(flow))}>
                      Editar
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <ol className="list-decimal space-y-1 pl-5 text-sm text-foreground">
                    {flow.tramos.map((tramo, index) => (
                      <li key={tramo.workflowId}>{tramoSummary(flow, index, etapas)}</li>
                    ))}
                  </ol>
                  <p className="text-xs text-muted-foreground">
                    {flow.projectCount === 1 ? "1 proyecto" : `${flow.projectCount} proyectos`}
                  </p>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={draft !== null} onOpenChange={(open) => (open ? undefined : setDraft(null))}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          {draft ? (
            <FlowEditor
              draft={draft}
              etapas={etapas}
              error={formError}
              saving={saveMutation.isPending}
              onChange={(next) => {
                setFormError("");
                setDraft(next);
              }}
              onSave={save}
              onCancel={() => setDraft(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function FlowEditor({
  draft,
  etapas,
  error,
  saving,
  onChange,
  onSave,
  onCancel,
}: {
  draft: FlowDraft;
  etapas: FlowEtapaOption[];
  error: string;
  saving: boolean;
  onChange: (draft: FlowDraft) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const etapaById = new Map(etapas.map((e) => [e.id, e]));
  const available = etapas.filter((e) => !draft.tramos.some((t) => t.workflowId === e.id));
  const addItems = Object.fromEntries(available.map((e) => [e.id, e.name]));

  return (
    <>
      <DialogHeader>
        <DialogTitle>{draft.id ? "Editar flujo" : "Nuevo flujo"}</DialogTitle>
        <DialogDescription>
          Elige las etapas en orden. Una etapa puede habilitarse cuando se completa una fase de una etapa anterior.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="flow-name" className="text-sm font-normal text-muted-foreground">
            Nombre
          </Label>
          <Input
            id="flow-name"
            value={draft.name}
            onChange={(event) => onChange({ ...draft, name: event.target.value })}
            aria-invalid={error ? true : undefined}
          />
        </div>

        {draft.id ? (
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="flow-active" className="text-sm font-normal text-foreground">
              Activo
            </Label>
            <Switch
              id="flow-active"
              checked={draft.active}
              disabled={draft.isDefault}
              onCheckedChange={(checked) => onChange({ ...draft, active: checked })}
            />
          </div>
        ) : null}

        <fieldset className="space-y-3">
          <legend className="mb-1 text-sm font-medium text-foreground">Etapas</legend>
          {draft.tramos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aún no hay etapas en este flujo.</p>
          ) : (
            <ol className="space-y-3">
              {draft.tramos.map((tramo, index) => {
                const name = etapaById.get(tramo.workflowId)?.name ?? "Etapa";
                const options = gateOptions(draft, tramo.workflowId, etapas);
                const items: Record<string, string> = {
                  [NO_GATE]: "Sin condición",
                  ...Object.fromEntries(options.map((o) => [o.value, o.label])),
                };
                const selected = gateValue(tramo) || NO_GATE;
                return (
                  <li key={tramo.workflowId} className="space-y-2 rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-foreground">
                        {index + 1}. {name}
                      </span>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Subir ${name}`}
                          disabled={index === 0}
                          onClick={() => onChange(moveTramo(draft, tramo.workflowId, -1))}
                        >
                          Subir
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Bajar ${name}`}
                          disabled={index === draft.tramos.length - 1}
                          onClick={() => onChange(moveTramo(draft, tramo.workflowId, 1))}
                        >
                          Bajar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Quitar ${name}`}
                          onClick={() => onChange(removeTramo(draft, tramo.workflowId))}
                        >
                          Quitar
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label
                        htmlFor={`flow-gate-${tramo.workflowId}`}
                        className="text-xs font-normal text-muted-foreground"
                      >
                        Se habilita al completar
                      </Label>
                      <Select
                        items={items}
                        value={selected}
                        onValueChange={(next) => {
                          const option = options.find((o) => o.value === next);
                          onChange(
                            setTramoGate(
                              draft,
                              tramo.workflowId,
                              option ? { afterWorkflowId: option.afterWorkflowId, gatePhaseKey: option.gatePhaseKey } : null,
                            ),
                          );
                        }}
                      >
                        <SelectTrigger id={`flow-gate-${tramo.workflowId}`} className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_GATE}>Sin condición</SelectItem>
                          {options.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}

          {available.length > 0 ? (
            <div className="space-y-1">
              <Label htmlFor="flow-add-etapa" className="text-sm font-normal text-muted-foreground">
                Agregar etapa
              </Label>
              <Select
                items={addItems}
                value={null}
                onValueChange={(next) => {
                  if (next) onChange(addTramo(draft, next as string));
                }}
              >
                <SelectTrigger id="flow-add-etapa" className="w-full">
                  <SelectValue placeholder="Elige una etapa" />
                </SelectTrigger>
                <SelectContent>
                  {available.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </fieldset>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button onClick={onSave} disabled={saving}>
          {saving ? "Guardando…" : "Guardar"}
        </Button>
      </DialogFooter>
    </>
  );
}
