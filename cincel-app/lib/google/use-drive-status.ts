"use client";

import { queryOptions, useQuery } from "@tanstack/react-query";

import { qk } from "@/lib/query/keys";

/** `hasDriveGrant` is present only when the route sent it (the Drive browser's consent check). */
export type DriveStatus = { configured: boolean; hasDriveGrant?: boolean };

/**
 * Reads GET /api/google/drive/status. Side-effect free: one GET, no writes.
 * A non-OK response (401, 5xx) means "not configured", as before.
 */
export async function fetchDriveStatus(): Promise<DriveStatus> {
  const res = await fetch("/api/google/drive/status");
  if (!res.ok) return { configured: false };
  const body = (await res.json()) as { configured?: unknown; hasDriveGrant?: unknown } | null;
  return {
    configured: Boolean(body?.configured),
    ...(typeof body?.hasDriveGrant === "boolean" ? { hasDriveGrant: body.hasDriveGrant } : {}),
  };
}

/** `qk.google.driveStatus()`, 5 min stale. */
export function driveStatusOptions() {
  return queryOptions<DriveStatus>({
    queryKey: qk.google.driveStatus(),
    queryFn: fetchDriveStatus,
    staleTime: 5 * 60_000,
  });
}

/**
 * Whether the Google Drive picker is available (staff OAuth client
 * configured), for client components that can't call
 * `isPickerDriveConfigured()` directly. `configured` is `false` while loading
 * and on error.
 */
export function useDriveStatus(): { configured: boolean; isLoading: boolean } {
  const { data, isLoading } = useQuery(driveStatusOptions());
  return { configured: data?.configured ?? false, isLoading };
}
