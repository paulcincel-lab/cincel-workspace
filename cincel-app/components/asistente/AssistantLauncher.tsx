"use client";

import { lazy, Suspense, useEffect, useMemo, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { AssistantButton } from "@/components/asistente/AssistantButton";
import { IMPLEMENTED } from "@/lib/actions/assistant-actions.flags";
import { assistantContextFromRoute, isAssistantPage } from "@/lib/assistant/page-context";
import { useAssistantUi } from "@/lib/stores/assistant-ui-store";

/** Stub phase (FE §9): the entry point stays hidden until the assistant thread actions are implemented. */
export function assistantEntryEnabled(flags: Record<string, boolean> = IMPLEMENTED): boolean {
  return Object.values(flags).every(Boolean);
}

/**
 * The sheet (chat transport, markdown, charts, tool summaries) is the
 * heaviest client tree of the shell, so it loads as its own chunk the first
 * time the assistant opens instead of with every staff page.
 */
const loadAssistantSheet = () => import("@/components/asistente/AssistantSheet");
const AssistantSheet = lazy(() => loadAssistantSheet().then((m) => ({ default: m.AssistantSheet })));

/** Starts fetching the sheet chunk early (hover / focus on the button). */
export function preloadAssistantSheet(): void {
  void loadAssistantSheet();
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
 * button. Mounted once by `AppShell`. Open state lives in `useAssistantUi`,
 * so other surfaces open the same sheet with `openAssistant()`.
 */
export function AssistantLauncher({ hidden = false, enabled = assistantEntryEnabled() }: AssistantLauncherProps) {
  const pathname = usePathname() ?? "/";
  const searchParams = useSearchParams();
  const open = useAssistantUi((s) => s.open);
  // Stays true after the first open so the sheet keeps its state and close animation.
  const sheetMounted = useAssistantUi((s) => s.mounted);
  const setOpen = useAssistantUi((s) => s.setOpen);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const tarea = searchParams?.get("tarea") ?? null;
  const context = useMemo(
    () => assistantContextFromRoute(pathname, { get: (name) => (name === "tarea" ? tarea : null) }),
    [pathname, tarea],
  );

  const active = enabled && !hidden && !isAssistantPage(pathname);

  useEffect(() => {
    const { setAvailable } = useAssistantUi.getState();
    setAvailable(active);
    return () => setAvailable(false);
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "j" || !(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
      event.preventDefault();
      useAssistantUi.getState().toggle();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active]);

  if (!active) return null;

  return (
    <>
      <AssistantButton ref={buttonRef} onOpen={() => setOpen(true)} onIntent={preloadAssistantSheet} />
      {sheetMounted ? (
        <Suspense fallback={null}>
          <AssistantSheet open={open} onOpenChange={setOpen} context={context} finalFocus={buttonRef} />
        </Suspense>
      ) : null}
    </>
  );
}
