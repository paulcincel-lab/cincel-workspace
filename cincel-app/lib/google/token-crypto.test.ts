// @vitest-environment node
import { describe, expect, it } from "vitest";

import { decryptToken, encryptToken, isEncryptedToken, TokenCryptoError, tokenEncryptionKey } from "./token-crypto";

const KEY_HEX = "0".repeat(64);
const OTHER_KEY_HEX = "f".repeat(64);
const key = Buffer.from(KEY_HEX, "hex");

describe("token-crypto", () => {
  it("round-trips a token in the v1:<iv>:<tag>:<data> format", () => {
    const ciphertext = encryptToken("ya29.fake-access-token", key);
    const parts = ciphertext.split(":");
    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe("v1");
    expect(Buffer.from(parts[1], "base64")).toHaveLength(12);
    expect(Buffer.from(parts[2], "base64")).toHaveLength(16);
    expect(ciphertext).not.toContain("fake-access-token");
    expect(decryptToken(ciphertext, key)).toBe("ya29.fake-access-token");
  });

  it("uses a fresh iv each time", () => {
    expect(encryptToken("same", key)).not.toBe(encryptToken("same", key));
  });

  it("round-trips empty and non-ASCII values", () => {
    expect(decryptToken(encryptToken("", key), key)).toBe("");
    expect(decryptToken(encryptToken("contraseña ñ ✓", key), key)).toBe("contraseña ñ ✓");
  });

  it("rejects a tampered payload, tag or iv", () => {
    const [version, iv, tag, data] = encryptToken("secret-value", key).split(":");
    const flip = (part: string) => {
      const bytes = Buffer.from(part, "base64");
      bytes[0] ^= 0x01;
      return bytes.toString("base64");
    };
    expect(() => decryptToken([version, iv, tag, flip(data)].join(":"), key)).toThrow(TokenCryptoError);
    expect(() => decryptToken([version, iv, flip(tag), data].join(":"), key)).toThrow(TokenCryptoError);
    expect(() => decryptToken([version, flip(iv), tag, data].join(":"), key)).toThrow(TokenCryptoError);
  });

  it("rejects a different key", () => {
    const ciphertext = encryptToken("secret-value", key);
    expect(() => decryptToken(ciphertext, Buffer.from(OTHER_KEY_HEX, "hex"))).toThrow(TokenCryptoError);
  });

  it("rejects malformed values and unknown versions", () => {
    const [, iv, tag, data] = encryptToken("secret-value", key).split(":");
    expect(() => decryptToken("plaintext-token", key)).toThrow(TokenCryptoError);
    expect(() => decryptToken(`v2:${iv}:${tag}:${data}`, key)).toThrow(TokenCryptoError);
    expect(() => decryptToken(`v1:${iv}:${data}`, key)).toThrow(TokenCryptoError);
    expect(() => decryptToken(`v1::${tag}:${data}`, key)).toThrow(TokenCryptoError);
  });

  it("tells ciphertext from legacy plaintext", () => {
    expect(isEncryptedToken(encryptToken("x", key))).toBe(true);
    expect(isEncryptedToken("ya29.legacy-plaintext")).toBe(false);
  });

  it("reads the key from TOKEN_ENCRYPTION_KEY", () => {
    expect(tokenEncryptionKey({ TOKEN_ENCRYPTION_KEY: KEY_HEX })).toEqual(key);
    expect(() => tokenEncryptionKey({})).toThrow(TokenCryptoError);
    expect(() => tokenEncryptionKey({ TOKEN_ENCRYPTION_KEY: "abc" })).toThrow(TokenCryptoError);
    expect(() => tokenEncryptionKey({ TOKEN_ENCRYPTION_KEY: "z".repeat(64) })).toThrow(TokenCryptoError);
  });
});
