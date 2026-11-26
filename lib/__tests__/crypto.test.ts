import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { decryptSecret, encryptSecret } from "@/lib/crypto";

describe("AES-256-GCM remote credential encryption", () => {
  const originalKey = process.env.REMOTE_CREDENTIAL_ENCRYPTION_KEY;

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.REMOTE_CREDENTIAL_ENCRYPTION_KEY;
    } else {
      process.env.REMOTE_CREDENTIAL_ENCRYPTION_KEY = originalKey;
    }
  });

  it("round-trips a password with a 64-char hex key", () => {
    process.env.REMOTE_CREDENTIAL_ENCRYPTION_KEY = "a".repeat(64);
    const cipher = encryptSecret("uv-pass-9876");
    expect(cipher.startsWith("v1:")).toBe(true);
    expect(cipher).not.toContain("uv-pass-9876");
    expect(decryptSecret(cipher)).toBe("uv-pass-9876");
  });

  it("fails when ciphertext is tampered or key mismatches", () => {
    process.env.REMOTE_CREDENTIAL_ENCRYPTION_KEY = "b".repeat(64);
    const cipher = encryptSecret("secret-123");
    const tampered = `${cipher.slice(0, -2)}zz`;
    expect(() => decryptSecret(tampered)).toThrow();

    process.env.REMOTE_CREDENTIAL_ENCRYPTION_KEY = "c".repeat(64);
    expect(() => decryptSecret(cipher)).toThrow();
  });

  it("fails closed when encryption key is missing", () => {
    delete process.env.REMOTE_CREDENTIAL_ENCRYPTION_KEY;
    expect(() => encryptSecret("secret")).toThrow(/REMOTE_CREDENTIAL_ENCRYPTION_KEY/);
  });
});
