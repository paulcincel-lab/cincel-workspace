/**
 * E2E script: login + full CRUD cycle for Clientes.
 *
 * ⚠️  ISOLATION REQUIREMENT
 * This script MUST only be executed against an ephemeral or fully local Supabase
 * project (e.g. `supabase start`). Never point it at a shared staging environment.
 * It injects synthetic PII-shaped data (name, CURP, RFC, address) that, if left
 * in a shared project, would pollute real data visible to other users.
 *
 * Environment variables:
 *   E2E_BASE_URL         – app origin (default: http://127.0.0.1:3000)
 *   E2E_SUPABASE_BEARER  – optional dev bearer token for Supabase auth bypass
 *
 * Teardown: the script deletes the synthetic client it creates as the last step
 * of its CRUD flow, so no cleanup is left behind in localStorage or Supabase
 * when the run completes successfully.
 */
import { chromium } from "playwright";

const baseUrl = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const devBearer = process.env.E2E_SUPABASE_BEARER ?? "";
const runId = Date.now();
const testClientName = `Cliente E2E ${runId}`;
const editedClientName = `${testClientName} Editado`;

function fail(message) {
  console.error(`E2E FAIL: ${message}`);
  process.exit(1);
}

async function seedAuth(page) {
  await page.addInitScript((token) => {
    if (typeof token === "string" && token.trim().length > 0) {
      (window).__CINCEL_DEV_SUPABASE_BEARER__ = token.trim();
    }

    const seededFlagKey = "cincel.e2e.seeded.v1";
    if (window.localStorage.getItem(seededFlagKey) === "1") {
      return;
    }

    const hashPassword = (value) => {
      const input = String(value || "").trim();
      let hash = 2166136261;
      for (let index = 0; index < input.length; index += 1) {
        hash ^= input.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
      }
      return (hash >>> 0).toString(16).padStart(8, "0");
    };

    const memberId = 2;
    const email = "paul@cincel.mx";
    // NOTE: this password is synthetic test data — it is NOT a production credential.
    const password = "Temporal123";

    const membersRaw = window.localStorage.getItem("cincel.team.members.v1");
    let members;
    try {
      members = membersRaw ? JSON.parse(membersRaw) : [];
    } catch {
      members = [];
    }

    const hasMember = Array.isArray(members) && members.some((m) => m && m.id === memberId);
    if (!hasMember) {
      members = [
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
            lastLoginAt: new Date().toISOString(),
          },
        },
      ];
    } else {
      members = members.map((m) => {
        if (!m || m.id !== memberId) return m;
        return {
          ...m,
          active: true,
          institutionalEmail: m.institutionalEmail || email,
          role: m.role || "Director",
          auth: {
            passwordHash: hashPassword(password),
            authEnabled: true,
            mustChangePassword: false,
            passwordUpdatedAt: m.auth?.passwordUpdatedAt || new Date().toISOString(),
            lastLoginAt: new Date().toISOString(),
          },
        };
      });
    }

    window.localStorage.setItem("cincel.team.members.v1", JSON.stringify(members));
    window.localStorage.removeItem("cincel.auth.session.v1");
    window.localStorage.setItem("cincel.team.system-roles.v1", JSON.stringify({ [memberId]: "Administrador" }));
    window.localStorage.setItem(seededFlagKey, "1");
  }, devBearer);
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      console.error(`BROWSER_CONSOLE_ERROR: ${msg.text()}`);
    }
  });

  await seedAuth(page);

  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });

  await page.getByLabel("Correo institucional").fill("paul@cincel.mx");
  await page.locator('input[type="password"]').first().fill("Temporal123");
  await page.getByRole("button", { name: "Entrar" }).click();

  await page.waitForURL(/\/dashboard|\/clientes/, { timeout: 20000 }).catch(() => fail("Login no redirigio a una ruta privada"));
  await page.goto(`${baseUrl}/clientes`, { waitUntil: "domcontentloaded" });

  await page.waitForLoadState("domcontentloaded");
  await page.waitForFunction(() => {
    const h1s = Array.from(document.querySelectorAll("h1")).map((el) => (el.textContent || "").trim());
    return h1s.includes("Clientes");
  }, { timeout: 60000 }).catch(async () => {
    const url = page.url();
    const h1Texts = await page.locator("h1").allTextContents();
    fail(`No cargo la pagina Clientes (url=${url}, h1=${JSON.stringify(h1Texts)})`);
  });

  // Crear
  await page.getByRole("button", { name: "Nuevo cliente" }).click();
  await page.getByRole("heading", { name: "Nuevo cliente" }).waitFor({ state: "visible" });

  const createPanel = page.locator("div", { has: page.getByRole("heading", { name: "Nuevo cliente" }) }).first();

  await createPanel.getByLabel("Nombre del cliente").fill(testClientName);
  await createPanel.getByLabel("Numero de contacto").fill("+52 646 000 9999");
  await createPanel.getByLabel("Email(s)").fill(`e2e.${runId}@cincel.test`);
  await createPanel.getByLabel("Empresa o Particular").selectOption("Empresa");
  await createPanel.getByLabel("Proyecto activo").selectOption("no");
  await createPanel.getByLabel("Nombre del proyecto").fill(`Proyecto E2E ${runId}`);
  await createPanel.getByLabel("Numero de proyectos con nosotros").fill("1");
  await page.getByRole("button", { name: "Crear cliente" }).click();

  await page.getByRole("heading", { name: "Nuevo cliente" }).waitFor({ state: "hidden", timeout: 20000 }).catch(() => fail("No cerro el modal de creacion"));
  await page.getByPlaceholder("Buscar por cliente, proyecto o tipo").fill(testClientName);

  const createdRow = page.locator("tr", { hasText: testClientName }).first();
  await createdRow.waitFor({ state: "visible", timeout: 30000 }).catch(async () => {
    const rows = await page.locator("tr").allTextContents();
    fail(`No se creo el cliente (rows=${rows.length})`);
  });

  // Abrir ficha y editar
  await createdRow.getByRole("link", { name: "Ver ficha" }).click();

  await page.waitForURL(/\/clientes\/\d+/, { timeout: 30000 }).catch(() => fail("No abrio la ficha del cliente"));
  const editButton = page.getByRole("button", { name: "Editar cliente" }).first();
  await editButton.waitFor({ state: "visible", timeout: 60000 }).catch(async () => {
    const url = page.url();
    const h1s = await page.locator("h1").allTextContents();
    fail(`No aparecio boton Editar cliente (url=${url}, h1=${JSON.stringify(h1s)})`);
  });
  await editButton.click();
  await page.getByRole("heading", { name: "Editar cliente" }).waitFor({ state: "visible" });

  const editPanel = page.locator("div", { has: page.getByRole("heading", { name: "Editar cliente" }) }).first();
  const nameInput = editPanel.getByLabel("Nombre del cliente");
  await nameInput.fill(editedClientName);
  await page.getByRole("button", { name: "Guardar cambios" }).click();

  await page.getByRole("heading", { name: editedClientName }).waitFor({ state: "visible", timeout: 15000 }).catch(() => fail("No se reflejo la edicion del cliente"));

  // Teardown: delete the synthetic client to leave no data behind.
  // This is the final CRUD step and serves as cleanup — run it even on a local
  // Supabase project so no test records accumulate between runs.
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Eliminar cliente" }).click();

  await page.waitForTimeout(1200);
  await page.goto(`${baseUrl}/clientes`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => {
    const h1s = Array.from(document.querySelectorAll("h1")).map((el) => (el.textContent || "").trim());
    return h1s.includes("Clientes");
  }, { timeout: 30000 }).catch(() => fail("No cargo la lista tras eliminar"));

  await page.getByPlaceholder("Buscar por cliente, proyecto o tipo").fill(editedClientName);
  const remainingRows = page.locator("tr", { hasText: editedClientName });
  const remainingCount = await remainingRows.count();
  if (remainingCount > 0) {
    fail("El cliente eliminado sigue apareciendo");
  }

  console.log("E2E OK: login+CRUD clientes completado. Datos sinteticos eliminados.");

  await context.close();
  await browser.close();
}

run().catch((error) => {
  console.error("E2E ERROR:", error);
  process.exit(1);
});
