import { fileTypeFromBuffer } from "file-type";

import { sanitizeFilename } from "@/lib/portal/file-delivery";

/**
 * Client upload rules (BE §B.4.7): size limit, extension allowlist and a
 * content check on the first bytes of every file. The extension decides the
 * expected content and the MIME type sent to Drive; the client's own
 * `Content-Type` is never trusted.
 *
 * - Binary formats are sniffed with `file-type`: pdf, jpg, png, heic; docx,
 *   xlsx, pptx and zip are ZIP containers (a 4 KB head may only show `zip`);
 *   doc, xls and ppt are OLE compound files (`cfb`).
 * - dwg must start with the `AC10` version header.
 * - dxf has no magic bytes: it must decode as text and start (after
 *   whitespace) with group code `0` followed by `SECTION`.
 */

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
/** Room for the multipart boundary and part headers on top of the file itself. */
export const MULTIPART_OVERHEAD_BYTES = 1024 * 1024;
/** Bytes read before the content check. */
export const SNIFF_BYTES = 4096;
/** Date prefix of uploaded file names. */
export const UPLOAD_TIME_ZONE = "America/Mexico_City";

type UploadRule = {
  mimeType: string;
  /** `file-type` results accepted for this extension; null means a custom check. */
  detected: readonly string[] | null;
  check?: (head: Uint8Array) => boolean;
};

const ZIP_CONTAINER = ["zip", "docx", "xlsx", "pptx"] as const;

function isDwg(head: Uint8Array): boolean {
  return head.length >= 4 && head[0] === 0x41 && head[1] === 0x43 && head[2] === 0x31 && head[3] === 0x30;
}

const DXF_START = /^0[ \t]*\r?\n[ \t]*SECTION(?:\s|$)/;

/** ASCII DXF: valid UTF-8 text without NUL bytes whose first group is `0` / `SECTION`. */
export function isDxfText(head: Uint8Array): boolean {
  if (head.includes(0)) return false;
  let text: string;
  try {
    // `stream: true` tolerates a multi-byte character cut at the end of the head.
    text = new TextDecoder("utf-8", { fatal: true }).decode(head, { stream: true });
  } catch {
    return false;
  }
  return DXF_START.test(text.replace(/^﻿/, "").trimStart());
}

const UPLOAD_RULES: Readonly<Record<string, UploadRule>> = {
  pdf: { mimeType: "application/pdf", detected: ["pdf"] },
  jpg: { mimeType: "image/jpeg", detected: ["jpg"] },
  jpeg: { mimeType: "image/jpeg", detected: ["jpg"] },
  png: { mimeType: "image/png", detected: ["png"] },
  heic: { mimeType: "image/heic", detected: ["heic"] },
  docx: {
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    detected: ["docx", "zip"],
  },
  xlsx: { mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", detected: ["xlsx", "zip"] },
  pptx: {
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    detected: ["pptx", "zip"],
  },
  zip: { mimeType: "application/zip", detected: ZIP_CONTAINER },
  doc: { mimeType: "application/msword", detected: ["cfb"] },
  xls: { mimeType: "application/vnd.ms-excel", detected: ["cfb"] },
  ppt: { mimeType: "application/vnd.ms-powerpoint", detected: ["cfb"] },
  dwg: { mimeType: "image/vnd.dwg", detected: null, check: isDwg },
  dxf: { mimeType: "image/vnd.dxf", detected: null, check: isDxfText },
};

/** Extensions clients may send, for the uploader's `accept` attribute. */
export const UPLOAD_ALLOWED_EXTENSIONS: readonly string[] = Object.keys(UPLOAD_RULES);

/** Lowercase extension without the dot, or null. */
export function uploadExtension(fileName: string): string | null {
  const dot = fileName.lastIndexOf(".");
  if (dot <= 0 || dot === fileName.length - 1) return null;
  return fileName.slice(dot + 1).toLowerCase();
}

export function isAllowedUploadExtension(fileName: string): boolean {
  const ext = uploadExtension(fileName);
  return ext !== null && Object.hasOwn(UPLOAD_RULES, ext);
}

export type UploadSniffResult = { ok: true; ext: string; mimeType: string } | { ok: false };

/**
 * Checks the extension against the allowlist and the first bytes against the
 * extension. A renamed executable, a PNG called `.pdf` or an empty file fail.
 */
export async function sniffUpload(fileName: string, head: Uint8Array): Promise<UploadSniffResult> {
  const ext = uploadExtension(fileName);
  if (!ext || !Object.hasOwn(UPLOAD_RULES, ext) || head.length === 0) return { ok: false };
  const rule = UPLOAD_RULES[ext];

  if (rule.detected === null) return rule.check?.(head) ? { ok: true, ext, mimeType: rule.mimeType } : { ok: false };

  const detected = await fileTypeFromBuffer(head);
  return detected && rule.detected.includes(detected.ext) ? { ok: true, ext, mimeType: rule.mimeType } : { ok: false };
}

/** `YYYY-MM-DD` of `at` in America/Mexico_City. */
export function uploadDatePrefix(at: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: UPLOAD_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** Name in `03 Del cliente`: `YYYY-MM-DD · {client name} · {original name}`, every piece sanitized. */
export function inboundFileName(at: Date, clientName: string, originalName: string): string {
  const client = sanitizeFilename(clientName.replace(/·/g, "-"));
  return sanitizeFilename(`${uploadDatePrefix(at)} · ${client} · ${sanitizeFilename(originalName)}`);
}
