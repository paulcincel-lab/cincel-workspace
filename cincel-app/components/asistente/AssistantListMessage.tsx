"use client";

import { Separator } from "@/components/ui/shadcn/separator";

type Props = {
  title: string;
  items: string[];
};

/** Renders `render_list` output — a short titled enumeration. */
export function AssistantListMessage({ title, items }: Props) {
  return (
    <div className="w-full max-w-md overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="px-4 py-3">
        <p className="text-sm font-semibold text-foreground">{title}</p>
      </div>
      <Separator />
      <ul className="list-disc space-y-1.5 px-8 py-3 text-sm text-muted-foreground">
        {items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
