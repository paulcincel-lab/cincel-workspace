"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import type { FileUIPart, UIMessage } from "ai";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CheckIcon, MessagesSquareIcon, PlusIcon, XIcon } from "lucide-react";

import { useAssistantToolGroups } from "@/components/asistente/assistant-tool-groups";
import { AssistantCardMessage } from "@/components/asistente/AssistantCardMessage";
import { AssistantChartMessage } from "@/components/asistente/AssistantChartMessage";
import { AssistantListMessage } from "@/components/asistente/AssistantListMessage";
import { AssistantStatGridMessage } from "@/components/asistente/AssistantStatGridMessage";
import { AssistantTableMessage, type RenderTableArgs } from "@/components/asistente/AssistantTableMessage";
import { AssistantTimelineMessage, type RenderTimelineArgs } from "@/components/asistente/AssistantTimelineMessage";
import type { WidgetTone } from "@/components/asistente/tone";
import type { AssistantTurn } from "@/components/asistente/use-asistente-cache";
import { useAssistantConversation, type AssistantConversation } from "@/components/asistente/use-assistant-conversation";
import { Alert, AlertDescription } from "@/components/ui/shadcn/alert";
import { Button } from "@/components/ui/shadcn/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/shadcn/sheet";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import { EsencialCard } from "@/components/widgets/EsencialCard";
import { EsencialItemRow } from "@/components/widgets/EsencialItemRow";
import { PageHeader } from "@/components/widgets/PageHeader";
import { ToolSteps, ToolStepsLiveRegion } from "@/components/widgets/ToolSteps";
import { AssistantCommandList } from "@/components/widgets/asistente/AssistantCommandList";
import { AssistantComposer } from "@/components/widgets/asistente/AssistantComposer";
import { AssistantThreadRail } from "@/components/widgets/asistente/AssistantThreadRail";
import { JumpToLatest } from "@/components/widgets/asistente/JumpToLatest";
import { useScrollAnchor } from "@/components/widgets/asistente/useScrollAnchor";
import {
  approvalOutcome,
  conversationTimeLabel,
  esencialQuestion,
  firstMessageTime,
  pendingIdsOf,
  taskListOf,
  type ApprovalOutcome,
} from "@/components/widgets/asistente/esencial-chat";
import { EXAMPLE_QUESTIONS } from "@/lib/assistant/suggestions";
import {
  RENDER_WIDGET_TOOLS,
  TOOL_STEP_DEFS,
  toToolSteps,
  toolNameOfPart,
  toolPartOf,
  unwrapOutput,
  type ToolApprovalGroup,
} from "@/lib/assistant/tool-steps";
import { tramoColorVar } from "@/lib/tramos/tramo-color";
import type { AssistantMessageMeta, AssistantUIMessage, ContextChip } from "@/lib/types/asistente";
import type { AssistantContext, AssistantThreadSummary } from "@/lib/types/redesign";

/** Rows of a task list before the "Ver las {n} en Tareas →" link. */
const MAX_TASK_ROWS = 6;
/** Example questions in an empty conversation. */
const MAX_EXAMPLES = 4;
const INTRO = "Pregunta por tus proyectos y tareas.";

/** Shell chrome around the page: the mobile top bar and bottom tabs below 768 px, nothing above. */
const FRAME_HEIGHT =
  "h-[calc(100dvh-3.5rem-env(safe-area-inset-top)-76px-env(safe-area-inset-bottom))] md:h-dvh";

type ToolPart = NonNullable<ReturnType<typeof toolPartOf>>;

export type AsistenteEsencialLayoutProps = {
  /** The caller's threads (`qk.asistente.threads()`). */
  threads: readonly AssistantThreadSummary[];
  /** The open stored thread; null for a new conversation. */
  activeId: string | null;
  onSelectThread(id: string): void;
  onNewConversation(): void;
  /** The open conversation; `messages` null while the thread loads. The chat is keyed by `id`. */
  thread: { id: string; title: string; messages: UIMessage[] | null };
  /** The thread whose messages are loading (rail `aria-busy`). */
  busyThreadId?: string | null;
  /** A page notice (missing thread, load error), shown as a destructive alert. */
  notice?: string | null;
  /** The context sent with each message. */
  context: AssistantContext;
  /** The open context; Esencial shows it as text in the composer ("· Oficina Polanco"), not removable. */
  chips?: readonly ContextChip[];
  /** A prompt placed in the composer without sending; a new `nonce` re-applies the same text. */
  draft?: { text: string; nonce: number };
  onTurnFinished?(turn: AssistantTurn): void;
};

/**
 * Asistente Esencial (frame `Asistente-Esencial`): a plain thread list and
 * one quiet column. Tools collapse to one line, task lists are dot rows and
 * the confirmation is a short question. Fixed full-height screen: the log
 * scrolls, the composer stays pinned and the page never scrolls.
 */
export function AsistenteEsencialLayout(props: AsistenteEsencialLayoutProps): ReactNode {
  const { threads, activeId, onSelectThread, onNewConversation, thread, notice, busyThreadId = null } = props;
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <div className={`flex min-h-0 w-full flex-col overflow-hidden ${FRAME_HEIGHT}`}>
      <div className="shrink-0 px-4 pt-5 pb-3 md:px-8 md:pt-7 md:pb-4 [&_[data-slot=page-header]]:mb-0">
        <PageHeader
          title="Asistente"
          description={INTRO}
          actions={
            <>
              <Button type="button" variant="outline" className="md:hidden" onClick={() => setSheetOpen(true)}>
                <MessagesSquareIcon aria-hidden />
                Conversaciones
              </Button>
              <Button type="button" onClick={onNewConversation}>
                <PlusIcon aria-hidden />
                Nueva conversación
              </Button>
            </>
          }
        />
      </div>

      <div className="flex min-h-0 flex-1 gap-7 px-4 pb-4 md:px-8 md:pb-5">
        <div className="hidden min-h-0 w-[220px] shrink-0 flex-col gap-0.5 md:flex">
          <AssistantThreadRail
            variant="esencial"
            threads={threads}
            activeId={activeId}
            busyId={busyThreadId}
            onSelect={onSelectThread}
            className="w-full flex-initial"
          />
          <NewConversationButton onClick={onNewConversation} />
        </div>

        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent side="left" className="w-[280px] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Conversaciones</SheetTitle>
            </SheetHeader>
            <div className="flex flex-col gap-0.5 px-3 pb-4">
              <AssistantThreadRail
                variant="esencial"
                threads={threads}
                activeId={activeId}
                busyId={busyThreadId}
                onSelect={(id) => {
                  setSheetOpen(false);
                  onSelectThread(id);
                }}
                className="w-full"
              />
              <NewConversationButton
                onClick={() => {
                  setSheetOpen(false);
                  onNewConversation();
                }}
              />
            </div>
          </SheetContent>
        </Sheet>

        <section aria-label="Conversación" className="flex min-h-0 min-w-0 max-w-[820px] flex-1 flex-col">
          {thread.messages ? (
            <EsencialConversation key={thread.id} {...props} thread={{ ...thread, messages: thread.messages }} />
          ) : (
            <>
              <ConversationHeader title={thread.title} time={null} />
              {notice ? <PageNotice text={notice} /> : null}
              <div className="relative min-h-0 flex-1">{notice ? null : <LoadingLog />}</div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function NewConversationButton({ onClick }: { onClick(): void }) {
  return (
    <Button type="button" variant="ghost" className="h-8 shrink-0 justify-start rounded-[10px] px-2.5 text-[13px] font-medium" onClick={onClick}>
      <PlusIcon aria-hidden className="size-3.5" />
      Nueva conversación
    </Button>
  );
}

function ConversationHeader({ title, time }: { title: string; time: string | null }) {
  return (
    <header className="flex shrink-0 items-baseline gap-2.5 border-b border-border pt-1 pb-3">
      <h2 className="min-w-0 truncate text-[14.5px] font-semibold text-foreground">{title}</h2>
      {time ? <span className="shrink-0 text-[12.5px] text-muted-foreground">{time}</span> : null}
    </header>
  );
}

function PageNotice({ text }: { text: string }) {
  return (
    <Alert variant="destructive" className="mt-3 shrink-0">
      <AlertDescription>{text}</AlertDescription>
    </Alert>
  );
}

function LoadingLog() {
  return (
    <div aria-busy="true" aria-label="Cargando conversación" className="flex flex-col gap-3 px-1 pt-5">
      <Skeleton className="h-4 w-3/5 self-end" />
      <Skeleton className="h-4 w-4/5" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

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

type ConversationProps = AsistenteEsencialLayoutProps & { thread: { id: string; title: string; messages: UIMessage[] } };

/** The chat of one thread: header, log with the jump pill and the pinned composer. */
function EsencialConversation({ thread, context, chips = [], draft, onTurnFinished, notice }: ConversationProps) {
  const conversation = useAssistantConversation({ thread, context, onTurnFinished });
  const { messages, status, busy, error } = conversation;
  const [input, setInput] = useState(draft?.text ?? "");
  const [files, setFiles] = useState<File[]>([]);
  const [commandsOpen, setCommandsOpen] = useState(false);
  const toolGroups = useAssistantToolGroups();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const assistantCount = messages.filter((m) => m.role === "assistant").length;
  const anchor = useScrollAnchor(logRef, { count: assistantCount });
  const time = conversationTimeLabel(firstMessageTime(messages));
  const lastAssistantId = [...messages].reverse().find((m) => m.role === "assistant")?.id;

  // A prompt from the page goes into the composer; it is never sent on its own.
  const [appliedDraft, setAppliedDraft] = useState(draft);
  if (draft && draft !== appliedDraft) {
    setAppliedDraft(draft);
    setInput(draft.text);
  }
  useEffect(() => {
    if (draft) focusEnd(textareaRef.current, draft.text.length);
  }, [draft]);

  const fill = (text: string) => {
    setInput(text);
    setCommandsOpen(false);
    requestAnimationFrame(() => focusEnd(textareaRef.current, text.length));
  };

  const submit = async () => {
    const fileParts = files.length ? await toFileParts(files) : undefined;
    if (!conversation.send({ text: input, files: fileParts })) return;
    setInput("");
    setFiles([]);
    setCommandsOpen(false);
    // Sending returns the reader to the last message; focus stays in the textarea.
    anchor.jump();
    textareaRef.current?.focus();
  };

  return (
    <>
      <ConversationHeader title={thread.title} time={time} />
      {notice ? <PageNotice text={notice} /> : null}
      {error ? <PageNotice text={error} /> : null}

      <div className="relative min-h-0 flex-1">
        <div
          ref={logRef}
          role="log"
          aria-label="Mensajes"
          tabIndex={-1}
          className="absolute inset-0 flex flex-col-reverse overflow-y-auto outline-none"
        >
          <div className="flex flex-col gap-[18px] px-1 pt-[18px] pb-[72px]">
            {messages.length === 0 && status !== "submitted" ? (
              <EmptyConversation onPick={fill} />
            ) : (
              messages.map((message) =>
                message.role === "user" ? (
                  <UserMessage key={message.id} message={message} />
                ) : message.role === "assistant" ? (
                  <AssistantMessage
                    key={message.id}
                    message={message}
                    latest={message.id === lastAssistantId}
                    approve={conversation.approve}
                  />
                ) : null,
              )
            )}
            {status === "submitted" ? <Thinking /> : null}
          </div>
        </div>
        <JumpToLatest visible={!anchor.atBottom} newCount={anchor.newCount} onJump={anchor.jump} />
        <ToolStepsLiveRegion messages={messages} />
      </div>

      {commandsOpen ? (
        <div
          role="group"
          aria-label="Comandos"
          className="anim-in mt-2 max-h-60 shrink-0 overflow-y-auto rounded-2xl border border-border bg-card p-2"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setCommandsOpen(false);
              textareaRef.current?.focus();
            }
          }}
        >
          <AssistantCommandList groups={toolGroups} onPick={fill} />
        </div>
      ) : null}

      <div
        className="mt-2 shrink-0 pb-[env(safe-area-inset-bottom)]"
        onKeyDown={(e) => {
          if (e.key === "Escape" && commandsOpen) setCommandsOpen(false);
        }}
      >
        <AssistantComposer
          variant="esencial"
          value={input}
          onChange={(value) => {
            setInput(value);
            if (!value.startsWith("/")) setCommandsOpen(false);
          }}
          onSubmit={() => void submit()}
          busy={busy}
          streaming={status === "streaming"}
          chips={chips.filter((chip) => chip.kind === "project").slice(0, 1)}
          onRemoveChip={() => {}}
          onAttach={(picked) => setFiles((prev) => [...prev, ...picked])}
          files={files}
          onRemoveFile={(index) => setFiles((prev) => prev.filter((_, i) => i !== index))}
          onCommands={() => setCommandsOpen(true)}
          textareaRef={textareaRef}
        />
      </div>
    </>
  );
}

function focusEnd(el: HTMLTextAreaElement | null, at: number) {
  if (!el) return;
  el.focus();
  el.setSelectionRange(at, at);
}

function EmptyConversation({ onPick }: { onPick(text: string): void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <p className="text-[14.5px] text-muted-foreground">{INTRO}</p>
      <ul aria-label="Preguntas de ejemplo" className="flex flex-col items-center gap-1">
        {EXAMPLE_QUESTIONS.slice(0, MAX_EXAMPLES).map((question) => (
          <li key={question}>
            <Button
              type="button"
              variant="ghost"
              className="h-auto py-1.5 text-[13.5px] font-normal whitespace-normal"
              onClick={() => onPick(question)}
            >
              {question}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Thinking() {
  return (
    <p role="status" className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
      <span aria-hidden className="flex items-center gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{ "--anim-delay": `${i * 150}ms` } as CSSProperties}
            className="typing size-1.5 rounded-full bg-muted-foreground"
          />
        ))}
      </span>
      Pensando…
    </p>
  );
}

function UserMessage({ message }: { message: UIMessage }) {
  const text = message.parts
    .map((part) => (part.type === "text" ? part.text : part.type === "file" ? `Archivo: ${part.filename ?? "sin nombre"}` : ""))
    .filter(Boolean)
    .join("\n");
  return (
    <p className="max-w-[520px] self-end rounded-[14px] bg-accent px-3.5 py-2.5 text-[14px] leading-normal whitespace-pre-wrap text-foreground">
      {text}
    </p>
  );
}

const MARKDOWN_CLASS =
  "max-w-full text-[14.5px] leading-[1.6] text-foreground [&_p]:mb-2 [&_p:last-child]:mb-0 [&_strong]:font-semibold [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_table]:my-2 [&_table]:block [&_table]:w-full [&_table]:overflow-x-auto [&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1";

/** One assistant reply: compact steps, text, task lists, rich results and the confirmation. */
function AssistantMessage({
  message,
  latest,
  approve,
}: {
  message: AssistantUIMessage;
  latest: boolean;
  approve: AssistantConversation["approve"];
}) {
  const tools = message.parts.map((part) => toolPartOf(part)).filter((p): p is ToolPart => p !== null);
  const isWidget = (tool: ToolPart) => RENDER_WIDGET_TOOLS.has(toolNameOfPart(tool));
  const hasSteps = tools.some((tool) => !isWidget(tool));
  const texts = message.parts.flatMap((part, index) => (part.type === "text" && part.text.trim() ? [{ index, text: part.text }] : []));
  const taskLists = tools.filter((tool) => tool.state === "output-available" && !tool.approval && !isWidget(tool));
  const widgets = tools.filter((tool) => isWidget(tool) && tool.state === "output-available");
  const approvals = toToolSteps(message).filter((group): group is ToolApprovalGroup => group.kind === "approval");
  const inputs = new Map(tools.map((tool) => [tool.toolCallId, tool.input]));
  const meta = message.metadata as AssistantMessageMeta | undefined;

  return (
    <article aria-label={latest ? "Respuesta del asistente" : "Respuesta anterior del asistente"} className="flex flex-col gap-2.5">
      {hasSteps ? <ToolSteps parts={message.parts} meta={meta} variant="compact" /> : null}
      {texts.map((t) => (
        <div key={t.index} className={MARKDOWN_CLASS}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{t.text}</ReactMarkdown>
        </div>
      ))}
      {taskLists.map((tool) => (
        <TaskList key={tool.toolCallId} tool={tool} />
      ))}
      {widgets.map((tool) => (
        <RichResult key={tool.toolCallId} tool={tool} />
      ))}
      {approvals.map((group) => (
        <EsencialConfirmation
          key={group.steps[0]?.toolCallId ?? group.toolName}
          group={group}
          inputs={group.steps.map((step) => inputs.get(step.toolCallId))}
          approve={approve}
        />
      ))}
    </article>
  );
}

/** A read tool's task rows: tramo dot, title link and colored lateness; 6 rows, then a link to Tareas. */
function TaskList({ tool }: { tool: ToolPart }) {
  const list = taskListOf(tool.output);
  if (!list) return null;
  const shown = list.rows.slice(0, MAX_TASK_ROWS);
  return (
    <div className="flex flex-col gap-1.5">
      <ul aria-label="Tareas" className="flex flex-col">
        {shown.map((row, index) => (
          <li key={row.key} className={index < shown.length - 1 ? "border-b border-border" : undefined}>
            <EsencialItemRow
              title={row.title}
              href={row.href}
              leading={
                <span aria-hidden className="size-[7px] shrink-0 rounded-full" style={{ backgroundColor: tramoColorVar(row.tramo) }} />
              }
              status={row.trailing ? { kind: "text", label: row.trailing.label, tone: row.trailing.tone } : null}
            />
          </li>
        ))}
      </ul>
      {list.total > MAX_TASK_ROWS ? (
        <Link href={tasksHref(tool)} className="self-start text-[12.5px] font-medium text-primary underline-offset-4 hover:underline">
          Ver las {list.total} en Tareas →
        </Link>
      ) : null}
    </div>
  );
}

/** The tool's own "Ver en Tareas" link when its step definition has one, else `/tareas`. */
function tasksHref(tool: ToolPart): string {
  const def = TOOL_STEP_DEFS[toolNameOfPart(tool)];
  try {
    return def?.href?.(tool.input, unwrapOutput(tool.output)) ?? "/tareas";
  } catch {
    return "/tareas";
  }
}

type RenderChartInput = { chartType: "bar" | "line"; title: string; data: { label: string; value: number }[] };
type RenderCardInput = {
  title: string;
  subtitle?: string;
  fields: { label: string; value: string }[];
  badge?: { label: string; tone: WidgetTone };
};
type RenderStatGridInput = { title?: string; stats: { label: string; value: string; badge?: { label: string; tone: WidgetTone } }[] };
type RenderListInput = { title: string; items: string[] };

/** `render_*` results; each library widget draws its Esencial branch. */
function RichResult({ tool }: { tool: ToolPart }) {
  switch (toolNameOfPart(tool)) {
    case "render_chart": {
      const chart = tool.input as RenderChartInput;
      return <AssistantChartMessage chartType={chart.chartType} title={chart.title} data={chart.data} />;
    }
    case "render_card": {
      const card = tool.input as RenderCardInput;
      return <AssistantCardMessage title={card.title} subtitle={card.subtitle} fields={card.fields} badge={card.badge} />;
    }
    case "render_stat_grid": {
      const grid = tool.input as RenderStatGridInput;
      return <AssistantStatGridMessage title={grid.title} stats={grid.stats} />;
    }
    case "render_list": {
      const list = tool.input as RenderListInput;
      return <AssistantListMessage title={list.title} items={list.items} />;
    }
    case "render_table":
      return (
        <div className="overflow-x-auto">
          <AssistantTableMessage {...(tool.input as RenderTableArgs)} />
        </div>
      );
    case "render_timeline":
      return <AssistantTimelineMessage {...(tool.input as RenderTimelineArgs)} />;
    default:
      return null;
  }
}

/** The short confirmation: one question, Confirmar / Cancelar answering every id of the group once. */
function EsencialConfirmation({
  group,
  inputs,
  approve,
}: {
  group: ToolApprovalGroup;
  inputs: readonly unknown[];
  approve: AssistantConversation["approve"];
}) {
  const { question, detail } = esencialQuestion(group, inputs);
  const outcome = approvalOutcome(group);
  const [answered, setAnswered] = useState(false);
  const resultRef = useRef<HTMLParagraphElement>(null);

  const respond = (approved: boolean) => {
    const ids = pendingIdsOf(group);
    if (answered || ids.length === 0) return;
    setAnswered(true);
    approve(ids, approved);
  };

  // After the answer, focus moves to the result line.
  useEffect(() => {
    if (answered && outcome.kind !== "pending") resultRef.current?.focus();
  }, [answered, outcome.kind]);

  return (
    <div role="group" aria-label={question}>
      <EsencialCard title={question} headingLevel={3}>
        <p className="text-[14px] text-foreground">{detail}</p>
        {outcome.kind === "pending" ? (
          <div className="mt-2.5 flex gap-2">
            <Button type="button" className="h-8 rounded-[10px] text-[13px] font-semibold" disabled={answered} onClick={() => respond(true)}>
              Confirmar
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-8 rounded-[10px] text-[13px] font-medium"
              disabled={answered}
              onClick={() => respond(false)}
            >
              Cancelar
            </Button>
          </div>
        ) : (
          <ConfirmationResult outcome={outcome} resultRef={resultRef} />
        )}
      </EsencialCard>
    </div>
  );
}

function ConfirmationResult({
  outcome,
  resultRef,
}: {
  outcome: Exclude<ApprovalOutcome, { kind: "pending" }>;
  resultRef: RefObject<HTMLParagraphElement | null>;
}) {
  if (outcome.kind === "error") {
    return (
      <p ref={resultRef} tabIndex={-1} role="status" className="mt-2.5 text-[13px] text-destructive outline-none">
        {outcome.done > 0 ? `${outcome.done} de ${outcome.total} hechas. ` : ""}
        {outcome.errorText}
      </p>
    );
  }
  if (outcome.kind === "running") {
    return (
      <p ref={resultRef} tabIndex={-1} role="status" className="mt-2.5 text-[13px] text-muted-foreground outline-none">
        Confirmado. Ejecutando…
      </p>
    );
  }
  const done = outcome.kind === "done";
  const Icon = done ? CheckIcon : XIcon;
  return (
    <p ref={resultRef} tabIndex={-1} role="status" className="mt-2.5 flex items-center gap-1.5 text-[13px] text-muted-foreground outline-none">
      <Icon aria-hidden className="size-4" />
      {done ? "Hecho" : "Cancelado"}
    </p>
  );
}
