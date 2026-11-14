"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AttachmentThumbs } from "@/components/soporte/AttachmentThumbs";
import { TicketTimeline } from "@/components/soporte/TicketTimeline";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/shadcn/dialog";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/shadcn/sheet";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import { Textarea } from "@/components/ui/shadcn/textarea";
import {
  addTicketMessageAction,
  listMejorasAction,
  markDuplicateAction,
  updateTicketAction,
} from "@/lib/actions/mejoras-actions";
import { qk } from "@/lib/query/keys";
import { useActionMutation } from "@/lib/query/mutation";
import { catalogStaffOptions } from "@/lib/query/options/catalog";
import { mejorasListInfiniteOptions, ticketOptions } from "@/lib/query/options/soporte";
import { SOPORTE_GITHUB_ENABLED } from "@/lib/soporte/flags";
import {
  AREA_LABEL,
  KIND_LABEL,
  PRIORITY_LABEL,
  STATUS_LABEL,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  type TicketDetail,
  type TicketPatch,
  type TicketPriority,
  type TicketStatus,
  type TicketVisibility,
} from "@/lib/types/soporte";

import { PublishToGithubDialog } from "./PublishToGithubDialog";

export type TicketDetailDrawerProps = {
  /** Code in the `?solicitud=` URL param, e.g. `SOL-0123`; null = closed. */
  code: string | null;
  onClose: () => void;
};

const NONE = "__none__";

const invalidateAfterWrite = (id: string) => [qk.soporte.ticket(id), qk.soporte.all, qk.mejoras.all];

/** The code of the URL param resolved to the solicitud id (the actions take ids). */
function useTicketIdByCode(code: string | null) {
  return useQuery({
    queryKey: [...qk.mejoras.all, "resolve", code] as const,
    queryFn: async () => {
      const page = await listMejorasAction({ q: code ?? "" });
      return page.rows.find((r) => r.code.toLowerCase() === (code ?? "").toLowerCase())?.id ?? null;
    },
    enabled: code !== null && code !== "",
    staleTime: 30_000,
  });
}

/** Mejoras ticket detail drawer: header controls, context, timeline with internal notes, composer and duplicates. */
export function TicketDetailDrawer({ code, onClose }: TicketDetailDrawerProps) {
  const open = code !== null && code !== "";
  const resolved = useTicketIdByCode(code);
  const id = resolved.data ?? null;
  const ticket = useQuery({ ...ticketOptions(id ?? ""), enabled: id !== null });
  const detail = ticket.data ?? null;

  const notFound = open && ((resolved.isSuccess && id === null) || (ticket.isSuccess && detail === null));
  const failed = open && (resolved.isError || ticket.isError);
  const loading = open && !detail && !notFound && !failed;

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-xl">
        {detail ? (
          <DrawerBody key={detail.id} ticket={detail} />
        ) : (
          <>
            <SheetHeader>
              <SheetTitle>{code ?? "Solicitud"}</SheetTitle>
              <SheetDescription>
                {notFound
                  ? "No encontramos esta solicitud."
                  : failed
                    ? "No pudimos cargar la solicitud."
                    : "Cargando solicitud"}
              </SheetDescription>
            </SheetHeader>
            {loading ? (
              <div className="space-y-3 p-4" aria-busy="true">
                <Skeleton className="h-6 w-2/3" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
            ) : null}
            {failed ? (
              <div className="p-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    void resolved.refetch();
                    if (id !== null) void ticket.refetch();
                  }}
                >
                  Reintentar
                </Button>
              </div>
            ) : null}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

function DrawerBody({ ticket }: { ticket: TicketDetail }) {
  const staff = useQuery(catalogStaffOptions());
  const [discardOpen, setDiscardOpen] = useState(false);
  const [discardText, setDiscardText] = useState("");
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);

  const update = useActionMutation((patch: TicketPatch) => updateTicketAction(ticket.id, patch), {
    invalidate: () => invalidateAfterWrite(ticket.id),
  });

  const staffItems = useMemo(
    () => [{ value: NONE, label: "Sin asignar" }, ...(staff.data ?? []).map((s) => ({ value: s.id, label: s.name }))],
    [staff.data],
  );
  const priorityItems = useMemo(
    () => [
      { value: NONE, label: "Sin prioridad" },
      ...TICKET_PRIORITIES.map((p) => ({ value: p as string, label: PRIORITY_LABEL[p] })),
    ],
    [],
  );
  const statusItems = useMemo(() => TICKET_STATUSES.map((s) => ({ value: s as string, label: STATUS_LABEL[s] })), []);

  function onStatus(next: TicketStatus) {
    if (next === ticket.status) return;
    if (next === "descartado") {
      setDiscardOpen(true);
      return;
    }
    setDiscardOpen(false);
    update.mutate({ status: next });
  }

  function confirmDiscard() {
    const message = discardText.trim();
    if (!message) return;
    update.mutate(
      { status: "descartado", message },
      {
        onSuccess: () => {
          setDiscardOpen(false);
          setDiscardText("");
        },
      },
    );
  }

  async function copyLink() {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("solicitud", ticket.code);
      await navigator.clipboard.writeText(url.toString());
      toast.success("Enlace copiado");
    } catch {
      toast.error("No pudimos copiar el enlace");
    }
  }

  const canPublish = SOPORTE_GITHUB_ENABLED && ticket.githubIssueNumber === null;

  return (
    <>
      <SheetHeader className="border-b">
        <div className="flex flex-wrap items-center gap-2 pr-8">
          <span className="font-mono text-xs text-muted-foreground">{ticket.code}</span>
          <Badge variant="secondary">{KIND_LABEL[ticket.kind]}</Badge>
          {ticket.duplicateOf ? <Badge variant="outline">Duplicada de {ticket.duplicateOf.code}</Badge> : null}
        </div>
        <SheetTitle className="text-base font-semibold">{ticket.title}</SheetTitle>
        <SheetDescription className="sr-only">Detalle de la solicitud {ticket.code}</SheetDescription>
        <div className="grid gap-3 pt-1 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="ticket-status">Estado</Label>
            <Select items={statusItems} value={ticket.status} onValueChange={(v) => v && onStatus(v as TicketStatus)}>
              <SelectTrigger id="ticket-status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statusItems.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="ticket-priority">Prioridad</Label>
            <Select
              items={priorityItems}
              value={ticket.priority ?? NONE}
              onValueChange={(v) => {
                if (!v) return;
                const next: TicketPriority | null = v === NONE ? null : (v as TicketPriority);
                if (next !== ticket.priority) update.mutate({ priority: next });
              }}
            >
              <SelectTrigger id="ticket-priority" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {priorityItems.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="ticket-assignee">Asignado</Label>
            <Select
              items={staffItems}
              value={ticket.assignee?.id ?? NONE}
              onValueChange={(v) => {
                if (!v) return;
                const next = v === NONE ? null : (v as string);
                if (next !== (ticket.assignee?.id ?? null)) update.mutate({ assigneeId: next });
              }}
            >
              <SelectTrigger id="ticket-assignee" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {staffItems.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {discardOpen ? (
          <div className="space-y-2 pt-2">
            <Label htmlFor="ticket-discard-reason">Motivo para descartar (lo verá quien la envió)</Label>
            <Textarea
              id="ticket-discard-reason"
              value={discardText}
              onChange={(e) => setDiscardText(e.target.value)}
              rows={3}
            />
            <div className="flex gap-2">
              <Button size="sm" disabled={discardText.trim() === "" || update.isPending} onClick={confirmDiscard}>
                Descartar solicitud
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setDiscardOpen(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2 pt-2">
          <Button size="sm" variant="outline" onClick={() => setDuplicateOpen(true)}>
            Marcar como duplicada…
          </Button>
          {canPublish ? (
            <Button size="sm" variant="outline" onClick={() => setPublishOpen(true)}>
              Publicar en GitHub…
            </Button>
          ) : null}
          {ticket.githubIssueUrl ? (
            <Button
              size="sm"
              variant="outline"
              render={<a href={ticket.githubIssueUrl} target="_blank" rel="noreferrer" />}
            >
              GitHub #{ticket.githubIssueNumber}
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" onClick={() => void copyLink()}>
            Copiar enlace
          </Button>
        </div>
      </SheetHeader>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4">
        <section aria-labelledby="ticket-context" className="space-y-1 text-sm">
          <h3 id="ticket-context" className="text-xs font-semibold text-muted-foreground">
            Contexto
          </h3>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="text-muted-foreground">Autor</dt>
            <dd>{ticket.author.name}</dd>
            <dt className="text-muted-foreground">Enviada</dt>
            <dd>{formatDate(ticket.createdAt)}</dd>
            <dt className="text-muted-foreground">Área</dt>
            <dd>{AREA_LABEL[ticket.area]}</dd>
            <dt className="text-muted-foreground">Página</dt>
            <dd className="min-w-0 break-all">
              <Link href={ticket.context.path} className="underline underline-offset-2">
                {ticket.context.path}
              </Link>
            </dd>
            <dt className="text-muted-foreground">Estilo</dt>
            <dd>{ticket.context.estilo}</dd>
            <dt className="text-muted-foreground">Tema</dt>
            <dd>{ticket.context.theme}</dd>
            <dt className="text-muted-foreground">Versión</dt>
            <dd>{ticket.context.appVersion}</dd>
            <dt className="text-muted-foreground">Navegador</dt>
            <dd className="min-w-0 break-words">{ticket.context.userAgent}</dd>
          </dl>
        </section>

        <section aria-labelledby="ticket-description" className="space-y-1 text-sm">
          <h3 id="ticket-description" className="text-xs font-semibold text-muted-foreground">
            Descripción
          </h3>
          <p className="whitespace-pre-wrap break-words">{ticket.description}</p>
        </section>

        {ticket.steps ? (
          <section aria-labelledby="ticket-steps" className="space-y-1 text-sm">
            <h3 id="ticket-steps" className="text-xs font-semibold text-muted-foreground">
              Pasos para repetirlo
            </h3>
            <p className="whitespace-pre-wrap break-words">{ticket.steps}</p>
          </section>
        ) : null}

        {ticket.attachments.length > 0 ? (
          <section aria-labelledby="ticket-attachments" className="space-y-2 text-sm">
            <h3 id="ticket-attachments" className="text-xs font-semibold text-muted-foreground">
              Adjuntos
            </h3>
            <AttachmentThumbs attachments={ticket.attachments} />
          </section>
        ) : null}

        <section aria-labelledby="ticket-timeline" className="space-y-2">
          <h3 id="ticket-timeline" className="text-xs font-semibold text-muted-foreground">
            Historial
          </h3>
          <TicketTimeline events={ticket.events} showInternal />
        </section>
      </div>

      <Composer ticketId={ticket.id} />

      <DuplicateDialog ticket={ticket} open={duplicateOpen} onOpenChange={setDuplicateOpen} />
      {canPublish ? (
        <PublishToGithubDialog ticketId={ticket.id} open={publishOpen} onOpenChange={setPublishOpen} />
      ) : null}
    </>
  );
}

/** Reply / internal note composer. Defaults to "Nota interna" so a reply is always a deliberate choice (S7). */
function Composer({ ticketId }: { ticketId: string }) {
  const [mode, setMode] = useState<TicketVisibility>("internal");
  const [text, setText] = useState("");

  const send = useActionMutation(
    (vars: { text: string; visibility: TicketVisibility }) => addTicketMessageAction(ticketId, vars),
    { invalidate: () => invalidateAfterWrite(ticketId) },
  );

  const trimmed = text.trim();
  const isNote = mode === "internal";

  function submit() {
    if (!trimmed || send.isPending) return;
    send.mutate(
      { text: trimmed, visibility: mode },
      {
        onSuccess: () => {
          setText("");
          setMode("internal");
        },
      },
    );
  }

  return (
    <div className="space-y-2 border-t p-4">
      <div role="group" aria-label="Tipo de mensaje" className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant={isNote ? "default" : "outline"}
          aria-pressed={isNote}
          onClick={() => setMode("internal")}
        >
          Nota interna
        </Button>
        <Button
          type="button"
          size="sm"
          variant={!isNote ? "default" : "outline"}
          aria-pressed={!isNote}
          onClick={() => setMode("public")}
        >
          Respuesta
        </Button>
      </div>
      <Label htmlFor="ticket-composer" className="sr-only">
        {isNote ? "Nota interna" : "Respuesta a quien la envió"}
      </Label>
      <Textarea
        id="ticket-composer"
        value={text}
        rows={3}
        placeholder={
          isNote ? "Nota interna: solo la ven quienes administran Mejoras" : "Respuesta: la verá quien envió la solicitud"
        }
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          }
        }}
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {isNote ? "No llega a quien la envió. " : "Llega a quien la envió. "}⌘ Enter para enviar
        </span>
        <Button size="sm" disabled={trimmed === "" || send.isPending} onClick={submit}>
          {isNote ? "Guardar nota" : "Enviar respuesta"}
        </Button>
      </div>
    </div>
  );
}

/** Search by code or title and mark the open solicitud as a duplicate of the chosen one. */
function DuplicateDialog({
  ticket,
  open,
  onOpenChange,
}: {
  ticket: TicketDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const results = useInfiniteQuery({
    ...mejorasListInfiniteOptions({ q: debounced, sort: "updated" }),
    enabled: open && debounced.length >= 2,
  });
  const rows = (results.data?.pages ?? []).flatMap((p) => p.rows).filter((r) => r.id !== ticket.id);

  const mark = useActionMutation((ofId: string) => markDuplicateAction(ticket.id, ofId), {
    invalidate: () => invalidateAfterWrite(ticket.id),
    successToast: "Marcada como duplicada",
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Marcar como duplicada</DialogTitle>
          <DialogDescription>
            Busca la solicitud original por código o título. Esta quedará descartada y apuntará a la original.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="duplicate-search">Buscar solicitud</Label>
          <Input
            id="duplicate-search"
            value={q}
            autoFocus
            placeholder="SOL-0042 o parte del título"
            onChange={(e) => setQ(e.target.value)}
          />
          <ul className="max-h-64 space-y-1 overflow-y-auto" aria-live="polite">
            {debounced.length < 2 ? (
              <li className="px-1 py-2 text-sm text-muted-foreground">Escribe al menos 2 caracteres.</li>
            ) : results.isPending ? (
              <li className="px-1 py-2 text-sm text-muted-foreground">Buscando…</li>
            ) : rows.length === 0 ? (
              <li className="px-1 py-2 text-sm text-muted-foreground">Sin resultados.</li>
            ) : (
              rows.map((r) => (
                <li key={r.id}>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-auto w-full justify-start gap-2 py-2 text-left whitespace-normal"
                    disabled={mark.isPending}
                    onClick={() => mark.mutate(r.id, { onSuccess: () => onOpenChange(false) })}
                  >
                    <span className="font-mono text-xs text-muted-foreground">{r.code}</span>
                    <span className="min-w-0 flex-1 break-words">{r.title}</span>
                    <span className="text-xs text-muted-foreground">{STATUS_LABEL[r.status]}</span>
                  </Button>
                </li>
              ))
            )}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}
