/**
 * Cutto API adapter (redesign BE §11.2, brief decision 13, open question Q1).
 * Server-only: client components never import this module (enforced by
 * eslint and tests/guards/cutto-server-only.test.ts); they use
 * `lib/integrations/cutto-links.ts` instead.
 *
 * Cutto does not expose an API yet, so the only implementation is the no-op
 * `noopCuttoClient`: every method rejects with `DISABLED: cutto` (BE §9.10)
 * and nothing leaves Cincel. `getCuttoApi()` returns `null` unless
 * `CUTTO_API_URL` is set, and the 15 Cutto assistant tools are left out of
 * the registry while it is `null` (BE §10.1, §10.3).
 */
import "server-only";

export type CuttoMeeting = { meetingId: string; title: string; start: string; durationMin: number; url: string };
export type CuttoVoiceRoom = { roomId: string; name: string; participants: number; url: string };
export type CuttoConversation = { conversationId: string; title: string; unread: number; url: string };
export type CuttoMessage = { messageId: string; author: string; text: string; sentAt: string };

/** The methods behind the "Reuniones en Cutto" (8) and "Mensajes en Cutto" (7) tools (BE §10.3). */
export interface CuttoClient {
  /** create_meeting */
  createMeeting(input: {
    title: string;
    start: string;
    durationMin: number;
    attendeeEmails: string[];
    projectId?: string;
    agenda?: string;
  }): Promise<{ meetingId: string; url: string }>;
  /** start_call */
  startCall(input: { attendeeEmails?: string[]; channel?: string; video?: boolean }): Promise<{ url: string }>;
  /** list_meetings */
  listMeetings(input: { date?: string; projectId?: string }): Promise<CuttoMeeting[]>;
  /** invite_to_meeting */
  inviteToMeeting(input: { meetingId: string; attendeeEmails: string[] }): Promise<{ invited: number }>;
  /** get_meeting_notes */
  getMeetingNotes(input: { meetingId: string }): Promise<{ notes: string; actionItems: string[] }>;
  /** meeting_to_tasks (action items only; Cincel creates the tasks itself) */
  getMeetingActionItems(input: { meetingId: string }): Promise<{ text: string; assigneeEmail?: string }[]>;
  /** list_voice_rooms */
  listVoiceRooms(input: { projectId?: string }): Promise<CuttoVoiceRoom[]>;
  /** join_voice_room */
  voiceRoomUrl(input: { roomId: string }): Promise<{ url: string }>;
  /** list_conversations */
  listConversations(input: { unreadOnly?: boolean }): Promise<CuttoConversation[]>;
  /** read_conversation */
  readConversation(input: { conversationId: string; limit?: number }): Promise<CuttoMessage[]>;
  /** summarize_channel (raw messages; the assistant summarizes) */
  channelMessages(input: { channel: string; since: string }): Promise<CuttoMessage[]>;
  /** send_message */
  sendMessage(input: { toEmails: string[]; text: string; taskUrl?: string; fileUrl?: string }): Promise<{ messageId: string }>;
  /** post_to_project_channel */
  postMessage(input: { channel: string; text: string; mentionEmails?: string[] }): Promise<{ messageId: string }>;
  /** reply_in_thread */
  replyInThread(input: { messageId: string; text: string }): Promise<{ messageId: string }>;
  /** create_project_channel */
  createProjectChannel(input: { projectId: string; memberEmails: string[] }): Promise<{ channel: string; url: string }>;
}

/** BE §11.2 name of the same interface. */
export type CuttoApi = CuttoClient;

/** The error every no-op method rejects with (`actionErrorCode` → `DISABLED`). */
export const CUTTO_DISABLED = "DISABLED: cutto";

function disabled(): Promise<never> {
  return Promise.reject(new Error(CUTTO_DISABLED));
}

/** No-op client: makes no network call and rejects every method with `DISABLED: cutto`. */
export const noopCuttoClient: CuttoClient = {
  createMeeting: disabled,
  startCall: disabled,
  listMeetings: disabled,
  inviteToMeeting: disabled,
  getMeetingNotes: disabled,
  getMeetingActionItems: disabled,
  listVoiceRooms: disabled,
  voiceRoomUrl: disabled,
  listConversations: disabled,
  readConversation: disabled,
  channelMessages: disabled,
  sendMessage: disabled,
  postMessage: disabled,
  replyInThread: disabled,
  createProjectChannel: disabled,
};

/** The env keys the Cutto client reads. */
export type CuttoEnv = Readonly<Record<string, string | undefined>>;

/** Whether the Cutto API is configured (`CUTTO_API_URL` set to an http(s) URL). */
export function isCuttoApiConfigured(env: CuttoEnv = process.env): boolean {
  const raw = (env.CUTTO_API_URL ?? "").trim();
  if (raw === "") return false;
  try {
    const { protocol } = new URL(raw);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * The Cutto client, or `null` while `CUTTO_API_URL` is unset (the default).
 * Until Cutto publishes its API (Q1) the configured client is the no-op one.
 */
export function getCuttoApi(env: CuttoEnv = process.env): CuttoClient | null {
  return isCuttoApiConfigured(env) ? noopCuttoClient : null;
}
