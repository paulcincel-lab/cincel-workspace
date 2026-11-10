// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import axe from "axe-core";
import type { CSSProperties } from "react";

import { ConfirmationCard, type ConfirmationPart } from "../ConfirmationCard";
import { THEME_IDS, THEME_PRESETS, TOKEN_NAMES } from "@/lib/ui/themes";

afterEach(cleanup);

const STATES: ConfirmationPart["state"][] = [
  "approval-requested",
  "output-available",
  "output-denied",
  "output-error",
];

function themeVars(theme: (typeof THEME_IDS)[number], mode: "light" | "dark"): CSSProperties {
  const tokens = THEME_PRESETS[theme].tokens;
  const vars: Record<string, string> = {};
  for (const name of TOKEN_NAMES) vars[`--${name}`] = tokens[name][mode];
  return vars as CSSProperties;
}

async function seriousViolations(container: HTMLElement) {
  // Color contrast needs real layout/rendering, which happy-dom doesn't provide;
  // token pairs are checked with CONTRAST_PAIRS / checkContrast (lib/ui/contrast.ts).
  const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  return results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
}

describe("ConfirmationCard accessibility", () => {
  for (const theme of THEME_IDS) {
    for (const mode of ["light", "dark"] as const) {
      it(`has no serious or critical axe violations in ${theme} ${mode}`, async () => {
        const { container } = render(
          <div data-theme={mode} className={mode === "dark" ? "dark" : undefined} style={themeVars(theme, mode)}>
            {STATES.map((state) => (
              <ConfirmationCard
                key={state}
                part={{
                  toolCallId: `call-${state}`,
                  toolName: "create_reminder",
                  input: { title: "Llamar al proveedor" },
                  state,
                  approvalId: `approval-${state}`,
                  errorText: state === "output-error" ? "FORBIDDEN" : undefined,
                }}
                onRespond={() => {}}
              />
            ))}
          </div>,
        );
        expect(await seriousViolations(container)).toEqual([]);
      });
    }
  }
});
