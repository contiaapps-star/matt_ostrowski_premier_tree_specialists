import { randomBytes } from 'node:crypto';

/**
 * RFC 9562 UUID v7: 48-bit unix-ms timestamp + 4-bit version + 12-bit random
 * + 2-bit variant + 62-bit random. Strings are lexicographically sortable by
 * generation time, which lets us order rows without a separate timestamp index.
 */
export function generateUuidV7(): string {
  const ms = BigInt(Date.now());
  const bytes = randomBytes(16);

  bytes[0] = Number((ms >> 40n) & 0xffn);
  bytes[1] = Number((ms >> 32n) & 0xffn);
  bytes[2] = Number((ms >> 24n) & 0xffn);
  bytes[3] = Number((ms >> 16n) & 0xffn);
  bytes[4] = Number((ms >> 8n) & 0xffn);
  bytes[5] = Number(ms & 0xffn);

  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex = Buffer.from(bytes).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export function now(): Date {
  return new Date();
}

export function nowIso(): string {
  return new Date().toISOString();
}
