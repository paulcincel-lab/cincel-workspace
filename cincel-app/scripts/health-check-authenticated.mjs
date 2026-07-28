import crypto from "node:crypto";
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

function b64url(value) {
  return Buffer.from(typeof value === "string" ? value : JSON.stringify(value))
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function buildAuthenticatedJwt(jwtSecret) {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: "supabase",
    aud: "authenticated",
    role: "authenticated",
    sub: "00000000-0000-0000-0000-000000000000",
    iat: now,
    exp: now + 60 * 60,
  };

  const unsigned = `${b64url(header)}.${b64url(payload)}`;
  const sig = crypto
    .createHmac("sha256", jwtSecret)
    .update(unsigned)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  return `${unsigned}.${sig}`;
}

function resolveAuthToken(env) {
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (serviceRoleKey) {
    return { token: serviceRoleKey, source: "service_role_key" };
  }

  const prebuiltAuthToken = env.SUPABASE_AUTH_TEST_JWT ?? process.env.SUPABASE_AUTH_TEST_JWT ?? "";
  if (prebuiltAuthToken) {
    return { token: prebuiltAuthToken, source: "auth_test_jwt" };
  }

  const jwtSecret = env.SUPABASE_JWT_SECRET ?? process.env.SUPABASE_JWT_SECRET ?? "";
  if (jwtSecret) {
    return {
      token: buildAuthenticatedJwt(jwtSecret),
      source: "jwt_secret_signed_authenticated_token",
    };
  }

  return { token: "", source: "missing" };
}

async function main() {
  const cwd = process.cwd();
  const envPath = path.join(cwd, ".env.local");
  const env = loadEnvFile(envPath);

  const dataSource = env.NEXT_PUBLIC_CINCEL_DATA_SOURCE ?? process.env.NEXT_PUBLIC_CINCEL_DATA_SOURCE ?? "localstorage";
  const url = env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const publishableKey =
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    "";
  const resolvedRef = url.match(/^https:\/\/([a-z0-9-]+)\.supabase\.co/i)?.[1] ?? "";
  const expectedRef = env.SUPABASE_EXPECTED_PROJECT_REF ?? process.env.SUPABASE_EXPECTED_PROJECT_REF ?? "";

  const tokenConfig = resolveAuthToken(env);

  if (!url || !publishableKey) {
    console.log("Health Check Authenticated: NO CONFIGURADO");
    console.log(`- data_source: ${dataSource}`);
    console.log(`- project_ref: ${resolvedRef || "(vacio)"}`);
    console.log("- error: faltan NEXT_PUBLIC_SUPABASE_URL y/o NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
    process.exit(2);
  }

  if (!tokenConfig.token) {
    console.log("Health Check Authenticated: NO CONFIGURADO");
    console.log(`- data_source: ${dataSource}`);
    console.log(`- project_ref: ${resolvedRef || "(no detectado)"}`);
    console.log("- error: define SUPABASE_SERVICE_ROLE_KEY, SUPABASE_AUTH_TEST_JWT o SUPABASE_JWT_SECRET para un contexto autenticado de desarrollo");
    process.exit(2);
  }

  const client = createClient(url, publishableKey, {
    auth: { persistSession: false },
    global: {
      headers: {
        Authorization: `Bearer ${tokenConfig.token}`,
      },
    },
  });

  const start = Date.now();
  const { error } = await client.schema("core").from("clients").select("id").limit(1);
  const latency = Date.now() - start;

  if (error) {
    console.log("Health Check Authenticated: DESCONECTADO");
    console.log(`- data_source: ${dataSource}`);
    console.log(`- project_ref: ${resolvedRef || "(no detectado)"}`);
    console.log(`- expected_ref: ${expectedRef || "(no configurado)"}`);
    console.log(`- auth_context: ${tokenConfig.source}`);
    console.log(`- error: ${error.message}`);
    process.exit(1);
  }

  console.log("Health Check Authenticated: Conectado");
  console.log(`- data_source: ${dataSource}`);
  console.log(`- project_ref: ${resolvedRef || "(no detectado)"}`);
  console.log(`- expected_ref: ${expectedRef || "(no configurado)"}`);
  console.log(`- target_matches_expected: ${expectedRef ? resolvedRef === expectedRef : "n/a"}`);
  console.log(`- auth_context: ${tokenConfig.source}`);
  console.log(`- latency_ms: ${latency}`);
}

main().catch((err) => {
  console.error("Health Check Authenticated: ERROR");
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
