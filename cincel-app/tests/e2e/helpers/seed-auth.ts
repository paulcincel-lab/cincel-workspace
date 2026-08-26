import type { Page } from "@playwright/test";

/**
 * Injects a test admin member and session credentials into the browser's
 * localStorage before the page loads. Uses the same FNV-1a hash as the app.
 *
 * IMPORTANT: Only run E2E specs against an ephemeral or local environment —
 * never against a shared staging project, to avoid polluting real data.
 */
export async function seedAuth(page: Page): Promise<void> {
  const devBearer = process.env.E2E_SUPABASE_BEARER ?? "";

  await page.addInitScript((token: string) => {
    if (typeof token === "string" && token.trim().length > 0) {
      (window as unknown as Record<string, unknown>).__CINCEL_DEV_SUPABASE_BEARER__ = token.trim();
    }

    const seededFlagKey = "cincel.e2e.seeded.v1";
    if (window.localStorage.getItem(seededFlagKey) === "1") {
      return;
    }

    const hashPassword = (value: string): string => {
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

    const membersRaw = window.localStorage.getItem("cincel.team.members.v1");
    let members: unknown[];
    try {
      members = membersRaw ? (JSON.parse(membersRaw) as unknown[]) : [];
    } catch {
      members = [];
    }

    const hasMember =
      Array.isArray(members) &&
      members.some((m) => m && typeof m === "object" && (m as Record<string, unknown>).id === memberId);

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
      members = (members as Record<string, unknown>[]).map((m) => {
        if (!m || m["id"] !== memberId) return m;
        return {
          ...m,
          active: true,
          institutionalEmail: m["institutionalEmail"] || email,
          role: m["role"] || "Director",
          auth: {
            passwordHash: hashPassword(password),
            authEnabled: true,
            mustChangePassword: false,
            passwordUpdatedAt: (m["auth"] as Record<string, unknown>)?.["passwordUpdatedAt"] || new Date().toISOString(),
            lastLoginAt: new Date().toISOString(),
          },
        };
      });
    }

    window.localStorage.setItem("cincel.team.members.v1", JSON.stringify(members));
    window.localStorage.removeItem("cincel.auth.session.v1");
    window.localStorage.setItem(
      "cincel.team.system-roles.v1",
      JSON.stringify({ [memberId]: "Administrador" })
    );
    window.localStorage.setItem(seededFlagKey, "1");
  }, devBearer);
}

/** Logs in as the seeded admin user. Call after seedAuth and page.goto. */
export async function loginAsAdmin(page: Page, baseUrl: string): Promise<void> {
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Correo institucional").fill("paul@cincel.mx");
  await page.locator('input[type="password"]').first().fill("Temporal123");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/dashboard|\/clientes|\/proyectos|\/tareas|\/equipo/, {
    timeout: 20_000,
  });
}
