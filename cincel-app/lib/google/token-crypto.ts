import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Encryption at rest for Google OAuth tokens (`core.google_oauth_accounts`).
 *
 * AES-256-GCM with the key in `TOKEN_ENCRYPTION_KEY` (64 hex chars = 32
 * bytes). Ciphertext is `v1:<iv>:<tag>:<data>`, each part base64; the `v1`
 * prefix leaves room for a later key rotation. A tampered or truncated value
 * fails authentication and throws.
 */

const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;

type Env = Record<string, string | undefined>;

export class TokenCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TokenCryptoError";
  }
}

/** The 32-byte key from `TOKEN_ENCRYPTION_KEY`; throws when missing or malformed. */
export function tokenEncryptionKey(env: Env = process.env): Buffer {
  const hex = env.TOKEN_ENCRYPTION_KEY?.trim();
  if (!hex) throw new TokenCryptoError("TOKEN_ENCRYPTION_KEY no está configurada");
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new TokenCryptoError("TOKEN_ENCRYPTION_KEY debe tener 64 caracteres hex");
  return Buffer.from(hex, "hex");
}

/** Whether `value` looks like our ciphertext (legacy rows hold plaintext tokens). */
export function isEncryptedToken(value: string): boolean {
  return value.startsWith(`${VERSION}:`) && value.split(":").length === 4;
}

export function encryptToken(plaintext: string, key: Buffer = tokenEncryptionKey()): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), tag.toString("base64"), data.toString("base64")].join(":");
}

export function decryptToken(ciphertext: string, key: Buffer = tokenEncryptionKey()): string {
  const parts = ciphertext.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) throw new TokenCryptoError("Formato de token cifrado no reconocido");

  const [, ivPart, tagPart, dataPart] = parts;
  const iv = Buffer.from(ivPart, "base64");
  const tag = Buffer.from(tagPart, "base64");
  const data = Buffer.from(dataPart, "base64");
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) throw new TokenCryptoError("Token cifrado inválido");

  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    throw new TokenCryptoError("No se pudo descifrar el token");
  }
}
