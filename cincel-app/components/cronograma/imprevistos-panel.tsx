"use client";

import { useOptimistic, useRef, useState, useTransition } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/shadcn/alert-dialog";
import { Button } from "@/components/ui/shadcn/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/shadcn/card";
import { Input } from "@/components/ui/shadcn/input";
import { Textarea } from "@/components/ui/shadcn/textarea";
import { addImprevistoAction, deleteImprevistoAction } from "@/lib/actions/schedule-actions";
import { isoDate } from "@/lib/cronograma/week";
import type { Imprevisto } from "@/lib/types/schedule";

function fmtLarga(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  return `${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
}

interface ImprevistosPanelProps {
  scheduleId: string;
  imprevistos: Imprevisto[];
  readOnly?: boolean;
}

type OptimisticAction = { type: "add"; item: Imprevisto } | { type: "remove"; id: string };

export function ImprevistosPanel({ scheduleId, imprevistos, readOnly = false }: ImprevistosPanelProps) {
  const [items, setItems] = useState(imprevistos);
  const [optimisticItems, applyOptimistic] = useOptimistic(items, (state, action: OptimisticAction) => {
    if (action.type === "add") return [action.item, ...state];
    return state.filter((i) => i.id !== action.id);
  });
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [fecha, setFecha] = useState(isoDate(new Date()));
  const [texto, setTexto] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  const sorted = [...optimisticItems].sort((a, b) => b.fecha.localeCompare(a.fecha));

  function handleAdd() {
    const trimmed = texto.trim();
    if (!trimmed || !fecha) return;
    setError("");
    const tempId = `optimistic-${Date.now()}`;

    startTransition(async () => {
      applyOptimistic({ type: "add", item: { id: tempId, fecha, texto: trimmed } });
      const result = await addImprevistoAction(scheduleId, { fecha, texto: trimmed });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setItems((current) => [result.data, ...current]);
      setTexto("");
      formRef.current?.reset();
    });
  }

  function handleDelete(id: string) {
    setError("");
    startTransition(async () => {
      applyOptimistic({ type: "remove", id });
      const result = await deleteImprevistoAction(id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setItems((current) => current.filter((i) => i.id !== id));
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Trabajos realizados imprevistos</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin trabajos imprevistos registrados.</p>
        ) : (
          <div className="space-y-1.5">
            {sorted.map((item) => (
              <div key={item.id} className="flex items-start gap-2 rounded-lg border border-border bg-card px-2.5 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-snug text-foreground">{item.texto}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{fmtLarga(item.fecha)}</p>
                </div>
                {readOnly ? null : (
                  <AlertDialog>
                    <AlertDialogTrigger
                      render={
                        <button
                          type="button"
                          className="shrink-0 text-muted-foreground/60 hover:text-destructive"
                          aria-label="Eliminar"
                          title="Eliminar"
                        >
                          ✕
                        </button>
                      }
                    />
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>¿Eliminar este trabajo imprevisto?</AlertDialogTitle>
                        <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(item.id)}>Eliminar</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            ))}
          </div>
        )}

        {readOnly ? null : (
          <form
            ref={formRef}
            onSubmit={(e) => {
              e.preventDefault();
              handleAdd();
            }}
            className="space-y-2 rounded-xl border border-dashed border-border p-3"
          >
            <Textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Describe el trabajo imprevisto realizado..."
              rows={2}
            />
            <div className="flex items-center gap-2">
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-auto" />
              <Button type="submit" size="sm" disabled={isPending || !texto.trim()}>
                Agregar
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
