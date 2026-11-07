/**
 * Reminder text parser (redesign BE §8.4): es-MX, accent-insensitive, first
 * match wins, matched fragment (and a leading "recuérdame" / "recordarme" /
 * "recordar") removed from `cleanText`. Pure.
 */
import { notImplemented } from "@/lib/stubs";
import type { ParsedReminder } from "@/lib/types/redesign";

export function parseReminderText(text: string, now: Date, tz: string = "America/Mexico_City"): ParsedReminder {
  return notImplemented("parseReminderText", text, now, tz);
}
