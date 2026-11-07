// @vitest-environment happy-dom
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redesignEnabled: false,
  bootstrap: true,
}));

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect ${to}`);
  },
}));
vi.mock("@/components/layout/Header", () => ({ default: () => null }));
vi.mock("@/components/layout/Sidebar", () => ({ default: () => null }));
vi.mock("@/components/configuracion/GoogleSetupWizard", () => ({ GoogleSetupWizard: () => null }));
vi.mock("@/components/configuracion/monday-import/MondayImportWizard", () => ({ MondayImportWizard: () => null }));
vi.mock("@/lib/actions/positions-actions", () => ({ fetchPositionsAction: vi.fn(async () => []) }));
vi.mock("@/lib/actions/workspace-access-actions", () => ({
  getGoogleHealthAction: vi.fn(async () => null),
  listGroupMappingsAction: vi.fn(async () => []),
}));
vi.mock("@/lib/actions/monday-import-actions", () => ({
  getMondayImportChoicesAction: vi.fn(async () => ({ ok: false, error: "x" })),
  getMondayImportStatusAction: vi.fn(async () => ({ ok: true, hasServerToken: false })),
  openMondayImportRunAction: vi.fn(async () => ({ ok: false, error: "x" })),
}));
vi.mock("@/lib/auth/session", () => ({
  getSessionAccess: vi.fn(async () => ({
    status: "active",
    user: {
      id: "s1",
      email: "admin@example.test",
      name: "Admin",
      access: (await import("@/lib/data/roles")).SYSTEM_ADMIN_ROLE,
    },
  })),
}));
vi.mock("@/lib/onboarding/first-login", () => ({ isBootstrapAdminEmail: () => mocks.bootstrap }));
// The legacy→Ajustes redirect has its own tests; this file checks the `redesign` prop only.
vi.mock("@/lib/ui/legacy-redirects-server", () => ({ redirectLegacyIfRedesignOn: vi.fn(async () => {}) }));
vi.mock("@/lib/ui/preferences-server", () => ({
  getResolvedAppearance: vi.fn(async () => ({ redesignEnabled: mocks.redesignEnabled })),
}));

import { GoogleSetupWizard } from "@/components/configuracion/GoogleSetupWizard";
import { MondayImportWizard } from "@/components/configuracion/monday-import/MondayImportWizard";
import GoogleSetupWizardPage from "@/app/(staff)/configuracion/google/primeros-pasos/page";
import ImportarMondayPage from "@/app/(staff)/configuracion/importar-monday/page";

/** The first element of `type` in a server component's returned tree. */
function findElement(node: ReactNode, type: unknown): ReactElement<Record<string, unknown>> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElement(child, type);
      if (found) return found;
    }
    return null;
  }
  if (!isValidElement<{ children?: ReactNode }>(node)) return null;
  if (node.type === type) return node as ReactElement<Record<string, unknown>>;
  return findElement(node.props.children, type);
}

beforeEach(() => {
  mocks.redesignEnabled = false;
});

describe("first-login wizard pages follow the resolved redesign flag", () => {
  for (const enabled of [false, true]) {
    it(`Google primeros pasos passes redesign=${enabled}`, async () => {
      mocks.redesignEnabled = enabled;
      mocks.bootstrap = true;
      const tree = await GoogleSetupWizardPage({ searchParams: Promise.resolve({}) });
      expect(findElement(tree, GoogleSetupWizard)?.props.redesign).toBe(enabled);
    });

    it(`Importar de monday passes redesign=${enabled}`, async () => {
      mocks.redesignEnabled = enabled;
      mocks.bootstrap = false;
      const tree = await ImportarMondayPage({ searchParams: Promise.resolve({}) });
      expect(findElement(tree, MondayImportWizard)?.props.redesign).toBe(enabled);
    });
  }
});
