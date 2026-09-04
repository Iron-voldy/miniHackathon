import crypto from "node:crypto";

// Unambiguous alphabet - no 0/O, 1/I/L confusion, since a caregiver reads this
// aloud or writes it down for the patient's device.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function generateAccessCode(): string {
  const bytes = crypto.randomBytes(8);
  let raw = "";
  for (let i = 0; i < 8; i += 1) raw += ALPHABET[bytes[i] % ALPHABET.length];
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

export function normalizeAccessCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function hashAccessCode(code: string): string {
  return crypto.createHash("sha256").update(normalizeAccessCode(code)).digest("hex");
}
