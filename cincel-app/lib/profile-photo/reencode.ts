/**
 * Client side of the profile photo upload (redesign FE §3.2, §7.3; BE §8.11):
 * the picked image is drawn on a `<canvas>` and re-encoded to JPEG of at most
 * 1024 px per side, which drops EXIF and other metadata, then posted to
 * `POST /api/staff/me/photo`. Errors are thrown as `Error("<CODE>")` so the
 * caller shows them with `actionErrorText(err, "photo")`. Client-safe.
 */
import { actionErrorCode } from "@/lib/errors";

export const PHOTO_UPLOAD_URL = "/api/staff/me/photo";
/** The route's limit (`413 TOO_LARGE` above it). */
export const PHOTO_MAX_BYTES = 2 * 1024 * 1024;
export const PHOTO_MAX_EDGE = 1024;
export const PHOTO_JPEG_QUALITY = 0.9;

/** Width and height that fit `maxEdge` and keep the aspect ratio (never upscales). */
export function fitWithin(width: number, height: number, maxEdge: number = PHOTO_MAX_EDGE): { width: number; height: number } {
  const longest = Math.max(width, height);
  const scale = longest > maxEdge ? maxEdge / longest : 1;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Re-encode an image file to a metadata-free JPEG blob. Throws `INVALID_TYPE` or `TOO_LARGE`. */
export async function reencodePhoto(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error("INVALID_TYPE");

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // The browser could not decode it: not an image it can read.
    throw new Error("INVALID_TYPE");
  }

  const { width, height } = fitWithin(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("ENCODE_FAILED");
  }
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", PHOTO_JPEG_QUALITY));
  if (!blob) throw new Error("ENCODE_FAILED");
  if (blob.size > PHOTO_MAX_BYTES) throw new Error("TOO_LARGE");
  return blob;
}

/** Post the re-encoded photo; resolves with the new photo URL. */
export async function uploadMyPhoto(photo: Blob): Promise<string> {
  const body = new FormData();
  body.append("file", photo, "foto.jpg");
  const response = await fetch(PHOTO_UPLOAD_URL, { method: "POST", body });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (response.ok) {
    const url = payload && typeof payload === "object" && "url" in payload ? (payload as { url: unknown }).url : null;
    if (typeof url === "string" && url) return url;
    throw new Error("UPLOAD_FAILED");
  }

  // `{ error: "TOO_LARGE" }` from the route, else the HTTP status (413 / 415 / 429).
  const code = actionErrorCode(payload) || actionErrorCode(response.status);
  throw new Error(code || `HTTP_${response.status}`);
}
