"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useChat } from "@ai-sdk/react";
import {
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type FileUIPart,
  type UIMessage,
} from "ai";
import { ArrowUpIcon, HistoryIcon, Maximize2Icon, MicIcon, PaperclipIcon, XIcon } from "lucide-react";

import { AssistantMessageParts } from "@/components/asistente/AssistantMessageParts";
import { ToolStepsLiveRegion } from "@/components/widgets/ToolSteps";
import { AssistantContextStore, createAssistantChatTransport } from "@/components/asistente/assistant-transport";
import { useAssistantTurnFinished } from "@/components/asistente/use-asistente-cache";
import { useConfirmedContext } from "@/components/asistente/use-confirmed-context";
import { Alert, AlertDescription } from "@/components/ui/shadcn/alert";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button, buttonVariants } from "@/components/ui/shadcn/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/shadcn/dropdown-menu";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/shadcn/sheet";
import { Textarea } from "@/components/ui/shadcn/textarea";
import { useAssistantToolGroups } from "@/components/asistente/assistant-tool-groups";
import { calendarioComposerPlaceholder, calendarioContextLine } from "@/lib/assistant/calendar-hints";
import { calendarioSuggestions } from "@/lib/assistant/suggestions";
import { actionErrorText } from "@/lib/errors";
import { calendarioAssistantHintsOptions } from "@/lib/query/options/calendario";
import { asistenteThreadOptions, asistenteThreadsOptions } from "@/lib/query/options/asistente";
import { useAssistantUi } from "@/lib/stores/assistant-ui-store";
import type { AssistantContext } from "@/lib/types/redesign";

export type AssistantSheetProps = {
  open: boolean;
  onOpenChange(open: boolean): void;
  /** The route context; `useAssistantUi.contextOverride` is merged over it. */
  context: AssistantContext;
  /** Where focus goes when the sheet closes (the trigger). */
  finalFocus?: RefObject<HTMLElement | null>;
};

export const ASSISTANT_CHAT_API = "/api/asistente/chat";

/** Footer chips (FE §3.9): each one puts a starter prompt in the composer. */
export const QUICK_ACTIONS: readonly { label: string; prompt: string }[] = [
  { label: "Resumen del día", prompt: "Dame el resumen de mi día: entregas, tareas vencidas y reuniones." },
  { label: "Minuta → tareas", prompt: "Convierte esta minuta en tareas con responsable y fecha:\n" },
  { label: "Cuantificar material", prompt: "Cuantifica el material para " },
  { label: "Revisar normativa", prompt: "Revisa la normativa que aplica a " },
  { label: "Bitácora con fotos", prompt: "Arma la bitácora de obra con las fotos de " },
];

const COMPOSER_PLACEHOLDER = "Pregunta, pide un cálculo o arrastra un plano…";

export function newAssistantThreadId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // Fallback for very old browsers: RFC 4122 v4 from getRandomValues.
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

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

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

function speechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const NO_MESSAGES: UIMessage[] = [];

/** Focuses the composer with the caret at `length` and grows it to its content (max 160 px). */
function focusComposerAtEnd(el: HTMLTextAreaElement | null, length: number): void {
  if (!el) return;
  el.focus();
  el.setSelectionRange(length, length);
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
}

/**
 * Assistant sheet (redesign FE §3.9, §4.9): the `/asistente` page conversation
 * (same `useChat`, same message rendering) in a right `Sheet`, 460 px,
 * radius 18, inset 12 px. Sends the client-generated thread id and only the
 * new message or the approval responses, plus the page context.
 *
 * State (Query Migration Phase 10, #944): the thread id lives in
 * `useAssistantUi.threadId` (in memory, survives navigation, not reloads);
 * null is a new conversation with a local id until its first turn. The
 * stored messages come from `qk.asistente.thread(id)` and the history menu
 * from `qk.asistente.threads()`. `contextOverride` is merged over the route
 * context and `pendingPrompt` lands in the composer.
 */
export function AssistantSheet({ open, onOpenChange, context, finalFocus }: AssistantSheetProps) {
  const storeThreadId = useAssistantUi((s) => s.threadId);
  const contextOverride = useAssistantUi((s) => s.contextOverride);
  const setThreadId = useAssistantUi((s) => s.setThreadId);
  const [draftId, setDraftId] = useState(newAssistantThreadId);
  const [historyOpen, setHistoryOpen] = useState(false);

  const conversationId = storeThreadId ?? draftId;
  const isNew = storeThreadId === null;

  const effectiveContext = useMemo<AssistantContext>(
    () => (contextOverride ? { ...context, ...contextOverride } : context),
    [context, contextOverride],
  );
  const confirmed = useConfirmedContext(effectiveContext, open);

  const threadQuery = useQuery({ ...asistenteThreadOptions(conversationId), enabled: !isNew });
  const threadsQuery = useQuery({ ...asistenteThreadsOptions(), enabled: historyOpen });
  const threads = threadsQuery.data;

  const loadError = isNew
    ? null
    : threadQuery.isError
      ? actionErrorText(threadQuery.error)
      : threadQuery.data === null
        ? actionErrorText(new Error("NOT_FOUND"))
        : null;
  const seedMessages = isNew
    ? NO_MESSAGES
    : threadQuery.data
      ? threadQuery.data.messages
      : loadError
        ? NO_MESSAGES
        : null;

  const turnFinished = useAssistantTurnFinished();
  const onTurnFinished = (turn: Parameters<typeof turnFinished>[0]) => {
    turnFinished(turn);
    // A new conversation becomes the store's thread once the route has stored it.
    if (useAssistantUi.getState().threadId !== turn.threadId) setThreadId(turn.threadId);
  };

  const startNewConversation = () => {
    setThreadId(null);
    setDraftId(newAssistantThreadId());
  };

  const fullPageHref = isNew ? "/asistente" : `/asistente?thread=${encodeURIComponent(conversationId)}`;

  return (
    <Sheet open={open} onOpenChange={(next) => onOpenChange(next)}>
      <SheetContent
        side="right"
        showCloseButton={false}
        finalFocus={finalFocus}
        className="gap-0 overflow-hidden rounded-[18px] border p-0 data-[side=right]:inset-y-3 data-[side=right]:right-3 data-[side=right]:h-auto data-[side=right]:w-[calc(100%-1.5rem)] data-[side=right]:sm:max-w-[460px]"
      >
        <SheetHeader className="flex-row items-center gap-2 border-b px-4 py-3">
          <span
            aria-hidden
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground"
          >
            C
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <SheetTitle>Cincel</SheetTitle>
            <SheetDescription className="sr-only">
              Asistente de Cincel. Pregunta sobre tus proyectos, tareas y equipo.
            </SheetDescription>
            {effectiveContext.calendar ? (
              <Badge variant="outline" className="max-w-full" data-testid="asistente-contexto">
                <span className="truncate">{calendarioContextLine(effectiveContext.calendar)}</span>
              </Badge>
            ) : confirmed ? (
              <Badge variant="outline" className="max-w-full" data-testid="asistente-contexto">
                <span className="truncate">Viendo: {confirmed.label}</span>
              </Badge>
            ) : null}
          </div>
          <DropdownMenu onOpenChange={setHistoryOpen}>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon-sm" aria-label="Historial" title="Historial" />}
            >
              <HistoryIcon aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuItem onClick={startNewConversation}>Nueva conversación</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Conversaciones recientes</DropdownMenuLabel>
              {threads === undefined ? (
                <DropdownMenuItem disabled>{threadsQuery.isError ? "No se pudo cargar." : "Cargando…"}</DropdownMenuItem>
              ) : threads.length === 0 ? (
                <DropdownMenuItem disabled>Aún no hay conversaciones.</DropdownMenuItem>
              ) : (
                threads.slice(0, 10).map((thread) => (
                  <DropdownMenuItem key={thread.id} onClick={() => setThreadId(thread.id)}>
                    <span className="truncate">{thread.title || "Conversación sin título"}</span>
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <Link
            href={fullPageHref}
            onClick={() => onOpenChange(false)}
            className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
            aria-label="Pantalla completa"
            title="Pantalla completa"
          >
            <Maximize2Icon aria-hidden />
          </Link>
          <SheetClose render={<Button variant="ghost" size="icon-sm" aria-label="Cerrar" title="Cerrar" />}>
            <XIcon aria-hidden />
          </SheetClose>
        </SheetHeader>

        {seedMessages ? (
          <SheetConversation
            key={conversationId}
            threadId={conversationId}
            seedMessages={seedMessages}
            openingError={loadError}
            context={effectiveContext}
            onTurnFinished={onTurnFinished}
          />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col justify-center px-4 py-4" aria-live="polite">
            <p className="text-center text-sm text-muted-foreground">Cargando conversación…</p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

type SheetConversationProps = {
  threadId: string;
  /** The cached messages the chat starts from; `useChat` reads them once, when the conversation mounts. */
  seedMessages: UIMessage[];
  /** Shown until the next send: the thread could not be read. */
  openingError: string | null;
  context: AssistantContext;
  onTurnFinished(turn: { threadId: string; message: UIMessage; messages: UIMessage[] }): void;
};

/**
 * One conversation of the sheet: the messages, the quick actions and the
 * composer. Keyed by the thread id, so switching threads starts a fresh
 * `useChat` seeded from the cache instead of syncing messages by hand.
 */
function SheetConversation({ threadId, seedMessages, openingError, context, onTurnFinished }: SheetConversationProps) {
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(openingError);
  const [listening, setListening] = useState(false);
  // The sheet content only renders on the client (it mounts when opened), so this never hydrates.
  const [canDictate] = useState(() => speechRecognitionCtor() !== null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const [contextStore] = useState(() => new AssistantContextStore(context));
  const onTurnFinishedRef = useRef(onTurnFinished);
  const pendingPrompt = useAssistantUi((s) => s.pendingPrompt);

  useEffect(() => {
    contextStore.set(context);
    onTurnFinishedRef.current = onTurnFinished;
  }, [context, contextStore, onTurnFinished]);

  // On /calendario the suggestions and the placeholder use the viewer's real dates and names (BE §11.5).
  const calendarOpen = Boolean(context.calendar);
  const toolGroups = useAssistantToolGroups();
  const hintsQuery = useQuery({ ...calendarioAssistantHintsOptions(), enabled: calendarOpen });
  const suggestions = useMemo(
    () => (calendarOpen ? calendarioSuggestions(hintsQuery.data, toolGroups) : []),
    [calendarOpen, hintsQuery.data, toolGroups],
  );
  const placeholder = calendarOpen ? calendarioComposerPlaceholder(hintsQuery.data?.project ?? null) : COMPOSER_PLACEHOLDER;

  const transport = useMemo(() => createAssistantChatTransport(ASSISTANT_CHAT_API, contextStore), [contextStore]);

  const { messages, sendMessage, status, addToolApprovalResponse } = useChat({
    id: threadId,
    messages: seedMessages,
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    onFinish: ({ message, messages: all }) => onTurnFinishedRef.current({ threadId, message, messages: all }),
    onError: (err) => setError(actionErrorText(err)),
  });

  const isBusy = status === "submitted" || status === "streaming";

  useEffect(() => {
    if (messages.length > 0) endRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [messages, status]);

  useEffect(() => {
    return () => recognitionRef.current?.stop();
  }, []);

  const resizeTextarea = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  const applyPrompt = (prompt: string) => {
    setInput(prompt);
    requestAnimationFrame(() => focusComposerAtEnd(textareaRef.current, prompt.length));
  };

  // A prompt handed in with `openAssistant({ prompt })` goes into the composer once; it is never sent on its own.
  // The text is applied while rendering (the prompt's nonce is the change marker), then the effect focuses the
  // composer and consumes the prompt from the store.
  const [appliedPromptNonce, setAppliedPromptNonce] = useState<number | null>(null);
  if (pendingPrompt && pendingPrompt.nonce !== appliedPromptNonce) {
    setAppliedPromptNonce(pendingPrompt.nonce);
    setInput(pendingPrompt.text);
  }
  useEffect(() => {
    if (!pendingPrompt) return;
    requestAnimationFrame(() => focusComposerAtEnd(textareaRef.current, pendingPrompt.text.length));
    useAssistantUi.getState().consumePrompt();
  }, [pendingPrompt]);

  const sendSuggestion = (text: string) => {
    if (isBusy) return;
    setError(null);
    void Promise.resolve(sendMessage({ text })).catch((err) => setError(actionErrorText(err)));
  };

  const submit = async () => {
    const text = input.trim();
    if ((!text && files.length === 0) || isBusy) return;
    setError(null);
    const attached = files;
    setInput("");
    setFiles([]);
    requestAnimationFrame(resizeTextarea);
    try {
      const fileParts = attached.length ? await toFileParts(attached) : undefined;
      if (text) await sendMessage({ text, files: fileParts });
      else if (fileParts) await sendMessage({ files: fileParts });
    } catch (err) {
      setError(actionErrorText(err));
    }
  };

  const addFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setFiles((prev) => [...prev, ...Array.from(list)]);
  };

  const toggleDictation = () => {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const Ctor = speechRecognitionCtor();
    if (!Ctor) return;
    const recognition = new Ctor();
    recognition.lang = "es-MX";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ")
        .trim();
      if (transcript) setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  };

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4" aria-live="polite">
        {messages.length === 0 ? (
          <div className="flex flex-1 flex-col justify-center gap-1 text-center">
            <p className="text-sm font-medium text-foreground">¿En qué te ayudo?</p>
            <p className="text-sm text-muted-foreground">
              Pregunta por tus proyectos, tareas y equipo, o elige una acción rápida.
            </p>
          </div>
        ) : null}

        {messages.map((message) => (
          <div
            key={message.id}
            className={message.role === "user" ? "flex justify-end" : "flex flex-col items-start gap-2"}
          >
            <AssistantMessageParts
              message={message}
              userBubble="ink"
              stepsVariant="compact"
              onToolApproval={(approvalIds, approved, reason) => {
                for (const id of approvalIds) void addToolApprovalResponse({ id, approved, reason });
              }}
              onEditDraft={applyPrompt}
            />
          </div>
        ))}

        {status === "submitted" ? <p className="text-sm text-muted-foreground">Pensando…</p> : null}
        <div ref={endRef} />
      </div>
      <ToolStepsLiveRegion messages={messages} />

      <div className="flex flex-col gap-3 border-t px-4 py-3">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Acciones rápidas">
          {suggestions.length > 0
            ? suggestions.map((suggestion) => (
                <Button key={suggestion.text} variant="outline" size="xs" disabled={isBusy} onClick={() => sendSuggestion(suggestion.text)}>
                  {suggestion.text}
                </Button>
              ))
            : QUICK_ACTIONS.map((action) => (
                <Button key={action.label} variant="outline" size="xs" onClick={() => applyPrompt(action.prompt)}>
                  {action.label}
                </Button>
              ))}
        </div>

        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes("Files")) e.preventDefault();
          }}
          onDrop={(e) => {
            if (e.dataTransfer.files.length === 0) return;
            e.preventDefault();
            addFiles(e.dataTransfer.files);
          }}
        >
          <label htmlFor="asistente-sheet-composer" className="sr-only">
            Mensaje para Cincel
          </label>
          <Textarea
            id="asistente-sheet-composer"
            ref={textareaRef}
            value={input}
            rows={1}
            placeholder={placeholder}
            disabled={isBusy}
            className="max-h-40 resize-none"
            onChange={(e) => {
              setInput(e.target.value);
              resizeTextarea();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                void submit();
              }
            }}
          />
          {files.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5" aria-label="Archivos adjuntos">
              {files.map((file, index) => (
                <li key={`${file.name}-${index}`}>
                  <Badge variant="secondary">
                    <span className="max-w-40 truncate">{file.name}</span>
                    <button
                      type="button"
                      aria-label={`Quitar ${file.name}`}
                      onClick={() => setFiles((prev) => prev.filter((_, i) => i !== index))}
                    >
                      <XIcon aria-hidden />
                    </button>
                  </Badge>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex items-center gap-1">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Adjuntar archivo"
              title="Adjuntar archivo"
              onClick={() => fileInputRef.current?.click()}
            >
              <PaperclipIcon aria-hidden />
            </Button>
            {canDictate ? (
              <Button
                type="button"
                variant={listening ? "secondary" : "ghost"}
                size="icon-sm"
                aria-label={listening ? "Detener dictado" : "Dictar"}
                aria-pressed={listening}
                title={listening ? "Detener dictado" : "Dictar"}
                onClick={toggleDictation}
              >
                <MicIcon aria-hidden />
              </Button>
            ) : null}
            <Button
              type="submit"
              size="icon-sm"
              className="ml-auto"
              aria-label="Enviar"
              title="Enviar"
              disabled={isBusy || (!input.trim() && files.length === 0)}
            >
              <ArrowUpIcon aria-hidden />
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}
