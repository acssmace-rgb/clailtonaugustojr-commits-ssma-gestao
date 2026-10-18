import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { config } from './config.js';
import { randomToken } from './crypto.js';

export interface StorageDriver {
  put(key: string, data: Buffer, mimeType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}

class LocalStorage implements StorageDriver {
  constructor(private root: string) {}
  private resolve(key: string) {
    const full = path.resolve(this.root, key);
    if (!full.startsWith(path.resolve(this.root))) throw new Error('Chave de armazenamento inválida');
    return full;
  }
  async put(key: string, data: Buffer) {
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, data, { mode: 0o600 });
  }
  get(key: string) {
    return readFile(this.resolve(key));
  }
  async remove(key: string) {
    await unlink(this.resolve(key)).catch(() => undefined);
  }
}

class S3Storage implements StorageDriver {
  private client = new S3Client({
    region: config.S3_REGION,
    endpoint: config.S3_ENDPOINT || undefined,
    forcePathStyle: Boolean(config.S3_ENDPOINT),
    credentials:
      config.S3_ACCESS_KEY_ID && config.S3_SECRET_ACCESS_KEY
        ? { accessKeyId: config.S3_ACCESS_KEY_ID, secretAccessKey: config.S3_SECRET_ACCESS_KEY }
        : undefined,
  });
  constructor(private bucket: string) {}
  async put(key: string, data: Buffer, mimeType: string) {
    // Criptografia em repouso do lado do servidor (SSE-S3)
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: data, ContentType: mimeType, ServerSideEncryption: 'AES256' }),
    );
  }
  async get(key: string) {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return Buffer.from(await res.Body!.transformToByteArray());
  }
  async remove(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

export const storage: StorageDriver =
  config.STORAGE_DRIVER === 's3' ? new S3Storage(config.S3_BUCKET ?? '') : new LocalStorage(config.STORAGE_DIR);

/** Chaves sempre separadas por cliente; nome original nunca entra na chave. */
export const newStorageKey = (tenantId: string, area: string) =>
  `${tenantId}/${area}/${new Date().toISOString().slice(0, 7)}/${randomToken(18)}`;

export const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'text/csv',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
]);
