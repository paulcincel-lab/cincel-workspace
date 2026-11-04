import { describe, expect, it } from "vitest";

import type { GoogleHealth, GroupMapping } from "@/lib/types/workspace-access";

import {
  ADMIN_GROUP_RANK,
  canAdvance,
  doneMessage,
  findAdminGroup,
  initialStep,
  missingRequiredChecks,
  nextStep,
  previousStep,
  reviewChecks,
} from "./google-setup-steps";

const healthy: GoogleHealth = {
  workspaceDomain: "example.test",
  oauthClientConfigured: true,
  groupMappingCount: 0,
  roleGroupMappingCount: 0,
  serviceAccountEmail: "directory-sa@example-project.iam.gserviceaccount.com",
  sharedDriveId: null,
  tokenKeyConfigured: false,
  lastDirectoryError: null,
  lastDriveError: null,
  googleLinkedStaff: 0,
  activeStaff: 1,
};

const empty: GoogleHealth = { ...healthy, workspaceDomain: null, oauthClientConfigured: false, serviceAccountEmail: null };

const adminGroup: GroupMapping = {
  id: "11111111-1111-4111-8111-111111111111",
  groupEmail: "admins@example.test",
  kind: "role",
  role: "Administrador",
  areaId: null,
  areaName: null,
  rank: ADMIN_GROUP_RANK,
};

const otherGroup: GroupMapping = { ...adminGroup, id: "22222222-2222-4222-8222-222222222222", role: "Colaborador" };

describe("reviewChecks", () => {
  it("lists every setting with a KCD hint", () => {
    const checks = reviewChecks(empty);
    expect(checks.map((check) => check.id)).toEqual(["workspace_domain", "oauth_client", "service_account", "token_key"]);
    expect(checks.every((check) => !check.ok)).toBe(true);
    expect(checks.find((check) => check.id === "workspace_domain")?.hint).toContain("GOOGLE_WORKSPACE_DOMAIN");
    expect(checks.find((check) => check.id === "oauth_client")?.hint).toContain("GOOGLE_OAUTH_CLIENT_ID");
    expect(checks.find((check) => check.id === "service_account")?.hint).toContain("GOOGLE_SA_CLIENT_EMAIL");
    expect(checks.find((check) => check.id === "token_key")?.hint).toContain("TOKEN_ENCRYPTION_KEY");
  });

  it("shows the domain and service account, never a secret", () => {
    const checks = reviewChecks(healthy);
    expect(checks.find((check) => check.id === "workspace_domain")?.value).toBe("example.test");
    expect(checks.find((check) => check.id === "oauth_client")?.value).toBeNull();
    expect(checks.find((check) => check.id === "token_key")?.value).toBeNull();
  });

  it("treats a failed health load as everything missing", () => {
    expect(missingRequiredChecks(null)).toHaveLength(3);
  });
});

describe("canAdvance", () => {
  it("blocks Revisión until domain, OAuth client and service account are set; the token key is optional", () => {
    expect(canAdvance("review", { health: empty, mappings: [] })).toBe(false);
    expect(canAdvance("review", { health: null, mappings: [] })).toBe(false);
    expect(canAdvance("review", { health: { ...healthy, oauthClientConfigured: false }, mappings: [] })).toBe(false);
    expect(canAdvance("review", { health: healthy, mappings: [] })).toBe(true);
  });

  it("blocks the admin group step until an Administrador group is mapped", () => {
    expect(canAdvance("admin_group", { health: healthy, mappings: [] })).toBe(false);
    expect(canAdvance("admin_group", { health: healthy, mappings: [otherGroup] })).toBe(false);
    expect(canAdvance("admin_group", { health: healthy, mappings: [otherGroup, adminGroup] })).toBe(true);
  });

  it("lets Más grupos pass with nothing and stops at Listo", () => {
    expect(canAdvance("more_groups", { health: healthy, mappings: [] })).toBe(true);
    expect(canAdvance("done", { health: healthy, mappings: [adminGroup] })).toBe(false);
  });
});

describe("findAdminGroup", () => {
  it("ignores area mappings and other roles", () => {
    const area: GroupMapping = { ...adminGroup, kind: "area", role: null, areaId: "a", areaName: "Diseño" };
    expect(findAdminGroup([area, otherGroup])).toBeNull();
    expect(findAdminGroup([area, adminGroup])).toBe(adminGroup);
  });
});

describe("step navigation", () => {
  it("moves forward and back within bounds", () => {
    expect(nextStep("review")).toBe("admin_group");
    expect(nextStep("more_groups")).toBe("done");
    expect(nextStep("done")).toBe("done");
    expect(previousStep("admin_group")).toBe("review");
    expect(previousStep("review")).toBe("review");
  });

  it("opens on the first step that still needs work, never on Listo", () => {
    expect(initialStep({ health: empty, mappings: [] })).toBe("review");
    expect(initialStep({ health: healthy, mappings: [] })).toBe("admin_group");
    expect(initialStep({ health: healthy, mappings: [adminGroup] })).toBe("more_groups");
  });
});

describe("doneMessage", () => {
  it("names the Workspace domain", () => {
    expect(doneMessage("example.test")).toBe("Ahora entra con Google con tu cuenta de example.test.");
    expect(doneMessage(null)).toBe("Ahora entra con Google con tu cuenta de Workspace.");
  });
});
