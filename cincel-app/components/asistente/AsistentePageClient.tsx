"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  useAssistantTurnFinished,
  useDeleteAssistantThread,
  useMarkAssistantThreadRead,
  usePinAssistantThread,
  type AssistantTurn,
} from "@/components/asistente/use-asistente-cache";
import { PageStyleLayout } from "@/components/widgets/PageStyleLayout";
import { AsistenteAnaliticoLayout } from "@/components/widgets/asistente/AsistenteAnaliticoLayout";
import { AsistenteEsencialLayout } from "@/components/widgets/asistente/AsistenteEsencialLayout";
import { AsistenteVisualLayout } from "@/components/widgets/asistente/AsistenteVisualLayout";
import { actionErrorText } from "@/lib/errors";
import { qk } from "@/lib/query/keys";
import { mutationErrorText } from "@/lib/query/mutation";
import { asistenteContextOptions, asistenteThreadOptions, asistenteThreadsOptions } from "@/lib/query/options/asistente";
import { useAssistantUi } from "@/lib/stores/assistant-ui-store";
import type { ContextChip } from "@/lib/types/asistente";
import type { AssistantContext, AssistantThreadSummary } from "@/lib/types/redesign";

export type { AsistentePageThread } from "@/lib/types/asistente";

export type AsistentePageClientProps = {
  /** The `?thread=<id>` thread the page seeded into `qk.asistente.thread(id)`; null starts a new conversation. */
  threadId: string | null;
  /** True when `?thread=<id>` named a thread the caller doesn't have. */
  missingThread?: boolean;
  /** `?proyecto=<id>` (uuid): prefills the project chip; dropped when the viewer can't see the project. */
  initialProjectId?: string | null;
};

const PAGE_ROUTE = "/asistente";
const UNTITLED = "Conversación sin título";
const NEW_TITLE = "Nueva conversación";
const NOT_FOUND_TEXT = () => actionErrorText(new Error("NOT_FOUND"));

function newThreadId(): string {
  return crypto.randomUUID();
}

/** The open conversation: a stored thread, or a new one the route creates on its first message. */
type Active = { id: string; isNew: boolean };

/** The context chips: at most one project (`projectId`) and one module (`route`). */
type Chips = { project: { id: string; label: string | null } | null; module: ContextChip | null };

/** `/asistente?thread=` without an RSC request (Next keeps `useSearchParams` in sync with `history`). */
function replaceThreadInUrl(threadId: string | null): void {
  const url = threadId ? `/asistente?thread=${encodeURIComponent(threadId)}` : "/asistente";
  window.history.replaceState(window.history.state, "", url);
}

/**
 * Full assistant page (redesign FE §3.9): one layout per presentation style
 * (`PageStyleLayout`), all fed by this state: the threads, the open
 * conversation, the context chips, pin, delete and read marks.
 *
 * Data (Query Migration Phase 10, #944): the list is `qk.asistente.threads()`
 * and each conversation `qk.asistente.thread(id)`, both seeded by the page.
 * Switching threads replaces `?thread=` with `history.replaceState` and
 * reads the cache (one thread call when it isn't cached), so the page never
 * re-renders on the server. The selected thread also goes to
 * `useAssistantUi.threadId`, so the floating sheet elsewhere continues it.
 */
export function AsistentePageClient({
  threadId: seededThreadId,
  missingThread = false,
  initialProjectId = null,
}: AsistentePageClientProps) {
  const qc = useQueryClient();
  const setStoreThreadId = useAssistantUi((s) => s.setThreadId);
  const [active, setActive] = useState<Active>(() =>
    seededThreadId ? { id: seededThreadId, isNew: false } : { id: newThreadId(), isNew: true },
  );
  const [notice, setNotice] = useState<string | null>(missingThread ? NOT_FOUND_TEXT() : null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [chips, setChips] = useState<Chips>(() => ({
    project: initialProjectId ? { id: initialProjectId, label: null } : null,
    module: null,
  }));

  const threadsQuery = useQuery(asistenteThreadsOptions());
  const threads = useMemo(() => threadsQuery.data ?? [], [threadsQuery.data]);
  const threadQuery = useQuery({ ...asistenteThreadOptions(active.id), enabled: !active.isNew });

  // A deep-linked project chip gets its name from the context lookup; null = not visible to the viewer.
  const lookupProjectId = chips.project && chips.project.label === null ? chips.project.id : null;
  const projectLookupIds = useMemo(() => ({ projectId: lookupProjectId ?? undefined }), [lookupProjectId]);
  const projectLookup = useQuery({ ...asistenteContextOptions(projectLookupIds), enabled: lookupProjectId !== null });
  const lookupGone = lookupProjectId !== null && (projectLookup.data === null || projectLookup.isError);
  useEffect(() => {
    if (lookupGone) setChips((prev) => (prev.project && prev.project.label === null ? { ...prev, project: null } : prev));
  }, [lookupGone]);

  const projectLabel = chips.project ? (chips.project.label ?? projectLookup.data?.label ?? null) : null;
  const chipList = useMemo<ContextChip[]>(() => {
    const out: ContextChip[] = [];
    if (chips.project && projectLabel) out.push({ kind: "project", id: chips.project.id, label: projectLabel });
    if (chips.module) out.push(chips.module);
    return out;
  }, [chips.project, chips.module, projectLabel]);

  const context = useMemo<AssistantContext>(() => {
    const out: AssistantContext = { route: chips.module?.id ?? PAGE_ROUTE };
    if (chips.project && projectLabel) out.projectId = chips.project.id;
    return out;
  }, [chips.module, chips.project, projectLabel]);

  const addChip = useCallback((chip: ContextChip) => {
    setChips((prev) =>
      chip.kind === "project" ? { ...prev, project: { id: chip.id, label: chip.label } } : { ...prev, module: chip },
    );
  }, []);
  const removeChip = useCallback((chip: ContextChip) => {
    setChips((prev) => (chip.kind === "project" ? { ...prev, project: null } : { ...prev, module: null }));
  }, []);

  // The deep-linked thread is the one the floating sheet continues after leaving the page.
  useEffect(() => {
    if (seededThreadId) useAssistantUi.getState().setThreadId(seededThreadId);
  }, [seededThreadId]);

  // Read marks: on open, and whenever the open thread's row says "Nueva respuesta".
  const markRead = useMarkAssistantThreadRead();
  const openStoredId = !active.isNew && threadQuery.data ? active.id : null;
  const openUnread = openStoredId ? Boolean(threads.find((t) => t.id === openStoredId)?.unread) : false;
  useEffect(() => {
    if (openStoredId) markRead(openStoredId);
  }, [openStoredId, markRead]);
  useEffect(() => {
    if (openStoredId && openUnread) markRead(openStoredId);
  }, [openStoredId, openUnread, markRead]);

  const startNewConversation = useCallback(() => {
    setNotice(null);
    setActive({ id: newThreadId(), isNew: true });
    replaceThreadInUrl(null);
    setStoreThreadId(null);
  }, [setStoreThreadId]);

  const selectThread = async (id: string) => {
    if (id === active.id && !active.isNew) return;
    setNotice(null);
    setLoadingId(id);
    try {
      // Cached threads (staleTime Infinity) resolve without a request.
      const thread = await qc.fetchQuery(asistenteThreadOptions(id));
      if (!thread) {
        qc.setQueryData<AssistantThreadSummary[]>(qk.asistente.threads(), (prev) => prev?.filter((t) => t.id !== id));
        qc.removeQueries({ queryKey: qk.asistente.thread(id), exact: true });
        setNotice(NOT_FOUND_TEXT());
        return;
      }
      setActive({ id: thread.id, isNew: false });
      replaceThreadInUrl(thread.id);
      setStoreThreadId(thread.id);
    } catch (err) {
      setNotice(mutationErrorText(err));
    } finally {
      setLoadingId(null);
    }
  };

  const deleteMutation = useDeleteAssistantThread({
    onDeleted: (id) => {
      if (id === active.id) startNewConversation();
    },
  });
  const pinMutation = usePinAssistantThread();

  const turnFinished = useAssistantTurnFinished();
  const onTurnFinished = useCallback(
    (turn: AssistantTurn) => {
      turnFinished(turn);
      markRead(turn.threadId);
      setActive((prev) => (prev.id === turn.threadId && prev.isNew ? { ...prev, isNew: false } : prev));
      replaceThreadInUrl(turn.threadId);
      setStoreThreadId(turn.threadId);
    },
    [turnFinished, markRead, setStoreThreadId],
  );

  const stored = active.isNew ? null : threadQuery.data;
  const activeTitle = active.isNew
    ? NEW_TITLE
    : threads.find((t) => t.id === active.id)?.title || stored?.title || UNTITLED;
  const threadNotice = active.isNew
    ? null
    : threadQuery.isError
      ? mutationErrorText(threadQuery.error)
      : threadQuery.data === null
        ? NOT_FOUND_TEXT()
        : null;
  const shownNotice = notice ?? threadNotice;
  const chatMessages = active.isNew ? [] : (threadQuery.data?.messages ?? null);
  const activeId = active.isNew ? null : active.id;
  const thread = { id: active.id, title: activeTitle, messages: chatMessages };

  const visual = () => (
    <AsistenteVisualLayout
      threads={threads}
      activeId={activeId}
      busyThreadId={loadingId}
      onSelectThread={selectThread}
      onNewConversation={startNewConversation}
      thread={thread}
      notice={shownNotice}
      context={context}
      chips={chipList}
      onAddChip={addChip}
      onRemoveChip={removeChip}
      onTurnFinished={onTurnFinished}
      onPinThread={(id, pinned) => pinMutation.mutate({ id, pinned })}
      onDeleteThread={(id) => deleteMutation.mutate(id)}
    />
  );

  const analitico = () => (
    <AsistenteAnaliticoLayout
      threads={threads}
      thread={{ id: active.id, isNew: active.isNew, title: activeTitle, messages: chatMessages }}
      notice={shownNotice}
      context={context}
      loadingThreadId={loadingId}
      onNewConversation={startNewConversation}
      onSelectThread={(id) => void selectThread(id)}
      onTurnFinished={onTurnFinished}
    />
  );

  return (
    <PageStyleLayout
      visual={visual}
      esencial={() => (
        <AsistenteEsencialLayout
          threads={threads}
          activeId={activeId}
          busyThreadId={loadingId}
          onSelectThread={(id) => void selectThread(id)}
          onNewConversation={startNewConversation}
          thread={thread}
          notice={shownNotice}
          context={context}
          chips={chipList}
          onTurnFinished={onTurnFinished}
        />
      )}
      analitico={analitico}
    />
  );
}
