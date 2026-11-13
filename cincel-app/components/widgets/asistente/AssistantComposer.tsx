"use client";

import { useLayoutEffect, useRef, type ReactNode, type Ref, type RefObject } from "react";
import { ArrowUpIcon, Loader2Icon, PaperclipIcon, XIcon } from "lucide-react";

import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { etapaColorClass } from "@/lib/etapas/etapa-color";
import type { ContextChip } from "@/lib/types/asistente";
import { cn } from "@/lib/utils";

export type { ContextChip } from "@/lib/types/asistente";

/**
 * The composer of the full `/asistente` page, pinned below the log. `visual`
 * (frame `Asistente-Visual`): bordered box, attach, "/ comandos", removable
 * context chips, the keyboard hint and the round send button. `esencial`:
 * the light box with the context as text. Enter sends; Shift / Alt / Ctrl +
 * Enter is a new line; "/" as the first character opens the commands.
 */
export type AssistantComposerProps = {
  value: string;
  onChange(value: string): void;
  onSubmit(): void;
  /** A turn is running: send waits (spinner while streaming). */
  busy: boolean;
  chips: readonly ContextChip[];
  onRemoveChip(chip: ContextChip): void;
  /** Files picked with "Adjuntar archivo"; without it the button is hidden. */
  onAttach?(files: File[]): void;
  /** The attached files waiting for the next message. */
  files?: readonly File[];
  onRemoveFile?(index: number): void;
  /** Opens the starter list ("/ comandos" and "/" typed first). */
  onCommands?(): void;
  /** The "Agregar contexto" control, placed after the chips. */
  addContext?: ReactNode;
  variant: "visual" | "esencial" | "analitico";
  textareaRef?: Ref<HTMLTextAreaElement>;
  /** Shows the spinner in the send button (streaming). */
  streaming?: boolean;
};

const MAX_HEIGHT = 160;

function resize(el: HTMLTextAreaElement | null): void {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
  el.style.overflowY = el.scrollHeight > MAX_HEIGHT ? "auto" : "hidden";
}

function assignRef<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (!ref) return;
  if (typeof ref === "function") ref(value);
  else (ref as RefObject<T | null>).current = value;
}

export function AssistantComposer({
  value,
  onChange,
  onSubmit,
  busy,
  chips,
  onRemoveChip,
  onAttach,
  files = [],
  onRemoveFile,
  onCommands,
  addContext,
  variant,
  textareaRef,
  streaming = false,
}: AssistantComposerProps): ReactNode {
  const localRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const esencial = variant === "esencial";
  const canSend = !busy && (value.trim().length > 0 || files.length > 0);

  useLayoutEffect(() => resize(localRef.current), [value]);

  const submit = () => {
    if (canSend) onSubmit();
  };

  return (
    <form
      aria-label="Escribir al asistente"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      onDragOver={(event) => {
        if (onAttach && event.dataTransfer.types.includes("Files")) event.preventDefault();
      }}
      onDrop={(event) => {
        if (!onAttach || event.dataTransfer.files.length === 0) return;
        event.preventDefault();
        onAttach(Array.from(event.dataTransfer.files));
      }}
      className={cn(
        "flex flex-col bg-card",
        esencial
          ? "gap-1.5 rounded-2xl border border-border py-2.5 pr-2.5 pl-3.5"
          : "gap-2 rounded-2xl border border-primary/25 py-2.5 pr-2.5 pl-3.5 shadow-[0_6px_20px_rgba(15,23,42,.07)]",
      )}
    >
      <label htmlFor="asistente-composer" className="sr-only">
        Mensaje al asistente
      </label>
      <textarea
        id="asistente-composer"
        ref={(el) => {
          localRef.current = el;
          assignRef(textareaRef, el);
        }}
        value={value}
        rows={2}
        placeholder={esencial ? "Pregunta o pide algo…" : "Pregunta o pide algo… escribe / para comandos"}
        onChange={(event) => {
          const next = event.target.value;
          if (next.startsWith("/") && !value.startsWith("/")) onCommands?.();
          onChange(next);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
            if (event.nativeEvent.isComposing) return;
            event.preventDefault();
            submit();
          }
        }}
        className="max-h-40 w-full resize-none border-0 bg-transparent p-0 text-sm leading-normal text-foreground outline-none placeholder:text-muted-foreground"
      />

      {files.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Archivos adjuntos">
          {files.map((file, index) => (
            <li key={`${file.name}-${index}`}>
              <Badge variant="secondary">
                <span className="max-w-40 truncate">{file.name}</span>
                {onRemoveFile ? (
                  <button type="button" aria-label={`Quitar ${file.name}`} onClick={() => onRemoveFile(index)}>
                    <XIcon aria-hidden />
                  </button>
                ) : null}
              </Badge>
            </li>
          ))}
        </ul>
      ) : null}

      <div className={cn("flex flex-wrap items-center", esencial ? "gap-2" : "gap-1.5")}>
        {onAttach ? (
          <>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(event) => {
                const picked = event.target.files ? Array.from(event.target.files) : [];
                if (picked.length > 0) onAttach(picked);
                event.target.value = "";
              }}
            />
            <Button
              type="button"
              variant={esencial ? "ghost" : "outline"}
              size="icon"
              aria-label="Adjuntar archivo"
              title="Adjuntar archivo"
              onClick={() => fileInputRef.current?.click()}
            >
              <PaperclipIcon aria-hidden />
            </Button>
          </>
        ) : null}

        {esencial ? (
          <>
            <span className="text-xs text-muted-foreground">/ para comandos</span>
            {chips.map((chip) => (
              <span key={`${chip.kind}-${chip.id}`} className="truncate text-xs text-muted-foreground">
                · {chip.label}
              </span>
            ))}
          </>
        ) : (
          <>
            {onCommands ? (
              <button
                type="button"
                onClick={onCommands}
                className="inline-flex h-7 items-center rounded-lg border border-border bg-sidebar px-2.5 font-mono text-xs font-medium text-sidebar-foreground outline-none transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                / comandos
              </button>
            ) : null}
            {chips.map((chip) => (
              <span
                key={`${chip.kind}-${chip.id}`}
                className={cn(
                  "inline-flex h-7 max-w-56 items-center gap-1.5 rounded-full pr-1.5 pl-2.5 text-xs font-medium",
                  chip.kind === "project" ? "bg-secondary text-secondary-foreground" : "bg-muted text-sidebar-foreground",
                )}
              >
                {chip.etapa ? (
                  <span aria-hidden className={cn("size-[7px] shrink-0 rounded-full", etapaColorClass(chip.etapa))} />
                ) : null}
                <span className="truncate">{chip.label}</span>
                <button
                  type="button"
                  aria-label={`Quitar contexto ${chip.label}`}
                  onClick={() => onRemoveChip(chip)}
                  className="inline-flex size-[18px] shrink-0 items-center justify-center rounded-full outline-none hover:bg-background/60 focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  <XIcon aria-hidden className="size-3" />
                </button>
              </span>
            ))}
            {addContext}
          </>
        )}

        <span className="flex-1" />
        {esencial ? null : (
          <span className="text-[11.5px] text-muted-foreground max-sm:hidden">Enter envía · Shift+Enter nueva línea</span>
        )}
        <Button
          type="submit"
          size="icon"
          aria-label="Enviar"
          disabled={!canSend}
          className={cn("rounded-full", esencial ? "size-[34px]" : "size-9 shadow-[0_4px_10px_rgba(37,99,235,.28)]")}
        >
          {streaming ? <Loader2Icon aria-hidden className="spin" /> : <ArrowUpIcon aria-hidden />}
        </Button>
      </div>
    </form>
  );
}
