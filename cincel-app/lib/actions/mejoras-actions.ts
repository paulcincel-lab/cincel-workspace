"use server";

import { z } from "zod";

import { toActionResult } from "@/lib/actions/action-result";
import { createRateLimiter } from "@/lib/auth/rate-limit";
import { canManageSupport } from "@/lib/auth/permissions";
import { requireCapabilityUser } from "@/lib/auth/session";
import { createGithubIssue, isGithubConfigured } from "@/lib/github/client";
import { getPublishableTicket, loadRedactionContext } from "@/lib/repositories/support-publish";
import * as supportRepository from "@/lib/repositories/support-repository";
import { RFC_LABEL, buildPublishDraft } from "@/lib/soporte/publish-draft";
import { SOPORTE_GITHUB_ENABLED } from "@/lib/soporte/flags";
import type { ActionResult } from "@/lib/types/schedule";
import { publishTicketInputSchema } from "@/lib/validation/soporte";
import {
  TICKET_AREAS,
  TICKET_KINDS,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  TICKET_VISIBILITIES,
  type MejorasCounts,
  type PublishDraftData,
  type PublishTicketInput,
  type TicketFilters,
  type TicketMessageInput,
  type TicketPatch,
  type TicketsPage,
} from "@/lib/types/soporte";

/** Every action here requires `canManageSupport`; the role is re-checked on each call. */
async function requireSupportAdmin() {
  const user = await requireCapabilityUser();
  if (!canManageSupport(user)) throw new Error("FORBIDDEN: soporte");
  return user;
}

/** Triage writes: generous, it only stops runaway loops. */
const triageLimiter = createRateLimiter({ limit: 120, windowMs: 10 * 60_000 });
const messageLimiter = createRateLimiter({ limit: 30, windowMs: 10 * 60_000 });

const Id = z.string().uuid();

const FiltersInput = z
  .object({
    status: z.enum([...TICKET_STATUSES, "abiertas", "cerradas"]).optional(),
    kind: z.enum(TICKET_KINDS).optional(),
    area: z.enum(TICKET_AREAS).optional(),
    priority: z.enum(TICKET_PRIORITIES).optional(),
    assigneeId: Id.optional(),
    unassigned: z.literal(true).optional(),
    authorId: Id.optional(),
    q: z.string().max(200).optional(),
    sort: z.enum(["updated", "created", "priority"]).optional(),
  })
  .strict();

const ListInput = FiltersInput.extend({ cursor: z.string().max(500).nullish() }).strict();

const PatchInput = z
  .object({
    status: z.enum(TICKET_STATUSES).optional(),
    priority: z.enum(TICKET_PRIORITIES).nullable().optional(),
    assigneeId: Id.nullable().optional(),
    message: z.string().max(4000).optional(),
  })
  .strict();

const MessageInput = z
  .object({
    text: z.string().trim().min(1).max(4000),
    visibility: z.enum(TICKET_VISIBILITIES),
  })
  .strict();

/** Filtered list for Mejoras, cursor paging (50). */
export async function listMejorasAction(input: TicketFilters & { cursor?: string | null }): Promise<TicketsPage> {
  await requireSupportAdmin();
  const parsed = ListInput.safeParse(input ?? {});
  if (!parsed.success) throw new Error("INVALID");
  const { cursor, ...filters } = parsed.data;
  return supportRepository.listMejoras(filters, cursor ?? null);
}

/** Counts per status (under the other filters, when given) and the `nuevo` count for the nav badge. */
export async function mejorasCountsAction(input?: TicketFilters): Promise<MejorasCounts> {
  await requireSupportAdmin();
  const parsed = FiltersInput.safeParse(input ?? {});
  if (!parsed.success) throw new Error("INVALID");
  return supportRepository.getMejorasCounts(parsed.data);
}

/** Status, priority and assignee; one event per change. Closing as `descartado` needs a public `message`. */
export async function updateTicketAction(id: string, patch: TicketPatch): Promise<ActionResult<null>> {
  return toActionResult(async () => {
    const user = await requireSupportAdmin();
    const parsedId = Id.safeParse(id);
    const parsed = PatchInput.safeParse(patch);
    if (!parsedId.success || !parsed.success) throw new Error("INVALID");
    if (!triageLimiter.hit(user.member.id).allowed) throw new Error("RATE_LIMITED");
    const result = await supportRepository.updateTicket(user.member.id, parsedId.data, parsed.data);
    if (!result.ok) throw new Error(result.error);
    return null;
  });
}

/** A public reply (the author is notified) or an internal note (admins only). */
export async function addTicketMessageAction(id: string, input: TicketMessageInput): Promise<ActionResult<null>> {
  return toActionResult(async () => {
    const user = await requireSupportAdmin();
    const parsedId = Id.safeParse(id);
    const parsed = MessageInput.safeParse(input);
    if (!parsedId.success || !parsed.success) throw new Error("INVALID");
    if (!messageLimiter.hit(user.member.id).allowed) throw new Error("RATE_LIMITED");
    const result = await supportRepository.addTicketMessage(user.member.id, parsedId.data, parsed.data);
    if (!result.ok) throw new Error(result.error);
    return null;
  });
}

/** Marks a solicitud as a duplicate of another one: `descartado`, a public message, the author follows the original. */
export async function markDuplicateAction(id: string, ofId: string): Promise<ActionResult<null>> {
  return toActionResult(async () => {
    const user = await requireSupportAdmin();
    const parsedId = Id.safeParse(id);
    const parsedOf = Id.safeParse(ofId);
    if (!parsedId.success || !parsedOf.success) throw new Error("INVALID");
    if (!triageLimiter.hit(user.member.id).allowed) throw new Error("RATE_LIMITED");
    const result = await supportRepository.markDuplicate(user.member.id, parsedId.data, parsedOf.data);
    if (!result.ok) throw new Error(result.error);
    return null;
  });
}

/** Publishing goes to a public repository: a handful per hour is plenty. */
const publishLimiter = createRateLimiter({ limit: 10, windowMs: 60 * 60_000 });

/** `PublishTicketInput` plus the mandatory "sin datos internos" confirmation. */
const PublishInput = publishTicketInputSchema.extend({ confirmedRedaction: z.literal(true) }).strict();

/** The editable preview of "Publicar en GitHub…": the redacted template, the labels and whether publishing is possible. */
export async function getPublishDraftAction(id: string): Promise<ActionResult<PublishDraftData>> {
  return toActionResult(async () => {
    await requireSupportAdmin();
    const parsedId = Id.safeParse(id);
    if (!parsedId.success) throw new Error("INVALID");
    if (!SOPORTE_GITHUB_ENABLED) throw new Error("DISABLED");
    const ticket = await getPublishableTicket(parsedId.data);
    if (!ticket) throw new Error("NOT_FOUND");
    const draft = buildPublishDraft(ticket, await loadRedactionContext());
    return {
      code: ticket.code,
      ...draft,
      configured: isGithubConfigured(),
      published: ticket.githubIssueNumber !== null && ticket.githubIssueUrl !== null
        ? { number: ticket.githubIssueNumber, url: ticket.githubIssueUrl }
        : null,
    };
  });
}

/**
 * Publishes a solicitud to GitHub as an RFC issue after admin review. Nothing
 * is sent unless `confirmedRedaction` is true; a solicitud is published once
 * (`ALREADY_PUBLISHED`); a GitHub error stores nothing.
 */
export async function publishTicketAction(
  id: string,
  input: PublishTicketInput,
): Promise<ActionResult<{ number: number; url: string }>> {
  return toActionResult(async () => {
    const user = await requireSupportAdmin();
    const parsedId = Id.safeParse(id);
    if (!parsedId.success) throw new Error("INVALID");
    const raw = (input ?? {}) as Partial<PublishTicketInput>;
    if (raw.confirmedRedaction !== true) throw new Error("CONFIRM_REQUIRED");
    const parsed = PublishInput.safeParse(raw);
    if (!parsed.success) throw new Error("INVALID");
    if (!SOPORTE_GITHUB_ENABLED) throw new Error("DISABLED");
    if (!isGithubConfigured()) throw new Error("GITHUB_NOT_CONFIGURED");
    if (!publishLimiter.hit(user.member.id).allowed) throw new Error("RATE_LIMITED");

    const ticket = await getPublishableTicket(parsedId.data);
    if (!ticket) throw new Error("NOT_FOUND");
    if (ticket.githubIssueNumber !== null) throw new Error("ALREADY_PUBLISHED");
    // Two admins publishing the same solicitud at once would create two issues.
    if (publishing.has(ticket.id)) throw new Error("ALREADY_PUBLISHED");

    const { confirmedRedaction: _confirmed, ...publish } = parsed.data;
    const labels = [...new Set([RFC_LABEL, ...publish.labels])];
    publishing.add(ticket.id);
    try {
      let issue: { number: number; url: string };
      try {
        issue = await createGithubIssue({ title: publish.title, body: publish.body, labels });
      } catch {
        // The API message may echo the request: keep it out of the client.
        throw new Error("GITHUB_ERROR");
      }
      const recorded = await supportRepository.recordPublished(user.member.id, ticket.id, issue, { ...publish, labels });
      if (!recorded.ok) throw new Error(recorded.error);
      return issue;
    } finally {
      publishing.delete(ticket.id);
    }
  });
}

/** Solicitudes being published right now by this server process. */
const publishing = new Set<string>();
