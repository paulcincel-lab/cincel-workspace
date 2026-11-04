// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/lib/auth/auth-actions", () => ({
  loginAction: vi.fn(),
}));

import LoginForm from "./LoginForm";

// Text that must never be rendered on the public login page; the password values come from the env below.
const FORBIDDEN_SNIPPETS = ["contraseña temporal inicial"];

afterEach(() => {
  cleanup();
});

describe("LoginForm", () => {
  it.each([
    { googleEnabled: true, passwordEnabled: true },
    { googleEnabled: false, passwordEnabled: true },
    { googleEnabled: true, passwordEnabled: false },
  ])("never shows a credential (google=$googleEnabled, password=$passwordEnabled)", (props) => {
    const { container } = render(<LoginForm {...props} callbackError={null} />);
    const html = container.innerHTML;

    for (const snippet of FORBIDDEN_SNIPPETS) {
      expect(html).not.toContain(snippet);
    }
    for (const envName of ["SEED_ADMIN_PASSWORD", "BOOTSTRAP_ADMIN_PASSWORD", "E2E_ADMIN_PASSWORD"]) {
      const value = process.env[envName];
      if (value) expect(html).not.toContain(value);
    }
    expect(container.querySelector("#login-password-help")).toBeNull();
  });
});
