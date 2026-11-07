"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type UIMessage,
} from "ai";

import { Button } from "@/components/ui/shadcn/button";
import { Separator } from "@/components/ui/shadcn/separator";
import { Textarea } from "@/components/ui/shadcn/textarea";
import { AssistantMessageParts } from "@/components/asistente/AssistantMessageParts";
import { AssistantContextStore, createAssistantChatTransport } from "@/components/asistente/assistant-transport";
import type { AssistantContext } from "@/lib/types/redesign";

/**
 * Server-thread mode (redesign FE §3.9, used by the full `/asistente` page):
 * the thread lives in the database, the client sends `{ id, message?,
 * approvals?, context }` and never touches localStorage. Without `thread` the
 * chat keeps today's localStorage thread (flag off).
 */
export type AssistantChatProps = {
  thread?: { id: string; messages: UIMessage[] };
  context?: AssistantContext;
  /** A starter prompt placed in the composer without sending; a new `nonce` re-applies the same text. */
  draft?: { text: string; nonce: number };
  /** Server mode: called after each finished turn (the page refreshes its history). */
  onTurnFinished?(threadId: string): void;
  /** Hides the built-in title block (the page renders its own header). */
  hideHeader?: boolean;
};

const EXAMPLE_QUESTIONS = [
  "¿Qué entregas vencen esta semana?",
  "¿Quién está más saturado en el equipo?",
  "¿Qué proyectos están en riesgo alto?",
  "¿Hay tareas bloqueadas?",
  "Compara el avance de los proyectos activos",
  "Muéstrame la ocupación por área",
];

// The conversation is kept in localStorage so it survives a reload / navigation
// away from /asistente. Per-browser only; capped so it can't grow unbounded.
const THREAD_KEY = "cincel.asistente.thread.v1";
const MAX_PERSISTED_MESSAGES = 60;

function loadThread(): UIMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(THREAD_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? (parsed as UIMessage[]) : [];
  } catch {
    return [];
  }
}

function saveThread(messages: UIMessage[]): void {
  if (typeof window === "undefined") return;
  try {
    if (messages.length === 0) {
      window.localStorage.removeItem(THREAD_KEY);
      return;
    }
    window.localStorage.setItem(
      THREAD_KEY,
      JSON.stringify(messages.slice(-MAX_PERSISTED_MESSAGES))
    );
  } catch {
    // private mode / quota — the chat still works, just won't persist.
  }
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}

export function AssistantChat({ thread, context, draft, onTurnFinished, hideHeader = false }: AssistantChatProps = {}) {
  const serverThreadId = thread?.id;
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [initialMessages] = useState<UIMessage[]>(() => (thread ? thread.messages : loadThread()));
  // How many messages came from the saved thread; they're shown under a "Conversación anterior" divider and the
  // view opens at their top instead of jumping to the end. Reset to 0 when a new conversation starts.
  const [restoredCount, setRestoredCount] = useState(thread ? 0 : initialMessages.length);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [contextStore] = useState(() => new AssistantContextStore(context ?? { route: "/asistente" }));
  const onTurnFinishedRef = useRef(onTurnFinished);

  useEffect(() => {
    contextStore.set(context ?? { route: "/asistente" });
    onTurnFinishedRef.current = onTurnFinished;
  }, [context, onTurnFinished, contextStore]);

  const transport = useMemo(
    () =>
      serverThreadId
        ? createAssistantChatTransport("/api/asistente/chat", contextStore)
        : new DefaultChatTransport<UIMessage>({ api: "/api/asistente/chat" }),
    [serverThreadId, contextStore],
  );

  const { messages, sendMessage, status, setMessages, addToolApprovalResponse } = useChat({
    ...(serverThreadId
      ? {
          id: serverThreadId,
          sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
          onFinish: () => onTurnFinishedRef.current?.(serverThreadId),
        }
      : {}),
    transport,
    messages: initialMessages,
    onError: (err) => {
      console.error("Assistant chat error:", err);
      setError(
        "No se pudo obtener una respuesta del asistente. Verifica que esté configurado e intenta de nuevo."
      );
    },
  });

  const isBusy = status === "submitted" || status === "streaming";

  useEffect(() => {
    // A restored thread opens at its top; only follow the end once the user adds to it.
    if (messages.length <= restoredCount && status === "ready") return;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status, restoredCount]);

  // Persist the conversation as it changes so it survives a reload (legacy mode only; server threads persist on the server).
  useEffect(() => {
    if (serverThreadId) return;
    saveThread(messages);
  }, [messages, serverThreadId]);

  // A starter prompt from the page goes into the composer; it is never sent on its own.
  const [appliedDraft, setAppliedDraft] = useState<AssistantChatProps["draft"]>(undefined);
  if (draft && draft !== appliedDraft) {
    setAppliedDraft(draft);
    setInput(draft.text);
  }

  useEffect(() => {
    if (!draft) return;
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(draft.text.length, draft.text.length);
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    });
  }, [draft]);

  const resizeTextarea = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  const submit = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isBusy) return;
    setError(null);
    sendMessage({ text: trimmed });
    setInput("");
    requestAnimationFrame(resizeTextarea);
  };

  const clearConversation = () => {
    setMessages([]);
    setRestoredCount(0);
    setError(null);
    saveThread([]);
  };

  return (
    <div className="flex h-full w-full flex-col gap-4">
      {hideHeader ? null : (
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Asistente</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pregunta sobre proyectos en riesgo, entregas próximas y carga del equipo.
          </p>
        </div>
        {messages.length > 0 ? (
          <Button
            variant="outline"
            size="sm"
            className="h-auto shrink-0 px-3 py-1.5"
            onClick={clearConversation}
            disabled={isBusy}
          >
            Nueva conversación
          </Button>
        ) : null}
      </div>
      )}

      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto rounded-2xl border border-border bg-card p-4 shadow-sm">
        {messages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <p className="text-sm text-muted-foreground">Prueba con una de estas preguntas:</p>
            <div className="flex flex-wrap justify-center gap-2">
              {EXAMPLE_QUESTIONS.map((question) => (
                <Button
                  key={question}
                  variant="outline"
                  size="sm"
                  className="h-auto rounded-full px-3 py-1"
                  onClick={() => {
                    setInput(question);
                    textareaRef.current?.focus();
                    requestAnimationFrame(resizeTextarea);
                  }}
                >
                  {question}
                </Button>
              ))}
            </div>
          </div>
        ) : null}

        {restoredCount > 0 && messages.length > 0 ? (
          <div className="flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="shrink-0 text-xs text-muted-foreground">Conversación anterior</span>
            <Separator className="flex-1" />
          </div>
        ) : null}

        {messages.map((message, messageIndex) => (
          <Fragment key={message.id}>
          {restoredCount > 0 && messageIndex === restoredCount ? (
            <div className="flex items-center gap-3">
              <Separator className="flex-1" />
              <span className="shrink-0 text-xs text-muted-foreground">Nuevos mensajes</span>
              <Separator className="flex-1" />
            </div>
          ) : null}
          <div
            className={
              message.role === "user"
                ? "flex justify-end"
                : "flex flex-col items-start gap-2"
            }
          >
            <AssistantMessageParts
              message={message}
              onToolApproval={
                serverThreadId
                  ? (approvalId, approved) => addToolApprovalResponse({ id: approvalId, approved })
                  : undefined
              }
            />
          </div>
          </Fragment>
        ))}

        {status === "submitted" ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner />
            Pensando…
          </div>
        ) : null}

        <div ref={messagesEndRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
        className="flex items-end gap-2"
      >
        <Textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            resizeTextarea();
          }}
          onKeyDown={(e) => {
            // Enter sends; Shift+Enter (or Alt/Ctrl+Enter) inserts a newline.
            if (e.key === "Enter" && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) {
              e.preventDefault();
              submit(input);
            }
          }}
          rows={1}
          aria-label={serverThreadId ? "Mensaje al asistente" : undefined}
          placeholder="Escribe tu pregunta…  (Shift+Enter para salto de línea)"
          disabled={isBusy}
          className="max-h-40 min-h-[2.75rem] flex-1 resize-none py-2 leading-6"
        />
        <Button
          type="submit"
          disabled={isBusy || !input.trim()}
          className="h-11 shrink-0 px-5"
        >
          {isBusy ? <Spinner /> : null}
          {status === "submitted"
            ? "Pensando…"
            : status === "streaming"
              ? "Respondiendo…"
              : "Enviar"}
        </Button>
      </form>
    </div>
  );
}
