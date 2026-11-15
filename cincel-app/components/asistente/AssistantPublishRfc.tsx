"use client";

import { useState } from "react";

import { Button } from "@/components/ui/shadcn/button";
import { PublishToGithubDialog } from "@/components/widgets/mejoras/PublishToGithubDialog";

/** Tickets whose review dialog the asistente already opened once in this session. */
const opened = new Set<string>();

/**
 * Shown after `create_rfc` files a solicitud: opens the same redaction + review
 * dialog as "Publicar en GitHub…" (once), and keeps a button to reopen it.
 */
export function AssistantPublishRfc({ ticketId, code }: { ticketId: string; code?: string }) {
  const [open, setOpen] = useState(() => {
    if (opened.has(ticketId)) return false;
    opened.add(ticketId);
    return true;
  });
  return (
    <div className="flex w-full items-center justify-between gap-3 rounded-md border border-border bg-card p-3 text-sm">
      <span className="text-foreground">{code ? `Solicitud ${code} lista para revisar.` : "Solicitud lista para revisar."}</span>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Revisar y publicar
      </Button>
      <PublishToGithubDialog ticketId={ticketId} open={open} onOpenChange={setOpen} />
    </div>
  );
}
