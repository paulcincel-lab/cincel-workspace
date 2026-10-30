"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { HistoryCommentInput } from "@/components/ui/HistoryCommentInput";
import { HistoryEventList } from "@/components/ui/HistoryEventList";
import {
  addProjectCommentAction,
  fetchProjectHistoryAction,
} from "@/lib/actions/projects-actions";
import type { HistoryEvent } from "@/lib/types/core";

const EMPTY_COMMENT_MESSAGE = "Escribe un comentario antes de guardarlo.";
const SAVE_ERROR_MESSAGE = "No se pudo guardar el comentario.";
const LOAD_ERROR_MESSAGE = "No se pudo cargar la bitácora.";

/** Project ficha Bitácora: project history newest first, with a comment input. */
export function ProjectBitacoraCard({ projectId }: { projectId: string }) {
  const [history, setHistory] = useState<HistoryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setHistory(await fetchProjectHistoryAction(projectId));
    } catch {
      setError(LOAD_ERROR_MESSAGE);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const sortedHistory = useMemo(
    () => [...history].sort((a, b) => b.eventAt.localeCompare(a.eventAt)),
    [history],
  );

  async function addComment(text: string) {
    setError("");
    try {
      await addProjectCommentAction(projectId, text);
    } catch (err) {
      setError(
        err instanceof Error && err.message === "EMPTY"
          ? EMPTY_COMMENT_MESSAGE
          : SAVE_ERROR_MESSAGE,
      );
      throw err;
    }
    await load();
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-foreground">Bitácora</h2>
      <div className="mt-4 space-y-3">
        {loading ? (
          <p className="text-sm text-muted-foreground">Cargando bitácora…</p>
        ) : (
          <HistoryEventList
            events={sortedHistory}
            empty={
              <p className="text-sm text-muted-foreground">
                No hay comentarios ni cambios registrados.
              </p>
            }
          />
        )}
        <HistoryCommentInput
          onSubmit={addComment}
          onEmpty={() => setError(EMPTY_COMMENT_MESSAGE)}
          placeholder="Agregar un comentario..."
          submitLabel="Guardar comentario"
        />
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}
