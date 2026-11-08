"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronLeftIcon, ImageIcon, LinkIcon, ListChecksIcon, ReplyIcon } from "lucide-react";
import { toast } from "sonner";

import { ErrorState } from "@/components/shell/ErrorState";
import { LoadingSkeleton } from "@/components/shell/LoadingSkeleton";
import { Alert, AlertDescription } from "@/components/ui/shadcn/alert";
import { Avatar, AvatarFallback } from "@/components/ui/shadcn/avatar";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { Label } from "@/components/ui/shadcn/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";
import { IMPLEMENTED } from "@/lib/actions/gmail-actions.flags";
import { actionErrorCode, actionErrorText } from "@/lib/errors";
import { catalogOptions } from "@/lib/query/options/catalog";
import { meGmailThreadOptions } from "@/lib/query/options/mi-espacio";
import type { GmailThreadView } from "@/lib/types/mi-espacio";

import { GmailDraftSheet } from "./GmailDraftSheet";
import {
  attachmentHref,
  attachmentKind,
  buildEmailDocument,
  formatFileSize,
  formatMessageDate,
  replySubject,
  senderEmail,
  senderInitials,
  senderName,
} from "./gmail-format";
import { useCreateTaskFromGmailThread, useLinkGmailThread, useMarkGmailThreadRead } from "./use-gmail-mutations";

export type GmailReaderProps = { threadId: string; onClose(): void };

/** Sandbox flags of the body iframe: links may open in a new tab; never `allow-scripts` or `allow-same-origin`. */
export const EMAIL_IFRAME_SANDBOX = "allow-popups allow-popups-to-escape-sandbox";

/** Copy shown before linking (the backend writes the subject to the project history). */
export const LINK_NOTE = "El asunto del correo quedará en la bitácora del proyecto.";

/**
 * Gmail reading pane (redesign FE §3.3, frame `MiEspacioGmail`): headers, the
 * sanitized body in `<iframe sandbox srcdoc>` with remote images blocked until
 * "Mostrar imágenes", attachments as download links, and the actions
 * Responder (`GmailDraftSheet`), Crear tarea and Vincular a proyecto.
 *
 * Reading is the side-effect-free query `me.gmail.thread(id)` (reopening
 * within its stale time makes no call); a thread that opens unread sends one
 * `markGmailThreadReadAction`. Nothing here re-renders the route.
 */
export function GmailReader({ threadId, onClose }: GmailReaderProps) {
  const query = useQuery({ ...meGmailThreadOptions(threadId), retry: false });
  const { mutate: markRead } = useMarkGmailThreadRead();

  // Once per opened thread: the optimistic patch makes `unread` false right away.
  const marked = useRef(new Set<string>());
  const unread = query.data?.thread.unread === true;
  useEffect(() => {
    if (!unread || !IMPLEMENTED.fetchGmailThreadAction || marked.current.has(threadId)) return;
    marked.current.add(threadId);
    markRead(threadId);
  }, [unread, threadId, markRead]);

  if (query.isPending) {
    return (
      <section aria-label="Correo abierto" aria-busy="true" className="flex flex-col gap-4 p-4">
        <BackButton onClose={onClose} />
        <LoadingSkeleton variant="list" rows={4} />
      </section>
    );
  }

  if (query.isError) {
    const code = actionErrorCode(query.error);
    return (
      <section aria-label="Correo abierto" className="flex flex-col gap-4 p-4">
        <BackButton onClose={onClose} />
        <ErrorState
          title="No se pudo abrir el correo."
          description={actionErrorText(query.error, "gmail")}
          code={code || undefined}
          onRetry={code === "NOT_CONNECTED" || code === "SCOPE_MISSING" ? undefined : () => void query.refetch()}
        />
        {code === "NOT_CONNECTED" || code === "SCOPE_MISSING" ? (
          <a href="/ajustes/integraciones" className="text-sm text-primary underline-offset-4 hover:underline">
            Ajustes de Gmail
          </a>
        ) : null}
      </section>
    );
  }

  return <ThreadView key={threadId} data={query.data} onClose={onClose} />;
}

function BackButton({ onClose }: { onClose(): void }) {
  return (
    <Button type="button" variant="ghost" size="icon" aria-label="Volver a la bandeja" onClick={onClose}>
      <ChevronLeftIcon aria-hidden="true" strokeWidth={2} />
    </Button>
  );
}

function ThreadView({ data, onClose }: { data: GmailThreadView; onClose(): void }) {
  const { thread, messages, attachments } = data;
  const pickerId = useId();
  const canReply = IMPLEMENTED.createGmailDraftAction;
  const canTask = IMPLEMENTED.createTaskFromGmailThreadAction;
  const canLink = IMPLEMENTED.linkGmailThreadToProjectAction;
  const needsProjects = canTask || canLink;

  const [showImages, setShowImages] = useState(false);
  const [pickedId, setPickedId] = useState<string | null>(thread.projectId ?? thread.suggestedProjectId);
  const [error, setError] = useState<string | null>(null);
  const [draftOpen, setDraftOpen] = useState(false);
  const replyButtonRef = useRef<HTMLButtonElement>(null);

  // Project names for the picker and chips: the shared light catalog, loaded once.
  const projectsQuery = useQuery({ ...catalogOptions.projectOptions(), enabled: needsProjects });
  const projects = useMemo(() => projectsQuery.data ?? [], [projectsQuery.data]);
  // The link lives in the cache (`me.gmail.thread(id)`), patched by the mutations.
  const linkedId = thread.projectId;

  const taskMutation = useCreateTaskFromGmailThread({ onFormError: setError });
  const linkMutation = useLinkGmailThread({ onFormError: setError });
  const pending = taskMutation.isPending ? "task" : linkMutation.isPending ? "link" : null;

  const projectName = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);
  const suggested =
    thread.suggestedProjectId && projectName.has(thread.suggestedProjectId)
      ? { id: thread.suggestedProjectId, name: projectName.get(thread.suggestedProjectId) ?? "" }
      : null;
  const headerProjectId = linkedId ?? thread.suggestedProjectId;
  const headerProjectName = headerProjectId ? projectName.get(headerProjectId) : undefined;
  const picked = pickedId && projectName.has(pickedId) ? pickedId : null;

  const documents = useMemo(
    () => messages.map((m) => ({ message: m, doc: buildEmailDocument(m, { showImages }) })),
    [messages, showImages],
  );
  const hasRemoteImages = documents.some((d) => d.doc.hasRemoteImages);

  const lastMessage = messages[messages.length - 1];
  const replyTo = senderEmail(lastMessage?.from ?? thread.from);

  function handleCreateTask() {
    if (!picked) return;
    setError(null);
    const name = projectName.get(picked) ?? "el proyecto";
    taskMutation.mutate(
      { threadId: thread.id, projectId: picked, previousProjectId: linkedId },
      { onSuccess: () => toast.success(`Tarea creada en ${name}`) },
    );
  }

  function handleLink() {
    if (!picked) return;
    setError(null);
    const name = projectName.get(picked) ?? "el proyecto";
    linkMutation.mutate(
      { threadId: thread.id, projectId: picked, previousProjectId: linkedId },
      { onSuccess: () => toast.success(`Correo vinculado a ${name}`) },
    );
  }

  function handleDraftOpenChange(open: boolean) {
    setDraftOpen(open);
    if (!open) replyButtonRef.current?.focus();
  }

  return (
    <section aria-label="Correo abierto" className="flex min-w-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <BackButton onClose={onClose} />
        <Badge variant="secondary">Gmail</Badge>
        {headerProjectName ? <Badge variant="outline">{headerProjectName}</Badge> : null}
      </div>

      <div className="flex flex-col gap-4 px-6 py-5">
        <h2 className="text-lg font-semibold tracking-tight">{thread.subject || "(sin asunto)"}</h2>

        {hasRemoteImages && !showImages ? (
          <Alert>
            <ImageIcon aria-hidden="true" />
            <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
              <span>Las imágenes remotas están bloqueadas para proteger tu privacidad.</span>
              <Button type="button" variant="outline" size="sm" onClick={() => setShowImages(true)}>
                Mostrar imágenes
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        {documents.map(({ message, doc }) => (
          <article key={message.id} className="flex flex-col gap-3" aria-label={`Mensaje de ${senderName(message.from)}`}>
            <div className="flex items-center gap-3">
              <Avatar size="lg" aria-hidden="true">
                <AvatarFallback>{senderInitials(message.from)}</AvatarFallback>
              </Avatar>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">{senderName(message.from)}</span>
                {message.to.length > 0 ? (
                  <span className="truncate text-xs text-muted-foreground">para {message.to.map(senderName).join(", ")}</span>
                ) : null}
                {message.cc.length > 0 ? (
                  <span className="truncate text-xs text-muted-foreground">cc {message.cc.map(senderName).join(", ")}</span>
                ) : null}
              </div>
              <time dateTime={message.date} className="font-mono text-xs text-muted-foreground">
                {formatMessageDate(message.date)}
              </time>
            </div>
            <iframe
              title={`Contenido del correo de ${senderName(message.from)}`}
              sandbox={EMAIL_IFRAME_SANDBOX}
              referrerPolicy="no-referrer"
              srcDoc={doc.srcDoc}
              className="h-96 w-full rounded-md border"
            />
          </article>
        ))}

        {attachments.length > 0 ? (
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              {attachments.length === 1 ? "1 adjunto" : `${attachments.length} adjuntos`}
            </span>
            <ul className="flex flex-wrap gap-2" aria-label="Adjuntos">
              {attachments.map((a) => (
                <li key={`${a.messageId}:${a.attachmentId}`}>
                  <a
                    href={attachmentHref(a.messageId, a.attachmentId)}
                    download={a.name}
                    className="flex min-w-56 items-center gap-3 rounded-lg border px-3 py-2 text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
                  >
                    <span
                      aria-hidden="true"
                      className="inline-flex h-10 w-9 items-center justify-center rounded-md bg-muted font-mono text-[10px] font-medium text-muted-foreground"
                    >
                      {attachmentKind(a.name, a.mime)}
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm">{a.name}</span>
                      <span className="font-mono text-xs text-muted-foreground">{formatFileSize(a.size)}</span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {canReply || canTask || canLink ? (
        <div className="mt-auto flex flex-col gap-3 border-t bg-muted/40 px-6 py-4">
          {needsProjects ? (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Label htmlFor={pickerId}>Proyecto</Label>
                <Select
                  items={Object.fromEntries(
                    projects.map((p) => [p.id, p.id === suggested?.id ? `${p.name} (sugerido)` : p.name]),
                  )}
                  value={picked}
                  disabled={pending !== null || projects.length === 0}
                  onValueChange={(v) => setPickedId(typeof v === "string" ? v : null)}
                >
                  <SelectTrigger id={pickerId} aria-label="Proyecto" className="w-full sm:w-64">
                    <SelectValue placeholder="Elige un proyecto" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.id === suggested?.id ? `${p.name} (sugerido)` : p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {suggested ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="xs"
                    aria-pressed={picked === suggested.id}
                    onClick={() => setPickedId(suggested.id)}
                  >
                    Sugerido: {suggested.name}
                  </Button>
                ) : null}
              </div>
              {canLink ? <p className="text-xs text-muted-foreground">{LINK_NOTE}</p> : null}
              {linkedId && projectName.has(linkedId) ? (
                <p className="text-xs text-muted-foreground" aria-live="polite">
                  Vinculado a {projectName.get(linkedId)}.
                </p>
              ) : null}
            </div>
          ) : null}

          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {canReply ? (
              <Button ref={replyButtonRef} type="button" onClick={() => setDraftOpen(true)}>
                <ReplyIcon aria-hidden="true" strokeWidth={2} />
                Responder
              </Button>
            ) : null}
            {canTask ? (
              <Button
                type="button"
                variant="outline"
                disabled={!picked || pending !== null}
                onClick={handleCreateTask}
              >
                <ListChecksIcon aria-hidden="true" strokeWidth={1.9} />
                Crear tarea
              </Button>
            ) : null}
            {canLink ? (
              <Button
                type="button"
                variant="outline"
                disabled={!picked || picked === linkedId || pending !== null}
                onClick={handleLink}
              >
                <LinkIcon aria-hidden="true" strokeWidth={1.9} />
                Vincular a proyecto
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {canReply ? (
        <GmailDraftSheet
          open={draftOpen}
          onOpenChange={handleDraftOpenChange}
          replyToThreadId={thread.id}
          to={replyTo ? [replyTo] : []}
          subject={replySubject(thread.subject)}
        />
      ) : null}
    </section>
  );
}
