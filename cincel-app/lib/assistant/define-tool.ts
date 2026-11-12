/**
 * `defineTool` (redesign BE §8.10, §10.1): one assistant tool with its
 * capability, availability (Rule 3: reads the `*-actions.flags.ts` of the
 * actions it calls, never the actions modules), approval rule
 * (`confirm: true` → AI SDK `needsApproval`; writes also ask after untrusted
 * content in the turn), `summarize(input)` for `ConfirmationCard` and `run`.
 */
import { tool, type FlexibleSchema, type ModelMessage, type Tool, type ToolSet } from "ai";
import type { z } from "zod";

import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { actionErrorCode, actionErrorText } from "@/lib/errors";
import { NOT_IMPLEMENTED } from "@/lib/stubs";
import type { AssistantContext } from "@/lib/types/redesign";

/** `threadId` is null when a button on the page runs the tool (no chat thread). */
export type ToolRunContext = { user: AuthenticatedUser; context: AssistantContext; threadId: string | null };

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

/** What a tool returns instead of throwing (error codes of BE §9.10, Spanish copy). */
export type ToolFailure = { ok: false; error: string; message: string };

/** A tool result carrying third-party text (mail, documents; review N4). */
export type UntrustedContent<T = unknown> = { untrusted: true; content: T };

/** Wraps a tool result that carries third-party text so the model treats it as data. */
export function untrusted<T>(content: T): UntrustedContent<T> {
  return { untrusted: true, content };
}

/**
 * For `available(ctx)`: true only when every named action is flipped to
 * `true` in its `IMPLEMENTED` flags module (Rule 3).
 */
export function implemented<F extends Readonly<Record<string, boolean>>>(flags: F, ...names: (keyof F)[]): boolean {
  return names.every((name) => flags[name] === true);
}

/** `needsApproval` as passed to the AI SDK. */
export type ApprovalRule = boolean | ((input: unknown, options: { messages: ModelMessage[] }) => boolean);

const TOOL_NAME = /^[a-z][a-z0-9_]*$/;

/** BE §9.10 copy of `NOT_IMPLEMENTED`. */
const NOT_IMPLEMENTED_COPY = "Esta función todavía no está disponible.";

function failure(error: string, message?: string): ToolFailure {
  return { ok: false, error, message: message ?? actionErrorText(error) };
}

function isUntrustedValue(value: unknown): boolean {
  return typeof value === "object" && value !== null && (value as { untrusted?: unknown }).untrusted === true;
}

/**
 * True when the current turn (the messages after the last user message)
 * already contains a tool result marked `{ untrusted: true }`.
 */
export function turnHasUntrustedResult(messages: readonly ModelMessage[]): boolean {
  let start = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      start = i + 1;
      break;
    }
  }
  for (const message of messages.slice(start)) {
    if (message.role !== "tool") continue;
    for (const part of message.content) {
      if (part.type !== "tool-result") continue;
      if (part.output.type === "json" && isUntrustedValue(part.output.value)) return true;
    }
  }
  return false;
}

/**
 * The approval rule of a tool (BE §10.1): `confirm` → always; a write tool
 * without `confirm` → only when the turn already read untrusted content;
 * reads → never.
 */
export function approvalRule(definition: Pick<ToolDefinition, "confirm" | "write">): ApprovalRule {
  if (definition.confirm) return true;
  if (definition.write) return (_input, { messages }) => turnHasUntrustedResult(messages);
  return false;
}

export function defineTool<S extends z.ZodType>(definition: ToolDefinition<S>): DefinedTool<S> {
  if (!TOOL_NAME.test(definition.name)) {
    throw new Error(`INVALID: tool name "${definition.name}" must be snake_case`);
  }
  const needsApproval = approvalRule(definition);
  const inputSchema = definition.schema as unknown as FlexibleSchema<z.output<S>>;

  return {
    name: definition.name,
    definition,
    toAiTool(ctx: ToolRunContext): Tool {
      return tool<z.output<S>, unknown, Record<string, unknown>>({
        description: definition.description,
        inputSchema,
        needsApproval,
        execute: async (input: z.output<S>) => {
          // Re-checked at execute time: the tool set may outlive a role change.
          if (!definition.capability(ctx.user)) return failure("FORBIDDEN");
          if (!definition.available({ user: ctx.user, context: ctx.context })) {
            return failure(NOT_IMPLEMENTED, NOT_IMPLEMENTED_COPY);
          }
          try {
            return await definition.run(ctx, input);
          } catch (err) {
            const code = actionErrorCode(err) || "ERROR";
            return failure(code, code === NOT_IMPLEMENTED ? NOT_IMPLEMENTED_COPY : actionErrorText(err));
          }
        },
      });
    },
  };
}

/**
 * The AI SDK tool set for one request: every defined tool whose
 * `capability(user)` and `available(ctx)` are true. Unavailable tools are not
 * offered to the model. Throws on a duplicate tool name.
 */
export function buildToolSet(defined: readonly DefinedTool[], ctx: ToolRunContext): ToolSet {
  const set: ToolSet = {};
  const seen = new Set<string>();
  for (const entry of defined) {
    if (seen.has(entry.name)) throw new Error(`INVALID: duplicate assistant tool "${entry.name}"`);
    seen.add(entry.name);
    const { definition } = entry;
    if (!definition.capability(ctx.user)) continue;
    if (!definition.available({ user: ctx.user, context: ctx.context })) continue;
    set[entry.name] = entry.toAiTool(ctx);
  }
  return set;
}
