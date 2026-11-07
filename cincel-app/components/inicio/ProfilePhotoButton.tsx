"use client";

/** `onChange(null)` after the photo is removed. */
export type ProfilePhotoButtonProps = { photoUrl: string | null; initials: string; onChange(url: string | null): void };

/**
 * Avatar 72 px with the camera button (redesign FE §3.2): re-encodes through
 * `<canvas>` and uploads to `POST /api/staff/me/photo`.
 *
 * Contract stub: renders nothing until its owning issue implements it.
 */
export function ProfilePhotoButton(props: ProfilePhotoButtonProps) {
  void props;
  return null;
}
