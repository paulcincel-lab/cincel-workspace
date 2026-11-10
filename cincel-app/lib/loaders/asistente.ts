import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import type { UIMessage } from "ai";

import { messageMetaOf } from "@/lib/assistant/threads";
import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import {
  resolveActivitiesCapabilities,
  resolveProjectsCapabilities,
  resolveTeamCapabilities,
} from "@/lib/auth/permissions";
import { viewerScopeOf } from "@/lib/auth/viewer-scope";
import { db, schema } from "@/lib/db/client";
import * as assistantRepository from "@/lib/repositories/assistant-repository";
import * as projectsRepository from "@/lib/repositories/projects-repository";
import * as tasksRepository from "@/lib/repositories/tasks-repository";
import type {
  AsistentePageData,
  AsistentePageThread,
  AssistantContextIds,
  AssistantContextLabel,
  AssistantUIMessage,
} from "@/lib/types/asistente";
import type { AssistantThreadSummary } from "@/lib/types/redesign";

/**
 * `/asistente` loaders (Query Migration Phase 10, #944): `(user, input) =>
 * data`. The page-data actions call them after the session check and the
 * page prefetch calls them directly. Owner-only: every read is scoped to the
 * viewer's staff id, so another user's thread is null, never its messages.
 * Read-only.
 */

/** The viewer's live threads, pinned first then newest first, at most 50 (`qk.asistente.threads()`). */
export async function loadAsistenteThreads(user: AuthenticatedUser): Promise<AssistantThreadSummary[]> {
  const rows = await assistantRepository.listLiveAssistantThreads(
    db,
    user.member.id,
    assistantRepository.ASSISTANT_THREADS_KEEP,
  );
  return rows.map(toThreadSummary);
}

/** A threads-list row as the client sees it (ISO dates). */
export function toThreadSummary(row: assistantRepository.AssistantThreadListRow): AssistantThreadSummary {
  return {
    id: row.id,
    title: row.title,
    updatedAt: row.updatedAt.toISOString(),
    pinnedAt: row.pinnedAt ? row.pinnedAt.toISOString() : null,
    pendingApprovals: row.pendingApprovals,
    unread: row.unread,
  };
}

/**
 * The viewer's live thread with its last messages (`qk.asistente.thread(id)`),
 * or null when it is missing, deleted or someone else's.
 */
export async function loadAsistenteThread(
  user: AuthenticatedUser,
  input: { id: string },
): Promise<AsistentePageThread | null> {
  const thread = await assistantRepository.findOwnedAssistantThread(db, user.member.id, input.id);
  if (!thread) return null;
  const rows = await assistantRepository.listAssistantThreadMessages(db, thread.id);
  // Metadata carries the tool durations and the message time (`created_at`) for the tool steps.
  const messages: AssistantUIMessage[] = rows.map((row) => ({
    id: row.id,
    role: row.role as UIMessage["role"],
    parts: (Array.isArray(row.parts) ? row.parts : []) as UIMessage["parts"],
    metadata: messageMetaOf(row),
  }));
  return { id: thread.id, title: thread.title, messages };
}

/** `/asistente` in one call: the thread list plus the `?thread=` thread. */
export async function loadAsistentePageData(
  user: AuthenticatedUser,
  input: { threadId: string | null },
): Promise<AsistentePageData> {
  const [threads, initialThread] = await Promise.all([
    loadAsistenteThreads(user),
    input.threadId ? loadAsistenteThread(user, { id: input.threadId }) : Promise.resolve(null),
  ]);
  return { threads, initialThread, missingThread: input.threadId !== null && initialThread === null };
}

async function taskLabel(user: AuthenticatedUser, id: string): Promise<AssistantContextLabel | null> {
  if (!resolveActivitiesCapabilities(user).canViewActivities) return null;
  // An admin task is null for non-admins.
  const task = await tasksRepository.getTaskForViewer(id, viewerScopeOf(user));
  return task ? { id: task.id, label: task.title } : null;
}

async function personLabel(user: AuthenticatedUser, id: string): Promise<AssistantContextLabel | null> {
  if (!resolveTeamCapabilities(user).canViewTeam) return null;
  // Name columns only: the chip never needs the profile, email or phone.
  const [row] = await db
    .select({ id: schema.staff.id, name: schema.staff.name, lastName: schema.staff.lastName })
    .from(schema.staff)
    .where(and(eq(schema.staff.id, id), isNull(schema.staff.deletedAt)))
    .limit(1);
  if (!row) return null;
  return { id: row.id, label: [row.name, row.lastName].filter(Boolean).join(" ").trim() || row.name };
}

async function projectLabel(user: AuthenticatedUser, id: string): Promise<AssistantContextLabel | null> {
  if (!resolveProjectsCapabilities(user).canViewProjects) return null;
  const project = await projectsRepository.getProject(id, viewerScopeOf(user));
  return project ? { id: project.id, label: project.name } : null;
}

/** A read that fails (bad id, no access) counts as not visible. */
async function visible(read: () => Promise<AssistantContextLabel | null>): Promise<AssistantContextLabel | null> {
  try {
    return await read();
  } catch {
    return null;
  }
}

/**
 * The "Viendo: {entity}" chip (`qk.asistente.context(c)`): the most specific
 * id the viewer can see (task, then person, then project) as `{ id, label }`
 * and nothing else. Null when none of the ids is visible.
 */
export async function loadAssistantContextLabel(
  user: AuthenticatedUser,
  input: AssistantContextIds,
): Promise<AssistantContextLabel | null> {
  if (input.taskId) {
    const task = await visible(() => taskLabel(user, input.taskId!));
    if (task) return task;
  }
  if (input.personId) {
    const person = await visible(() => personLabel(user, input.personId!));
    if (person) return person;
  }
  if (input.projectId) {
    const project = await visible(() => projectLabel(user, input.projectId!));
    if (project) return project;
  }
  return null;
}
