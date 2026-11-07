/**
 * Appearance → CSS variables (redesign BE §8.2, FE §4.1, §14.1). Pure.
 */
import { notImplemented } from "@/lib/stubs";
import type { OrgAppearance, TextSize } from "@/lib/types/redesign";

/**
 * `--<token>` for every token, `--font-sans`, `--radius` (radius/16 rem),
 * `--card-padding`, `--gap`, `--shadow-card`, `--type-<role>-size` /
 * `--type-<role>-weight` and `--text-base` (= `textSize`) for one mode.
 */
export function toCssVars(
  appearance: OrgAppearance,
  mode: "light" | "dark",
  textSize?: TextSize,
): Record<string, string> {
  return notImplemented("toCssVars", appearance, mode, textSize);
}

/**
 * The `<style id="appearance">` body: `html:root[data-theme="light"]{…}` and
 * `html:root[data-theme="dark"]{…}` (specificity 0,2,1, review B18).
 */
export function appearanceStyleBlock(cssVars: { light: Record<string, string>; dark: Record<string, string> }): string {
  return notImplemented("appearanceStyleBlock", cssVars);
}

/**
 * Blocking head script for `mode = "system"` (≤ 1 KB, no dependencies): sets
 * `data-theme` and toggles `.dark` on `<html>` from `matchMedia` before first
 * paint and on change. Empty until the root-layout appearance issue lands.
 */
export const SYSTEM_MODE_SCRIPT: string = "";
