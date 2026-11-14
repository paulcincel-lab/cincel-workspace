"use client";

import { useInfiniteQuery, useQuery, useQueryClient, type InfiniteData, type QueryClient } from "@tanstack/react-query";
import { InboxIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/shell/EmptyState";
import { AttachmentPicker } from "@/components/soporte/AttachmentPicker";
import { AttachmentThumbs } from "@/components/soporte/AttachmentThumbs";
import { TicketTimeline } from "@/components/soporte/TicketTimeline";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/shadcn/alert-dialog";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/shadcn/sheet";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import { Textarea } from "@/components/ui/shadcn/textarea";
import { uploadTicketAttachments } from "@/lib/soporte/attachments-client";
import { replyTicketAction, withdrawTicketAction } from "@/lib/actions/soporte-actions";
import { qk } from "@/lib/query/keys";
import { useActionMutation } from "@/lib/query/mutation";
import { myTicketsInfiniteOptions, ticketOptions } from "@/lib/query/options/soporte";
import { useSoporteDraft } from "@/lib/stores/soporte-draft";
import {
  KIND_LABEL,
  STATUS_LABEL,
  type TicketDetail,
  type TicketListRow,
  type TicketsPage,
  type TicketStatus,
} from "@/lib/types/soporte";
import { ticketReplySchema } from "@/lib/validation/soporte";

type Group = "abiertas" | "cerradas";
type ListData = InfiniteData<TicketsPage, string | null>;

const GROUPS: ReadonlyArray<{ key: Group; label: string }> = [
  { key: "abiertas", label: "Abiertas" },
  { key: "cerradas", label: "Cerradas" },
];

const dateFormat = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" });

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : dateFormat.format(date);
}

function statusVariant(status: TicketStatus): "default" | "secondary" | "outline" {
  if (status === "nuevo" || status === "en_progreso") return "default";
  if (status === "resuelto" || status === "descartado") return "outline";
  return "secondary";
}

function StatusBadge({ status }: { status: TicketStatus }) {
  return <Badge variant={statusVariant(status)}>{STATUS_LABEL[status]}</Badge>;
}

type ListSnapshot = { lists: Array<[readonly unknown[], ListData | undefined]>; detail: TicketDetail | null | undefined };

/** Patches every cached "mine" list row of `id`. */
function patchLists(qc: QueryClient, id: string, patch: (row: TicketListRow) => TicketListRow): void {
  qc.setQueriesData<ListData>({ queryKey: [...qk.soporte.all, "mine"] }, (old) =>
    old
      ? { ...old, pages: old.pages.map((page) => ({ ...page, rows: page.rows.map((r) => (r.id === id ? patch(r) : r)) })) }
      : old,
  );
}

async function snapshot(qc: QueryClient, id: string): Promise<ListSnapshot> {
  await qc.cancelQueries({ queryKey: qk.soporte.all });
  return {
    lists: qc.getQueriesData<ListData>({ queryKey: [...qk.soporte.all, "mine"] }),
    detail: qc.getQueryData<TicketDetail | null>(qk.soporte.ticket(id)),
  };
}

function restore(qc: QueryClient, id: string, snap: ListSnapshot): void {
  for (const [key, data] of snap.lists) qc.setQueryData(key, data);
  qc.setQueryData(qk.soporte.ticket(id), snap.detail);
}

function TicketDrawerBody({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: ticket, isPending, isError } = useQuery(ticketOptions(id));
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [replyFiles, setReplyFiles] = useState<File[]>([]);
  const queryClient = useQueryClient();

  const reply = useActionMutation<{ id: string; text: string }, null, ListSnapshot>(
    ({ id: ticketId, text: body }) => replyTicketAction(ticketId, body),
    {
      errorContext: {},
      onFormError: setError,
      optimistic: {
        onMutate: async (qc, vars) => {
          const snap = await snapshot(qc, vars.id);
          const now = new Date().toISOString();
          qc.setQueryData<TicketDetail | null>(qk.soporte.ticket(vars.id), (old) =>
            old
              ? {
                  ...old,
                  updatedAt: now,
                  events: [
                    ...old.events,
                    {
                      id: `optimistic-${now}`,
                      ticketId: old.id,
                      type: "reply",
                      visibility: "public",
                      actor: old.author,
                      payload: { text: vars.text },
                      createdAt: now,
                    },
                  ],
                }
              : old,
          );
          patchLists(qc, vars.id, (row) => ({ ...row, updatedAt: now }));
          return snap;
        },
        rollback: (qc, snap) => restore(qc, id, snap),
      },
      invalidate: (vars) => [qk.soporte.ticket(vars.id), qk.soporte.all],
    },
  );

  const withdraw = useActionMutation<string, null, ListSnapshot>((ticketId) => withdrawTicketAction(ticketId), {
    successToast: "Solicitud retirada.",
    optimistic: {
      onMutate: async (qc, ticketId) => {
        const snap = await snapshot(qc, ticketId);
        const now = new Date().toISOString();
        qc.setQueryData<TicketDetail | null>(qk.soporte.ticket(ticketId), (old) =>
          old ? { ...old, status: "descartado", updatedAt: now, closedAt: now } : old,
        );
        patchLists(qc, ticketId, (row) => ({ ...row, status: "descartado", updatedAt: now, closedAt: now }));
        return snap;
      },
      rollback: (qc, snap) => restore(qc, id, snap),
    },
    invalidate: (ticketId) => [qk.soporte.ticket(ticketId), qk.soporte.all],
  });

  if (isPending) {
    return (
      <div className="flex flex-col gap-3 p-4" aria-busy="true">
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }
  if (isError || !ticket) {
    return <p className="p-4 text-sm text-muted-foreground">No pudimos cargar esta solicitud.</p>;
  }

  const submitReply = () => {
    const parsed = ticketReplySchema.safeParse(text);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Escribe un mensaje.");
      return;
    }
    setError(null);
    const body = parsed.data;
    setText("");
    const images = replyFiles;
    setReplyFiles([]);
    reply.mutate(
      { id: ticket.id, text: body },
      {
        onError: () => {
          setText(body);
          setReplyFiles(images);
        },
        onSuccess: async () => {
          if (images.length === 0) return;
          const { failed } = await uploadTicketAttachments(ticket.id, images).catch(() => ({
            failed: images.map((file) => ({ name: file.name, error: "No se pudo subir la imagen." })),
          }));
          await queryClient.invalidateQueries({ queryKey: qk.soporte.all });
          if (failed.length > 0) {
            toast.error(`No se subieron ${failed.length} imagen(es): ${failed.map((f) => `${f.name || "Imagen"} (${f.error})`).join(", ")}`);
          }
        },
      },
    );
  };

  const canReply = ticket.status !== "descartado";
  const context = ticket.context;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 pb-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={ticket.status} />
        <Badge variant="outline">{KIND_LABEL[ticket.kind]}</Badge>
        {ticket.githubIssueUrl ? (
          <a
            href={ticket.githubIssueUrl}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            Ver en GitHub (Publicada como propuesta)
          </a>
        ) : null}
      </div>

      <section className="flex flex-col gap-1.5">
        <h3 className="text-sm font-semibold text-foreground">Descripción</h3>
        <p className="text-sm whitespace-pre-wrap text-foreground">{ticket.description}</p>
        {ticket.steps ? (
          <>
            <h3 className="mt-2 text-sm font-semibold text-foreground">Pasos para repetirlo</h3>
            <p className="text-sm whitespace-pre-wrap text-foreground">{ticket.steps}</p>
          </>
        ) : null}
      </section>

      {ticket.attachments.length > 0 ? (
        <section className="flex flex-col gap-1.5">
          <h3 className="text-sm font-semibold text-foreground">Imágenes</h3>
          <AttachmentThumbs attachments={ticket.attachments} />
        </section>
      ) : null}

      <section className="flex flex-col gap-1.5">
        <h3 className="text-sm font-semibold text-foreground">Contexto</h3>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Pantalla</dt>
          <dd className="min-w-0 break-words text-foreground">{context.path}</dd>
          <dt className="text-muted-foreground">Enviada</dt>
          <dd className="text-foreground">{formatDate(ticket.createdAt)}</dd>
          <dt className="text-muted-foreground">Versión</dt>
          <dd className="text-foreground">{context.appVersion}</dd>
        </dl>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-foreground">Historial</h3>
        <TicketTimeline events={ticket.events} authorId={ticket.author.id} />
      </section>

      {canReply ? (
        <section className="flex flex-col gap-2">
          <label htmlFor={`reply-${ticket.id}`} className="text-sm font-semibold text-foreground">
            Responder
          </label>
          <Textarea
            id={`reply-${ticket.id}`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Agrega más detalle o responde a Soporte"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `reply-${ticket.id}-error` : undefined}
          />
          <AttachmentPicker files={replyFiles} onChange={setReplyFiles} disabled={reply.isPending} />
          {error ? (
            <p id={`reply-${ticket.id}-error`} role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-2">
            {ticket.status === "nuevo" ? (
              <AlertDialog>
                <AlertDialogTrigger render={<Button type="button" variant="outline" disabled={withdraw.isPending} />}>
                  Retirar
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>¿Retirar esta solicitud?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Dejará de estar en la bandeja de Soporte. Solo puedes retirarla mientras está nueva.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => withdraw.mutate(ticket.id, { onSuccess: onClose })}
                    >
                      Retirar
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : (
              <span />
            )}
            <Button type="button" onClick={submitReply} disabled={reply.isPending || text.trim().length === 0}>
              Enviar respuesta
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function TicketRow({ row, onOpen }: { row: TicketListRow; onOpen: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full flex-col gap-1.5 rounded-xl border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">{row.code}</span>
          <StatusBadge status={row.status} />
          <Badge variant="outline">{KIND_LABEL[row.kind]}</Badge>
        </div>
        <span className="min-w-0 text-sm font-medium break-words text-foreground">{row.title}</span>
        <span className="text-xs text-muted-foreground">Actualizada {formatDate(row.updatedAt)}</span>
      </button>
    </li>
  );
}

/** Mis solicitudes in Ajustes › Personal: the user's own list, detail drawer, reply and withdraw. */
export function MisSolicitudes() {
  const [group, setGroup] = useState<Group>("abiertas");
  const [openId, setOpenId] = useState<string | null>(null);
  const openReportar = useSoporteDraft((s) => s.openReportar);

  const query = useInfiniteQuery(myTicketsInfiniteOptions({ status: group }));
  const rows = query.data?.pages.flatMap((page) => page.rows) ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Filtrar solicitudes" className="flex gap-1.5">
          {GROUPS.map((item) => (
            <Button
              key={item.key}
              type="button"
              size="sm"
              variant={group === item.key ? "secondary" : "ghost"}
              aria-pressed={group === item.key}
              onClick={() => setGroup(item.key)}
            >
              {item.label}
            </Button>
          ))}
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => openReportar()}>
          Reportar o sugerir
        </Button>
      </div>

      {query.isPending ? (
        <div className="flex flex-col gap-2" aria-busy="true">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : query.isError ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm text-muted-foreground">No pudimos cargar tus solicitudes.</p>
          <Button type="button" size="sm" variant="outline" onClick={() => void query.refetch()}>
            Reintentar
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={InboxIcon}
          title={group === "abiertas" ? "No tienes solicitudes abiertas" : "No tienes solicitudes cerradas"}
          description="Cuéntanos si algo falla, si tienes una idea o una pregunta."
          action={{ label: "Reportar o sugerir", onClick: () => openReportar() }}
        />
      ) : (
        <>
          <ul aria-label="Mis solicitudes" className="flex flex-col gap-2">
            {rows.map((row) => (
              <TicketRow key={row.id} row={row} onOpen={() => setOpenId(row.id)} />
            ))}
          </ul>
          {query.hasNextPage ? (
            <Button
              type="button"
              variant="outline"
              className="self-center"
              disabled={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            >
              Cargar más
            </Button>
          ) : null}
        </>
      )}

      <Sheet open={openId !== null} onOpenChange={(open) => (open ? undefined : setOpenId(null))}>
        <SheetContent side="right" className="w-full sm:max-w-[560px]">
          <SheetHeader>
            <SheetTitle>Solicitud</SheetTitle>
            <SheetDescription>Estado, conversación y respuestas.</SheetDescription>
          </SheetHeader>
          {openId ? <TicketDrawerBody key={openId} id={openId} onClose={() => setOpenId(null)} /> : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
