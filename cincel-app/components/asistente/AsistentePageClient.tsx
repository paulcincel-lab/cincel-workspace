"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PlusIcon, Trash2Icon } from "lucide-react";

import { AssistantChat } from "@/components/asistente/AssistantChat";
import {
  useAssistantTurnFinished,
  useDeleteAssistantThread,
  type AssistantTurn,
} from "@/components/asistente/use-asistente-cache";
import { Alert, AlertDescription } from "@/components/ui/shadcn/alert";
import { Button } from "@/components/ui/shadcn/button";
import { ASSISTANT_TOOL_GROUPS } from "@/lib/assistant/starter-prompts";
import { groupAssistantThreads, threadTimeLabel } from "@/lib/assistant/thread-groups";
import { actionErrorText } from "@/lib/errors";
import { CUTTO_LINK_LABELS, CUTTO_LINK_TARGET, cuttoBaseUrl } from "@/lib/integrations/cutto-links";
import { qk } from "@/lib/query/keys";
import { mutationErrorText } from "@/lib/query/mutation";
import { asistenteThreadOptions, asistenteThreadsOptions } from "@/lib/query/options/asistente";
import { useAssistantUi } from "@/lib/stores/assistant-ui-store";
import type { AssistantContext, AssistantThreadSummary } from "@/lib/types/redesign";

export type { AsistentePageThread } from "@/lib/types/asistente";

export type AsistentePageClientProps = {
  /** The `?thread=<id>` thread the page seeded into `qk.asistente.thread(id)`; null starts a new conversation. */
  threadId: string | null;
  /** True when `?thread=<id>` named a thread the caller doesn't have. */
  missingThread?: boolean;
};

const PAGE_CONTEXT: AssistantContext = { route: "/asistente" };
const UNTITLED = "Conversación sin título";
const NOT_FOUND_TEXT = () => actionErrorText(new Error("NOT_FOUND"));

function newThreadId(): string {
  return crypto.randomUUID();
}

/** The open conversation: a stored thread, or a new one the route creates on its first message. */
type Active = { id: string; isNew: boolean };

/** `/asistente?thread=` without an RSC request (Next keeps `useSearchParams` in sync with `history`). */
function replaceThreadInUrl(threadId: string | null): void {
  const url = threadId ? `/asistente?thread=${encodeURIComponent(threadId)}` : "/asistente";
  window.history.replaceState(window.history.state, "", url);
}

/**
 * Full assistant page (redesign FE §3.9, frame `AsistentePagina`): history
 * grouped Hoy / Esta semana / Anteriores with delete, the conversation
 * (`AssistantChat` in server-thread mode) and the "Herramientas" panel of
 * starter prompts. The floating assistant button is not part of this page.
 *
 * Data (Query Migration Phase 10, #944): the list is `qk.asistente.threads()`
 * and each conversation `qk.asistente.thread(id)`, both seeded by the page.
 * Switching threads replaces `?thread=` with `history.replaceState` and
 * reads the cache (one thread call when it isn't cached), so the page never
 * re-renders on the server. The selected thread also goes to
 * `useAssistantUi.threadId`, so the floating sheet elsewhere continues it.
 */
export function AsistentePageClient({ threadId: seededThreadId, missingThread = false }: AsistentePageClientProps) {
  const qc = useQueryClient();
  const setStoreThreadId = useAssistantUi((s) => s.setThreadId);
  const [active, setActive] = useState<Active>(() =>
    seededThreadId ? { id: seededThreadId, isNew: false } : { id: newThreadId(), isNew: true },
  );
  const [notice, setNotice] = useState<string | null>(missingThread ? NOT_FOUND_TEXT() : null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ text: string; nonce: number } | undefined>(undefined);
  const cuttoUrl = cuttoBaseUrl();

  const threadsQuery = useQuery(asistenteThreadsOptions());
  const threads = useMemo(() => threadsQuery.data ?? [], [threadsQuery.data]);
  const threadQuery = useQuery({ ...asistenteThreadOptions(active.id), enabled: !active.isNew });
  const groups = useMemo(() => groupAssistantThreads(threads), [threads]);

  // The deep-linked thread is the one the floating sheet continues after leaving the page.
  useEffect(() => {
    if (seededThreadId) useAssistantUi.getState().setThreadId(seededThreadId);
  }, [seededThreadId]);

  const startNewConversation = useCallback(() => {
    setNotice(null);
    setActive({ id: newThreadId(), isNew: true });
    replaceThreadInUrl(null);
    setStoreThreadId(null);
  }, [setStoreThreadId]);

  const selectThread = async (id: string) => {
    if (id === active.id && !active.isNew) return;
    setNotice(null);
    setLoadingId(id);
    try {
      // Cached threads (staleTime Infinity) resolve without a request.
      const thread = await qc.fetchQuery(asistenteThreadOptions(id));
      if (!thread) {
        qc.setQueryData<AssistantThreadSummary[]>(qk.asistente.threads(), (prev) => prev?.filter((t) => t.id !== id));
        qc.removeQueries({ queryKey: qk.asistente.thread(id), exact: true });
        setNotice(NOT_FOUND_TEXT());
        return;
      }
      setActive({ id: thread.id, isNew: false });
      replaceThreadInUrl(thread.id);
      setStoreThreadId(thread.id);
    } catch (err) {
      setNotice(mutationErrorText(err));
    } finally {
      setLoadingId(null);
    }
  };

  const deleteMutation = useDeleteAssistantThread({
    onDeleted: (id) => {
      if (id === active.id) startNewConversation();
    },
  });

  const turnFinished = useAssistantTurnFinished();
  const onTurnFinished = useCallback(
    (turn: AssistantTurn) => {
      turnFinished(turn);
      setActive((prev) => (prev.id === turn.threadId && prev.isNew ? { ...prev, isNew: false } : prev));
      replaceThreadInUrl(turn.threadId);
      setStoreThreadId(turn.threadId);
    },
    [turnFinished, setStoreThreadId],
  );

  const insertPrompt = (text: string) => {
    setDraft((prev) => ({ text, nonce: (prev?.nonce ?? 0) + 1 }));
  };

  const stored = active.isNew ? null : threadQuery.data;
  const activeTitle = active.isNew
    ? "Nueva conversación"
    : threads.find((t) => t.id === active.id)?.title || stored?.title || UNTITLED;
  const threadNotice = active.isNew
    ? null
    : threadQuery.isError
      ? mutationErrorText(threadQuery.error)
      : threadQuery.data === null
        ? NOT_FOUND_TEXT()
        : null;
  const shownNotice = notice ?? threadNotice;
  const chatMessages = active.isNew ? [] : (threadQuery.data?.messages ?? null);

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col lg:h-dvh lg:flex-row">
      <aside
        aria-label="Conversaciones"
        className="flex flex-col gap-1 border-b border-border bg-card p-3 lg:w-64 lg:shrink-0 lg:overflow-y-auto lg:border-r lg:border-b-0"
      >
        <Button variant="outline" className="mb-2 justify-start" onClick={startNewConversation}>
          <PlusIcon aria-hidden />
          Nueva conversación
        </Button>
        {groups.length === 0 ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">Aún no hay conversaciones.</p>
        ) : (
          groups.map((group) => (
            <section key={group.key} aria-labelledby={`asistente-grupo-${group.key}`} className="flex flex-col gap-0.5">
              <h2 id={`asistente-grupo-${group.key}`} className="px-2 pt-3 pb-1 text-xs font-medium text-muted-foreground">
                {group.label}
              </h2>
              <ul className="flex flex-col gap-0.5">
                {group.threads.map((thread) => {
                  const current = thread.id === active.id && !active.isNew;
                  const title = thread.title || UNTITLED;
                  return (
                    <li key={thread.id} className="flex items-center gap-1">
                      <Button
                        variant={current ? "secondary" : "ghost"}
                        className="h-auto min-w-0 flex-1 justify-between gap-2 py-2"
                        aria-current={current ? "page" : undefined}
                        aria-busy={loadingId === thread.id || undefined}
                        onClick={() => void selectThread(thread.id)}
                      >
                        <span className="truncate">{title}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {threadTimeLabel(thread.updatedAt, group.key)}
                        </span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Eliminar conversación ${title}`}
                        title="Eliminar conversación"
                        onClick={() => deleteMutation.mutate(thread.id)}
                      >
                        <Trash2Icon aria-hidden />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </aside>

      <section aria-labelledby="asistente-titulo" className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-4 lg:px-6">
        <div className="flex flex-col gap-0.5">
          <h1 id="asistente-titulo" className="text-lg font-semibold text-foreground">
            Asistente
          </h1>
          <p className="truncate text-sm text-muted-foreground">{activeTitle}</p>
        </div>
        {shownNotice ? (
          <Alert variant="destructive">
            <AlertDescription>{shownNotice}</AlertDescription>
          </Alert>
        ) : null}
        <div className="flex min-h-[28rem] flex-1 flex-col">
          {chatMessages ? (
            <AssistantChat
              key={active.id}
              thread={{ id: active.id, messages: chatMessages }}
              context={PAGE_CONTEXT}
              draft={draft}
              onTurnFinished={onTurnFinished}
            />
          ) : threadQuery.isPending ? (
            <p className="text-sm text-muted-foreground" aria-live="polite">
              Cargando conversación…
            </p>
          ) : null}
        </div>
      </section>

      <aside
        aria-labelledby="asistente-herramientas"
        className="flex flex-col gap-4 border-t border-border bg-muted p-4 lg:w-72 lg:shrink-0 lg:overflow-y-auto lg:border-t-0 lg:border-l"
      >
        <div className="flex flex-col gap-1">
          <h2 id="asistente-herramientas" className="text-sm font-semibold text-foreground">
            Herramientas
          </h2>
          <p className="text-xs text-muted-foreground">
            Elige una herramienta para escribir la instrucción en el mensaje; revísala y envíala cuando esté lista.
          </p>
        </div>
        {ASSISTANT_TOOL_GROUPS.map((group) => (
          <section
            key={group.key}
            aria-labelledby={`asistente-herramientas-${group.key}`}
            aria-disabled={group.disabled || undefined}
            className="flex flex-col gap-1.5"
          >
            <h3 id={`asistente-herramientas-${group.key}`} className="text-xs font-medium text-foreground">
              {group.label}
            </h3>
            <p className="text-xs text-muted-foreground">{group.description}</p>
            <ul className="flex flex-col gap-1">
              {group.prompts.map((starter) => (
                <li key={starter.label}>
                  <Button
                    variant="outline"
                    className="h-auto w-full flex-col items-start gap-0.5 py-2 text-left whitespace-normal"
                    disabled={group.disabled}
                    onClick={group.disabled ? undefined : () => insertPrompt(starter.prompt)}
                  >
                    <span>{starter.label}</span>
                    <span className="text-xs font-normal text-muted-foreground">{starter.description}</span>
                  </Button>
                </li>
              ))}
            </ul>
            {group.disabled && group.disabledNote ? (
              <p className="text-xs text-muted-foreground">
                {group.disabledNote}{" "}
                {cuttoUrl ? (
                  <a className="underline underline-offset-2" href={cuttoUrl} {...CUTTO_LINK_TARGET}>
                    {CUTTO_LINK_LABELS.open}
                  </a>
                ) : null}
              </p>
            ) : null}
          </section>
        ))}
      </aside>
    </div>
  );
}
