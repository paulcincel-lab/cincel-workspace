"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { CircleAlertIcon, LoaderCircleIcon } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/shadcn/alert";
import { Button } from "@/components/ui/shadcn/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/shadcn/dialog";
import { actionErrorText } from "@/lib/errors";
import { cn } from "@/lib/utils";

import { formErrorCopy, type FormSheetProps } from "./FormSheet";

/**
 * `Dialog` form shell (redesign FE §4.11): the `FormSheet` props on a centered
 * dialog, extending the `NewTaskModal` / `ProjectCreateModal` shells (one
 * `<form>`, header, scrollable body, footer "Cancelar" + submit).
 *
 * - Errors: the `error` prop (an action error code goes through
 *   `actionErrorText`, other text is shown as given) or, when `onSubmit`
 *   rejects, the `actionErrorText` of the rejection, in an inline destructive
 *   `Alert` above the sticky footer (FE §9). The dialog never closes itself
 *   after a successful submit: the caller decides through `onOpenChange`.
 * - `dismissible` (default `true`): when `false`, Escape and outside click do
 *   not close, the close button and "Cancelar" are hidden, and only the submit
 *   remains (required `ClockInPrompt`). The same inline `Alert` and footer.
 * - Focus is trapped while open and returns to the element that opened it
 *   (Base UI `Dialog` focus management, as in the `Sheet` editors).
 * - Ignores the presentation style: the same shell in Visual, Esencial and
 *   Analítico.
 */
export type FormDialogProps = FormSheetProps & { dismissible?: boolean };

const SIZE_CLASS: Record<NonNullable<FormSheetProps["size"]>, string> = {
  md: "sm:max-w-[480px]",
  lg: "sm:max-w-[720px]",
};

export function FormDialog({
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
  dismissible = true,
}: FormDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [prevOpen, setPrevOpen] = useState(open);
  const inFlight = useRef(false);
  const mounted = useRef(true);

  // A fresh open starts without the previous attempt's error.
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setSubmitError(null);
  }

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const busy = pending || submitting;
  const errorCopy = submitError ?? formErrorCopy(error);

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

  return (
    <Dialog
      open={open}
      disablePointerDismissal={!dismissible}
      onOpenChange={(next, details) => {
        if (!next && !dismissible) {
          details.cancel();
          return;
        }
        onOpenChange(next);
      }}
    >
      <DialogContent
        showCloseButton={dismissible}
        finalFocus
        data-form-dialog={size}
        data-dismissible={dismissible ? "true" : "false"}
        className={cn(
          "flex max-h-[calc(100dvh-2rem)] flex-col gap-0 p-0 motion-reduce:animate-none",
          SIZE_CLASS[size],
        )}
      >
        <form
          noValidate
          onSubmit={handleSubmit}
          aria-busy={busy || undefined}
          className="flex min-h-0 flex-1 flex-col"
        >
          <DialogHeader className="p-4 pb-2 pr-10">
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
          <div data-slot="form-dialog-body" className="min-h-0 flex-1 overflow-y-auto px-4 py-2">
            {children}
          </div>
          <div data-slot="form-dialog-footer" className="sticky bottom-0 mt-auto">
            {errorCopy ? (
              <div className="px-4 pt-2 pb-4">
                <Alert variant="destructive">
                  <CircleAlertIcon aria-hidden="true" />
                  <AlertDescription>{errorCopy}</AlertDescription>
                </Alert>
              </div>
            ) : null}
            <DialogFooter className="m-0 flex-row justify-end">
              {dismissible ? (
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancelar
                </Button>
              ) : null}
              <Button type="submit" disabled={busy}>
                {busy ? (
                  <LoaderCircleIcon aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
                ) : null}
                {submitLabel}
              </Button>
            </DialogFooter>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
