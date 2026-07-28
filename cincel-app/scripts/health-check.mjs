import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnvFile(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;

  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    out[key] = value;
  }
  return out;
}

async function main() {
  const cwd = process.cwd();
  const envPath = path.join(cwd, ".env.local");
  const env = loadEnvFile(envPath);

  const dataSource = env.NEXT_PUBLIC_CINCEL_DATA_SOURCE ?? process.env.NEXT_PUBLIC_CINCEL_DATA_SOURCE ?? "localstorage";
  const url = env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key =
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    "";
  const expectedRef = "cincel-beta";
  const urlProjectRef = url.match(/^https:\/\/([a-z0-9-]+)\.supabase\.co/i)?.[1] ?? "";
  const resolvedRef = urlProjectRef;

  const checks = {
    dataSourceSupabase: dataSource === "supabase",
    hasCredentials: Boolean(url && key),
    targetIsCincelBeta: resolvedRef === expectedRef,
  };

  if (!checks.hasCredentials) {
    console.log("Health Check: NO CONFIGURADO");
    console.log(`- data_source: ${dataSource}`);
    console.log(`- project_ref: ${resolvedRef || "(vacío)"}`);
    console.log("- error: faltan NEXT_PUBLIC_SUPABASE_URL y/o NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
    process.exit(2);
  }

  const client = createClient(url, key, { auth: { persistSession: false } });

  const start = Date.now();
  const { error } = await client.schema("core").from("clients").select("id").limit(1);
  const latency = Date.now() - start;

  if (error) {
    console.log("Health Check: DESCONECTADO");
    console.log(`- data_source: ${dataSource}`);
    console.log(`- project_ref: ${resolvedRef || "(no detectado)"}`);
    console.log(`- target_is_cincel_beta: ${checks.targetIsCincelBeta}`);
    console.log(`- error: ${error.message}`);
    process.exit(1);
  }

  console.log("Health Check: Conectado");
  console.log(`- data_source: ${dataSource}`);
  console.log(`- project_ref: ${resolvedRef || "(no detectado)"}`);
  console.log(`- target_is_cincel_beta: ${checks.targetIsCincelBeta}`);
  console.log(`- latency_ms: ${latency}`);

  if (!checks.dataSourceSupabase || !checks.targetIsCincelBeta) {
    process.exit(3);
  }
}

main().catch((err) => {
  console.error("Health Check: ERROR");
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
