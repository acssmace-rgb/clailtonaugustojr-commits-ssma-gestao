import type { MultipartFile } from '@fastify/multipart';
import { badRequest } from './errors.js';
import { ALLOWED_MIME } from './storage.js';
import { sha256 } from './crypto.js';

/** Identifica o tipo real do arquivo pelos primeiros bytes ("magic numbers"). */
function sniff(buf: Buffer): 'pdf' | 'png' | 'jpeg' | 'webp' | 'zip' | 'ole' | 'text' | 'unknown' {
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  if (buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) return 'zip';
  if (buf.subarray(0, 4).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0]))) return 'ole';
  if (!buf.subarray(0, 4096).includes(0)) return 'text';
  return 'unknown';
}

const EXPECTED: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpeg',
  'image/webp': 'webp',
  'text/csv': 'text',
  'text/plain': 'text',
  'application/msword': 'ole',
  'application/vnd.ms-excel': 'ole',
};

export async function readUpload(file: MultipartFile | undefined) {
  if (!file) throw badRequest('Envie um arquivo');
  const buffer = await file.toBuffer();
  if (file.file.truncated) throw badRequest('Arquivo excede o tamanho máximo permitido');
  if (!buffer.length) throw badRequest('Arquivo vazio');
  const mimeType = file.mimetype;
  if (!ALLOWED_MIME.has(mimeType)) throw badRequest(`Tipo de arquivo não permitido: ${mimeType}`);
  const real = sniff(buffer);
  const expected = EXPECTED[mimeType] ?? 'zip';
  if (real !== expected) throw badRequest('O conteúdo do arquivo não corresponde ao tipo informado');
  const fileName = file.filename.replace(/[^\p{L}\p{N}._ -]/gu, '_').slice(0, 200) || 'arquivo';
  return { buffer, mimeType, fileName, size: buffer.length, sha256: sha256(buffer) };
}

export const contentDisposition = (fileName: string) =>
  `attachment; filename="${fileName.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
