import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { config } from './config.js';

const key = Buffer.from(config.ENCRYPTION_KEY, 'base64');

/** Criptografa texto com AES-256-GCM. Formato: v1.<iv>.<tag>.<dados> (base64url). */
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), data.toString('base64url')].join('.');
}

export function decrypt(token: string): string {
  const [v, iv, tag, data] = token.split('.');
  if (v !== 'v1' || !iv || !tag || data === undefined) throw new Error('Formato criptografado inválido');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
}

export const encryptJson = (value: unknown) => encrypt(JSON.stringify(value));
export const decryptJson = <T = unknown>(token: string | null | undefined): T | null =>
  token ? (JSON.parse(decrypt(token)) as T) : null;

export const sha256 = (input: string | Buffer) => createHash('sha256').update(input).digest('hex');
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');
