/**
 * `defineTool` (redesign BE §8.10, §10.1): one assistant tool with its
 * capability, availability (Rule 3: reads the `*-actions.flags.ts` of the
 * actions it calls, never the actions modules), approval rule
 * (`confirm: true` → AI SDK `needsApproval`; writes also ask after untrusted
 * content in the turn), `summarize(input)` for `ConfirmationCard` and `run`.
 */
import type { Tool } from "ai";
import type { z } from "zod";

import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { notImplemented } from "@/lib/stubs";
import type { AssistantContext } from "@/lib/types/redesign";

export type ToolRunContext = { user: AuthenticatedUser; context: AssistantContext; threadId: string };

export type ToolAvailabilityContext = {
  user: AuthenticatedUser;
  context: AssistantContext;
};

export type ToolDefinition<S extends z.ZodType = z.ZodType> = {
  name: string;
  description: string;
  schema: S;
  capability(user: AuthenticatedUser): boolean;
  available(ctx: ToolAvailabilityContext): boolean;
  /** "Confirmar" in BE §10.2–§10.3. */
  confirm: boolean;
  /** Write tool: asks for approval after an untrusted result in the same turn (review N4). */
  write: boolean;
  summarize(input: z.output<S>): string;
  run(ctx: ToolRunContext, input: z.output<S>): Promise<unknown>;
};

export type DefinedTool<S extends z.ZodType = z.ZodType> = {
  name: string;
  definition: ToolDefinition<S>;
  /** The AI SDK tool for one request (execute re-checks the capability). */
  toAiTool(ctx: ToolRunContext): Tool;
};

export function defineTool<S extends z.ZodType>(definition: ToolDefinition<S>): DefinedTool<S> {
  return notImplemented("defineTool", definition);
}
