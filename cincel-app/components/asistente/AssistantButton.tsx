"use client";

import type { Ref } from "react";
import { SparklesIcon } from "lucide-react";

import { Button } from "@/components/ui/shadcn/button";

export type AssistantButtonProps = { onOpen(): void; ref?: Ref<HTMLButtonElement> };

/**
 * Floating "Pregúntale a Cincel" button with the ⌘J hint (redesign FE §3.1,
 * §4.9): fixed bottom-right, 48 px pill. The shortcut (⌘J / Ctrl+J) is
 * handled by `AssistantLauncher`.
 */
export function AssistantButton({ onOpen, ref }: AssistantButtonProps) {
  return (
    <Button
      ref={ref}
      type="button"
      size="lg"
      onClick={onOpen}
      aria-keyshortcuts="Meta+J Control+J"
      className="fixed right-4 bottom-20 z-40 h-12 gap-2 rounded-full px-4 shadow-lg md:right-6 md:bottom-6"
      data-testid="asistente-boton"
    >
      <SparklesIcon aria-hidden data-icon="inline-start" />
      Pregúntale a Cincel
      <kbd aria-hidden className="rounded-sm bg-primary-foreground/15 px-1.5 font-mono text-xs">
        ⌘J
      </kbd>
    </Button>
  );
}
