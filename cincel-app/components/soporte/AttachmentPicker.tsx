"use client";

export type AttachmentPickerProps = {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
};

/** Paste, drop or pick up to 3 images, with thumbnails (stub: #1112). */
export function AttachmentPicker(_props: AttachmentPickerProps) {
  return null;
}
