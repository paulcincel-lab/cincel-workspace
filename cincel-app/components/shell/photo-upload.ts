"use client";

/**
 * Client side of the profile photo upload (redesign FE §3.2, §7.3): the
 * picked file is decoded and re-encoded through `<canvas>` to a JPEG whose
 * longest side is at most 1024 px (this drops EXIF, including GPS), then sent
 * to `POST /api/staff/me/photo`. Failures throw `Error(CODE)` so the caller
 * shows `actionErrorText(err, "photo")`.
 *
 * `usePhotoUploadMutation` / `useRemovePhotoMutation` (plan §5 Phase 1b, S2)
 * write the result into `qk.me.profile()` with `setQueryData`; the route and
 * `removeMyPhotoAction` no longer revalidate the layout. Errors stay with the
 * caller (`mutateAsync` rejects), so each screen keeps its own error copy.
 */

import { useMutation, useQuery, useQueryClient, type QueryClient, type UseMutationResult } from "@tanstack/react-query";

import { removeMyPhotoAction } from "@/lib/actions/profile-photo-actions";
import { qk } from "@/lib/query/keys";
import { runAction } from "@/lib/query/mutation";
import { meProfileOptions } from "@/lib/query/options/me";
import type { MyProfile } from "@/lib/types/shell";

export const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";
export const PHOTO_MAX_SIDE = 1024;
export const PHOTO_MAX_BYTES = 2 * 1024 * 1024;
export const PHOTO_UPLOAD_URL = "/api/staff/me/photo";

const ACCEPTED_TYPES = new Set(PHOTO_ACCEPT.split(","));
const JPEG_QUALITY = 0.86;

/** Target size that keeps the aspect ratio and fits `maxSide` on the longest side. */
export function fitWithin(width: number, height: number, maxSide = PHOTO_MAX_SIDE): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("INVALID_TYPE"));
    };
    img.src = url;
  });
}

/** Re-encode an image file to a metadata-free JPEG ≤ 1024 px. Throws `INVALID_TYPE` for anything else. */
export async function reencodePhoto(file: File): Promise<Blob> {
  if (!ACCEPTED_TYPES.has(file.type)) throw new Error("INVALID_TYPE");
  const img = await loadImage(file);
  const { width, height } = fitWithin(img.naturalWidth, img.naturalHeight);
  if (width === 0) throw new Error("INVALID_TYPE");
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("INVALID_TYPE");
  ctx.drawImage(img, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
  if (!blob) throw new Error("INVALID_TYPE");
  if (blob.size > PHOTO_MAX_BYTES) throw new Error("TOO_LARGE");
  return blob;
}

const STATUS_CODES: Record<number, string> = {
  401: "UNAUTHORIZED",
  413: "TOO_LARGE",
  415: "INVALID_TYPE",
  429: "RATE_LIMITED",
};

/** POST the re-encoded photo; resolves with the new photo URL. */
export async function uploadMyPhoto(photo: Blob): Promise<string> {
  const body = new FormData();
  body.append("file", photo, "photo.jpg");
  const res = await fetch(PHOTO_UPLOAD_URL, { method: "POST", body, credentials: "same-origin" });
  const payload = (await res.json().catch(() => null)) as { url?: unknown; error?: unknown } | null;
  if (!res.ok) {
    const code = typeof payload?.error === "string" && payload.error ? payload.error : STATUS_CODES[res.status];
    throw new Error(code ?? "UNKNOWN");
  }
  if (typeof payload?.url !== "string" || !payload.url) throw new Error("UNKNOWN");
  return payload.url;
}

/** Re-encode then upload; the single entry point UI components call. */
export async function changeMyPhoto(file: File): Promise<string> {
  return uploadMyPhoto(await reencodePhoto(file));
}

/**
 * The caller's `me.profile`, seeded with `initial` (the layout's session or
 * the page's own read) when the cache is still empty. Every avatar that
 * reads it shows a new photo as soon as an upload or removal settles.
 */
export function useMyProfile(initial: MyProfile): MyProfile {
  return useQuery(meProfileOptions(initial)).data ?? initial;
}

/** Writes the new photo URL into the cached `me.profile` (no-op when nothing is cached yet). */
export function setMyProfilePhoto(qc: QueryClient, photoUrl: string | null): void {
  qc.setQueryData<MyProfile>(qk.me.profile(), (current) => (current ? { ...current, photoUrl } : current));
}

/**
 * Upload mutation: `mutateAsync(file)` resolves with the new URL and sets
 * `me.profile.photoUrl`. `upload` defaults to `changeMyPhoto`; a screen with
 * its own re-encode passes it so its behaviour stays the same.
 */
export function usePhotoUploadMutation(
  upload: (file: File) => Promise<string> = changeMyPhoto,
): UseMutationResult<string, Error, File> {
  const qc = useQueryClient();
  return useMutation<string, Error, File>({
    mutationFn: (file) => upload(file),
    onSuccess: (photoUrl) => setMyProfilePhoto(qc, photoUrl),
  });
}

/** Remove mutation: runs `removeMyPhotoAction` and sets `me.profile.photoUrl` to null. */
export function useRemovePhotoMutation(): UseMutationResult<void, Error, void> {
  const qc = useQueryClient();
  return useMutation<void, Error, void>({
    mutationFn: async () => {
      await runAction<void, unknown>(() => removeMyPhotoAction(), undefined);
    },
    onSuccess: () => setMyProfilePhoto(qc, null),
  });
}
