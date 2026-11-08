"use client";

import { useId, useRef, useState } from "react";
import { SendIcon } from "lucide-react";
import { toast } from "sonner";

import { FormDialog } from "@/components/patterns/FormDialog";
import { FormSheet } from "@/components/patterns/FormSheet";
import { Button } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import { Textarea } from "@/components/ui/shadcn/textarea";
import { createGmailDraftAction, sendGmailDraftAction } from "@/lib/actions/gmail-actions";
import { IMPLEMENTED } from "@/lib/actions/gmail-actions.flags";
import { actionErrorCode, actionErrorText } from "@/lib/errors";
import { qk } from "@/lib/query/keys";
import { useActionMutation } from "@/lib/query/mutation";
import type { GmailDraft } from "@/lib/types/redesign";

import { parseRecipients, recipientsLabel } from "./gmail-format";

export type GmailDraftSheetProps = {
  open: boolean;
  replyToThreadId?: string;
  to?: string[];
  subject?: string;
  onOpenChange(open: boolean): void;
};

/** Codes that mean the confirmation token is no longer good: re-save for a fresh one and ask again. */
const TOKEN_CODES = new Set(["EXPIRED", "CONFIRM_REQUIRED"]);

/**
 * Reply draft (redesign FE §3.3) on `FormSheet`. Every save calls
 * `createGmailDraftAction` with the current `draftId`, so Gmail keeps one
 * draft. "Enviar" never sends: it saves the latest text and opens the
 * `FormDialog` "¿Enviar este correo a {destinatarios}?", whose confirm button
 * is the only caller of `sendGmailDraftAction(draftId, confirmToken)`. A sent
 * reply refreshes the thread and the Bandeja list (`me.gmail.*`); saving a
 * draft changes no cached data.
 */
export function GmailDraftSheet({ open, replyToThreadId, to, subject, onOpenChange }: GmailDraftSheetProps) {
  const fieldId = useId();
  const [toText, setToText] = useState((to ?? []).join(", "));
  const [subjectText, setSubjectText] = useState(subject ?? "");
  const [body, setBody] = useState("");
  const [draft, setDraft] = useState<GmailDraft | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmPending, setConfirmPending] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirmTo, setConfirmTo] = useState<string[]>([]);
  // Survives in-flight saves, so a second save never creates a second draft. Tagged with the
  // opening it belongs to, so a new opening starts a new draft.
  const draftIdRef = useRef<{ opening: number; id: string } | null>(null);
  const [opening, setOpening] = useState(0);
  const sendButtonRef = useRef<HTMLButtonElement>(null);

  // Each opening starts from the props (an earlier draft stays in Gmail).
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setToText((to ?? []).join(", "));
      setSubjectText(subject ?? "");
      setBody("");
      setDraft(null);
      setError(null);
      setConfirmOpen(false);
      setConfirmError(null);
      setOpening((n) => n + 1);
    }
  }

  const canSend = IMPLEMENTED.sendGmailDraftAction;

  // Errors stay in the sheet / dialog (the handlers below), never as a toast.
  const draftMutation = useActionMutation<Parameters<typeof createGmailDraftAction>[0], GmailDraft>(
    createGmailDraftAction,
    { onFormError: () => undefined },
  );
  const sendMutation = useActionMutation<{ draftId: string; confirmToken: string }, { messageId: string }>(
    ({ draftId, confirmToken }) => sendGmailDraftAction(draftId, confirmToken),
    {
      invalidate: replyToThreadId
        ? [qk.me.gmail.thread(replyToThreadId), qk.me.gmail.threads()]
        : [qk.me.gmail.threads()],
      onFormError: () => undefined,
    },
  );

  async function saveDraft(): Promise<GmailDraft> {
    const recipients = parseRecipients(toText);
    if (recipients.length === 0) throw new Error("INVALID: to");
    const draftId = draftIdRef.current?.opening === opening ? draftIdRef.current.id : undefined;
    const saved: GmailDraft = await draftMutation.mutateAsync({
      to: recipients,
      subject: subjectText.trim(),
      body,
      ...(replyToThreadId ? { replyToThreadId } : {}),
      ...(draftId ? { draftId } : {}),
    });
    draftIdRef.current = { opening, id: saved.draftId };
    setDraft(saved);
    return saved;
  }

  async function handleSave() {
    setPending(true);
    setError(null);
    try {
      await saveDraft();
      toast.success("Borrador guardado");
    } catch (err) {
      setError(actionErrorText(err, "gmail"));
    } finally {
      setPending(false);
    }
  }

  async function handleSendClick() {
    setPending(true);
    setError(null);
    try {
      await saveDraft();
      setConfirmTo(parseRecipients(toText));
      setConfirmError(null);
      setConfirmOpen(true);
    } catch (err) {
      setError(actionErrorText(err, "gmail"));
    } finally {
      setPending(false);
    }
  }

  async function handleConfirmSend() {
    if (!draft) {
      setConfirmError(actionErrorText(new Error("CONFIRM_REQUIRED"), "gmail"));
      return;
    }
    setConfirmPending(true);
    setConfirmError(null);
    try {
      await sendMutation.mutateAsync({ draftId: draft.draftId, confirmToken: draft.confirmToken });
      setConfirmOpen(false);
      draftIdRef.current = null;
      setDraft(null);
      toast.success("Correo enviado");
      onOpenChange(false);
    } catch (err) {
      setConfirmError(actionErrorText(err, "gmail"));
      if (TOKEN_CODES.has(actionErrorCode(err))) {
        // Re-save the same draft for a fresh token; the person confirms again.
        try {
          await saveDraft();
        } catch (saveErr) {
          setConfirmError(actionErrorText(saveErr, "gmail"));
        }
      }
    } finally {
      setConfirmPending(false);
    }
  }

  function handleConfirmOpenChange(next: boolean) {
    setConfirmOpen(next);
    if (!next) {
      setConfirmError(null);
      sendButtonRef.current?.focus();
    }
  }

  const toId = `${fieldId}-to`;
  const subjectId = `${fieldId}-subject`;
  const bodyId = `${fieldId}-body`;

  return (
    <>
      <FormSheet
        title={replyToThreadId ? "Responder" : "Nuevo correo"}
        description="Se guarda como borrador en tu Gmail. Solo se envía cuando lo confirmas."
        open={open}
        onOpenChange={onOpenChange}
        onSubmit={handleSave}
        submitLabel="Guardar borrador"
        pending={pending}
        error={error}
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={toId}>Para</Label>
            <Input
              id={toId}
              type="text"
              inputMode="email"
              autoComplete="off"
              value={toText}
              onChange={(e) => setToText(e.target.value)}
              placeholder="correo@ejemplo.com"
              aria-describedby={`${toId}-hint`}
            />
            <p id={`${toId}-hint`} className="text-xs text-muted-foreground">
              Separa varios destinatarios con comas.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={subjectId}>Asunto</Label>
            <Input id={subjectId} type="text" value={subjectText} onChange={(e) => setSubjectText(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={bodyId}>Mensaje</Label>
            <Textarea id={bodyId} rows={10} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
          {canSend ? (
            <div className="flex justify-end">
              <Button ref={sendButtonRef} type="button" onClick={handleSendClick} disabled={pending}>
                <SendIcon aria-hidden="true" strokeWidth={1.9} />
                Enviar
              </Button>
            </div>
          ) : null}
        </div>
      </FormSheet>

      {canSend ? (
        <FormDialog
          title={`¿Enviar este correo a ${recipientsLabel(confirmTo)}?`}
          description="Al confirmar, Gmail lo envía desde tu cuenta."
          open={confirmOpen}
          onOpenChange={handleConfirmOpenChange}
          onSubmit={handleConfirmSend}
          submitLabel="Enviar"
          pending={confirmPending}
          error={confirmError}
        >
          <p className="text-sm text-muted-foreground">
            Asunto: <span className="text-foreground">{subjectText.trim() || "(sin asunto)"}</span>
          </p>
        </FormDialog>
      ) : null}
    </>
  );
}
