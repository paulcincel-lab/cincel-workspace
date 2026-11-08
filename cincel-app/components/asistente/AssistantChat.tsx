"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { lastAssistantMessageIsCompleteWithApprovalResponses, type UIMessage } from "ai";

import { Alert, AlertDescription } from "@/components/ui/shadcn/alert";
import { Button } from "@/components/ui/shadcn/button";
import { Textarea } from "@/components/ui/shadcn/textarea";
import { AssistantMessageParts } from "@/components/asistente/AssistantMessageParts";
import { AssistantContextStore, createAssistantChatTransport } from "@/components/asistente/assistant-transport";
import type { AssistantTurn } from "@/components/asistente/use-asistente-cache";
import type { AssistantContext } from "@/lib/types/redesign";

/**
 * Chat of the full `/asistente` page (redesign FE §3.9): the thread lives in
 * the database and the client sends `{ id, message?, approvals?, context }`.
 * The page renders its own header.
 */
export type AssistantChatProps = {
  thread: { id: string; messages: UIMessage[] };
  context?: AssistantContext;
  /** A starter prompt placed in the composer without sending; a new `nonce` re-applies the same text. */
  draft?: { text: string; nonce: number };
  /** Called after each finished turn with the final message (the page updates `qk.asistente.*` and the tool keys). */
  onTurnFinished?(turn: AssistantTurn): void;
};

const EXAMPLE_QUESTIONS = [
  "¿Qué entregas vencen esta semana?",
  "¿Quién está más saturado en el equipo?",
  "¿Qué proyectos están en riesgo alto?",
  "¿Hay tareas bloqueadas?",
  "Compara el avance de los proyectos activos",
  "Muéstrame la ocupación por área",
];

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}

export function AssistantChat({ thread, context, draft, onTurnFinished }: AssistantChatProps) {
  const threadId = thread.id;
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [contextStore] = useState(() => new AssistantContextStore(context ?? { route: "/asistente" }));
  const onTurnFinishedRef = useRef(onTurnFinished);

  useEffect(() => {
    contextStore.set(context ?? { route: "/asistente" });
    onTurnFinishedRef.current = onTurnFinished;
  }, [context, onTurnFinished, contextStore]);

  const transport = useMemo(() => createAssistantChatTransport("/api/asistente/chat", contextStore), [contextStore]);

  const { messages, sendMessage, status, addToolApprovalResponse } = useChat({
    id: threadId,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    onFinish: ({ message, messages }) => onTurnFinishedRef.current?.({ threadId, message, messages }),
    transport,
    // Read once, when the chat is created; `key` on the page remounts it per thread.
    messages: thread.messages,
    onError: (err) => {
      console.error("Assistant chat error:", err);
      setError(
        "No se pudo obtener una respuesta del asistente. Verifica que esté configurado e intenta de nuevo."
      );
    },
  });

  const isBusy = status === "submitted" || status === "streaming";

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

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

  return (
    <div className="flex h-full w-full flex-col gap-4">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
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

        {messages.map((message) => (
          <div
            key={message.id}
            className={message.role === "user" ? "flex justify-end" : "flex flex-col items-start gap-2"}
          >
            <AssistantMessageParts
              message={message}
              onToolApproval={(approvalId, approved) => addToolApprovalResponse({ id: approvalId, approved })}
            />
          </div>
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
          aria-label="Mensaje al asistente"
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
