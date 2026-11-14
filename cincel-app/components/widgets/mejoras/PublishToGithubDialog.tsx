"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/shadcn/alert";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { Checkbox } from "@/components/ui/shadcn/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/shadcn/dialog";
import { FormField } from "@/components/ui/shadcn/form-field";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import { Textarea } from "@/components/ui/shadcn/textarea";
import { getPublishDraftAction, publishTicketAction } from "@/lib/actions/mejoras-actions";
import { unwrapActionResult } from "@/lib/actions/action-result";
import { actionErrorCode } from "@/lib/errors";
import { qk } from "@/lib/query/keys";
import { mutationErrorText, useActionMutation } from "@/lib/query/mutation";
import { PUBLISH_CHECKLIST_TEXT, publishErrorText } from "@/lib/soporte/publish-draft";
import { TICKET_TITLE_MAX, TICKET_TITLE_MIN } from "@/lib/validation/soporte";
import type { PublishDraftData, PublishTicketInput } from "@/lib/types/soporte";

export type PublishToGithubDialogProps = {
  ticketId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const BODY_MAX = 60_000;

/**
 * "Publicar en GitHub…": the redacted template, editable, the `rfc` + kind
 * labels and the checklist the admin must tick. The repository is public, so
 * the button stays disabled until the checklist is ticked; the action checks it again.
 */
export function PublishToGithubDialog({ ticketId, open, onOpenChange }: PublishToGithubDialogProps) {
  const draft = useQuery({
    queryKey: [...qk.mejoras.all, "publish-draft", ticketId],
    queryFn: async () => unwrapActionResult(await getPublishDraftAction(ticketId)),
    enabled: open,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-dvh overflow-y-auto max-sm:top-0 max-sm:left-0 max-sm:h-dvh max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:content-start max-sm:rounded-none sm:max-w-2xl">
        {draft.data ? (
          <PublishForm ticketId={ticketId} draft={draft.data} onDone={() => onOpenChange(false)} />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Publicar en GitHub</DialogTitle>
              <DialogDescription>Revisa lo que se va a publicar en el repositorio público.</DialogDescription>
            </DialogHeader>
            {draft.isError ? (
              <Alert variant="destructive">
                <AlertDescription>
                  {publishErrorText(actionErrorCode(draft.error)) ?? mutationErrorText(draft.error)}
                </AlertDescription>
              </Alert>
            ) : (
              <div className="grid gap-3" aria-busy="true">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-48 w-full" />
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cerrar
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PublishForm({ ticketId, draft, onDone }: { ticketId: string; draft: PublishDraftData; onDone: () => void }) {
  const [title, setTitle] = useState(draft.title);
  const [body, setBody] = useState(draft.body);
  const [confirmed, setConfirmed] = useState(false);

  const publish = useActionMutation((input: PublishTicketInput) => publishTicketAction(ticketId, input), {
    invalidate: [qk.soporte.ticket(ticketId), qk.soporte.all, qk.mejoras.all],
    onFormError: () => {},
  });

  const trimmedTitle = title.trim();
  const titleValid = trimmedTitle.length >= TICKET_TITLE_MIN && trimmedTitle.length <= TICKET_TITLE_MAX;
  const bodyValid = body.trim().length > 0 && body.length <= BODY_MAX;
  const blocked = draft.published !== null || !draft.configured;
  const canPublish = confirmed && titleValid && bodyValid && !blocked && !publish.isPending;

  const errorCode = publish.error ? actionErrorCode(publish.error) : "";
  const errorText = publish.error ? (publishErrorText(errorCode) ?? mutationErrorText(publish.error)) : null;
  const inlineError = draft.published
    ? `Esta solicitud ya se publicó en GitHub (#${draft.published.number}).`
    : !draft.configured
      ? "GitHub no está configurado."
      : errorText;

  function submit() {
    if (!canPublish) return;
    publish.mutate(
      { title: trimmedTitle, body: body.trim(), labels: draft.labels, confirmedRedaction: true },
      {
        onSuccess: (issue) => {
          onDone();
          toast.success(`${draft.code} publicada en GitHub (#${issue.number}).`, {
            action: { label: "Ver", onClick: () => window.open(issue.url, "_blank", "noopener,noreferrer") },
          });
        },
      },
    );
  }

  return (
    <form
      className="grid gap-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <DialogHeader>
        <DialogTitle>Publicar en GitHub</DialogTitle>
        <DialogDescription>
          El repositorio es público. Revisa y edita el texto: limpiamos correos, teléfonos y nombres conocidos, pero tú
          decides qué se publica.
        </DialogDescription>
      </DialogHeader>

      {draft.redacted ? (
        <Alert>
          <AlertDescription>Se quitaron datos personales del texto original. Revisa que no falte nada.</AlertDescription>
        </Alert>
      ) : null}

      <FormField className="grid gap-1.5">
        <Label>Título</Label>
        <Input
          value={title}
          maxLength={TICKET_TITLE_MAX}
          aria-invalid={titleValid ? undefined : true}
          onChange={(event) => setTitle(event.target.value)}
        />
      </FormField>

      <FormField className="grid gap-1.5">
        <Label>Descripción</Label>
        <Textarea
          rows={14}
          value={body}
          className="font-mono text-xs"
          aria-invalid={bodyValid ? undefined : true}
          onChange={(event) => setBody(event.target.value)}
        />
      </FormField>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Etiquetas</span>
        {draft.labels.map((label) => (
          <Badge key={label} variant="secondary">
            {label}
          </Badge>
        ))}
      </div>

      <label className="flex items-start gap-2 text-sm">
        <Checkbox
          className="mt-0.5"
          checked={confirmed}
          disabled={blocked}
          onCheckedChange={(checked) => setConfirmed(checked === true)}
        />
        <span>{PUBLISH_CHECKLIST_TEXT}</span>
      </label>

      {inlineError ? (
        <p role="alert" className="text-sm text-destructive">
          {inlineError}
        </p>
      ) : null}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" disabled={!canPublish}>
          {publish.isPending ? "Publicando…" : "Publicar en GitHub"}
        </Button>
      </DialogFooter>
    </form>
  );
}
