"use client";

import type { ReactNode } from "react";
import { ArrowDownIcon } from "lucide-react";

import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";

export type JumpToLatestProps = { visible: boolean; newCount: number; onJump(): void };

/** "1 nuevo" / "{n} nuevos". */
export function newMessagesLabel(count: number): string {
  return count === 1 ? "1 nuevo" : `${count} nuevos`;
}

/**
 * "Bajar al último mensaje" pill at the bottom of an Asistente log (frame
 * `Asistente-Esencial`). Shows while the reader is scrolled up; the badge
 * counts the messages that arrived since.
 */
export function JumpToLatest({ visible, newCount, onJump }: JumpToLatestProps): ReactNode {
  if (!visible) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3.5 flex justify-center">
      <Button
        type="button"
        variant="outline"
        className="anim-in pointer-events-auto h-8 gap-2 rounded-full px-3.5 text-[12.5px] font-medium shadow-md"
        onClick={onJump}
      >
        <ArrowDownIcon aria-hidden className="size-3.5" />
        Bajar al último mensaje
        {newCount > 0 ? (
          <Badge variant="secondary" className="rounded-full px-[7px] py-px text-[11.5px]">
            {newMessagesLabel(newCount)}
          </Badge>
        ) : null}
      </Button>
    </div>
  );
}
