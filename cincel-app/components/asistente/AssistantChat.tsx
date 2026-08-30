"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { AssistantChartMessage } from "@/components/asistente/AssistantChartMessage";
import { AssistantCardMessage } from "@/components/asistente/AssistantCardMessage";
import { AssistantStatGridMessage } from "@/components/asistente/AssistantStatGridMessage";
import { AssistantListMessage } from "@/components/asistente/AssistantListMessage";
import type { WidgetTone } from "@/components/asistente/tone";

const EXAMPLE_QUESTIONS = [
  "¿Qué entregas vencen esta semana?",
  "¿Quién está más saturado en el equipo?",
  "¿Qué proyectos están en riesgo alto?",
  "¿Hay tareas bloqueadas?",
  "Compara el avance de los proyectos activos",
  "Muéstrame la ocupación por área",
];

// render_chart's input shape (lib/assistant/tools.ts) — duplicated here since
// that module is server-only.
type RenderChartInput = {
  chartType: "bar" | "line";
  title: string;
  data: { label: string; value: number }[];
};

// render_card / render_stat_grid / render_list input shapes — same reasoning.
type RenderCardInput = {
  title: string;
  subtitle?: string;
  fields: { label: string; value: string }[];
  badge?: { label: string; tone: WidgetTone };
};
type RenderStatGridInput = {
  title?: string;
  stats: { label: string; value: string; badge?: { label: string; tone: WidgetTone } }[];
};
type RenderListInput = {
  title: string;
  items: string[];
};

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

export function AssistantChat() {
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [initialMessages] = useState<UIMessage[]>(loadThread);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { messages, sendMessage, status, setMessages } = useChat({
    transport: new DefaultChatTransport({ api: "/api/asistente/chat" }),
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
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  // Persist the conversation as it changes so it survives a reload.
  useEffect(() => {
    saveThread(messages);
  }, [messages]);

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
    setError(null);
    saveThread([]);
  };

  return (
    <div className="flex h-full w-full flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Asistente</h1>
          <p className="mt-1 text-sm text-slate-600">
            Pregunta sobre proyectos en riesgo, entregas próximas y carga del equipo.
          </p>
        </div>
        {messages.length > 0 ? (
          <button
            type="button"
            onClick={clearConversation}
            disabled={isBusy}
            className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Nueva conversación
          </button>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        {messages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <p className="text-sm text-slate-500">Prueba con una de estas preguntas:</p>
            <div className="flex flex-wrap justify-center gap-2">
              {EXAMPLE_QUESTIONS.map((question) => (
                <button
                  key={question}
                  type="button"
                  onClick={() => {
                    setInput(question);
                    textareaRef.current?.focus();
                    requestAnimationFrame(resizeTextarea);
                  }}
                  className="rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-600 hover:bg-slate-50"
                >
                  {question}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {messages.map((message) => (
          <div
            key={message.id}
            className={
              message.role === "user"
                ? "flex justify-end"
                : "flex flex-col items-start gap-2"
            }
          >
            {message.parts.map((part, index) => {
              if (part.type === "text") {
                return message.role === "user" ? (
                  <div
                    key={index}
                    className="max-w-[80%] whitespace-pre-wrap rounded-lg bg-blue-600 px-3 py-2 text-sm text-white"
                  >
                    {part.text}
                  </div>
                ) : (
                  <div
                    key={index}
                    className="max-w-full text-sm text-slate-800 [&_p]:mb-2 [&_p:last-child]:mb-0 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_table]:my-2 [&_table]:block [&_table]:w-full [&_table]:overflow-x-auto [&_table]:border-collapse [&_th]:border [&_th]:border-slate-200 [&_th]:bg-slate-50 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_td]:border [&_td]:border-slate-200 [&_td]:px-2 [&_td]:py-1"
                  >
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{part.text}</ReactMarkdown>
                  </div>
                );
              }

              if (part.type === "tool-render_chart") {
                if (part.state === "input-streaming" || part.state === "input-available") {
                  return (
                    <p key={index} className="text-xs text-slate-400">
                      Generando gráfico…
                    </p>
                  );
                }
                if (part.state === "output-available") {
                  const chart = part.input as RenderChartInput;
                  return (
                    <div key={index} className="w-full max-w-md">
                      <AssistantChartMessage
                        chartType={chart.chartType}
                        title={chart.title}
                        data={chart.data}
                      />
                    </div>
                  );
                }
                return null;
              }

              if (part.type === "tool-render_card") {
                if (part.state === "input-streaming" || part.state === "input-available") {
                  return (
                    <p key={index} className="text-xs text-slate-400">
                      Generando tarjeta…
                    </p>
                  );
                }
                if (part.state === "output-available") {
                  const card = part.input as RenderCardInput;
                  return (
                    <div key={index} className="w-full">
                      <AssistantCardMessage
                        title={card.title}
                        subtitle={card.subtitle}
                        fields={card.fields}
                        badge={card.badge}
                      />
                    </div>
                  );
                }
                return null;
              }

              if (part.type === "tool-render_stat_grid") {
                if (part.state === "input-streaming" || part.state === "input-available") {
                  return (
                    <p key={index} className="text-xs text-slate-400">
                      Generando comparación…
                    </p>
                  );
                }
                if (part.state === "output-available") {
                  const grid = part.input as RenderStatGridInput;
                  return (
                    <div key={index} className="w-full">
                      <AssistantStatGridMessage title={grid.title} stats={grid.stats} />
                    </div>
                  );
                }
                return null;
              }

              if (part.type === "tool-render_list") {
                if (part.state === "input-streaming" || part.state === "input-available") {
                  return (
                    <p key={index} className="text-xs text-slate-400">
                      Generando lista…
                    </p>
                  );
                }
                if (part.state === "output-available") {
                  const list = part.input as RenderListInput;
                  return (
                    <div key={index} className="w-full">
                      <AssistantListMessage title={list.title} items={list.items} />
                    </div>
                  );
                }
                return null;
              }

              if (
                part.type === "tool-list_projects" ||
                part.type === "tool-list_activities_due" ||
                part.type === "tool-team_workload_summary" ||
                part.type === "tool-find_duplicates"
              ) {
                if (part.state === "input-streaming" || part.state === "input-available") {
                  return (
                    <p key={index} className="text-xs text-slate-400">
                      {part.type === "tool-find_duplicates"
                        ? "Buscando duplicados…"
                        : "Consultando datos…"}
                    </p>
                  );
                }
                return null;
              }

              if (
                part.type === "tool-create_task" ||
                part.type === "tool-assign_task" ||
                part.type === "tool-create_client" ||
                part.type === "tool-onboard_client" ||
                part.type === "tool-merge_duplicate_clients" ||
                part.type === "tool-merge_duplicate_activities" ||
                part.type === "tool-discard_project"
              ) {
                const label =
                  part.type === "tool-create_task"
                    ? "Creando tarea…"
                    : part.type === "tool-assign_task"
                      ? "Reasignando responsable…"
                      : part.type === "tool-create_client"
                        ? "Dando de alta al cliente…"
                        : part.type === "tool-onboard_client"
                          ? "Arrancando cliente y tareas…"
                          : part.type === "tool-discard_project"
                            ? "Descartando proyecto y tareas…"
                            : "Fusionando duplicados…";
                if (part.state === "input-streaming" || part.state === "input-available") {
                  return (
                    <p key={index} className="text-xs text-slate-400">
                      {label}
                    </p>
                  );
                }
                return null;
              }

              return null;
            })}
          </div>
        ))}

        {status === "submitted" ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
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
        <textarea
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
          placeholder="Escribe tu pregunta…  (Shift+Enter para salto de línea)"
          disabled={isBusy}
          className="max-h-40 min-h-[2.75rem] flex-1 resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm leading-6 text-slate-700 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none disabled:bg-slate-50"
        />
        <button
          type="submit"
          disabled={isBusy || !input.trim()}
          className={`inline-flex h-11 shrink-0 items-center gap-2 rounded-lg px-5 text-sm font-medium text-white ${
            isBusy || !input.trim()
              ? "cursor-not-allowed bg-slate-300"
              : "bg-blue-600 hover:bg-blue-700"
          }`}
        >
          {isBusy ? <Spinner /> : null}
          {status === "submitted"
            ? "Pensando…"
            : status === "streaming"
              ? "Respondiendo…"
              : "Enviar"}
        </button>
      </form>
    </div>
  );
}
