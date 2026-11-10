"use client";

import { useEffect, useId, useRef, useSyncExternalStore, type ReactNode } from "react";
import { XIcon } from "lucide-react";

import { Button } from "@/components/ui/shadcn/button";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/shadcn/sheet";
import { cn } from "@/lib/utils";

/** From this width the editor sits next to the list; below it opens as a `Sheet`. */
export const CATALOG_INLINE_QUERY = "(min-width: 1024px)";
/** Below this width the `Sheet` opens from the bottom instead of the right. */
export const CATALOG_BOTTOM_SHEET_QUERY = "(max-width: 639px)";

const subscribers = new Map<string, (onChange: () => void) => () => void>();

/** One stable subscribe function per query, so `useSyncExternalStore` doesn't resubscribe on every render. */
function subscribeTo(query: string) {
  let subscribe = subscribers.get(query);
  if (!subscribe) {
    subscribe = (onChange: () => void) => {
      if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    };
    subscribers.set(query, subscribe);
  }
  return subscribe;
}

/** Whether a media query matches; `serverValue` on the server and where `matchMedia` is missing. */
export function useMediaQuery(query: string, serverValue: boolean): boolean {
  return useSyncExternalStore(
    subscribeTo(query),
    () => (typeof window.matchMedia === "function" ? window.matchMedia(query).matches : serverValue),
    () => serverValue,
  );
}

export type CatalogEditorPanelProps = {
  title: string;
  open: boolean;
  onClose(): void;
  footer: ReactNode;
  children: ReactNode;
  /** Shown before the title (the tramo's color dot). */
  titleAdornment?: ReactNode;
  /** The panel's basis width next to the list, in px (340 by default, 360 for Tramos). */
  width?: 340 | 360;
  /** Where focus goes back on close (the row's "•••" button); defaults to what had focus on open. */
  returnFocus?: () => HTMLElement | null | undefined;
};

/**
 * The editor of an Ajustes catalog (Estatus, Puestos, Tramos): at 1024 px and
 * up an inline card next to the list (`<aside class="drawer">`, sticky at the
 * top, `anim-in`), below it a shadcn `Sheet` (from the right; from the bottom
 * on a phone). Escape and "Cerrar" close it; focus moves to the title on open
 * and back to the row's action on close. The layout ignores the presentation
 * style: one layout for every style.
 */
export function CatalogEditorPanel({
  title,
  open,
  onClose,
  footer,
  children,
  titleAdornment,
  width = 340,
  returnFocus,
}: CatalogEditorPanelProps) {
  const inline = useMediaQuery(CATALOG_INLINE_QUERY, true);
  const bottom = useMediaQuery(CATALOG_BOTTOM_SHEET_QUERY, false);
  const titleId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const returnFocusRef = useRef(returnFocus);
  useEffect(() => {
    returnFocusRef.current = returnFocus;
  });

  // Focus: the title on open; on close, back to the row's action (or whatever opened the panel).
  useEffect(() => {
    if (!open) return;
    const active = document.activeElement;
    opener.current = active instanceof HTMLElement && active !== document.body ? active : null;
    if (inline) titleRef.current?.focus();
    return () => {
      const target = returnFocusRef.current?.() ?? opener.current;
      if (target && target.isConnected) {
        // After the panel unmounts and any menu restored its own focus.
        requestAnimationFrame(() => target.focus());
      }
    };
  }, [open, inline]);

  if (!inline) {
    return (
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
      >
        <SheetContent
          side={bottom ? "bottom" : "right"}
          className={cn("overflow-y-auto text-foreground", bottom ? "max-h-[90vh]" : "w-full sm:max-w-[420px]")}
        >
          <SheetHeader className="pr-12">
            <SheetTitle className="flex items-center gap-2 text-[15px] font-semibold">
              {titleAdornment}
              {title}
            </SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-5 px-4">{children}</div>
          <SheetFooter>{footer}</SheetFooter>
        </SheetContent>
      </Sheet>
    );
  }

  if (!open) return null;

  return (
    <aside
      aria-labelledby={titleId}
      className={cn(
        "drawer anim-in sticky top-6 flex min-w-0 flex-col gap-5 self-start rounded-[14px] border border-border bg-card p-5 text-card-foreground shadow-xs",
        width === 360 ? "flex-[1_1_360px]" : "flex-[1_1_340px]",
      )}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || event.defaultPrevented) return;
        // Escape inside a portaled popup (Select, menu) bubbles here through React; let the popup close alone.
        if (!(event.target instanceof Node) || !event.currentTarget.contains(event.target)) return;
        event.preventDefault();
        onClose();
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <h2
          id={titleId}
          ref={titleRef}
          tabIndex={-1}
          className="flex min-w-0 items-center gap-2 text-[15px] font-semibold text-foreground outline-none"
        >
          {titleAdornment}
          <span className="min-w-0 break-words">{title}</span>
        </h2>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Cerrar" onClick={onClose}>
          <XIcon aria-hidden="true" />
        </Button>
      </div>
      <div className="flex flex-col gap-5">{children}</div>
      <div className="border-t border-border pt-4">{footer}</div>
    </aside>
  );
}

/** List section + editor panel side by side, wrapping under each other when narrow (gap 16 px). */
export function CatalogLayout({ children, panel }: { children: ReactNode; panel: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start gap-4">
      <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-4">{children}</div>
      {panel}
    </div>
  );
}
