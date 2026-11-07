/**
 * Appearance → CSS variables (redesign BE §8.2, FE §4.1, §14.1). Pure.
 */
import type { OrgAppearance, TextSize, TypeRole } from "@/lib/types/redesign";
import { TOKEN_NAMES } from "@/lib/ui/themes";

/** The six type roles, in the order of BE §5.4. */
export const TYPE_ROLES: readonly TypeRole[] = ["pageTitle", "sectionTitle", "cardTitle", "body", "label", "kpi"];

/**
 * `next/font` CSS variable of each selectable family (FE §4.1); the root
 * layout declares the fonts with these `variable` names.
 */
export const FONT_FAMILY_VARIABLES: Record<OrgAppearance["fontFamily"], string> = {
  Geist: "--font-geist-sans",
  Inter: "--font-inter",
  "DM Sans": "--font-dm-sans",
};

/** `--shadow-card` per `shape.shadow` (BE §8.2). */
export const CARD_SHADOWS: Record<OrgAppearance["shape"]["shadow"], string> = {
  none: "none",
  suave: "0 1px 2px rgba(15,23,42,0.04), 0 6px 16px rgba(15,23,42,0.04)",
  marcada: "0 10px 30px rgba(15,23,42,0.12)",
};

const FONT_FALLBACK = "ui-sans-serif, system-ui, sans-serif";

/** Trims trailing zeros: 0.875 → "0.875", 1 → "1", 0.5625 → "0.5625". */
function num(value: number): string {
  return String(Number(value.toFixed(4)));
}

/**
 * `--<token>` for every token, `--font-sans`, `--radius` (radius/16 rem),
 * `--card-padding`, `--gap`, `--shadow-card`, `--type-<role>-size` /
 * `--type-<role>-weight` and `--text-base` (= `textSize`) for one mode.
 * Without `textSize`, `--text-base` is the org body size.
 */
export function toCssVars(
  appearance: OrgAppearance,
  mode: "light" | "dark",
  textSize?: TextSize,
): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const name of TOKEN_NAMES) vars[`--${name}`] = appearance.tokens[name][mode];

  vars["--font-sans"] = `var(${FONT_FAMILY_VARIABLES[appearance.fontFamily]}), ${FONT_FALLBACK}`;
  vars["--radius"] = `${num(appearance.shape.radius / 16)}rem`;
  vars["--card-padding"] = `${num(appearance.shape.cardPadding)}px`;
  vars["--gap"] = `${num(appearance.shape.gap)}px`;
  vars["--shadow-card"] = CARD_SHADOWS[appearance.shape.shadow];

  for (const role of TYPE_ROLES) {
    const { size, weight } = appearance.typeScale[role];
    vars[`--type-${role}-size`] = `${num(size)}px`;
    vars[`--type-${role}-weight`] = String(weight);
  }

  vars["--text-base"] = `${num(textSize ?? appearance.typeScale.body.size)}px`;
  return vars;
}

/** A declaration that could break out of the `<style>` element or the rule is dropped. */
const UNSAFE_CSS = /[<>{};]|\/\*/;
const CSS_VAR_NAME = /^--[a-zA-Z0-9-]+$/;

function declarations(vars: Record<string, string>): string {
  return Object.entries(vars)
    .filter(([name, value]) => CSS_VAR_NAME.test(name) && !UNSAFE_CSS.test(value))
    .map(([name, value]) => `${name}:${value}`)
    .join(";");
}

/**
 * The `<style id="appearance">` body: `html:root[data-theme="light"]{…}` and
 * `html:root[data-theme="dark"]{…}` (specificity 0,2,1, review B18).
 */
export function appearanceStyleBlock(cssVars: { light: Record<string, string>; dark: Record<string, string> }): string {
  return (
    `html:root[data-theme="light"]{${declarations(cssVars.light)}}` +
    `html:root[data-theme="dark"]{${declarations(cssVars.dark)}}`
  );
}

/**
 * Blocking head script for `mode = "system"` (≤ 1 KB, no dependencies): sets
 * `data-theme` and toggles `.dark` on `<html>` from `matchMedia` before first
 * paint and on change. Acts only while `<html data-mode="system">`, so an
 * explicit mode picked later on the client is never overridden.
 */
export const SYSTEM_MODE_SCRIPT: string =
  '(function(){var d=document.documentElement,q=window.matchMedia("(prefers-color-scheme: dark)");' +
  'function a(){if(d.getAttribute("data-mode")!=="system")return;var k=q.matches;' +
  'd.setAttribute("data-theme",k?"dark":"light");d.classList.toggle("dark",k)}' +
  'a();if(q.addEventListener)q.addEventListener("change",a);else q.addListener(a)})();';
