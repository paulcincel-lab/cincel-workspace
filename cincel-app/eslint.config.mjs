import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
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
