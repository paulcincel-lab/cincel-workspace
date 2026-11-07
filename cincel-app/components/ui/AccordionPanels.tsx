"use client";

import { type ReactNode, useState } from "react";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/shadcn/accordion";

export type AccordionPanelGroup = {
  id: string;
  title: string;
  count: number;
  /** Optional non-interactive content shown after the count (e.g. tramo chips). */
  badges?: ReactNode;
  /** Optional buttons at the right of the header, outside the toggle (e.g. "Agregar fases"). */
  actions?: ReactNode;
  /** Optional DOM id on the panel, for scrolling to it (e.g. a `?project=` deep link). */
  anchorId?: string;
  content: ReactNode;
};

/**
 * Collapsible groups where each group is a single bordered panel (header +
 * content share one card). All groups start open; collapsed state is tracked
 * per id so groups that appear or disappear (e.g. after filtering) keep it.
 */
export function AccordionPanels({ groups }: { groups: AccordionPanelGroup[] }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  return (
    <Accordion
      className="gap-4"
      multiple
      value={groups.filter((g) => !collapsed.has(g.id)).map((g) => g.id)}
      onValueChange={(open) => setCollapsed(new Set(groups.filter((g) => !(open as string[]).includes(g.id)).map((g) => g.id)))}
    >
      {groups.map((group) => (
        <AccordionItem
          key={group.id}
          id={group.anchorId}
          value={group.id}
          className="scroll-mt-4 overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
        >
          <div className="flex items-center">
            <AccordionTrigger className="min-w-0 flex-1 px-4 py-3">
              <span>
                {group.title}
                <span className="ml-2 font-normal text-muted-foreground">{group.count}</span>
                {group.badges ? <span className="ml-3 inline-flex align-middle">{group.badges}</span> : null}
              </span>
            </AccordionTrigger>
            {group.actions ? <div className="flex shrink-0 items-center gap-1 pr-3">{group.actions}</div> : null}
          </div>
          <AccordionContent className="pb-0">{group.content}</AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
