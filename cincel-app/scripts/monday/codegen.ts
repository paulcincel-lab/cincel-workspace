import type { CodegenConfig } from "@graphql-codegen/cli";

/**
 * Typed monday queries for the migration CLI (backend.md §4.2).
 *
 * The schema is a checked-in copy of monday's public SDL for API version
 * 2026-07 (the version client.ts sends), so codegen runs offline and in CI:
 *   npm run monday:codegen   regenerate scripts/monday/generated/
 *   npm run monday:schema    refresh graphql/schema.graphql from monday
 */
const config: CodegenConfig = {
  schema: "scripts/monday/graphql/schema.graphql",
  documents: ["scripts/monday/graphql/**/*.graphql", "!scripts/monday/graphql/schema.graphql"],
  ignoreNoDocuments: false,
  generates: {
    "scripts/monday/generated/": {
      preset: "client",
      presetConfig: { fragmentMasking: false },
      config: {
        documentMode: "string",
        enumsAsTypes: true,
        useTypeImports: true,
        skipTypename: true,
        scalars: {
          ID: "string",
          Date: "string",
          ISO8601DateTime: "string",
          JSON: "unknown",
        },
      },
    },
  },
};

export default config;
