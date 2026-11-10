import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Unused bindings stay a warning (and CI fails on any warning); a leading `_` marks a parameter or
  // binding that has to exist (a mock's signature, an omitted destructured key) but is not read.
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
    },
  },
  // Cutto boundary (redesign BE §11.2): client code links to Cutto through lib/integrations/cutto-links.ts
  // and never imports the server-only adapter (also checked by tests/guards/cutto-server-only.test.ts).
  // Listed before the portal block so the portal patterns win on components/portal/**.
  {
    files: ["components/**", "hooks/**", "lib/integrations/cutto-links.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/integrations/cutto-api.server", "**/cutto-api.server"],
              message: "Client code must not import the Cutto API adapter. Use lib/integrations/cutto-links.ts.",
            },
          ],
        },
      ],
    },
  },
  // Portal boundary: client-portal code reaches data only through lib/portal (requirePortalUser,
  // requireProjectAccess, lib/portal/queries), never through staff actions, repositories or the staff session.
  {
    files: ["app/portal/**", "app/api/portal/**", "components/portal/**", "lib/portal/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/actions", "@/lib/actions/*"],
              message: "Portal code must not import staff server actions. Use lib/portal instead.",
            },
            {
              group: ["@/lib/repositories", "@/lib/repositories/*"],
              message: "Portal code must not import staff repositories. Use lib/portal/queries instead.",
            },
            {
              group: ["@/lib/auth/session"],
              message: "Portal code must not read the staff session. Use requirePortalUser instead.",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // graphql-codegen output (npm run monday:codegen).
    "scripts/monday/generated/**",
  ]),
]);

export default eslintConfig;
