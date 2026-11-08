"use client";

import { Camera } from "lucide-react";
import { useId, useRef, useState, type ChangeEvent } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/shadcn/avatar";
import { Button } from "@/components/ui/shadcn/button";
import { uploadMyPhoto, usePhotoUploadMutation } from "@/components/shell/photo-upload";
import { actionErrorText } from "@/lib/errors";

import { PHOTO_ACCEPT, PHOTO_MAX_BYTES, PHOTO_TYPES, reencodeToJpeg } from "./reencode-photo";

/** `onChange(url)` after an upload; the new URL is already in `qk.me.profile()`. */
export type ProfilePhotoButtonProps = { photoUrl: string | null; initials: string; onChange?(url: string): void };

/** Copy of the photo route's own codes (FE §9); every other code goes through `actionErrorText`. */
const PHOTO_ERROR_COPY: Record<string, string> = {
  TOO_LARGE: "La imagen pesa más de 2 MB. Elige una más ligera.",
  INVALID_TYPE: "Ese archivo no es una imagen. Usa JPG, PNG o WebP.",
};

/** Spanish copy for a photo upload error code. */
export function photoErrorText(code: string): string {
  return PHOTO_ERROR_COPY[code] ?? actionErrorText(code);
}

/**
 * Re-encode (EXIF orientation applied, metadata dropped), check the size and
 * POST through the shared `uploadMyPhoto`; resolves with the new URL and
 * throws `Error(code)`.
 */
async function uploadInicioPhoto(file: File): Promise<string> {
  const jpeg = await reencodeToJpeg(file);
  if (jpeg.size > PHOTO_MAX_BYTES) throw new Error("TOO_LARGE");
  return uploadMyPhoto(jpeg);
}

/**
 * Avatar 72 px with the camera button (redesign FE §3.2): re-encodes through
 * `<canvas>` to JPEG ≤ 1024 px (drops EXIF) and uploads to
 * `POST /api/staff/me/photo` through `usePhotoUploadMutation`, which writes
 * the new URL into `qk.me.profile()`: the Inicio and shell avatars update
 * together, with no refresh. Errors show inline under the avatar.
 */
export function ProfilePhotoButton({ photoUrl, initials, onChange }: ProfilePhotoButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const [error, setError] = useState<string | null>(null);
  const uploadPhoto = usePhotoUploadMutation(uploadInicioPhoto);
  const pending = uploadPhoto.isPending;

  async function upload(file: File) {
    setError(null);
    if (!PHOTO_TYPES.includes(file.type)) {
      setError(photoErrorText("INVALID_TYPE"));
      return;
    }
    try {
      onChange?.(await uploadPhoto.mutateAsync(file));
    } catch (err) {
      setError(photoErrorText(err instanceof Error ? err.message : ""));
    }
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset so picking the same file again fires `change`.
    event.target.value = "";
    if (file) void upload(file);
  }

  return (
    <div className="flex shrink-0 flex-col items-start gap-2">
      <div className="relative size-[72px]">
        <Avatar className="size-[72px]" aria-busy={pending || undefined}>
          {photoUrl ? <AvatarImage src={photoUrl} alt="Tu foto de perfil" /> : null}
          <AvatarFallback className="text-xl font-semibold">{initials}</AvatarFallback>
        </Avatar>
        <Button
          type="button"
          size="icon-sm"
          className="absolute -right-1 -bottom-1 rounded-full"
          aria-label={photoUrl ? "Cambiar foto de perfil" : "Subir foto de perfil"}
          aria-describedby={error ? errorId : undefined}
          disabled={pending}
          onClick={() => inputRef.current?.click()}
        >
          <Camera aria-hidden="true" />
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept={PHOTO_ACCEPT}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          aria-label="Elegir foto de perfil"
          data-testid="profile-photo-input"
          onChange={handleChange}
        />
      </div>
      {error ? (
        <p id={errorId} role="alert" className="max-w-60 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
