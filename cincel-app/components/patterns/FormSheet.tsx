"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { CircleAlertIcon, LoaderCircleIcon } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/shadcn/alert";
import { Button } from "@/components/ui/shadcn/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/shadcn/sheet";
import { actionErrorCode, actionErrorText } from "@/lib/errors";

/**
 * Right `Sheet` form shell (redesign FE §4.11): sticky footer "Cancelar" +
 * submit, inline `Alert` for errors through `actionErrorText`.
 *
 * Built on the same shadcn `Sheet` primitives as `MemberEditorDrawer`,
 * `ContactEditorSheet` and `TaskDrawer`, so those editors move onto this shell
 * when their redesigned screens land. Focus is trapped while open, Escape and
 * "Cancelar" call `onOpenChange(false)`, and focus returns to the element that
 * opened the sheet. The shell never closes itself after a successful submit:
 * the caller decides through `onOpenChange`. It ignores the presentation style.
 */
export type FormSheetProps = {
  title: string;
  description?: string;
  open: boolean;
  onOpenChange(o: boolean): void;
  onSubmit(): Promise<void>;
  submitLabel: string;
  pending?: boolean;
  error?: string | null;
  size?: "md" | "lg";
  children: ReactNode;
};

/** Width per size; widths only, color always comes from the primitives' tokens. */
const SIZE_CLASS: Record<NonNullable<FormSheetProps["size"]>, string> = {
  md: "w-full data-[side=right]:sm:max-w-[560px]",
  lg: "w-full data-[side=right]:sm:max-w-[800px]",
};

/**
 * Copy for the `error` prop: an action error code ("FORBIDDEN",
 * "INVALID: …") goes through `actionErrorText`; any other text is already
 * user-facing copy and is shown as given.
 */
export function formErrorCopy(error: string | null | undefined): string | null {
  if (!error) return null;
  return actionErrorCode(error) ? actionErrorText(error) : error;
}

export function FormSheet({
  title,
  description,
  open,
  onOpenChange,
  onSubmit,
  submitLabel,
  pending = false,
  error = null,
  size = "md",
  children,
}: FormSheetProps) {
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // A fresh open starts without the previous attempt's error.
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) setSubmitError(null);
  }

  const busy = pending || submitting;

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (inFlight.current || pending) return;
      inFlight.current = true;
      setSubmitting(true);
      setSubmitError(null);
      try {
        await onSubmit();
      } catch (err) {
        if (mounted.current) setSubmitError(actionErrorText(err));
      } finally {
        inFlight.current = false;
        if (mounted.current) setSubmitting(false);
      }
    },
    [onSubmit, pending],
  );

  const errorCopy = submitError ?? formErrorCopy(error);

  return (
    <Sheet open={open} onOpenChange={(next) => onOpenChange(next)}>
      <SheetContent
        side="right"
        finalFocus
        data-form-sheet={size}
        className={`${SIZE_CLASS[size]} gap-0 p-0 motion-reduce:transition-none`}
      >
        <SheetHeader className="border-b pr-12">
          <SheetTitle>{title}</SheetTitle>
          {description ? <SheetDescription>{description}</SheetDescription> : null}
        </SheetHeader>

        <form
          noValidate
          aria-busy={busy || undefined}
          onSubmit={handleSubmit}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div data-slot="form-sheet-body" className="min-h-0 flex-1 overflow-y-auto p-4">
            {children}
          </div>

          <div data-slot="form-sheet-footer" className="sticky bottom-0 border-t">
            {errorCopy ? (
              <div className="px-4 pt-4">
                <Alert variant="destructive">
                  <CircleAlertIcon aria-hidden="true" />
                  <AlertDescription>{errorCopy}</AlertDescription>
                </Alert>
              </div>
            ) : null}
            <SheetFooter className="mt-0 flex-row justify-end">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? (
                  <LoaderCircleIcon aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
                ) : null}
                {submitLabel}
              </Button>
            </SheetFooter>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
