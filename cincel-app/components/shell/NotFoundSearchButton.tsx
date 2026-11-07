"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";

import { CommandPalette } from "@/components/shell/CommandPalette";
import { Button } from "@/components/ui/shadcn/button";
import { NOT_FOUND_COPY } from "@/lib/ui/route-states";

/**
 * "Buscar" on the staff not-found page (redesign FE §3.12, frame `Error404`):
 * opens `CommandPalette`, also with ⌘K / Ctrl+K. The page renders it only when
 * the palette is available (`isNotFoundSearchAvailable`).
 */
export function NotFoundSearchButton() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <Button type="button" variant="outline" size="lg" onClick={() => setOpen(true)} aria-keyshortcuts="Meta+K Control+K">
        <Search aria-hidden="true" />
        {NOT_FOUND_COPY.search}
        <kbd className="font-mono text-xs text-muted-foreground">⌘K</kbd>
      </Button>
      <CommandPalette open={open} onOpenChange={setOpen} />
    </>
  );
}
