"use client";

import { Badge } from "@/components/ui/shadcn/badge";
import { useBandejaUnread } from "@/lib/my-space/bandeja-unread";

/** "99+" above 99. */
export function formatUnreadBadge(count: number): string {
  return count > 99 ? "99+" : String(count);
}

/**
 * The Mi espacio unread badge (redesign FE §3.1): the server count from the
 * slot loader, kept fresh by the Bandeja poll. Hidden at zero.
 */
export function BandejaBadge({ data }: { data: { unreadCount: number } }) {
  const count = useBandejaUnread(data.unreadCount);
  if (count <= 0) return null;
  return (
    <Badge variant="destructive" data-slot="bandeja-badge">
      {formatUnreadBadge(count)}
      <span className="sr-only"> sin leer</span>
    </Badge>
  );
}
