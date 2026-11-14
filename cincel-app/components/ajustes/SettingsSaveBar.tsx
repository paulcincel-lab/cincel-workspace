"use client";

import { Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/shadcn/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/shadcn/alert";
import { Button } from "@/components/ui/shadcn/button";

export type SettingsSaveBarProps = {
  /** Changed fields not saved yet (0 = clean). */
  dirtyCount: number;
  saving: boolean;
  onDiscard(): void;
  onSave(): void;
  /** "Guardar" by default; Perfil uses "Guardar cambios". */
  saveLabel?: string;
  /** Save error (`mutationErrorText`), shown above the bar as a destructive alert. */
  error?: string | null;
  /** Left text while there are unsaved changes, in place of the count (Horario: "Los cambios se aplican desde mañana."). */
  status?: string;
};

export const LEAVE_TITLE = "¿Salir sin guardar?";
export const LEAVE_DESCRIPTION = "Tienes cambios sin guardar. Si sales ahora se pierden.";

/** "1 cambio sin guardar" / "3 cambios sin guardar"; empty when clean. */
export function dirtyText(count: number): string {
  if (count <= 0) return "";
  return count === 1 ? "1 cambio sin guardar" : `${count} cambios sin guardar`;
}

/** The internal href a click on `target` would open, or null (external, new tab, modifier keys, same page). */
function interceptableHref(event: MouseEvent): string | null {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return null;
  }
  const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
  if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return null;
  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) return null;
  if (url.pathname === window.location.pathname && url.search === window.location.search) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * Save bar of an Ajustes form (canvas `Ajustes-*`): sticky at the end of the
 * content column (16 px from the bottom), the dirty count on the left and
 * "Descartar" / "Guardar" on the right. Both are inert while the form is
 * clean or saving (`aria-disabled`, so focus stays on "Guardar" after a
 * save); saving shows a spinner and "Guardando…". While there are unsaved
 * changes, leaving the page through a link asks "¿Salir sin guardar?" and
 * closing or reloading the tab asks the browser's own confirmation.
 */
export function SettingsSaveBar({
  dirtyCount,
  saving,
  onDiscard,
  onSave,
  saveLabel = "Guardar",
  error,
  status,
}: SettingsSaveBarProps) {
  const router = useRouter();
  const [leaveHref, setLeaveHref] = useState<string | null>(null);
  const dirty = dirtyCount > 0;
  const inert = !dirty || saving;

  useEffect(() => {
    if (!dirty) return;
    const onClick = (event: MouseEvent) => {
      const href = interceptableHref(event);
      if (!href) return;
      event.preventDefault();
      event.stopPropagation();
      setLeaveHref(href);
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    document.addEventListener("click", onClick, true);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [dirty]);

  return (
    <>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div
        data-slot="settings-save-bar"
        className="sticky bottom-4 z-10 flex w-full flex-wrap items-center justify-between gap-3 rounded-[14px] border border-border bg-card px-4 py-3 shadow-md"
      >
        <p role="status" aria-live="polite" className="text-[13px] text-muted-foreground">
          {status && dirtyCount > 0 ? status : dirtyText(dirtyCount)}
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            aria-disabled={inert || undefined}
            className="aria-disabled:pointer-events-none aria-disabled:opacity-50"
            onClick={() => {
              if (!inert) onDiscard();
            }}
          >
            Descartar
          </Button>
          <Button
            type="button"
            aria-disabled={inert || undefined}
            aria-busy={saving || undefined}
            className="aria-disabled:opacity-50"
            onClick={() => {
              if (!inert) onSave();
            }}
          >
            {saving ? (
              <>
                <Loader2Icon aria-hidden="true" data-icon="inline-start" className="spin" />
                Guardando…
              </>
            ) : (
              saveLabel
            )}
          </Button>
        </div>
      </div>
      <AlertDialog
        open={leaveHref !== null}
        onOpenChange={(open) => {
          if (!open) setLeaveHref(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{LEAVE_TITLE}</AlertDialogTitle>
            <AlertDialogDescription>{LEAVE_DESCRIPTION}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Seguir editando</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const href = leaveHref;
                setLeaveHref(null);
                if (href) router.push(href);
              }}
            >
              Salir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
