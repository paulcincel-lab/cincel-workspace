/**
 * Refreshes scripts/monday/graphql/schema.graphql from monday's public schema
 * endpoint for the API version the client sends. No token is needed.
 *
 *   npm run monday:schema && npm run monday:codegen
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { MONDAY_API_VERSION } from "./client";

const SCHEMA_URL = `https://api.monday.com/v2/get_schema?format=sdl&version=${MONDAY_API_VERSION}`;
const OUT = resolve(__dirname, "graphql/schema.graphql");

async function main() {
  const res = await fetch(SCHEMA_URL);
  if (!res.ok) throw new Error(`monday: schema download failed (HTTP ${res.status})`);
  const sdl = await res.text();
  if (!/^\s*schema\s*\{/m.test(sdl)) throw new Error("monday: schema response is not SDL");
  writeFileSync(OUT, sdl.endsWith("\n") ? sdl : `${sdl}\n`);
  console.log(`monday: wrote ${OUT} (API ${MONDAY_API_VERSION})`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
