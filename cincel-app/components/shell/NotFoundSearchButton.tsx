"use client";

import { useState } from "react";
import { Search } from "lucide-react";

import { CommandPalette } from "@/components/shell/CommandPalette";
import { Button } from "@/components/ui/shadcn/button";
import { useShellUi } from "@/lib/stores/shell-ui-store";
import { NOT_FOUND_COPY } from "@/lib/ui/route-states";

/**
 * "Buscar" on the staff not-found page (redesign FE §3.12, frame `Error404`):
 * opens the ⌘K palette through `useShellUi.openSearch`, the same store the
 * Sidebar button and ⌘K use. The not-found page renders outside the staff
 * shell, so it mounts the palette itself unless one is already mounted
 * (`searchAvailable`); the palette owns ⌘K / Ctrl+K. The page renders it
 * only when the palette is available (`isNotFoundSearchAvailable`).
 */
export function NotFoundSearchButton() {
  const openSearch = useShellUi((s) => s.openSearch);
  // Decided once: a palette mounted elsewhere (the shell's) is reused instead of a second one.
  const [ownPalette] = useState(() => !useShellUi.getState().searchAvailable);

  return (
    <>
      <Button type="button" variant="outline" size="lg" onClick={openSearch} aria-keyshortcuts="Meta+K Control+K">
        <Search aria-hidden="true" />
        {NOT_FOUND_COPY.search}
        <kbd className="font-mono text-xs text-muted-foreground">⌘K</kbd>
      </Button>
      {ownPalette ? <CommandPalette /> : null}
    </>
  );
}
