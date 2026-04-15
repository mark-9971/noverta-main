import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const secret = process.env.SESSION_SECRET ?? process.env.DATABASE_URL ?? "trellis-sis-default-key";
  return scryptSync(secret, "trellis-sis-cred-salt", KEY_LENGTH);
}

export function encryptCredentials(credentials: Record<string, unknown>): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const plaintext = JSON.stringify(credentials);
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

export function decryptCredentials(encryptedStr: string): Record<string, unknown> {
  if (!encryptedStr) return {};

  try {
    const [ivHex, authTagHex, encrypted] = encryptedStr.split(":");
    if (!ivHex || !authTagHex || !encrypted) return {};

    const key = getEncryptionKey();
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return JSON.parse(decrypted) as Record<string, unknown>;
  } catch {
    return {};
  }
}
