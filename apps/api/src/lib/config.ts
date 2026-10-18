import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3333),
  APP_ORIGIN: z.string().url().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1),
  ENCRYPTION_KEY: z
    .string()
    .min(1, 'ENCRYPTION_KEY é obrigatória (32 bytes em base64)')
    .refine((v) => Buffer.from(v, 'base64').length === 32, 'ENCRYPTION_KEY deve ter 32 bytes em base64'),
  SESSION_TTL_HOURS: z.coerce.number().default(12),
  /** Tentativas de login/MFA/redefinição por IP a cada 15 minutos */
  LOGIN_RATE_LIMIT: z.coerce.number().int().min(1).default(10),
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_DIR: z.string().default('./storage'),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  MAX_UPLOAD_MB: z.coerce.number().default(25),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default('SSMA Gestão <nao-responda@localhost>'),
  ESOCIAL_TRANSMITTER: z.enum(['disabled']).default('disabled'),
  ESOCIAL_AMBIENTE: z.enum(['producao_restrita', 'producao']).default('producao_restrita'),
  ESOCIAL_LEIAUTE_REFERENCIA: z.string().default('S-1.3 (conferir NT vigente)'),
  ALLOW_DEMO_SEED: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // Mostra apenas os nomes das variáveis com problema, nunca os valores.
  const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n  ');
  throw new Error(`Configuração inválida:\n  ${issues}`);
}

export const config = parsed.data;
export const isProd = config.NODE_ENV === 'production';
