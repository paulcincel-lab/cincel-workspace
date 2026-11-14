"use client";

import { ImagePlus, X } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/shadcn/button";
import {
  addAttachmentFiles,
  ATTACHMENT_MAX_COUNT,
  ATTACHMENT_MIME_TYPES,
} from "@/lib/soporte/attachments-rules";

export type AttachmentPickerProps = {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
};

/** Paste, drop or pick up to 3 images (5 MB, png/jpeg/webp), with thumbnails and remove. */
export function AttachmentPicker({ files, onChange, disabled = false }: AttachmentPickerProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);

  const add = useCallback(
    (incoming: File[]) => {
      if (incoming.length === 0) return;
      const result = addAttachmentFiles(files, incoming);
      setErrors(result.errors);
      if (result.files.length !== files.length) onChange(result.files);
    },
    [files, onChange]
  );

  // Paste an image from the clipboard anywhere in the form; plain text pastes are left alone.
  useEffect(() => {
    if (disabled) return;
    function onPaste(event: ClipboardEvent) {
      const images = Array.from(event.clipboardData?.files ?? []).filter((file) => file.type.startsWith("image/"));
      if (images.length === 0) return;
      event.preventDefault();
      add(images);
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [add, disabled]);

  const previews = useMemo(() => files.map((file) => URL.createObjectURL(file)), [files]);
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews]);

  const full = files.length >= ATTACHMENT_MAX_COUNT;

  return (
    <div className="flex flex-col gap-2">
      {!full && (
        <div
          onDragOver={(event) => {
            if (disabled) return;
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            if (!disabled) add(Array.from(event.dataTransfer.files));
          }}
          className={`flex flex-col items-center gap-2 rounded-md border border-dashed p-3 text-center text-sm text-muted-foreground ${
            dragging ? "border-ring bg-muted" : "border-border"
          }`}
        >
          <p>Pega, arrastra o elige hasta {ATTACHMENT_MAX_COUNT} imágenes (png, jpeg o webp, 5 MB cada una).</p>
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => inputRef.current?.click()}>
            <ImagePlus aria-hidden /> Adjuntar imagen
          </Button>
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept={ATTACHMENT_MIME_TYPES.join(",")}
            multiple
            hidden
            disabled={disabled}
            onChange={(event) => {
              add(Array.from(event.target.files ?? []));
              event.target.value = "";
            }}
          />
        </div>
      )}

      {errors.length > 0 && (
        <ul role="alert" className="flex flex-col gap-0.5 text-sm text-destructive">
          {errors.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}

      {files.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {files.map((file, index) => (
            <li key={`${file.name}-${file.size}-${file.lastModified}-${index}`} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previews[index]}
                alt={file.name || "Imagen adjunta"}
                className="size-20 rounded-md border border-border object-cover"
              />
              <Button
                type="button"
                variant="secondary"
                size="icon-xs"
                disabled={disabled}
                aria-label={`Quitar ${file.name || "imagen"}`}
                className="absolute -right-1.5 -top-1.5"
                onClick={() => {
                  setErrors([]);
                  onChange(files.filter((_, i) => i !== index));
                }}
              >
                <X aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
