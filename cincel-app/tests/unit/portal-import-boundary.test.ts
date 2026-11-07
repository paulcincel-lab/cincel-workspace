// @vitest-environment node
import { resolve } from "path";
import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

// The portal boundary in eslint.config.mjs: portal code must not import staff actions, repositories or the staff
// session. Each case lints a snippet as if it lived at a path inside one of the four portal trees.

const appRoot = resolve(__dirname, "../..");
const portalPaths = [
  "app/portal/boundary-check/page.tsx",
  "app/api/portal/boundary-check/route.ts",
  "components/portal/boundary-check.tsx",
  "lib/portal/boundary-check.ts",
];
const forbiddenImports = [
  "@/lib/actions/projects-actions",
  "@/lib/repositories/contacts-repository",
  "@/lib/auth/session",
];

let eslint: ESLint;

beforeAll(async () => {
  eslint = new ESLint({ cwd: appRoot });
  // Load the config and plugins once here, so the cold start does not count against the first case.
  await eslint.lintText("export {};\n", { filePath: resolve(appRoot, portalPaths[0]) });
}, 120_000);

async function restrictedImportMessages(code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath: resolve(appRoot, filePath) });
  return result.messages.filter((m) => m.ruleId === "no-restricted-imports");
}

describe("portal import boundary", () => {
  for (const filePath of portalPaths) {
    for (const source of forbiddenImports) {
      it(`blocks ${source} in ${filePath}`, async () => {
        const code = `import * as staff from "${source}";\nexport const x = staff;\n`;
        const messages = await restrictedImportMessages(code, filePath);
        expect(messages).toHaveLength(1);
        expect(messages[0].severity).toBe(2);
      }, 30_000);
    }

    it(`allows portal and shared imports in ${filePath}`, async () => {
      const code = `import * as portal from "@/lib/portal/queries";\nimport { cn } from "@/lib/utils";\nexport const x = [portal, cn];\n`;
      expect(await restrictedImportMessages(code, filePath)).toHaveLength(0);
    }, 30_000);
  }

  it("does not apply outside the portal trees", async () => {
    const code = `import * as staff from "@/lib/auth/session";\nexport const x = staff;\n`;
    expect(await restrictedImportMessages(code, "app/(app)/boundary-check/page.tsx")).toHaveLength(0);
  }, 30_000);
});
