import { createHash, randomBytes, randomUUID } from 'node:crypto';

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
export const randomToken = (bytes = 48) => randomBytes(bytes).toString('base64url');
export const uuid = () => randomUUID();

const FRIEND_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function friendCode(len = 8): string {
  const bytes = randomBytes(len);
  let out = '';
  for (const b of bytes) out += FRIEND_ALPHABET[b % FRIEND_ALPHABET.length];
  return out;
}
