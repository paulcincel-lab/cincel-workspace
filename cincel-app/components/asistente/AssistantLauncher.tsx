"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { AssistantButton } from "@/components/asistente/AssistantButton";
import { AssistantSheet } from "@/components/asistente/AssistantSheet";
import { IMPLEMENTED } from "@/lib/actions/assistant-actions.flags";
import { assistantContextFromRoute, isAssistantPage } from "@/lib/assistant/page-context";

/** Stub phase (FE §9): the entry point stays hidden until the assistant thread actions are implemented. */
export function assistantEntryEnabled(flags: Record<string, boolean> = IMPLEMENTED): boolean {
  return Object.values(flags).every(Boolean);
}

/** Event other entry points (e.g. the command palette's "Preguntar al asistente") dispatch to open the sheet. */
export const OPEN_ASSISTANT_EVENT = "cincel:open-assistant";

export function openAssistant(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(OPEN_ASSISTANT_EVENT));
}

export type AssistantLauncherProps = {
  /** True on /asistente (the shell passes `hideAssistant`). */
  hidden?: boolean;
  /** Test seam; defaults to the `assistant-actions` IMPLEMENTED flags. */
  enabled?: boolean;
};

/**
 * Mounts the floating `AssistantButton` and the `AssistantSheet` on every
 * staff page except `/asistente`; ⌘J / Ctrl+J toggles the sheet. The page
 * context comes from the route; Escape closes and focus returns to the
 * button. Mounted once by `AppShell` (so only with the redesign flag on).
 */
export function AssistantLauncher({ hidden = false, enabled = assistantEntryEnabled() }: AssistantLauncherProps) {
  const pathname = usePathname() ?? "/";
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const tarea = searchParams?.get("tarea") ?? null;
  const context = useMemo(
    () => assistantContextFromRoute(pathname, { get: (name) => (name === "tarea" ? tarea : null) }),
    [pathname, tarea],
  );

  const active = enabled && !hidden && !isAssistantPage(pathname);

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "j" || !(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
      event.preventDefault();
      setOpen((prev) => !prev);
    };
    const onOpenEvent = () => setOpen(true);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener(OPEN_ASSISTANT_EVENT, onOpenEvent);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(OPEN_ASSISTANT_EVENT, onOpenEvent);
    };
  }, [active]);

  if (!active) return null;

  return (
    <>
      <AssistantButton ref={buttonRef} onOpen={() => setOpen(true)} />
      <AssistantSheet open={open} onOpenChange={setOpen} context={context} finalFocus={buttonRef} />
    </>
  );
}
