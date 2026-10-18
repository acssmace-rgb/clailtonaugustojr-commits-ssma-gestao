export type ExpiryStatus = 'sem_validade' | 'vigente' | 'a_vencer' | 'vencido';

/** Situação de validade: vencido (< hoje), a vencer (até hoje + antecedência), vigente. */
export function expiryStatus(validUntil: Date | null | undefined, alertDays: number, today = new Date()): ExpiryStatus {
  if (!validUntil) return 'sem_validade';
  const t = new Date(today.toISOString().slice(0, 10));
  if (validUntil < t) return 'vencido';
  const limit = new Date(t);
  limit.setUTCDate(limit.getUTCDate() + alertDays);
  return validUntil <= limit ? 'a_vencer' : 'vigente';
}
