"use client";

import { useEffect, useState } from "react";

/**
 * Whether the Google Drive picker is available (staff OAuth client configured).
 * Client-side probe of /api/google/drive/status — for pages that aren't
 * Server Components and can't call `isPickerDriveConfigured()` directly.
 */
export function useDriveEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/google/drive/status")
      .then((r) => (r.ok ? r.json() : { configured: false }))
      .then((body) => {
        if (!cancelled) setEnabled(Boolean(body?.configured));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  return enabled;
}
