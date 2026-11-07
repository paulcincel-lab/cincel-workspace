/**
 * The tool set of one chat request with server threads (redesign BE §7.9,
 * §8.10, §10.1): the existing tools (`buildAssistantTools(user)`) plus the
 * registered `defineTool` tools the caller may use, each wrapped so that
 * - a `project` input left empty defaults to the resolved page project,
 * - results of tools that read third-party text are stored as
 *   `{ untrusted: true, content }`,
 * - an approved call reports its outcome (`done` / `failed`) to the audit.
 * Plus the approval policy (`toolApproval`) for `streamText`.
 */
import type { Tool, ToolSet } from "ai";

import { LEGACY_CONFIRM_TOOLS, buildToolApproval, toolFailureOf, type ApprovalPolicy, type ChatToolApproval } from "@/lib/assistant/approvals";
import type { ResolvedAssistantContext } from "@/lib/assistant/context";
import type { DefinedTool, ToolRunContext } from "@/lib/assistant/define-tool";
import { UNTRUSTED_RESULT_TOOLS, markUntrusted } from "@/lib/assistant/threads";
import { buildAssistantTools } from "@/lib/assistant/tools";
import { DEFINED_TOOLS } from "@/lib/assistant/tools/index";
import type { AuthenticatedUser } from "@/lib/auth/auth-service";

export type ToolOutcome = { toolCallId: string; tool: string; result?: unknown; error?: string };

export type ChatToolsOptions = {
  user: AuthenticatedUser;
  threadId: string;
  resolved: ResolvedAssistantContext;
  /** Tool call ids the user approved in this request: their outcome is audited. */
  approvedCallIds: ReadonlySet<string>;
  onOutcome(outcome: ToolOutcome): Promise<void> | void;
  /** Registered tools; the registry by default (injectable for tests). */
  defined?: readonly DefinedTool[];
};

export type ChatTools = { tools: ToolSet; toolApproval: ChatToolApproval; policy: ApprovalPolicy };

/** The registered tools the caller may use: capability ∧ available(ctx) (Rule 3). */
function registeredTools(defined: readonly DefinedTool[], ctx: ToolRunContext): { tools: ToolSet; policy: ApprovalPolicy } {
  const tools: ToolSet = {};
  const confirm = new Set<string>();
  const write = new Set<string>();
  for (const entry of defined) {
    const { definition } = entry;
    if (tools[entry.name]) continue;
    if (!definition.capability(ctx.user)) continue;
    if (!definition.available({ user: ctx.user, context: ctx.context })) continue;
    tools[entry.name] = entry.toAiTool(ctx);
    if (definition.confirm) confirm.add(entry.name);
    if (definition.write) write.add(entry.name);
  }
  return { tools, policy: { confirm, write } };
}

function hasProjectInput(tool: Tool): boolean {
  const schema = (tool as { inputSchema?: { shape?: Record<string, unknown> } }).inputSchema;
  return Boolean(schema && typeof schema === "object" && schema.shape && "project" in schema.shape);
}

/** Fills an empty `project` input with the resolved page project's name. */
export function withDefaultProject(input: unknown, project: { name: string } | null): unknown {
  if (!project || !input || typeof input !== "object" || Array.isArray(input)) return input;
  const current = (input as { project?: unknown }).project;
  if (typeof current === "string" && current.trim()) return input;
  return { ...(input as Record<string, unknown>), project: project.name };
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return typeof value === "object" && value !== null && Symbol.asyncIterator in value;
}

function wrapTool(name: string, tool: Tool, options: ChatToolsOptions): Tool {
  const execute = tool.execute;
  if (!execute) return tool;
  const defaultsProject = hasProjectInput(tool);
  const untrusted = UNTRUSTED_RESULT_TOOLS.has(name);

  const wrapped: Tool["execute"] = async (input, execOptions) => {
    const effectiveInput = defaultsProject ? withDefaultProject(input, options.resolved.defaultProject) : input;
    const audited = options.approvedCallIds.has(execOptions.toolCallId);
    try {
      let result = await execute(effectiveInput as never, execOptions);
      if (isAsyncIterable(result)) return result;
      if (untrusted) result = markUntrusted(result);
      if (audited) {
        const failure = toolFailureOf(result);
        await options.onOutcome(
          failure
            ? { toolCallId: execOptions.toolCallId, tool: name, error: failure }
            : { toolCallId: execOptions.toolCallId, tool: name, result },
        );
      }
      return result;
    } catch (err) {
      if (audited) {
        await options.onOutcome({
          toolCallId: execOptions.toolCallId,
          tool: name,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      throw err;
    }
  };

  return { ...tool, execute: wrapped } as Tool;
}

export function buildChatTools(options: ChatToolsOptions): ChatTools {
  const ctx: ToolRunContext = { user: options.user, context: options.resolved.context, threadId: options.threadId };
  const legacy = buildAssistantTools(options.user);
  const registered = registeredTools(options.defined ?? DEFINED_TOOLS, ctx);

  // A registered tool replaces an existing one of the same name.
  const merged: ToolSet = { ...legacy, ...registered.tools };
  const tools: ToolSet = {};
  for (const [name, tool] of Object.entries(merged)) tools[name] = wrapTool(name, tool, options);

  const confirm = new Set<string>(registered.policy.confirm);
  const write = new Set<string>(registered.policy.write);
  for (const name of Object.keys(legacy)) {
    if (registered.tools[name]) continue;
    if (LEGACY_CONFIRM_TOOLS.has(name)) {
      confirm.add(name);
      write.add(name);
    }
  }
  const policy: ApprovalPolicy = { confirm, write };
  return { tools, toolApproval: buildToolApproval(tools, policy), policy };
}
