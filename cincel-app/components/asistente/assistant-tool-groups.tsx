"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

import { ASSISTANT_TOOL_GROUPS, groupsForTools, type AssistantToolGroup } from "@/lib/assistant/starter-prompts";

const ToolGroupsContext = createContext<readonly AssistantToolGroup[]>(ASSISTANT_TOOL_GROUPS);

/**
 * The starter groups for the signed-in user (#1055): only the prompts whose
 * tools are in `toolNames`, the user's tool set read on the server. Without
 * a provider the layouts show every group.
 */
export function AssistantToolGroupsProvider({
  toolNames,
  children,
}: {
  toolNames: readonly string[] | null | undefined;
  children: ReactNode;
}) {
  const groups = useMemo(() => (toolNames ? groupsForTools(toolNames) : ASSISTANT_TOOL_GROUPS), [toolNames]);
  return <ToolGroupsContext.Provider value={groups}>{children}</ToolGroupsContext.Provider>;
}

/** The starter groups the user may use. */
export function useAssistantToolGroups(): readonly AssistantToolGroup[] {
  return useContext(ToolGroupsContext);
}
