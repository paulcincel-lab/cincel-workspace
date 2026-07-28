import fs from "node:fs";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const baseUrl = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const devBearer = process.env.E2E_SUPABASE_BEARER ?? "";
const outPath = process.env.E2E_REPORT_PATH ?? "/tmp/cincel-sprint11-modules-report.json";

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(v) {
  return String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

async function seedDevContext(page) {
  await page.addInitScript((token) => {
    if (typeof token === "string" && token.trim().length > 0) {
      window.__CINCEL_DEV_SUPABASE_BEARER__ = token.trim();
    }

    const seededFlagKey = "cincel.e2e.seeded.v1";
    if (window.localStorage.getItem(seededFlagKey) === "1") {
      return;
    }

    const hashPassword = (value) => {
      const input = String(value || "").trim();
      let hash = 2166136261;
      for (let i = 0; i < input.length; i += 1) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
      }
      return (hash >>> 0).toString(16).padStart(8, "0");
    };

    const memberId = 2;
    const email = "paul@cincel.mx";
    const password = "Temporal123";

    const members = [
      {
        id: memberId,
        name: "Paul",
        birthDate: "1993-09-03",
        nationality: "Mexicana",
        phone: "+52 646 222 3344",
        institutionalEmail: email,
        address: "Ensenada, Baja California",
        maritalStatus: "Soltero",
        homePhone: "+52 646 801 1002",
        personalEmail: "paul.personal@gmail.com",
        curp: "PAUL930903HBCNXL02",
        rfc: "PAUL9309037B2",
        emergencyContact: {
          name: "Ana Ruiz",
          relation: "Hermana",
          phone: "+52 646 801 2002",
          address: "Ensenada, Baja California",
        },
        role: "Director",
        area: "Direccion",
        capacity: 8,
        availability: "Disponible",
        active: true,
        auth: {
          passwordHash: hashPassword(password),
          authEnabled: true,
          mustChangePassword: false,
          passwordUpdatedAt: new Date().toISOString(),
          lastLoginAt: null,
        },
      },
    ];

    window.localStorage.setItem("cincel.team.members.v1", JSON.stringify(members));
    window.localStorage.setItem("cincel.team.system-roles.v1", JSON.stringify({ [memberId]: "Administrador" }));
    window.localStorage.removeItem("cincel.auth.session.v1");
    window.localStorage.setItem(seededFlagKey, "1");
  }, devBearer);
}

async function doLogin(page) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
  await page.locator('input[type="email"]').fill("paul@cincel.mx");
  await page.locator('input[type="password"]').first().fill("Temporal123");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/dashboard|\/clientes/, { timeout: 30000 });
}

async function checkModule(page, context, moduleName, route, expectedHeadingContains) {
  const record = {
    module: moduleName,
    route,
    ok: true,
    headingMatched: false,
    runtimeSupabaseErrors: [],
    restErrors: [],
    notes: [],
  };

  context.currentModule = moduleName;
  try {
    await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForTimeout(1800);
  } catch (error) {
    record.ok = false;
    record.notes.push(`No se pudo cargar la ruta: ${error instanceof Error ? error.message : String(error)}`);
    return record;
  }

  const headings = [
    ...(await page.locator("h1").allTextContents()),
    ...(await page.locator("h2").allTextContents()),
  ];
  const normExpected = normalizeText(expectedHeadingContains);
  record.headingMatched = headings.some((h) => normalizeText(h).includes(normExpected));

  const errorsForModule = context.supabaseErrors.filter((e) => e.module === moduleName);
  const restForModule = context.restErrors.filter((e) => e.module === moduleName);

  record.runtimeSupabaseErrors = errorsForModule;
  record.restErrors = restForModule;

  if (!record.headingMatched) {
    record.ok = false;
    record.notes.push(`No se encontró heading esperado: ${expectedHeadingContains}`);
  }

  if (errorsForModule.length > 0) {
    record.ok = false;
    record.notes.push("Se detectaron errores Supabase en consola");
  }

  if (restForModule.length > 0) {
    record.ok = false;
    record.notes.push("Se detectaron respuestas REST con error");
  }

  return record;
}

async function runClientesCrudScript() {
  return new Promise((resolve) => {
    const child = spawn("node", ["scripts/e2e-login-crud-clientes.mjs"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        E2E_BASE_URL: baseUrl,
        E2E_SUPABASE_BEARER: devBearer,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let out = "";
    let err = "";

    child.stdout.on("data", (chunk) => {
      out += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      err += chunk.toString();
    });

    child.on("close", (code) => {
      resolve({ ok: code === 0, code, out, err });
    });
  });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const runtimeContext = {
    currentModule: "(bootstrap)",
    supabaseErrors: [],
    restErrors: [],
  };

  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();

    if (text.includes("Cincel – Supabase inoperativo") || text.includes("Operación :") || text.includes("Detalle   :")) {
      runtimeContext.supabaseErrors.push({
        module: runtimeContext.currentModule,
        text,
      });
    }
  });

  page.on("response", (resp) => {
    const url = resp.url();
    if (!url.includes("/rest/v1/")) return;
    if (resp.status() < 400) return;
    runtimeContext.restErrors.push({
      module: runtimeContext.currentModule,
      status: resp.status(),
      url,
    });
  });

  await seedDevContext(page);

  const report = {
    generatedAt: nowIso(),
    baseUrl,
    auth: {
      loginOk: false,
      loginError: null,
    },
    modules: [],
    clientesCrud: null,
  };

  try {
    await doLogin(page);
    report.auth.loginOk = true;
  } catch (error) {
    report.auth.loginOk = false;
    report.auth.loginError = error instanceof Error ? error.message : String(error);
  }

  const checks = [
    ["Dashboard", "/dashboard", "Dashboard"],
    ["Clientes", "/clientes", "Clientes"],
    ["Proyectos", "/proyectos", "Proyectos"],
    ["Recursos", "/recursos", "Recursos"],
    ["Equipo", "/equipo", "Equipo"],
    ["Actividades", "/tareas", "Actividades"],
    ["Calendario", "/calendario", "Calendario"],
    ["Configuración", "/configuracion/general", "General"],
    ["Permisos", "/configuracion/permisos", "Permisos"],
  ];

  for (const [moduleName, route, heading] of checks) {
    const result = await checkModule(page, runtimeContext, moduleName, route, heading);
    report.modules.push(result);
  }

  runtimeContext.currentModule = "Clientes CRUD";
  report.clientesCrud = await runClientesCrudScript();

  await context.close();
  await browser.close();

  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`REPORT_PATH=${outPath}`);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error("SPRINT11_REVIEW_ERROR", error);
  process.exit(1);
});
