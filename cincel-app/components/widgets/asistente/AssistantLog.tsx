"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type { ChatStatus } from "ai";
import { ArrowUpIcon, SparklesIcon } from "lucide-react";

import { AssistantMessageParts } from "@/components/asistente/AssistantMessageParts";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import { JumpToLatest } from "@/components/widgets/asistente/JumpToLatest";
import { useScrollAnchor } from "@/components/widgets/asistente/useScrollAnchor";
import type { AssistantUIMessage } from "@/lib/types/asistente";

/**
 * The messages of one conversation (frame `Asistente-Visual`), bottom
 * anchored: the scroller is `column-reverse`, so new content keeps the last
 * message in view unless the reader scrolled up (then "Bajar al último
 * mensaje" counts what arrived). "Mensajes anteriores" shows while the first
 * message is out of view and scrolls to it. Never scrolls the page.
 */
export type AssistantLogProps = {
  messages: readonly AssistantUIMessage[];
  status: ChatStatus;
  /** The stored thread is still loading: skeleton rows, `aria-busy`. */
  loading?: boolean;
  /** Answers the approvals of a grouped confirmation. */
  onApprove(approvalIds: string[], approved: boolean, reason?: string): void;
  /** "Editar" on a confirmation: puts its rows in the composer. */
  onEditDraft?(text: string): void;
  /** Text of an empty conversation. */
  emptyText?: string;
  variant: "visual" | "esencial" | "analitico";
};

export type AssistantLogHandle = {
  /** Scrolls to the newest message (after a send). */
  scrollToBottom(): void;
  /** Moves focus to the log (after picking a thread). */
  focus(): void;
};

const TIME_FORMAT = new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** "10:38" from the message's `createdAt`; null without one. */
export function messageTime(message: AssistantUIMessage): string | null {
  const iso = message.metadata?.createdAt;
  if (!iso) return null;
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? null : TIME_FORMAT.format(at);
}

const DEFAULT_EMPTY = "Pregunta por tus proyectos y tareas; confirma antes de que cambie algo.";

/** Distance (px) above the visible area that still counts as "first message in view". */
const TOP_SLACK = 8;

function dotDelay(index: number): CSSProperties {
  return { "--anim-delay": `${index * 150}ms` } as CSSProperties;
}

function Avatar() {
  return (
    <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-primary text-primary-foreground">
      <SparklesIcon className="size-4" />
    </span>
  );
}

function UserMessage({ message }: { message: AssistantUIMessage }) {
  const time = messageTime(message);
  const files = message.parts.filter((part) => part.type === "file");
  return (
    <article aria-label="Tu mensaje" className="flex max-w-[520px] flex-col items-end gap-1 self-end">
      {message.parts.map((part, index) =>
        part.type === "text" ? (
          <p
            key={index}
            className="rounded-[14px_14px_4px_14px] bg-secondary px-3.5 py-2.5 text-sm leading-[1.55] whitespace-pre-wrap text-foreground"
          >
            {part.text}
          </p>
        ) : null,
      )}
      {files.length > 0 ? (
        <ul className="flex flex-wrap justify-end gap-1.5" aria-label="Archivos adjuntos">
          {files.map((part, index) => (
            <li key={index} className="rounded-lg border border-border bg-card px-2 py-1 text-xs text-sidebar-foreground">
              {"filename" in part && part.filename ? part.filename : "Archivo"}
            </li>
          ))}
        </ul>
      ) : null}
      {time ? <span className="font-mono text-[11px] text-muted-foreground">{time}</span> : null}
    </article>
  );
}

function AssistantMessage({
  message,
  onApprove,
  onEditDraft,
}: {
  message: AssistantUIMessage;
  onApprove: AssistantLogProps["onApprove"];
  onEditDraft?: AssistantLogProps["onEditDraft"];
}) {
  return (
    <article aria-label="Respuesta del asistente" className="flex min-w-0 gap-3">
      <Avatar />
      <div className="flex min-w-0 flex-1 flex-col gap-4 text-sm leading-[1.6] [&_strong]:font-semibold [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto">
        <AssistantMessageParts
          message={message}
          stepsVariant="timeline"
          onToolApproval={onApprove}
          onEditDraft={onEditDraft}
        />
      </div>
    </article>
  );
}

function Thinking() {
  return (
    <div className="flex items-center gap-3" aria-label="Pensando…">
      <Avatar />
      <span className="flex items-center gap-2">
        <span aria-hidden className="flex items-center gap-1">
          {[0, 1, 2].map((i) => (
            <span key={i} style={dotDelay(i)} className="typing size-1.5 rounded-full bg-primary" />
          ))}
        </span>
        <span className="text-[12.5px] text-muted-foreground">Pensando…</span>
      </span>
    </div>
  );
}

function SkeletonRows() {
  return (
    <>
      <div className="flex justify-end">
        <Skeleton className="h-10 w-2/5 rounded-[14px]" />
      </div>
      <div className="flex gap-3">
        <Skeleton className="size-8 shrink-0 rounded-[10px]" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-3/5" />
        </div>
      </div>
      <div className="flex justify-end">
        <Skeleton className="h-10 w-1/3 rounded-[14px]" />
      </div>
    </>
  );
}

export const AssistantLog = forwardRef<AssistantLogHandle, AssistantLogProps>(function AssistantLog(
  { messages, status, loading = false, onApprove, onEditDraft, emptyText = DEFAULT_EMPTY },
  ref,
) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const assistantCount = messages.filter((message) => message.role === "assistant").length;
  const anchor = useScrollAnchor(scrollerRef, { count: assistantCount });
  const [olderHidden, setOlderHidden] = useState(false);

  const measureTop = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    // `column-reverse`: scrollTop is 0 at the bottom and negative above it.
    const above = el.scrollHeight - el.clientHeight - Math.abs(el.scrollTop);
    setOlderHidden(above > TOP_SLACK);
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    measureTop();
    el.addEventListener("scroll", measureTop, { passive: true });
    return () => el.removeEventListener("scroll", measureTop);
  }, [measureTop]);

  useEffect(() => {
    measureTop();
  }, [messages, status, measureTop]);

  useImperativeHandle(
    ref,
    () => ({
      scrollToBottom() {
        const el = scrollerRef.current;
        if (el) el.scrollTop = 0;
      },
      focus() {
        scrollerRef.current?.focus({ preventScroll: true });
      },
    }),
    [],
  );

  const scrollToTop = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const top = -(el.scrollHeight - el.clientHeight);
    if (typeof el.scrollTo === "function") el.scrollTo({ top, behavior: "smooth" });
    else el.scrollTop = top;
  };

  const empty = !loading && messages.length === 0 && status !== "submitted";

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollerRef}
        role="log"
        aria-label="Mensajes"
        aria-live="polite"
        aria-relevant="additions"
        aria-busy={loading || undefined}
        tabIndex={-1}
        className="absolute inset-0 flex flex-col-reverse overflow-y-auto outline-none"
      >
        <div
          className={
            empty
              ? "mx-auto flex w-full max-w-[760px] flex-1 items-center justify-center px-6 pt-6 pb-4"
              : "mx-auto flex w-full max-w-[760px] flex-col gap-6 px-4 pt-6 pb-4 sm:px-6"
          }
        >
          {loading ? (
            <SkeletonRows />
          ) : empty ? (
            <p className="text-center text-sm text-muted-foreground">{emptyText}</p>
          ) : (
            <>
              {messages.map((message) =>
                message.role === "user" ? (
                  <UserMessage key={message.id} message={message} />
                ) : message.role === "assistant" ? (
                  <AssistantMessage key={message.id} message={message} onApprove={onApprove} onEditDraft={onEditDraft} />
                ) : null,
              )}
              {status === "submitted" ? <Thinking /> : null}
            </>
          )}
        </div>
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-linear-to-b from-card to-transparent" />
      {olderHidden && !loading ? (
        <div className="pointer-events-none absolute inset-x-0 top-2.5 flex justify-center">
          <button
            type="button"
            onClick={scrollToTop}
            className="anim-in pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs text-sidebar-foreground shadow-[0_2px_6px_rgba(15,23,42,.06)] outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <ArrowUpIcon aria-hidden className="size-3.5" />
            Mensajes anteriores
          </button>
        </div>
      ) : null}
      <JumpToLatest visible={!anchor.atBottom} newCount={anchor.newCount} onJump={anchor.jump} />
    </div>
  );
});
