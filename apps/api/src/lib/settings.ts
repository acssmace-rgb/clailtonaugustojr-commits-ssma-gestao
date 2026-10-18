import { z } from 'zod';

/**
 * Configurações por cliente. Nada aqui é exigência legal pré-definida pelo sistema:
 * antecedências e prazos são definidos pelo responsável técnico de cada cliente.
 */
export const settingsSchema = z.object({
  alertDays: z
    .object({
      documents: z.number().int().min(0).max(365).default(30),
      exams: z.number().int().min(0).max(365).default(30),
      trainings: z.number().int().min(0).max(365).default(30),
      ppe: z.number().int().min(0).max(365).default(15),
      tasks: z.number().int().min(0).max(60).default(3),
    })
    .default({ documents: 30, exams: 30, trainings: 30, ppe: 15, tasks: 3 }),
  /** Matriz de risco: limites do nível (probabilidade × severidade, 1..25) */
  riskMatrix: z
    .object({ moderado: z.number().int().default(5), alto: z.number().int().default(10), critico: z.number().int().default(17) })
    .default({ moderado: 5, alto: 10, critico: 17 }),
  /**
   * Prazos de envio dos eventos eSocial, em texto/dias, preenchidos pelo responsável
   * conforme o Manual de Orientação do eSocial vigente. Vazio = sem alerta de prazo.
   */
  esocialDeadlines: z
    .object({
      S2210: z.string().max(300).nullable().default(null),
      S2220: z.string().max(300).nullable().default(null),
      S2240: z.string().max(300).nullable().default(null),
    })
    .default({ S2210: null, S2220: null, S2240: null }),
  /** Retenção (meses) de registros encerrados antes de sinalizar revisão LGPD. Null = não sinalizar. */
  retentionReviewMonths: z.number().int().min(1).max(600).nullable().default(null),
});

export type TenantSettings = z.infer<typeof settingsSchema>;
export const readSettings = (raw: unknown): TenantSettings => settingsSchema.parse(raw ?? {});
