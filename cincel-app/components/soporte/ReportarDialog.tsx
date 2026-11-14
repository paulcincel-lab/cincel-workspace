"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronDownIcon } from "lucide-react";
import { toast } from "sonner";

import { AttachmentPicker } from "@/components/soporte/AttachmentPicker";
import { Button } from "@/components/ui/shadcn/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/shadcn/dialog";
import { FormField } from "@/components/ui/shadcn/form-field";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/shadcn/tabs";
import { Textarea } from "@/components/ui/shadcn/textarea";
import { createTicketAction } from "@/lib/actions/soporte-actions";
import { qk } from "@/lib/query/keys";
import { useActionMutation } from "@/lib/query/mutation";
import { uploadTicketAttachments } from "@/lib/soporte/attachments-client";
import { SOPORTE_ENABLED } from "@/lib/soporte/flags";
import {
  DESCRIPTION_LABEL,
  captureClientContext,
  contextRows,
  validateDraft,
} from "@/lib/soporte/reportar";
import { useSoporteDraft } from "@/lib/stores/soporte-draft";
import { KIND_LABEL, TICKET_KINDS, type TicketDraft, type TicketKind } from "@/lib/types/soporte";
import { APP_VERSION } from "@/lib/version";

export type ReportarDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Prefilled values, e.g. from an error page. Applied once each time the dialog opens. */
  prefill?: Partial<TicketDraft>;
};

/** Where "Ver" in the success toast goes. */
export const MIS_SOLICITUDES_HREF = "/ajustes/solicitudes";

/**
 * "Reportar o sugerir": kind, title, text, steps (only for "Algo falla") and
 * the read-only context line. The draft lives in `useSoporteDraft`, so closing
 * keeps what was typed; success clears it. Full-height sheet on phones.
 */
export function ReportarDialog({ open, onOpenChange, prefill }: ReportarDialogProps) {
  const patchDraft = useSoporteDraft((s) => s.patchDraft);
  const appliedFor = useRef<ReportarDialogProps["prefill"] | null>(null);

  useEffect(() => {
    if (!open) {
      appliedFor.current = null;
      return;
    }
    if (prefill && appliedFor.current !== prefill) {
      appliedFor.current = prefill;
      patchDraft(prefill);
    }
  }, [open, prefill, patchDraft]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-sm:top-0 max-sm:left-0 max-sm:h-dvh max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:content-start max-sm:overflow-y-auto max-sm:rounded-none sm:max-w-lg">
        <ReportarForm onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function ReportarForm({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const qc = useQueryClient();
  const draft = useSoporteDraft((s) => s.draft);
  const patchDraft = useSoporteDraft((s) => s.patchDraft);
  const clearDraft = useSoporteDraft((s) => s.clearDraft);
  const [context] = useState(captureClientContext);
  const [showContext, setShowContext] = useState(false);
  const [touched, setTouched] = useState<{ title: boolean; description: boolean }>({ title: false, description: false });
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // Images stay in the form (a `File` is not draft text): they upload once the solicitud exists.
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

  const create = useActionMutation(createTicketAction, {
    invalidate: [qk.soporte.all],
    onFormError: setFormError,
  });

  const errors = validateDraft(draft);
  const titleError = submitted || touched.title ? errors.title : undefined;
  const descriptionError = submitted || touched.description ? errors.description : undefined;
  const isError = draft.kind === "error";

  function submit() {
    setSubmitted(true);
    setFormError(null);
    if (Object.keys(errors).length > 0) return;
    create.mutate(
      {
        kind: draft.kind,
        title: draft.title.trim(),
        description: draft.description.trim(),
        steps: isError ? draft.steps?.trim() || null : null,
        context: captureClientContext(),
      },
      {
        onSuccess: async (ticket) => {
          clearDraft();
          // The solicitud exists already: a failed image never undoes it, it is reported.
          let failed: { name: string; error: string }[] = [];
          if (files.length > 0) {
            setUploading(true);
            try {
              failed = (await uploadTicketAttachments(ticket.id, files)).failed;
            } catch {
              failed = files.map((file) => ({ name: file.name, error: "No se pudo subir la imagen." }));
            }
            await qc.invalidateQueries({ queryKey: qk.soporte.all });
            setUploading(false);
          }
          onDone();
          toast.success(`Solicitud ${ticket.code} enviada.`, {
            action: { label: "Ver", onClick: () => router.push(MIS_SOLICITUDES_HREF) },
          });
          if (failed.length > 0) {
            toast.error(`No se subieron ${failed.length} imagen(es): ${failed.map((f) => `${f.name || "Imagen"} (${f.error})`).join(", ")}`);
          }
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
        <DialogTitle>Reportar o sugerir</DialogTitle>
        <DialogDescription>Cuéntanos qué pasa o qué mejorarías. Lo revisamos y te respondemos aquí.</DialogDescription>
      </DialogHeader>

      <Tabs value={draft.kind} onValueChange={(value) => patchDraft({ kind: value as TicketKind })}>
        <TabsList aria-label="Tipo de solicitud" className="w-full">
          {TICKET_KINDS.map((kind) => (
            <TabsTrigger key={kind} value={kind} className="flex-1">
              {KIND_LABEL[kind]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <FormField className="grid gap-1.5">
        <Label>Título</Label>
        <Input
          value={draft.title}
          maxLength={200}
          aria-invalid={titleError ? true : undefined}
          aria-describedby={titleError ? "reportar-title-error" : undefined}
          onChange={(event) => patchDraft({ title: event.target.value })}
          onBlur={() => setTouched((t) => ({ ...t, title: true }))}
        />
        {titleError ? (
          <p id="reportar-title-error" role="alert" className="text-xs text-destructive">
            {titleError}
          </p>
        ) : null}
      </FormField>

      <FormField className="grid gap-1.5">
        <Label>{DESCRIPTION_LABEL[draft.kind]}</Label>
        <Textarea
          rows={4}
          value={draft.description}
          aria-invalid={descriptionError ? true : undefined}
          aria-describedby={descriptionError ? "reportar-description-error" : undefined}
          onChange={(event) => patchDraft({ description: event.target.value })}
          onBlur={() => setTouched((t) => ({ ...t, description: true }))}
        />
        {descriptionError ? (
          <p id="reportar-description-error" role="alert" className="text-xs text-destructive">
            {descriptionError}
          </p>
        ) : null}
      </FormField>

      {isError ? (
        <FormField className="grid gap-1.5">
          <Label>
            Pasos para reproducirlo <span className="text-muted-foreground">(opcional)</span>
          </Label>
          <Textarea rows={3} value={draft.steps ?? ""} onChange={(event) => patchDraft({ steps: event.target.value })} />
        </FormField>
      ) : null}

      <AttachmentPicker files={files} onChange={setFiles} disabled={create.isPending || uploading} />

      <div data-slot="reportar-context" className="text-xs text-muted-foreground">
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-sm text-left focus-visible:outline-2 focus-visible:outline-ring"
          aria-expanded={showContext}
          aria-controls="reportar-context-list"
          onClick={() => setShowContext((v) => !v)}
        >
          Se enviará con: página, estilo, tema, versión
          <ChevronDownIcon aria-hidden="true" className={`size-3.5 ${showContext ? "rotate-180" : ""}`} />
        </button>
        {showContext ? (
          <dl id="reportar-context-list" className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            {contextRows(context, APP_VERSION).map((row) => (
              <div key={row.label} className="contents">
                <dt>{row.label}</dt>
                <dd className="min-w-0 break-words text-foreground">{row.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>

      {formError ? (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      ) : null}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" disabled={create.isPending || uploading}>
          {create.isPending || uploading ? "Enviando…" : "Enviar"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** The one dialog of the staff shell, driven by `useSoporteDraft`; mounted in `AppShellClient`. */
export function ReportarDialogHost() {
  const open = useSoporteDraft((s) => s.open);
  const closeReportar = useSoporteDraft((s) => s.closeReportar);
  if (!SOPORTE_ENABLED) return null;
  return <ReportarDialog open={open} onOpenChange={(next) => (next ? undefined : closeReportar())} />;
}
