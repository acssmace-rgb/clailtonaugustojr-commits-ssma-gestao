import argon2 from 'argon2';
import { z } from 'zod';

export const hashPassword = (plain: string) => argon2.hash(plain, { type: argon2.argon2id });
export const verifyPassword = (hash: string, plain: string) => argon2.verify(hash, plain).catch(() => false);

/** Política mínima: 10+ caracteres com letras e números. */
export const passwordSchema = z
  .string()
  .min(10, 'A senha deve ter pelo menos 10 caracteres')
  .max(128)
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), 'A senha deve conter letras e números');
