import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * FE §18 item 15 for the Equipo files: every Visual / Esencial / Analítico
 * difference lives in `components/widgets/*`; these files never import
 * `StyleView` nor branch on the presentation style.
 */
const FILES = [
  "components/personas/PersonasTabs.tsx",
  "components/personas/TeamGrid.tsx",
  "components/personas/TeamTable.tsx",
  "components/personas/AvailabilityWeek.tsx",
  "components/personas/EquipoView.tsx",
  "app/(staff)/personas/page.tsx",
];

describe("Personas · Equipo style guard", () => {
  it.each(FILES)("%s renders styles only through the widget library", (file) => {
    const source = readFileSync(resolve(__dirname, "../..", file), "utf8");
    expect(source).not.toMatch(/StyleView/);
    expect(source).not.toMatch(/style\s*===|===\s*["'](visual|esencial|analitico)["']/);
    expect(source).not.toMatch(/useStyle\(\)\.style/);
  });
});
