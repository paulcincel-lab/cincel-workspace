"use client";

import { type ReactNode, useState } from "react";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/shadcn/accordion";

export type AccordionPanelGroup = {
  id: string;
  title: string;
  count: number;
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
        <AccordionItem key={group.id} value={group.id} className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <AccordionTrigger className="px-4 py-3">
            <span>
              {group.title}
              <span className="ml-2 font-normal text-muted-foreground">{group.count}</span>
            </span>
          </AccordionTrigger>
          <AccordionContent className="pb-0">{group.content}</AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
