"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { UIMessage } from "ai";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import { AssistantChat } from "@/components/asistente/AssistantChat";
import { Alert, AlertDescription } from "@/components/ui/shadcn/alert";
import { Button } from "@/components/ui/shadcn/button";
import {
  deleteAssistantThreadAction,
  fetchAssistantThreadAction,
  fetchAssistantThreadsAction,
} from "@/lib/actions/assistant-actions";
import { ASSISTANT_TOOL_GROUPS } from "@/lib/assistant/starter-prompts";
import { groupAssistantThreads, threadTimeLabel } from "@/lib/assistant/thread-groups";
import { actionErrorCode, actionErrorText } from "@/lib/errors";
import { CUTTO_LINK_LABELS, CUTTO_LINK_TARGET, cuttoBaseUrl } from "@/lib/integrations/cutto-links";
import type { AssistantContext, AssistantThreadSummary } from "@/lib/types/redesign";

export type AsistentePageThread = { id: string; title: string; messages: UIMessage[] };

export type AsistentePageClientProps = {
  /** From `fetchAssistantThreadsAction()` (newest first). */
  threads: AssistantThreadSummary[];
  /** The thread of `?thread=<id>`, loaded on the server; null starts a new conversation. */
  initialThread: AsistentePageThread | null;
  /** True when `?thread=<id>` named a thread that no longer exists. */
  missingThread?: boolean;
};

const PAGE_CONTEXT: AssistantContext = { route: "/asistente" };
const UNTITLED = "Conversación sin título";

function newThreadId(): string {
  return crypto.randomUUID();
}

type Conversation = AsistentePageThread & { isNew: boolean };

/**
 * Full assistant page (redesign FE §3.9, frame `AsistentePagina`): history
 * grouped Hoy / Esta semana / Anteriores with delete, the conversation
 * (`AssistantChat` in server-thread mode) and the "Herramientas" panel of
 * starter prompts. The floating assistant button is not part of this page.
 */
export function AsistentePageClient({ threads: initialThreads, initialThread, missingThread = false }: AsistentePageClientProps) {
  const router = useRouter();
  const [threads, setThreads] = useState<AssistantThreadSummary[]>(initialThreads);
  const [conversation, setConversation] = useState<Conversation>(() =>
    initialThread
      ? { ...initialThread, isNew: false }
      : { id: newThreadId(), title: "Nueva conversación", messages: [], isNew: true },
  );
  const [notice, setNotice] = useState<string | null>(missingThread ? actionErrorText(new Error("NOT_FOUND")) : null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ text: string; nonce: number } | undefined>(undefined);
  const cuttoUrl = cuttoBaseUrl();

  const groups = useMemo(() => groupAssistantThreads(threads), [threads]);

  const refreshThreads = useCallback(async () => {
    try {
      setThreads(await fetchAssistantThreadsAction());
    } catch (err) {
      toast.error(actionErrorText(err));
    }
  }, []);

  const selectThread = async (id: string) => {
    if (id === conversation.id && !conversation.isNew) return;
    setNotice(null);
    setLoadingId(id);
    try {
      const { thread, messages } = await fetchAssistantThreadAction(id);
      setConversation({ id: thread.id, title: thread.title, messages, isNew: false });
      router.replace(`/asistente?thread=${encodeURIComponent(thread.id)}`, { scroll: false });
    } catch (err) {
      if (actionErrorCode(err) === "NOT_FOUND") setThreads((prev) => prev.filter((t) => t.id !== id));
      setNotice(actionErrorText(err));
    } finally {
      setLoadingId(null);
    }
  };

  const startNewConversation = () => {
    setNotice(null);
    setConversation({ id: newThreadId(), title: "Nueva conversación", messages: [], isNew: true });
    router.replace("/asistente", { scroll: false });
  };

  const deleteThread = async (thread: AssistantThreadSummary) => {
    const previous = threads;
    setThreads((prev) => prev.filter((t) => t.id !== thread.id));
    try {
      await deleteAssistantThreadAction(thread.id);
      if (thread.id === conversation.id) startNewConversation();
    } catch (err) {
      if (actionErrorCode(err) !== "NOT_FOUND") setThreads(previous);
      toast.error(actionErrorText(err));
    }
  };

  const onTurnFinished = useCallback(
    (threadId: string) => {
      setConversation((prev) => (prev.id === threadId && prev.isNew ? { ...prev, isNew: false } : prev));
      router.replace(`/asistente?thread=${encodeURIComponent(threadId)}`, { scroll: false });
      void refreshThreads();
    },
    [router, refreshThreads],
  );

  const insertPrompt = (text: string) => {
    setDraft((prev) => ({ text, nonce: (prev?.nonce ?? 0) + 1 }));
  };

  const activeTitle = conversation.isNew
    ? "Nueva conversación"
    : threads.find((t) => t.id === conversation.id)?.title || conversation.title || UNTITLED;

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
                  const active = thread.id === conversation.id && !conversation.isNew;
                  const title = thread.title || UNTITLED;
                  return (
                    <li key={thread.id} className="flex items-center gap-1">
                      <Button
                        variant={active ? "secondary" : "ghost"}
                        className="h-auto min-w-0 flex-1 justify-between gap-2 py-2"
                        aria-current={active ? "page" : undefined}
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
                        onClick={() => void deleteThread(thread)}
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
        {notice ? (
          <Alert variant="destructive">
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        ) : null}
        <div className="flex min-h-[28rem] flex-1 flex-col">
          <AssistantChat
            key={conversation.id}
            thread={{ id: conversation.id, messages: conversation.messages }}
            context={PAGE_CONTEXT}
            draft={draft}
            onTurnFinished={onTurnFinished}
          />
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
