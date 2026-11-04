import "server-only";

import nodemailer, { type Transporter } from "nodemailer";

/**
 * Outgoing mail (backend spec §B.6): portal invitations, sign-in links and
 * "archivo recibido" notices to staff. Production sends through Gmail SMTP from
 * one Workspace account:
 *
 *   SMTP_HOST=smtp.gmail.com  SMTP_PORT=465 (TLS)  SMTP_USER=<the account>
 *   SMTP_PASSWORD=<its app password>  MAIL_FROM="Cincel <the same account>"
 *
 * `MAIL_FROM` must be the account itself or one of its verified "Send mail as"
 * aliases, or Gmail rewrites it. Gmail allows about 2,000 messages a day per
 * Workspace account.
 *
 * Without `SMTP_HOST` (local and tests) messages are only logged, with link
 * tokens redacted, and nothing throws. `sendMail` never throws: callers record
 * `sent: false` (e.g. the invite's `emailSent`) and carry on.
 */

type Env = Record<string, string | undefined>;

export type MailMessage = {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
};

export type SendMailResult = { sent: true } | { sent: false; reason: "not_configured" | "failed" };

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string | null;
  password: string | null;
  from: string;
};

const DEFAULT_FROM = "Cincel <no-reply@localhost>";

/** SMTP settings from the environment, or null when `SMTP_HOST` is unset (log-only mode). */
export function getSmtpConfig(env: Env = process.env): SmtpConfig | null {
  const host = env.SMTP_HOST?.trim();
  if (!host) return null;
  const parsedPort = Number.parseInt(env.SMTP_PORT?.trim() ?? "", 10);
  const port = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 465;
  const user = env.SMTP_USER?.trim() || null;
  return {
    host,
    port,
    // 465 is implicit TLS (Gmail); 587 and Mailpit's 1025 upgrade or stay plain.
    secure: port === 465,
    user,
    password: env.SMTP_PASSWORD || null,
    from: env.MAIL_FROM?.trim() || (user ? `Cincel <${user}>` : DEFAULT_FROM),
  };
}

const TOKEN_PARAM = /([?&](?:token|code)=)[^&\s"'<>]+/gi;

/** Replaces `token=` / `code=` query values so sign-in links never reach the logs. */
export function redactSecrets(value: string): string {
  return value.replace(TOKEN_PARAM, "$1[redacted]");
}

let cachedTransport: { key: string; transport: Transporter } | null = null;

function getTransport(config: SmtpConfig): Transporter {
  const key = `${config.host}:${config.port}:${config.user ?? ""}:${config.password ?? ""}`;
  if (cachedTransport?.key === key) return cachedTransport.transport;
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user && config.password ? { user: config.user, pass: config.password } : undefined,
  });
  cachedTransport = { key, transport };
  return transport;
}

/** The SMTP reply code (e.g. 535, 550) or error code from a nodemailer failure; never the message body. */
function smtpFailureCode(error: unknown): string {
  if (error && typeof error === "object") {
    const { responseCode, code } = error as { responseCode?: unknown; code?: unknown };
    if (typeof responseCode === "number") return String(responseCode);
    if (typeof code === "string") return code;
  }
  return "unknown";
}

function recipients(to: string | string[]): string {
  return Array.isArray(to) ? to.join(", ") : to;
}

export async function sendMail(message: MailMessage, env: Env = process.env): Promise<SendMailResult> {
  const config = getSmtpConfig(env);

  if (!config) {
    console.info(
      `[email] SMTP_HOST not set; not sending.\nTo: ${recipients(message.to)}\nSubject: ${message.subject}\n\n` +
        redactSecrets(message.text),
    );
    return { sent: false, reason: "not_configured" };
  }

  try {
    await getTransport(config).sendMail({
      from: config.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    return { sent: true };
  } catch (error) {
    // Only the code and subject: the error text can echo the body, which may hold a sign-in link.
    console.error(`[email] SMTP send failed (code ${smtpFailureCode(error)}): "${message.subject}"`);
    return { sent: false, reason: "failed" };
  }
}
