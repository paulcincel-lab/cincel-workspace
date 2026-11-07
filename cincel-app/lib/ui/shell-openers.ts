/**
 * Openers for the shell overlays (redesign FE §3.1, §3.12). Pure and
 * client-safe.
 *
 * The mounted `CommandPalette` registers how to open itself, so any page (the
 * staff 404 "Buscar" button, for example) can call `openCommandPalette()`.
 * Whoever mounts `AssistantSheet` registers its opener the same way; the
 * palette's "Preguntar al asistente" command only shows while one is
 * registered, so it never points at a sheet that is not there.
 */

export type ShellOverlay = "search" | "assistant";

type Opener = () => void;

const openers: Record<ShellOverlay, Opener | null> = { search: null, assistant: null };

/** Registers the opener of an overlay. Returns the unregister function (pass it as an effect cleanup). */
export function registerShellOpener(overlay: ShellOverlay, open: Opener): () => void {
  openers[overlay] = open;
  return () => {
    if (openers[overlay] === open) openers[overlay] = null;
  };
}

/** Whether an opener for the overlay is registered. */
export function canOpenShellOverlay(overlay: ShellOverlay): boolean {
  return openers[overlay] !== null;
}

/** Opens the overlay. Returns false when nothing is registered for it. */
export function openShellOverlay(overlay: ShellOverlay): boolean {
  const open = openers[overlay];
  if (!open) return false;
  open();
  return true;
}

/** Opens the ⌘K palette (FE §3.12). */
export function openCommandPalette(): boolean {
  return openShellOverlay("search");
}

/** Opens the `AssistantSheet` (FE §3.9). */
export function openAssistant(): boolean {
  return openShellOverlay("assistant");
}
