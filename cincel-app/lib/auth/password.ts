import "server-only";

import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb);

const KEYLEN = 64;
const SALT_BYTES = 16;

/**
 * Hash a plaintext password with scrypt. Returns the derived key and the salt
 * (both hex). Store them in `core.auth_credentials`.
 */
export async function hashPassword(
  password: string
): Promise<{ hash: string; salt: string }> {
  const salt = randomBytes(SALT_BYTES).toString("hex");
  const derived = (await scrypt(password.normalize("NFKC"), salt, KEYLEN)) as Buffer;
  return { hash: derived.toString("hex"), salt };
}

/**
 * Constant-time verification of a plaintext password against a stored
 * scrypt hash + salt.
 */
export async function verifyPassword(
  password: string,
  hash: string,
  salt: string
): Promise<boolean> {
  const expected = Buffer.from(hash, "hex");
  const derived = (await scrypt(password.normalize("NFKC"), salt, KEYLEN)) as Buffer;
  if (expected.length !== derived.length) {
    return false;
  }
  return timingSafeEqual(expected, derived);
}
