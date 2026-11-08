"use client";

import { useMemo, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";

import { HistoryCommentInput } from "@/components/ui/HistoryCommentInput";
import { HistoryEventList } from "@/components/ui/HistoryEventList";
import { Button } from "@/components/ui/shadcn/button";
import { addProjectCommentAction } from "@/lib/actions/projects-actions";
import { actionErrorCode } from "@/lib/errors";
import { qk } from "@/lib/query/keys";
import { useActionMutation } from "@/lib/query/mutation";
import { proyectoHistoryOptions } from "@/lib/query/options/proyectos";

const EMPTY_COMMENT_MESSAGE = "Escribe un comentario antes de guardarlo.";
const SAVE_ERROR_MESSAGE = "No se pudo guardar el comentario.";
const LOAD_ERROR_MESSAGE = "No se pudo cargar la bitácora.";

/** The comment copy for a failed save. */
function commentErrorText(err: unknown): string {
  return actionErrorCode(err) === "EMPTY" ? EMPTY_COMMENT_MESSAGE : SAVE_ERROR_MESSAGE;
}

/**
 * Project ficha Bitácora: `qk.proyectos.history(id)`, newest first, the last
 * 50 events with "Ver más" for older ones, and a comment input. A comment
 * invalidates only the history.
 */
export function ProjectBitacoraCard({ projectId }: { projectId: string }) {
  const history = useInfiniteQuery(proyectoHistoryOptions(projectId));
  const [error, setError] = useState("");
  const comment = useActionMutation<string, void>((text) => addProjectCommentAction(projectId, text), {
    invalidate: [qk.proyectos.history(projectId)],
    onFormError: () => setError(SAVE_ERROR_MESSAGE),
  });

  const events = useMemo(
    () =>
      (history.data?.pages ?? [])
        .flatMap((page) => page.events)
        .sort((a, b) => b.eventAt.localeCompare(a.eventAt)),
    [history.data],
  );

  async function addComment(text: string) {
    setError("");
    try {
      await comment.mutateAsync(text);
    } catch (err) {
      setError(commentErrorText(err));
      // HistoryCommentInput keeps the text so it can be retried.
      throw err;
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-foreground">Bitácora</h2>
      <div className="mt-4 space-y-3">
        {history.isPending ? (
          <p className="text-sm text-muted-foreground">Cargando bitácora…</p>
        ) : history.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {LOAD_ERROR_MESSAGE}
          </p>
        ) : (
          <HistoryEventList
            events={events}
            empty={
              <p className="text-sm text-muted-foreground">
                No hay comentarios ni cambios registrados.
              </p>
            }
          />
        )}
        {history.hasNextPage ? (
          <Button
            variant="outline"
            size="sm"
            disabled={history.isFetchingNextPage}
            onClick={() => void history.fetchNextPage()}
          >
            {history.isFetchingNextPage ? "Cargando…" : "Ver más"}
          </Button>
        ) : null}
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
