import { z } from "zod";

import {
  TICKET_AREAS,
  TICKET_KINDS,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  TICKET_VISIBILITIES,
} from "@/lib/types/soporte";

export const TICKET_TITLE_MIN = 4;
export const TICKET_TITLE_MAX = 120;
export const TICKET_TEXT_MAX = 5000;

const uuid = z.string().uuid();

export const ticketKindSchema = z.enum(TICKET_KINDS);
export const ticketStatusSchema = z.enum(TICKET_STATUSES);
export const ticketPrioritySchema = z.enum(TICKET_PRIORITIES);
export const ticketAreaSchema = z.enum(TICKET_AREAS);

export const ticketClientContextSchema = z.object({
  path: z.string().trim().min(1).max(500),
  estilo: z.string().trim().max(40),
  theme: z.string().trim().max(40),
  viewport: z.string().trim().max(40),
  userAgent: z.string().trim().max(500),
});

export const ticketDraftSchema = z.object({
  kind: ticketKindSchema,
  title: z.string().trim().min(TICKET_TITLE_MIN, "El título debe tener al menos 4 caracteres.").max(TICKET_TITLE_MAX),
  description: z.string().trim().min(1, "Cuéntanos qué pasó.").max(TICKET_TEXT_MAX),
  steps: z.string().trim().max(TICKET_TEXT_MAX).nullish(),
});

export const createTicketInputSchema = ticketDraftSchema.extend({ context: ticketClientContextSchema });

export const ticketFiltersSchema = z.object({
  status: z.union([ticketStatusSchema, z.enum(["abiertas", "cerradas"])]).optional(),
  kind: ticketKindSchema.optional(),
  area: ticketAreaSchema.optional(),
  priority: ticketPrioritySchema.optional(),
  assigneeId: uuid.optional(),
  unassigned: z.literal(true).optional(),
  authorId: uuid.optional(),
  q: z.string().trim().max(120).optional(),
  sort: z.enum(["updated", "created", "priority"]).optional(),
});

export const listTicketsInputSchema = ticketFiltersSchema.extend({ cursor: z.string().max(200).nullish() });

export const ticketPatchSchema = z
  .object({
    status: ticketStatusSchema.optional(),
    priority: ticketPrioritySchema.nullable().optional(),
    assigneeId: uuid.nullable().optional(),
    message: z.string().trim().min(1).max(TICKET_TEXT_MAX).optional(),
  })
  .refine((p) => p.status !== undefined || p.priority !== undefined || p.assigneeId !== undefined, {
    message: "Nada que cambiar.",
  });

export const ticketReplySchema = z.string().trim().min(1, "Escribe un mensaje.").max(TICKET_TEXT_MAX);

export const ticketMessageInputSchema = z.object({
  text: ticketReplySchema,
  visibility: z.enum(TICKET_VISIBILITIES),
});

export const publishTicketInputSchema = z.object({
  title: z.string().trim().min(TICKET_TITLE_MIN).max(TICKET_TITLE_MAX),
  body: z.string().trim().min(1).max(60_000),
  labels: z.array(z.string().trim().min(1).max(50)).max(10),
});
