import { z } from 'zod';
import { isValidCnpj, isValidCpf, onlyDigits } from './br.js';

/** Data no formato AAAA-MM-DD (convertida para Date UTC). */
export const zDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use o formato AAAA-MM-DD')
  .transform((s) => new Date(`${s}T00:00:00.000Z`));
export const zDateOpt = zDate.nullish();
export const zDateTime = z.string().datetime({ offset: true, message: 'Data/hora inválida' }).transform((s) => new Date(s));

export const zText = (max = 500) => z.string().trim().max(max);
export const zTextOpt = (max = 500) => z.string().trim().max(max).nullish().transform((v) => (v === '' ? null : v));
export const zId = z.string().uuid('Identificador inválido');
export const zIdOpt = z.string().uuid().nullish().or(z.literal('').transform(() => null));

export const zCpf = z
  .string()
  .transform(onlyDigits)
  .refine(isValidCpf, 'CPF inválido');
export const zCnpj = z
  .string()
  .transform(onlyDigits)
  .refine(isValidCnpj, 'CNPJ inválido');

export const zPage = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  q: z.string().trim().max(100).optional(),
});
