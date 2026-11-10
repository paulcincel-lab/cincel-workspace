"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { FileUIPart, UIMessage } from "ai";
import {
  AlertTriangleIcon,
  CalendarClockIcon,
  CalendarDaysIcon,
  ListChecksIcon,
  MessagesSquareIcon,
  MoreHorizontalIcon,
  PinIcon,
  PinOffIcon,
  PlusIcon,
  SearchIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";

import type { AssistantTurn } from "@/components/asistente/use-asistente-cache";
import { useAssistantConversation } from "@/components/asistente/use-assistant-conversation";
import { Alert, AlertDescription } from "@/components/ui/shadcn/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/shadcn/alert-dialog";
import { Button } from "@/components/ui/shadcn/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/shadcn/dropdown-menu";
import { Popover, PopoverContent } from "@/components/ui/shadcn/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/shadcn/sheet";
import { PageHeader } from "@/components/widgets/PageHeader";
import { AssistantCommandList } from "@/components/widgets/asistente/AssistantCommandList";
import { AssistantComposer } from "@/components/widgets/asistente/AssistantComposer";
import { AssistantContextPicker } from "@/components/widgets/asistente/AssistantContextPicker";
import { AssistantLog, type AssistantLogHandle } from "@/components/widgets/asistente/AssistantLog";
import { AssistantThreadRail } from "@/components/widgets/asistente/AssistantThreadRail";
import { SuggestionCards, type SuggestionCardItem } from "@/components/widgets/asistente/SuggestionCards";
import { ASSISTANT_TOOL_GROUPS } from "@/lib/assistant/starter-prompts";
import { pickSuggestions, type SuggestionTopic } from "@/lib/assistant/suggestions";
import { tramoColorClass } from "@/lib/tramos/tramo-color";
import type { AssistantUIMessage, ContextChip } from "@/lib/types/asistente";
import type { AssistantContext, AssistantThreadSummary } from "@/lib/types/redesign";

/** Shell chrome around the page: the mobile top bar and bottom tabs below 768 px, nothing above. */
const FRAME_HEIGHT = "h-[calc(100dvh-3.5rem-env(safe-area-inset-top)-76px-env(safe-area-inset-bottom))] md:h-dvh";

const INTRO = "Pregunta por tus proyectos y tareas; confirma antes de que cambie algo.";

export type AsistenteVisualLayoutProps = {
  /** The caller's threads (`qk.asistente.threads()`). */
  threads: readonly AssistantThreadSummary[];
  /** The open stored thread; null for a new conversation. */
  activeId: string | null;
  /** The thread whose messages are loading after a pick. */
  busyThreadId?: string | null;
  /** Opens a stored thread; resolves once the switch is done. */
  onSelectThread(id: string): unknown;
  onNewConversation(): void;
  /** The open conversation; `messages` null while it loads. Keyed by `id`. */
  thread: { id: string; title: string; messages: UIMessage[] | null };
  /** A page notice (missing thread, load error), shown at the top of the card. */
  notice?: string | null;
  /** The context sent with the next message (route plus chips). */
  context: AssistantContext;
  chips: readonly ContextChip[];
  onAddChip(chip: ContextChip): void;
  onRemoveChip(chip: ContextChip): void;
  onTurnFinished?(turn: AssistantTurn): void;
  onPinThread(id: string, pinned: boolean): void;
  onDeleteThread(id: string): void;
};

const TOPIC_ICON: Record<SuggestionTopic, LucideIcon> = {
  agenda: CalendarClockIcon,
  team: UsersIcon,
  risk: AlertTriangleIcon,
  tasks: ListChecksIcon,
  search: SearchIcon,
  calendar: CalendarDaysIcon,
};

/** Below 640 px the commands open in a bottom `Sheet` instead of a `Popover`. */
function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia("(max-width: 640px)");
    const update = () => setNarrow(mql.matches);
    update();
    mql.addEventListener?.("change", update);
    return () => mql.removeEventListener?.("change", update);
  }, []);
  return narrow;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Attached files as message parts, the way the floating sheet sends them. */
async function toFileParts(files: readonly File[]): Promise<FileUIPart[]> {
  return Promise.all(
    files.map(async (file) => ({
      type: "file" as const,
      mediaType: file.type || "application/octet-stream",
      filename: file.name,
      url: await readAsDataUrl(file),
    })),
  );
}

type ToolLikePart = { type: string; state?: string };

/** Tool calls of the conversation (render widgets are results, not tools). */
export function toolCallCount(messages: readonly AssistantUIMessage[]): number {
  let count = 0;
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const part of message.parts as ToolLikePart[]) {
      const isTool = part.type.startsWith("tool-") || part.type === "dynamic-tool";
      if (isTool && !part.type.startsWith("tool-render_")) count += 1;
    }
  }
  return count;
}

/** "3 herramientas usadas · 1 confirmación pendiente"; parts at 0 are left out; null when both are 0. */
export function conversationSubline(tools: number, pending: number): string | null {
  const parts: string[] = [];
  if (tools > 0) parts.push(tools === 1 ? "1 herramienta usada" : `${tools} herramientas usadas`);
  if (pending > 0) parts.push(pending === 1 ? "1 confirmación pendiente" : `${pending} confirmaciones pendientes`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

type FocusRequest = { target: "composer" | "log"; nonce: number };

/**
 * Asistente Visual (frame `Asistente-Visual`): the threads rail, the
 * conversation card with its bottom-anchored log and, pinned below it,
 * suggestion cards and the composer. Fixed full-height screen: only the rail
 * and the log scroll; the composer never moves.
 */
export function AsistenteVisualLayout(props: AsistenteVisualLayoutProps): ReactNode {
  const { threads, activeId, busyThreadId, onSelectThread, onNewConversation, thread } = props;
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);

  const requestFocus = (target: FocusRequest["target"]) =>
    setFocusRequest((prev) => ({ target, nonce: (prev?.nonce ?? 0) + 1 }));

  const startNew = () => {
    setSheetOpen(false);
    onNewConversation();
    requestFocus("composer");
  };

  const select = async (id: string) => {
    setSheetOpen(false);
    await onSelectThread(id);
    requestFocus("log");
  };

  const rail = (className?: string) => (
    <AssistantThreadRail
      variant="visual"
      threads={threads}
      activeId={activeId}
      busyId={busyThreadId}
      onSelect={(id) => void select(id)}
      className={className}
    />
  );

  return (
    <div className={`flex min-h-0 w-full flex-col overflow-hidden ${FRAME_HEIGHT}`}>
      <div className="shrink-0 px-4 pt-5 pb-3 md:px-8 md:pt-7 md:pb-4">
        <PageHeader
          title="Asistente"
          description={INTRO}
          actions={
            <>
              <Button type="button" variant="outline" className="md:hidden" onClick={() => setSheetOpen(true)}>
                <MessagesSquareIcon aria-hidden />
                Conversaciones
              </Button>
              <Button type="button" className="h-9 rounded-[10px] text-[13.5px]" onClick={startNew}>
                <PlusIcon aria-hidden />
                Nueva conversación
              </Button>
            </>
          }
        />
      </div>

      <div className="flex min-h-0 flex-1 gap-4 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:px-8 md:pb-6">
        {rail("hidden md:flex")}

        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent side="left" className="w-[280px] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Conversaciones</SheetTitle>
            </SheetHeader>
            <div className="flex min-h-0 flex-1 flex-col px-3 pb-4">{rail("w-full")}</div>
          </SheetContent>
        </Sheet>

        <section
          aria-label="Conversación"
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[14px] border border-border bg-card shadow-[0_1px_2px_rgba(15,23,42,.05)]"
        >
          <VisualConversation
            key={thread.id}
            {...props}
            draft={draft}
            onDraftChange={setDraft}
            focusRequest={focusRequest}
          />
        </section>
      </div>
    </div>
  );
}

type ConversationProps = AsistenteVisualLayoutProps & {
  draft: string;
  onDraftChange(value: string): void;
  focusRequest: FocusRequest | null;
};

/** One conversation: header, log and composer. Mounted per thread; waits for the messages before the chat starts. */
function VisualConversation(props: ConversationProps) {
  const { thread } = props;
  if (!thread.messages) return <ConversationBody {...props} conversation={null} />;
  return <LiveConversation {...props} messages={thread.messages} />;
}

function LiveConversation(props: ConversationProps & { messages: UIMessage[] }) {
  const conversation = useAssistantConversation({
    thread: { id: props.thread.id, messages: props.messages },
    context: props.context,
    onTurnFinished: props.onTurnFinished,
  });
  return <ConversationBody {...props} conversation={conversation} />;
}

type BodyProps = ConversationProps & { conversation: ReturnType<typeof useAssistantConversation> | null };

function ConversationBody({
  thread,
  activeId,
  threads,
  notice,
  chips,
  onAddChip,
  onRemoveChip,
  onPinThread,
  onDeleteThread,
  draft,
  onDraftChange,
  focusRequest,
  conversation,
}: BodyProps) {
  const logRef = useRef<AssistantLogHandle>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [commandsOpen, setCommandsOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const narrow = useNarrow();
  const composerZoneRef = useRef<HTMLDivElement>(null);

  const stored = activeId !== null && activeId === thread.id;
  const summary = stored ? (threads.find((t) => t.id === thread.id) ?? null) : null;
  const pinned = Boolean(summary?.pinnedAt);
  const messages = conversation?.messages ?? [];
  const busy = conversation ? conversation.busy : true;
  const subline = conversationSubline(toolCallCount(messages), conversation?.pendingApprovalIds.length ?? 0);
  const projectChip = chips.find((chip) => chip.kind === "project") ?? null;

  const suggestions = useMemo<SuggestionCardItem[]>(
    () => pickSuggestions({ hasProject: projectChip !== null }).map((s) => ({ ...s, icon: TOPIC_ICON[s.topic] })),
    [projectChip],
  );

  // "Nueva conversación" focuses the composer; picking a thread focuses the log.
  useEffect(() => {
    if (!focusRequest) return;
    if (focusRequest.target === "composer") textareaRef.current?.focus();
    else logRef.current?.focus();
  }, [focusRequest]);

  const afterSend = () => {
    requestAnimationFrame(() => logRef.current?.scrollToBottom());
    textareaRef.current?.focus();
  };

  const submit = async () => {
    if (!conversation || conversation.busy) return;
    const text = draft;
    const attached = files;
    const fileParts = attached.length > 0 ? await toFileParts(attached) : undefined;
    if (conversation.send({ text, files: fileParts })) {
      onDraftChange("");
      setFiles([]);
      afterSend();
    }
  };

  const sendSuggestion = (text: string) => {
    if (conversation?.send({ text })) afterSend();
  };

  /** A starter or the rows of an edited confirmation go into the composer, never sent on their own. */
  const fillComposer = (prompt: string) => {
    setCommandsOpen(false);
    onDraftChange(prompt);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(prompt.length, prompt.length);
    });
  };

  const commands = <AssistantCommandList groups={ASSISTANT_TOOL_GROUPS} onPick={fillComposer} />;
  const turnError = conversation?.error ?? null;

  return (
    <>
      <header className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-3.5">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 className="truncate text-[15px] font-semibold text-foreground">{thread.title}</h2>
          {subline ? <p className="truncate text-xs text-muted-foreground">{subline}</p> : null}
        </div>
        {projectChip ? (
          <span className="hidden max-w-60 shrink-0 items-center gap-1.5 truncate rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground sm:inline-flex">
            {projectChip.tramo ? (
              <span aria-hidden className={`size-[7px] shrink-0 rounded-full ${tramoColorClass(projectChip.tramo)}`} />
            ) : null}
            <span className="truncate">
              {projectChip.tramo ? `${projectChip.label} · ${projectChip.tramo.name}` : projectChip.label}
            </span>
          </span>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={pinned ? "Quitar de fijadas" : "Fijar conversación"}
          title={pinned ? "Quitar de fijadas" : "Fijar conversación"}
          aria-pressed={pinned}
          disabled={!stored}
          onClick={() => onPinThread(thread.id, !pinned)}
        >
          {pinned ? <PinOffIcon aria-hidden /> : <PinIcon aria-hidden />}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={!stored}
            render={<Button variant="outline" size="icon" aria-label="Más opciones" title="Más opciones" />}
          >
            <MoreHorizontalIcon aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onPinThread(thread.id, !pinned)}>
              {pinned ? "Quitar de fijadas" : "Fijar conversación"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => setConfirmDelete(true)}>
              Eliminar conversación
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {notice ? (
        <Alert variant="destructive" className="m-4 mb-0 w-auto shrink-0">
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ) : null}
      {turnError ? (
        <Alert variant="destructive" className="m-4 mb-0 w-auto shrink-0">
          <AlertDescription>{turnError}</AlertDescription>
        </Alert>
      ) : null}

      <AssistantLog
        ref={logRef}
        variant="visual"
        messages={messages}
        status={conversation?.status ?? "ready"}
        loading={!conversation && !notice}
        onApprove={(ids, approved, reason) => conversation?.approve(ids, approved, reason)}
        onEditDraft={fillComposer}
      />

      <div
        ref={composerZoneRef}
        className="shrink-0 border-t border-border bg-sidebar px-3 pt-3 pb-4 sm:px-5"
      >
        <div className="mx-auto flex w-full max-w-[760px] flex-col gap-2.5">
          <SuggestionCards
            items={suggestions}
            disabled={busy}
            onSend={sendSuggestion}
            onMore={() => setCommandsOpen(true)}
          />
          <AssistantComposer
            variant="visual"
            textareaRef={textareaRef}
            value={draft}
            onChange={onDraftChange}
            onSubmit={() => void submit()}
            busy={busy}
            streaming={conversation?.status === "streaming"}
            chips={chips}
            onRemoveChip={onRemoveChip}
            onAttach={(picked) => setFiles((prev) => [...prev, ...picked])}
            files={files}
            onRemoveFile={(index) => setFiles((prev) => prev.filter((_, i) => i !== index))}
            onCommands={() => setCommandsOpen(true)}
            addContext={<AssistantContextPicker onPick={onAddChip} />}
          />
        </div>
      </div>

      {narrow ? (
        <Sheet open={commandsOpen} onOpenChange={setCommandsOpen}>
          <SheetContent side="bottom" className="max-h-[80dvh] overflow-y-auto" finalFocus={textareaRef}>
            <SheetHeader>
              <SheetTitle>Ideas y comandos</SheetTitle>
            </SheetHeader>
            <div className="px-3 pb-[max(1rem,env(safe-area-inset-bottom))]">{commands}</div>
          </SheetContent>
        </Sheet>
      ) : (
        <Popover open={commandsOpen} onOpenChange={setCommandsOpen}>
          <PopoverContent
            anchor={composerZoneRef}
            side="top"
            align="center"
            sideOffset={8}
            finalFocus={textareaRef}
            aria-label="Ideas y comandos"
            className="max-h-[60dvh] w-[min(760px,calc(100vw-2rem))] overflow-y-auto p-3"
          >
            {commands}
          </PopoverContent>
        </Popover>
      )}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta conversación?</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setConfirmDelete(false);
                onDeleteThread(thread.id);
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
