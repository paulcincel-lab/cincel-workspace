"use client";

import { useRef, useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";

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
import { isoDate } from "@/lib/cronograma/week";
import { proyectoCronogramaOptions } from "@/lib/query/options/proyectos";
import type { Imprevisto } from "@/lib/types/schedule";

import { useImprevistoMutations } from "./schedule-mutations";

function fmtLarga(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  return `${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
}

interface ImprevistosPanelProps {
  projectId: string;
  readOnly?: boolean;
}

const NO_IMPREVISTOS: Imprevisto[] = [];
/** An added row not saved yet: it can't be deleted until the server answers. */
const TEMP_ID_PREFIX = "optimistic-";

/**
 * "Trabajos realizados imprevistos": the list is the cached schedule's
 * (`qk.proyectos.cronograma(projectId)`); add and delete patch it
 * optimistically, one POST each.
 */
export function ImprevistosPanel({ projectId, readOnly = false }: ImprevistosPanelProps) {
  const { data: view } = useSuspenseQuery(proyectoCronogramaOptions(projectId));
  const [error, setError] = useState("");
  const [fecha, setFecha] = useState(isoDate(new Date()));
  const [texto, setTexto] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const { add, remove } = useImprevistoMutations(projectId, setError);

  const scheduleId = view?.data.schedule.id ?? null;
  const items = view?.data.imprevistos ?? NO_IMPREVISTOS;
  const sorted = [...items].sort((a, b) => b.fecha.localeCompare(a.fecha));

  function handleAdd() {
    const trimmed = texto.trim();
    if (!trimmed || !fecha || !scheduleId) return;
    setError("");
    add.mutate(
      { scheduleId, fecha, texto: trimmed, tempId: `${TEMP_ID_PREFIX}${Date.now()}` },
      {
        onSuccess: () => {
          setTexto("");
          formRef.current?.reset();
        },
      },
    );
  }

  function handleDelete(item: Imprevisto) {
    setError("");
    remove.mutate({ item });
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
                {readOnly || item.id.startsWith(TEMP_ID_PREFIX) ? null : (
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
                        <AlertDialogAction onClick={() => handleDelete(item)}>Eliminar</AlertDialogAction>
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
              <Input type="date" aria-label="Fecha del imprevisto" value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-auto" />
              <Button type="submit" size="sm" disabled={add.isPending || !texto.trim()}>
                Agregar
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
