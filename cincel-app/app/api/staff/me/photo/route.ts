/**
 * POST /api/staff/me/photo (redesign BE §7.2, §8.11): `multipart/form-data`
 * field `file` (≤ 2 MB, jpeg / png / webp by magic bytes), metadata stripped,
 * stored in `staff_photos`; `200 { url }`, 401, `413 TOO_LARGE`,
 * `415 INVALID_TYPE`, `429 RATE_LIMITED`; revalidates the root layout.
 */
import { fileTypeFromBuffer } from "file-type";
import { revalidatePath } from "next/cache";
import { type NextRequest, NextResponse } from "next/server";

import { getSessionAccess } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { isPhotoMime, MalformedImageError, stripImageMetadata } from "@/lib/profile-photo/strip-metadata";
import {
  MAX_PHOTO_UPLOAD_BYTES,
  MAX_STORED_PHOTO_BYTES,
  PHOTO_MULTIPART_OVERHEAD_BYTES,
  photoSha256,
  photoUploadRateLimiter,
  staffPhotoUrl,
} from "@/lib/profile-photo/upload";
import { upsertStaffPhoto } from "@/lib/repositories/preferences-repository";

function errorResponse(error: string, status: number, headers?: Record<string, string>): NextResponse {
  return NextResponse.json({ error }, { status, headers });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const access = await getSessionAccess();
  if (!access.user) {
    return access.status === "no_system_access"
      ? errorResponse("FORBIDDEN", 403)
      : errorResponse("UNAUTHENTICATED", 401);
  }
  const staffId = access.user.id;

  const limit = photoUploadRateLimiter.hit(staffId);
  if (!limit.allowed) {
    return errorResponse("RATE_LIMITED", 429, { "Retry-After": String(limit.retryAfterSeconds) });
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_PHOTO_UPLOAD_BYTES + PHOTO_MULTIPART_OVERHEAD_BYTES) {
    return errorResponse("TOO_LARGE", 413);
  }

  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get("file");
  } catch {
    return errorResponse("INVALID", 400);
  }
  if (!file || typeof file === "string") return errorResponse("INVALID", 400);
  if (file.size > MAX_PHOTO_UPLOAD_BYTES) return errorResponse("TOO_LARGE", 413);

  const raw = new Uint8Array(await file.arrayBuffer());
  if (raw.byteLength > MAX_PHOTO_UPLOAD_BYTES) return errorResponse("TOO_LARGE", 413);

  // The client's Content-Type is never trusted: magic bytes decide.
  const detected = await fileTypeFromBuffer(raw);
  const mime = detected?.mime;
  if (!isPhotoMime(mime)) return errorResponse("INVALID_TYPE", 415);

  let bytes: Buffer;
  try {
    bytes = stripImageMetadata(raw, mime);
  } catch (error) {
    if (error instanceof MalformedImageError) return errorResponse("INVALID_TYPE", 415);
    throw error;
  }
  if (bytes.byteLength > MAX_STORED_PHOTO_BYTES) return errorResponse("TOO_LARGE", 413);

  const sha256 = photoSha256(bytes);
  await upsertStaffPhoto(db, staffId, { mime, bytes, sha256 });
  revalidatePath("/", "layout");

  return NextResponse.json({ url: staffPhotoUrl(staffId, sha256) });
}
