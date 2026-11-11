"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { useChat } from "@ai-sdk/react";
import { lastAssistantMessageIsCompleteWithApprovalResponses, type FileUIPart, type UIMessage } from "ai";
import { ArrowUpIcon, ListIcon, PaperclipIcon, PlusIcon, XIcon } from "lucide-react";

import { useAssistantToolGroups } from "@/components/asistente/assistant-tool-groups";
import { AssistantMessageParts } from "@/components/asistente/AssistantMessageParts";
import { AssistantContextStore, createAssistantChatTransport } from "@/components/asistente/assistant-transport";
import type { AssistantTurn } from "@/components/asistente/use-asistente-cache";
import { useConfirmedContext } from "@/components/asistente/use-confirmed-context";
import { Alert, AlertDescription } from "@/components/ui/shadcn/alert";
import { Button } from "@/components/ui/shadcn/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/shadcn/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/shadcn/sheet";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/shadcn/tabs";
import { PageHeader } from "@/components/widgets/PageHeader";
import { ConfirmationBar } from "@/components/widgets/asistente/ConfirmationBar";
import { StepDataPanel } from "@/components/widgets/asistente/StepDataPanel";
import { ToolStepsTable } from "@/components/widgets/asistente/ToolStepsTable";
import {
  contextTokensLabel,
  estimateContextTokens,
  formatCount,
  formatSeconds,
  singleStepLine,
  stepsCsv,
  stepsCsvFileName,
  stepTableRows,
  threadStepsLine,
  threadStepStats,
  type StepTableRow,
} from "@/lib/assistant/step-tables";
import { toToolSteps, type ToolStepGroup } from "@/lib/assistant/tool-steps";
import type { AssistantMessageMeta, AssistantUIMessage } from "@/lib/types/asistente";
import type { AssistantContext, AssistantThreadSummary } from "@/lib/types/redesign";
import { cn } from "@/lib/utils";

/**
 * `/asistente` in Analítico (frame `Asistente-Analitico`): fixed full-height
 * screen with three columns that scroll on their own: the threads rail as a
 * table (Conversación · Pasos), the conversation (steps tables, confirmation
 * bars, per-answer metrics, pinned composer) and the data panel of the
 * selected answer. Under 1024 px: one column with the Conversación / Datos
 * tabs and the rail in a `Sheet`.
 */
export type AsistenteAnaliticoLayoutProps = {
  threads: AssistantThreadSummary[];
  /** The open conversation; `messages` is null while a stored thread loads. */
  thread: { id: string; isNew: boolean; title: string; messages: UIMessage[] | null };
  /** Thread missing / load error (destructive alert at the top of the conversation). */
  notice?: string | null;
  /** The page context sent with each message; the composer chip can drop its entity. */
  context: AssistantContext;
  /** Thread id being opened (its rail row is busy). */
  loadingThreadId?: string | null;
  onNewConversation(): void;
  onSelectThread(id: string): void;
  onTurnFinished(turn: AssistantTurn): void;
};

export const ANALITICO_COPY = {
  description: "Cada paso, parámetro y resultado a la vista.",
  newConversation: "Nueva conversación",
  export: "Exportar pasos",
  placeholder: "Pregunta o pide algo… (/ para comandos)",
  thinking: "Pensando…",
  older: "Mensajes anteriores",
  turnError: "No se pudo obtener una respuesta del asistente. Verifica que esté configurado e intenta de nuevo.",
  newThreadEmpty: "Pregunta por tus proyectos y tareas; confirma antes de que cambie algo.",
} as const;

const UNTITLED = "Conversación sin título";
const NARROW_QUERY = "(max-width: 1023px)";

function subscribeNarrow(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const mql = window.matchMedia(NARROW_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

function narrowSnapshot(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(NARROW_QUERY).matches;
}

/** True under 1024 px: one column with tabs. */
function useNarrow(): boolean {
  return useSyncExternalStore(subscribeNarrow, narrowSnapshot, () => false);
}

/** The rail's pending count; `pendingApprovals` comes with the Visual threads loader. */
function pendingOf(thread: AssistantThreadSummary): number {
  const value = "pendingApprovals" in thread ? (thread as { pendingApprovals?: unknown }).pendingApprovals : 0;
  return typeof value === "number" && value > 0 ? value : 0;
}

const TH = "border-b border-border bg-muted px-2.5 py-2 font-mono text-[11px] font-medium tracking-[.08em] whitespace-nowrap text-muted-foreground uppercase";

// ── Rail ───────────────────────────────────────────────────────────────────

function ThreadRail({
  threads,
  activeId,
  loadingId,
  onSelect,
}: {
  threads: AssistantThreadSummary[];
  activeId: string | null;
  loadingId?: string | null;
  onSelect(id: string): void;
}): ReactNode {
  if (threads.length === 0) {
    return <p className="px-2.5 py-3 text-[12.5px] text-muted-foreground">Aún no hay conversaciones.</p>;
  }
  return (
    <table className="w-full table-fixed border-collapse text-left text-[12.5px]">
      <thead>
        <tr>
          <th scope="col" className={cn(TH, "text-left")}>
            Conversación
          </th>
          <th scope="col" className={cn(TH, "w-[88px] text-right")}>
            Pasos
          </th>
        </tr>
      </thead>
      <tbody>
        {threads.map((thread) => {
          const current = thread.id === activeId;
          const pending = pendingOf(thread);
          const title = thread.title || UNTITLED;
          return (
            <tr key={thread.id} data-current={current || undefined} className={current ? "bg-secondary" : undefined}>
              <td className="border-b border-accent p-0">
                <button
                  type="button"
                  aria-current={current ? "true" : undefined}
                  aria-busy={loadingId === thread.id || undefined}
                  onClick={() => onSelect(thread.id)}
                  className={cn(
                    "block w-full truncate px-2.5 py-[7px] text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                    current ? "font-semibold text-foreground" : "text-sidebar-foreground",
                  )}
                  title={title}
                >
                  {title}
                </button>
              </td>
              <td className="border-b border-accent px-2.5 py-[7px] text-right font-mono whitespace-nowrap tabular-nums">
                {formatCount(thread.toolCalls)}
                {pending > 0 ? <span className="text-warning"> · {pending} pend.</span> : null}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ── Messages ───────────────────────────────────────────────────────────────

function textOf(message: UIMessage): string {
  return message.parts
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("\n")
    .trim();
}

/** Text and widget parts only: tool steps render as the table. */
function withoutToolSteps(message: AssistantUIMessage, widgets: ReadonlySet<string>): UIMessage {
  return {
    ...message,
    parts: message.parts.filter((part) => {
      if (part.type === "text") return true;
      if (part.type.startsWith("tool-")) return widgets.has(part.type.slice("tool-".length));
      return false;
    }),
  } as UIMessage;
}

const WIDGET_TOOLS: ReadonlySet<string> = new Set([
  "render_chart",
  "render_card",
  "render_stat_grid",
  "render_list",
  "render_table",
  "render_timeline",
]);

/** "Respuesta en 2.1 s" · "Tokens 3,812 entrada · 412 salida" · "Contexto: Oficina Polanco"; missing items left out. */
export function footerItems(meta: AssistantMessageMeta | undefined, contextLabel: string | null): string[] {
  const items: string[] = [];
  if (typeof meta?.responseMs === "number") items.push(`Respuesta en ${formatSeconds(meta.responseMs)}`);
  if (meta?.usage) {
    items.push(`Tokens ${formatCount(meta.usage.inputTokens)} entrada · ${formatCount(meta.usage.outputTokens)} salida`);
  }
  if (contextLabel) items.push(`Contexto: ${contextLabel}`);
  return items;
}

type MessageViewProps = {
  message: AssistantUIMessage;
  groups: ToolStepGroup[];
  rows: StepTableRow[];
  selected: boolean;
  contextLabel: string | null;
  onSelect(): void;
  onApprove(ids: string[], approved: boolean, reason?: string): void;
  onEditRows(text: string): void;
};

function selectKeyDown(event: KeyboardEvent<HTMLElement>, onSelect: () => void) {
  if (event.target !== event.currentTarget) return;
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    onSelect();
  }
}

function AssistantMessageView({ message, groups, rows, selected, contextLabel, onSelect, onApprove, onEditRows }: MessageViewProps) {
  const body = withoutToolSteps(message, WIDGET_TOOLS);
  const hasBody = body.parts.length > 0;
  const footer = footerItems(message.metadata, contextLabel);
  const selectable = rows.length > 0;
  const selectProps = selectable
    ? {
        tabIndex: 0,
        "aria-current": selected ? ("true" as const) : undefined,
        onClick: onSelect,
        onKeyDown: (event: KeyboardEvent<HTMLElement>) => selectKeyDown(event, onSelect),
      }
    : {};
  const ring = "cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring";

  const bars = rows.flatMap((row) =>
    row.group.kind === "approval" && row.state === "needs-confirmation"
      ? [
          <ConfirmationBar
            key={`bar-${row.key}`}
            group={row.group}
            index={row.index}
            onApprove={onApprove}
            onEditRows={onEditRows}
          />,
        ]
      : [],
  );

  const text = hasBody ? (
    <div className="max-w-full text-[13.5px] leading-[1.55] text-foreground">
      <AssistantMessageParts message={body} onToolApproval={() => {}} />
    </div>
  ) : null;

  const footerLine =
    footer.length > 0 ? (
      <p className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11.5px] text-muted-foreground">
        {footer.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </p>
    ) : null;

  if (rows.length === 1 && rows[0]?.group.kind === "steps") {
    return (
      <div className="flex flex-col gap-2">
        <div
          {...selectProps}
          className={cn(
            "flex flex-col gap-1.5 rounded-[10px] border px-3 py-2.5 text-[13px] leading-[1.5]",
            selected ? "border-primary" : "border-accent",
            ring,
          )}
        >
          <p className="font-mono text-[11.5px] text-muted-foreground">{singleStepLine(rows[0])}</p>
          {text}
        </div>
        {footerLine}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        {text}
        {footerLine}
      </div>
    );
  }

  return (
    <article aria-label="Respuesta del asistente" className="flex flex-col gap-3">
      <div {...selectProps} className={cn("rounded-[10px]", selected && "ring-1 ring-primary", ring)}>
        <ToolStepsTable groups={groups} />
      </div>
      {bars}
      {text}
      {footerLine}
    </article>
  );
}

// ── Composer ───────────────────────────────────────────────────────────────

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function toFileParts(files: File[]): Promise<FileUIPart[]> {
  return Promise.all(
    files.map(async (file) => ({
      type: "file" as const,
      mediaType: file.type || "application/octet-stream",
      filename: file.name,
      url: await readAsDataUrl(file),
    })),
  );
}

type ComposerProps = {
  value: string;
  onChange(value: string): void;
  onSubmit(files: File[]): void;
  busy: boolean;
  tokensLabel: string;
  chip: string | null;
  onRemoveChip(): void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
};

function AnaliticoComposer({ value, onChange, onSubmit, busy, tokensLabel, chip, onRemoveChip, textareaRef }: ComposerProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [commandsOpen, setCommandsOpen] = useState(false);
  const toolGroups = useAssistantToolGroups();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const submit = () => {
    if (busy || (!value.trim() && files.length === 0)) return;
    const attached = files;
    setFiles([]);
    onSubmit(attached);
  };

  const pick = (prompt: string) => {
    onChange(prompt);
    setCommandsOpen(false);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(prompt.length, prompt.length);
    });
  };

  return (
    <form
      className="flex shrink-0 flex-col gap-1.5 border-t border-border bg-card px-3 pt-2.5 pb-3"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <label htmlFor="asistente-analitico-mensaje" className="sr-only">
        Mensaje al asistente
      </label>
      <textarea
        id="asistente-analitico-mensaje"
        ref={textareaRef}
        rows={2}
        value={value}
        placeholder={ANALITICO_COPY.placeholder}
        onChange={(event) => {
          const next = event.target.value;
          onChange(next);
          if (value === "" && next === "/") setCommandsOpen(true);
        }}
        onKeyDown={(event) => {
          // Enter sends; Shift / Alt / Ctrl + Enter inserts a newline.
          if (event.key === "Enter" && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
            event.preventDefault();
            submit();
          }
        }}
        className="max-h-40 w-full resize-none rounded-[10px] border border-border bg-card px-2.5 py-2 text-[13.5px] leading-normal text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
      />
      {files.length > 0 ? (
        <ul aria-label="Archivos adjuntos" className="flex flex-wrap gap-1.5">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${index}`}
              className="inline-flex items-center gap-1 rounded-lg bg-muted px-2 py-0.5 font-mono text-[11.5px] text-sidebar-foreground"
            >
              <span className="max-w-40 truncate">{file.name}</span>
              <button
                type="button"
                aria-label={`Quitar ${file.name}`}
                className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => setFiles((prev) => prev.filter((_, i) => i !== index))}
              >
                <XIcon aria-hidden="true" className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            const list = event.target.files;
            if (list && list.length > 0) setFiles((prev) => [...prev, ...Array.from(list)]);
            event.target.value = "";
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Adjuntar archivo"
          title="Adjuntar archivo"
          className="size-[30px] rounded-lg"
          onClick={() => fileInputRef.current?.click()}
        >
          <PaperclipIcon aria-hidden="true" />
        </Button>
        <Popover open={commandsOpen} onOpenChange={setCommandsOpen}>
          <PopoverTrigger
            render={
              <button
                type="button"
                className="rounded-lg bg-muted px-2 py-[3px] font-mono text-[11.5px] text-sidebar-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            }
          >
            / comandos
          </PopoverTrigger>
          <PopoverContent align="start" className="max-h-80 w-80 overflow-y-auto p-2">
            <ul aria-label="Comandos" className="flex flex-col gap-2">
              {toolGroups.filter((group) => !group.disabled).map((group) => (
                <li key={group.key} className="flex flex-col gap-1">
                  <span className="px-1 text-xs font-medium text-muted-foreground">{group.label}</span>
                  <ul className="flex flex-col">
                    {group.prompts.map((starter) => (
                      <li key={starter.label}>
                        <button
                          type="button"
                          onClick={() => pick(starter.prompt)}
                          className="flex w-full flex-col items-start rounded-md px-2 py-1.5 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <span className="text-[13px] text-foreground">{starter.label}</span>
                          <span className="text-xs text-muted-foreground">{starter.description}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
        {chip ? (
          <button
            type="button"
            aria-label={`Quitar contexto ${chip}`}
            onClick={onRemoveChip}
            className="inline-flex max-w-56 items-center gap-1 rounded-lg bg-secondary px-2 py-[3px] font-mono text-[11.5px] text-secondary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="truncate">contexto={chip}</span>
            <XIcon aria-hidden="true" className="size-3 shrink-0" />
          </button>
        ) : null}
        <span className="flex-1" />
        <span className="font-mono text-[11.5px] text-muted-foreground">{tokensLabel}</span>
        <Button
          type="submit"
          aria-label="Enviar"
          disabled={busy || (!value.trim() && files.length === 0)}
          className="size-[34px] rounded-full p-0"
        >
          <ArrowUpIcon aria-hidden="true" />
        </Button>
      </div>
    </form>
  );
}

// ── Conversation body ──────────────────────────────────────────────────────

function download(text: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

type BodyProps = {
  threads: AssistantThreadSummary[];
  threadId: string;
  activeId: string | null;
  title: string;
  seed: UIMessage[];
  notice?: string | null;
  context: AssistantContext;
  chip: string | null;
  onRemoveChip(): void;
  narrow: boolean;
  loadingThreadId?: string | null;
  onSelectThread(id: string): void;
  onTurnFinished(turn: AssistantTurn): void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
};

/**
 * One conversation: `useChat` against the server thread (same transport and
 * approval resume as `AssistantChat`), keyed by the thread id so switching
 * threads starts a fresh chat seeded from the cache. Stays mounted across
 * the desktop / tabs switch.
 */
function ConversationBody(props: BodyProps) {
  const { threadId, seed, context, onTurnFinished, textareaRef } = props;
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<"conversacion" | "datos">("conversacion");
  const [showOlder, setShowOlder] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const [contextStore] = useState(() => new AssistantContextStore(context));
  const onTurnFinishedRef = useRef(onTurnFinished);

  useEffect(() => {
    contextStore.set(context);
    onTurnFinishedRef.current = onTurnFinished;
  }, [context, onTurnFinished, contextStore]);

  const transport = useMemo(() => createAssistantChatTransport("/api/asistente/chat", contextStore), [contextStore]);
  const chat = useChat({
    id: threadId,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    onFinish: ({ message, messages }) => onTurnFinishedRef.current?.({ threadId, message, messages }),
    transport,
    // Read once, when the chat is created; `key` remounts it per thread.
    messages: seed,
    onError: () => setError(ANALITICO_COPY.turnError),
  });
  const messages = chat.messages as AssistantUIMessage[];
  const { status, sendMessage, addToolApprovalResponse } = chat;
  const busy = status === "submitted" || status === "streaming";

  const views = useMemo(
    () =>
      messages.map((message) => {
        const groups = message.role === "assistant" ? toToolSteps(message) : [];
        return { message, groups, rows: stepTableRows(groups) };
      }),
    [messages],
  );
  const stats = useMemo(() => threadStepStats(messages), [messages]);
  const latestWithSteps = useMemo(() => [...views].reverse().find((view) => view.rows.length > 0)?.message.id ?? null, [views]);
  const selected = views.find((view) => view.message.id === selectedId && view.rows.length > 0)?.message.id ?? latestWithSteps;
  const selectedMessage = messages.find((message) => message.id === selected) ?? null;
  const tokensLabel = contextTokensLabel(estimateContextTokens(messages, draft));

  const last = messages[messages.length - 1];
  const thinking =
    status === "submitted" || (status === "streaming" && (!last || last.role !== "assistant" || textOf(last) === ""));

  const scrollToBottom = () => {
    const el = logRef.current;
    if (el) el.scrollTop = 0;
  };

  const onLogScroll = useCallback(() => {
    const el = logRef.current;
    if (!el) return;
    // Reversed column: scrollTop is 0 at the bottom and negative going up.
    setShowOlder(Math.abs(el.scrollTop) + el.clientHeight < el.scrollHeight - 8);
  }, []);

  // New messages can push the first one out of view without a scroll event.
  useEffect(() => {
    const frame = requestAnimationFrame(onLogScroll);
    return () => cancelAnimationFrame(frame);
  }, [messages.length, onLogScroll]);

  const send = (files: File[]) => {
    const text = draft.trim();
    if (busy || (!text && files.length === 0)) return;
    setError(null);
    setDraft("");
    scrollToBottom();
    void (async () => {
      try {
        const fileParts = files.length > 0 ? await toFileParts(files) : undefined;
        if (text) await sendMessage({ text, files: fileParts });
        else if (fileParts) await sendMessage({ files: fileParts });
      } catch {
        setError(ANALITICO_COPY.turnError);
      }
    })();
    // Focus stays in the textarea after sending.
    textareaRef.current?.focus();
  };

  const approve = useCallback(
    (ids: string[], approved: boolean, reason?: string) => {
      for (const id of ids) void addToolApprovalResponse({ id, approved, ...(reason ? { reason } : {}) });
    },
    [addToolApprovalResponse],
  );

  const editRows = (text: string) => {
    setDraft(text);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(text.length, text.length);
    });
  };

  const exportSteps = () => {
    download(stepsCsv(messages), stepsCsvFileName(props.title));
  };

  const conversation = (
    <section
      aria-label="Conversación"
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[14px] border border-border bg-card shadow-[var(--shadow-card)]"
    >
      <header className="flex shrink-0 flex-wrap items-center gap-2.5 border-b border-border px-3.5 py-2.5">
        <h2 className="min-w-0 truncate text-sm font-semibold text-foreground">{props.title}</h2>
        <span className="font-mono text-[11.5px] text-muted-foreground">{threadStepsLine(stats)}</span>
        <span className="flex-1" />
        <Button
          type="button"
          variant="outline"
          className="h-7 rounded-lg px-2.5 text-xs font-medium"
          disabled={stats.steps === 0}
          onClick={exportSteps}
        >
          {ANALITICO_COPY.export}
        </Button>
      </header>
      {props.notice || error ? (
        <div className="shrink-0 px-3.5 pt-3">
          <Alert variant="destructive">
            <AlertDescription>{props.notice ?? error}</AlertDescription>
          </Alert>
        </div>
      ) : null}
      <div className="relative min-h-0 flex-1">
        <div
          ref={logRef}
          role="log"
          aria-label="Mensajes"
          tabIndex={-1}
          onScroll={onLogScroll}
          className="absolute inset-0 flex flex-col-reverse overflow-y-auto px-3.5 outline-none"
        >
          <div className="flex flex-col gap-3 pt-3.5 pb-4">
            {messages.length === 0 ? (
              <p className="py-10 text-center text-[13.5px] text-muted-foreground">{ANALITICO_COPY.newThreadEmpty}</p>
            ) : null}
            {views.map(({ message, groups, rows }) =>
              message.role === "user" ? (
                <p
                  key={message.id}
                  className="max-w-[520px] self-end rounded-[14px_14px_4px_14px] bg-primary px-[13px] py-[9px] text-[13.5px] leading-normal whitespace-pre-wrap text-primary-foreground"
                >
                  {textOf(message)}
                </p>
              ) : (
                <AssistantMessageView
                  key={message.id}
                  message={message}
                  groups={groups}
                  rows={rows}
                  selected={message.id === selected}
                  contextLabel={props.chip}
                  onSelect={() => setSelectedId(message.id)}
                  onApprove={approve}
                  onEditRows={editRows}
                />
              ),
            )}
            {thinking ? <p className="font-mono text-[11.5px] text-muted-foreground">{ANALITICO_COPY.thinking}</p> : null}
          </div>
        </div>
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-12 bg-linear-to-b from-card to-transparent" />
        {showOlder ? (
          <Button
            type="button"
            variant="outline"
            className="absolute top-2 left-1/2 h-6 -translate-x-1/2 rounded-full px-2.5 text-[11.5px] font-medium"
            onClick={() => logRef.current?.scrollTo({ top: -(logRef.current?.scrollHeight ?? 0) })}
          >
            {ANALITICO_COPY.older}
          </Button>
        ) : null}
      </div>
      <AnaliticoComposer
        value={draft}
        onChange={setDraft}
        onSubmit={send}
        busy={busy}
        tokensLabel={tokensLabel}
        chip={props.chip}
        onRemoveChip={props.onRemoveChip}
        textareaRef={textareaRef}
      />
    </section>
  );

  const dataPanel = (
    <aside aria-label="Datos de la respuesta" className="flex min-h-0 flex-col gap-3 overflow-y-auto">
      <StepDataPanel message={selectedMessage} />
    </aside>
  );

  const rail = (
    <ThreadRail
      threads={props.threads}
      activeId={props.activeId}
      loadingId={props.loadingThreadId}
      onSelect={props.onSelectThread}
    />
  );

  if (props.narrow) {
    return (
      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as "conversacion" | "datos")}
        className="flex min-h-0 flex-1 flex-col gap-2.5 px-4 pb-4"
      >
        <TabsList className="w-full shrink-0 rounded-none border border-border bg-card p-0">
          <TabsTrigger value="conversacion" className="rounded-none">
            Conversación
          </TabsTrigger>
          <TabsTrigger value="datos" className="rounded-none">
            Datos
          </TabsTrigger>
        </TabsList>
        <TabsContent value="conversacion" keepMounted hidden={tab !== "conversacion"} className="flex min-h-0 flex-1 flex-col [&[hidden]]:hidden">
          {conversation}
        </TabsContent>
        <TabsContent value="datos" keepMounted hidden={tab !== "datos"} className="min-h-0 flex-1 overflow-y-auto [&[hidden]]:hidden">
          {dataPanel}
        </TabsContent>
      </Tabs>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 gap-3.5 px-8 pb-5">
      <aside
        aria-label="Conversaciones"
        className="w-[220px] shrink-0 overflow-y-auto rounded-[14px] border border-border bg-card shadow-[var(--shadow-card)]"
      >
        {rail}
      </aside>
      {conversation}
      <div className="flex w-[420px] shrink-0 flex-col">{dataPanel}</div>
    </div>
  );
}

function LoadingBody({ narrow, threads, activeId, onSelectThread, loadingThreadId }: Pick<
  BodyProps,
  "narrow" | "threads" | "activeId" | "onSelectThread" | "loadingThreadId"
>) {
  const skeleton = (
    <section
      aria-label="Conversación"
      aria-busy="true"
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden rounded-[14px] border border-border bg-card p-3.5"
    >
      <Skeleton className="h-5 w-48" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="ml-auto h-10 w-2/3" />
      <Skeleton className="h-24 w-full" />
    </section>
  );
  if (narrow) return <div className="flex min-h-0 flex-1 flex-col px-4 pb-4">{skeleton}</div>;
  return (
    <div className="flex min-h-0 flex-1 gap-3.5 px-8 pb-5">
      <aside
        aria-label="Conversaciones"
        className="w-[220px] shrink-0 overflow-y-auto rounded-[14px] border border-border bg-card shadow-[var(--shadow-card)]"
      >
        <ThreadRail threads={threads} activeId={activeId} loadingId={loadingThreadId} onSelect={onSelectThread} />
      </aside>
      {skeleton}
      <div className="w-[420px] shrink-0" />
    </div>
  );
}

// ── Layout ─────────────────────────────────────────────────────────────────

export function AsistenteAnaliticoLayout({
  threads,
  thread,
  notice,
  context,
  loadingThreadId,
  onNewConversation,
  onSelectThread,
  onTurnFinished,
}: AsistenteAnaliticoLayoutProps): ReactNode {
  const narrow = useNarrow();
  const [railOpen, setRailOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // The chip drops the page entity: the next messages carry the route only.
  const [dropped, setDropped] = useState(false);
  const sent: AssistantContext = dropped ? { route: context.route } : context;
  const confirmed = useConfirmedContext(sent, true);
  const chip = confirmed?.label ?? null;
  const activeId = thread.isNew ? null : thread.id;

  const startNew = () => {
    onNewConversation();
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  return (
    <div className="flex h-dvh min-h-0 w-full flex-col overflow-hidden">
      <div className={cn("shrink-0 pt-7 pb-4", narrow ? "px-4" : "px-8")}>
        <PageHeader
          title="Asistente"
          description={ANALITICO_COPY.description}
          actions={
            <>
              {narrow ? (
                <Button type="button" variant="outline" onClick={() => setRailOpen(true)}>
                  <ListIcon aria-hidden="true" />
                  Conversaciones
                </Button>
              ) : null}
              <Button type="button" onClick={startNew}>
                <PlusIcon aria-hidden="true" />
                {ANALITICO_COPY.newConversation}
              </Button>
            </>
          }
        />
      </div>
      {narrow ? (
        <Sheet open={railOpen} onOpenChange={setRailOpen}>
          <SheetContent side="left" className="gap-2 p-0">
            <SheetHeader className="px-4 pt-4 pb-0">
              <SheetTitle>Conversaciones</SheetTitle>
            </SheetHeader>
            <nav aria-label="Conversaciones" className="min-h-0 flex-1 overflow-y-auto">
              <ThreadRail
                threads={threads}
                activeId={activeId}
                loadingId={loadingThreadId}
                onSelect={(id) => {
                  setRailOpen(false);
                  onSelectThread(id);
                }}
              />
            </nav>
          </SheetContent>
        </Sheet>
      ) : null}
      {thread.messages ? (
        <ConversationBody
          key={thread.id}
          threads={threads}
          threadId={thread.id}
          activeId={activeId}
          title={thread.title || UNTITLED}
          seed={thread.messages}
          notice={notice}
          context={sent}
          chip={chip}
          onRemoveChip={() => setDropped(true)}
          narrow={narrow}
          loadingThreadId={loadingThreadId}
          onSelectThread={onSelectThread}
          onTurnFinished={onTurnFinished}
          textareaRef={textareaRef}
        />
      ) : notice ? (
        <div className={cn("flex min-h-0 flex-1 flex-col", narrow ? "px-4 pb-4" : "px-8 pb-5")}>
          <Alert variant="destructive">
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        </div>
      ) : (
        <LoadingBody
          narrow={narrow}
          threads={threads}
          activeId={activeId}
          onSelectThread={onSelectThread}
          loadingThreadId={loadingThreadId}
        />
      )}
    </div>
  );
}
