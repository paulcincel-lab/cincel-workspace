import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createTransport, transportSendMail } = vi.hoisted(() => {
  const transportSendMail = vi.fn();
  return { transportSendMail, createTransport: vi.fn(() => ({ sendMail: transportSendMail })) };
});

vi.mock("nodemailer", () => ({ default: { createTransport }, createTransport }));

import { getSmtpConfig, redactSecrets, sendMail } from "./index";

const TOKEN = "s3cr3t-T0ken_value";
const message = {
  to: "cliente@example.com",
  subject: "Tu enlace de acceso a Cincel",
  text: `Entra aquí: https://app.example.test/portal/acceder?token=${TOKEN}\n`,
  html: `<a href="https://app.example.test/portal/acceder?token=${TOKEN}">Entrar</a>`,
};

const gmailEnv = {
  SMTP_HOST: "smtp.gmail.com",
  SMTP_PORT: "465",
  SMTP_USER: "portal@cincel.example",
  SMTP_PASSWORD: "app-password-value",
  MAIL_FROM: "Cincel <portal@cincel.example>",
};

let info: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  info = vi.spyOn(console, "info").mockImplementation(() => {});
  error = vi.spyOn(console, "error").mockImplementation(() => {});
  createTransport.mockClear();
  transportSendMail.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function logged(spy: ReturnType<typeof vi.spyOn>): string {
  return spy.mock.calls.map((call: unknown[]) => call.map(String).join(" ")).join("\n");
}

describe("getSmtpConfig", () => {
  it("is null without SMTP_HOST", () => {
    expect(getSmtpConfig({})).toBeNull();
    expect(getSmtpConfig({ SMTP_HOST: "  ", SMTP_USER: "x" })).toBeNull();
  });

  it("reads the Gmail settings with implicit TLS on 465", () => {
    expect(getSmtpConfig(gmailEnv)).toEqual({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      user: "portal@cincel.example",
      password: "app-password-value",
      from: "Cincel <portal@cincel.example>",
    });
  });

  it("uses no TLS wrapper for Mailpit and falls back to the account as sender", () => {
    const config = getSmtpConfig({ SMTP_HOST: "mailpit", SMTP_PORT: "1025", SMTP_USER: "portal@cincel.example" });
    expect(config).toMatchObject({ host: "mailpit", port: 1025, secure: false, password: null });
    expect(config?.from).toBe("Cincel <portal@cincel.example>");
  });
});

describe("redactSecrets", () => {
  it("removes token and code values from links", () => {
    expect(redactSecrets(`/portal/acceder?token=${TOKEN}&x=1`)).toBe("/portal/acceder?token=[redacted]&x=1");
    expect(redactSecrets("a?foo=1&code=123456 b")).toBe("a?foo=1&code=[redacted] b");
  });
});

describe("sendMail without SMTP_HOST", () => {
  it("logs the message without the token and does not throw", async () => {
    await expect(sendMail(message, {})).resolves.toEqual({ sent: false, reason: "not_configured" });
    expect(createTransport).not.toHaveBeenCalled();
    const output = logged(info);
    expect(output).toContain("cliente@example.com");
    expect(output).toContain("Tu enlace de acceso a Cincel");
    expect(output).toContain("/portal/acceder?token=[redacted]");
    expect(output).not.toContain(TOKEN);
  });
});

describe("sendMail with SMTP", () => {
  it("sends from MAIL_FROM over the configured transport", async () => {
    transportSendMail.mockResolvedValue({ messageId: "1" });
    await expect(sendMail(message, gmailEnv)).resolves.toEqual({ sent: true });
    expect(createTransport).toHaveBeenCalledWith({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: "portal@cincel.example", pass: "app-password-value" },
    });
    expect(transportSendMail).toHaveBeenCalledWith({ from: "Cincel <portal@cincel.example>", ...message });
  });

  it("logs only the SMTP code on failure, never the password or token", async () => {
    transportSendMail.mockRejectedValue(
      Object.assign(new Error(`Invalid login for app-password-value ${TOKEN}`), { responseCode: 535, code: "EAUTH" }),
    );
    await expect(sendMail(message, gmailEnv)).resolves.toEqual({ sent: false, reason: "failed" });
    const output = logged(error);
    expect(output).toContain("535");
    expect(output).not.toContain("app-password-value");
    expect(output).not.toContain(TOKEN);
  });
});
