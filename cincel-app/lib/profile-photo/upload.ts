/**
 * Profile photo upload rules (redesign BE §7.2, §8.11, §16): the 2 MB request
 * limit, the 1 MB stored limit of `staff_photos_size_check`, the 10 per hour
 * per staff rate limit and the read URL handed back to the client.
 */
import { createHash } from "node:crypto";

import { createRateLimiter } from "@/lib/auth/rate-limit";

/** Largest accepted upload (the `file` field). */
export const MAX_PHOTO_UPLOAD_BYTES = 2 * 1024 * 1024;
/** Room for the multipart boundary and part headers on top of the file. */
export const PHOTO_MULTIPART_OVERHEAD_BYTES = 64 * 1024;
/** Largest stored photo (`staff_photos_size_check`, BE §3.4). */
export const MAX_STORED_PHOTO_BYTES = 1024 * 1024;

/** `POST /api/staff/me/photo`: 10 per hour per staff (BE §16). In-memory. */
export const photoUploadRateLimiter = createRateLimiter({ limit: 10, windowMs: 60 * 60 * 1000 });

export function photoSha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** The read URL of a staff photo; `v` busts caches when the bytes change. */
export function staffPhotoUrl(staffId: string, sha256: string): string {
  return `/api/staff/${staffId}/photo?v=${sha256.slice(0, 8)}`;
}

/** The quoted strong ETag of a photo. */
export function photoEtag(sha256: string): string {
  return `"${sha256}"`;
}

/** Whether an `If-None-Match` header matches `etag` (`*`, lists and weak validators included). */
export function ifNoneMatchHits(header: string | null, etag: string): boolean {
  if (!header) return false;
  const bare = etag.replace(/^W\//, "");
  return header
    .split(",")
    .map((value) => value.trim())
    .some((value) => value === "*" || value.replace(/^W\//, "") === bare);
}
