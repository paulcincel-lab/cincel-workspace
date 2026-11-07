/**
 * Client-side re-encode of a profile photo before upload (redesign FE §3.2,
 * BE §8.11): decode, scale so the longest side is at most 1024 px and draw it
 * on a `<canvas>`, then export JPEG. The canvas carries only pixels, so EXIF
 * (GPS included) never leaves the browser.
 */

/** The file picker's `accept`. */
export const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";
export const PHOTO_TYPES: readonly string[] = PHOTO_ACCEPT.split(",");
/** Longest side after re-encode. */
export const PHOTO_MAX_SIDE = 1024;
/** Upload limit of `POST /api/staff/me/photo`. */
export const PHOTO_MAX_BYTES = 2 * 1024 * 1024;
const JPEG_QUALITY = 0.85;

/** Width and height that fit in `maxSide` without upscaling. */
export function scaledSize(width: number, height: number, maxSide: number = PHOTO_MAX_SIDE): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= 0) return { width: 0, height: 0 };
  const scale = Math.min(1, maxSide / longest);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

type Decoded = { source: CanvasImageSource; width: number; height: number; release(): void };

async function decode(file: Blob): Promise<Decoded> {
  if (typeof createImageBitmap === "function") {
    // `from-image` applies the EXIF orientation before the pixels are copied.
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, release: () => URL.revokeObjectURL(url) };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

/**
 * JPEG ≤ `maxSide` px of `file`. Throws `Error("INVALID_TYPE")` when the
 * browser cannot decode it as an image.
 */
export async function reencodeToJpeg(file: Blob, maxSide: number = PHOTO_MAX_SIDE): Promise<Blob> {
  let decoded: Decoded;
  try {
    decoded = await decode(file);
  } catch {
    throw new Error("INVALID_TYPE");
  }
  try {
    const { width, height } = scaledSize(decoded.width, decoded.height, maxSide);
    if (width === 0 || height === 0) throw new Error("INVALID_TYPE");
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("INVALID_TYPE");
    // JPEG has no alpha: paint transparent PNG / WebP areas white, not black.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(decoded.source, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    if (!blob) throw new Error("INVALID_TYPE");
    return blob;
  } finally {
    decoded.release();
  }
}
