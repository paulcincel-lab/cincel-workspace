"use client";

import type { ReactNode } from "react";

import { CUTTO_LINK_LABELS, CUTTO_LINK_TARGET, cuttoBaseUrl } from "@/lib/integrations/cutto-links";
import type { AssistantToolGroup } from "@/lib/assistant/starter-prompts";

/**
 * Every starter group of the assistant ("Más ideas" and "/ comandos" in the
 * Visual composer): picking a prompt puts it in the composer without
 * sending. Disabled groups (Cutto) are drawn with their note and link:
 * their buttons are disabled, the section itself stays reachable so the link
 * to Cutto still works.
 */
export type AssistantCommandListProps = {
  groups: readonly AssistantToolGroup[];
  onPick(prompt: string): void;
};

export function AssistantCommandList({ groups, onPick }: AssistantCommandListProps): ReactNode {
  const cuttoUrl = cuttoBaseUrl();
  return (
    <div className="flex flex-col gap-3">
      {groups.map((group) => (
        <section
          key={group.key}
          aria-labelledby={`asistente-comandos-${group.key}`}
          className="flex flex-col gap-1"
        >
          <h3 id={`asistente-comandos-${group.key}`} className="px-2 text-xs font-medium text-muted-foreground">
            {group.label}
          </h3>
          <ul className="flex flex-col">
            {group.prompts.map((starter) => (
              <li key={starter.label}>
                <button
                  type="button"
                  disabled={group.disabled}
                  onClick={group.disabled ? undefined : () => onPick(starter.prompt)}
                  className="flex w-full flex-col items-start gap-0.5 rounded-lg px-2 py-1.5 text-left outline-none transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
                >
                  <span className="text-[13px] text-foreground">{starter.label}</span>
                  <span className="text-xs text-muted-foreground">{starter.description}</span>
                </button>
              </li>
            ))}
          </ul>
          {group.disabled && group.disabledNote ? (
            <p className="px-2 text-xs text-muted-foreground">
              {group.disabledNote}{" "}
              {cuttoUrl ? (
                <a className="underline underline-offset-2" href={cuttoUrl} {...CUTTO_LINK_TARGET}>
                  {CUTTO_LINK_LABELS.open}
                </a>
              ) : null}
            </p>
          ) : null}
        </section>
      ))}
    </div>
  );
}
