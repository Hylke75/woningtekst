import { createHmac } from "node:crypto";

/**
 * Minimale TOTP-implementatie (RFC 6238, HMAC-SHA1, 6 cijfers, 30 s) voor
 * tests die met Supabase Auth MFA inloggen. Alleen voor tests; geen extra dependency.
 */
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/[\s=-]/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error(`Ongeldig base32-teken: ${ch}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** HOTP (RFC 4226) voor een gegeven teller. */
export function hotp(key: Buffer, counter: number, digits = 6): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", key).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(bin % 10 ** digits).padStart(digits, "0");
}

export function totpStep(timeMs = Date.now(), period = 30): number {
  return Math.floor(timeMs / 1000 / period);
}

/** TOTP-code voor een base32-geheim (zoals Supabase dat teruggeeft). */
export function totp(secretBase32: string, timeMs = Date.now(), opts: { digits?: number; period?: number } = {}): string {
  return hotp(base32Decode(secretBase32), totpStep(timeMs, opts.period ?? 30), opts.digits ?? 6);
}
