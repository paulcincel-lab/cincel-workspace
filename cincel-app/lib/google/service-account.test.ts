// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  createServiceAccountJwt,
  DIRECTORY_SCOPES,
  getServiceAccountTokenSource,
  serviceAccountCredentialsFromEnv,
} from "./service-account";

const ENV = {
  GOOGLE_SA_CLIENT_EMAIL: "sa@project.iam.gserviceaccount.com",
  GOOGLE_SA_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nfake\\n-----END PRIVATE KEY-----\\n",
};

describe("service account", () => {
  it("reads credentials from env, null when either var is missing", () => {
    expect(serviceAccountCredentialsFromEnv(ENV)).toEqual({
      clientEmail: ENV.GOOGLE_SA_CLIENT_EMAIL,
      privateKey: ENV.GOOGLE_SA_PRIVATE_KEY,
    });
    expect(serviceAccountCredentialsFromEnv({ GOOGLE_SA_CLIENT_EMAIL: ENV.GOOGLE_SA_CLIENT_EMAIL })).toBeNull();
    expect(serviceAccountCredentialsFromEnv({})).toBeNull();
  });

  it("builds a JWT for the service account itself, with no subject", () => {
    const jwt = createServiceAccountJwt(serviceAccountCredentialsFromEnv(ENV)!, DIRECTORY_SCOPES);
    expect(jwt.email).toBe(ENV.GOOGLE_SA_CLIENT_EMAIL);
    expect(jwt.subject).toBeUndefined();
    expect(jwt.key).toContain("\nfake\n");
    expect(jwt.scopes).toEqual(DIRECTORY_SCOPES);
  });

  it("returns null when not configured and caches one source per scope set", () => {
    expect(getServiceAccountTokenSource(DIRECTORY_SCOPES, {})).toBeNull();
    const a = getServiceAccountTokenSource(DIRECTORY_SCOPES, ENV);
    const b = getServiceAccountTokenSource([...DIRECTORY_SCOPES].reverse(), ENV);
    const c = getServiceAccountTokenSource(["https://www.googleapis.com/auth/drive"], ENV);
    expect(a).not.toBeNull();
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});
