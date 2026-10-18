import { describe, expect, it } from 'vitest';
import { isValidCnpj, isValidCpf, maskCpf } from '../src/lib/br.js';
import { decrypt, encrypt } from '../src/lib/crypto.js';
import { redact } from '../src/lib/audit.js';
import { expiryStatus } from '../src/lib/expiry.js';
import { nextDueDate } from '../src/modules/tasks/routes.js';
import { validatePayload } from '../src/modules/esocial/validate.js';
import type { PayloadS2220 } from '../src/modules/esocial/domain.js';
import { validCnpj, validCpf } from './helpers.js';

describe('documentos brasileiros', () => {
  it('valida CPF', () => {
    expect(isValidCpf(validCpf('123456789'))).toBe(true);
    expect(isValidCpf('11111111111')).toBe(false);
    expect(isValidCpf('12345678900')).toBe(false);
    expect(maskCpf('12345678909')).toBe('***.456.***-**');
  });
  it('valida CNPJ', () => {
    expect(isValidCnpj(validCnpj('90000001'))).toBe(true);
    expect(isValidCnpj('00000000000000')).toBe(false);
    expect(isValidCnpj('12345678000100')).toBe(false);
  });
});

describe('criptografia', () => {
  it('cifra e decifra; detecta adulteração', () => {
    const c = encrypt('dado sensível');
    expect(c).not.toContain('sensível');
    expect(decrypt(c)).toBe('dado sensível');
    const parts = c.split('.');
    parts[3] = Buffer.from('outro').toString('base64url');
    expect(() => decrypt(parts.join('.'))).toThrow();
  });
});

describe('auditoria', () => {
  it('mascara campos sensíveis', () => {
    expect(redact({ name: 'x', cpf: '1', password: 'p', medical: { cid: 'A' }, nested: { notes: 'n' } })).toEqual({
      name: 'x', cpf: '[protegido]', password: '[protegido]', medical: '[protegido]', nested: { notes: '[protegido]' },
    });
  });
});

describe('datas', () => {
  const today = new Date('2026-10-18T12:00:00Z');
  it('situação de validade', () => {
    expect(expiryStatus(null, 30, today)).toBe('sem_validade');
    expect(expiryStatus(new Date('2026-10-17'), 30, today)).toBe('vencido');
    expect(expiryStatus(new Date('2026-11-10'), 30, today)).toBe('a_vencer');
    expect(expiryStatus(new Date('2027-01-10'), 30, today)).toBe('vigente');
  });
  it('recorrência de tarefas', () => {
    expect(nextDueDate(new Date('2026-01-31'), 'mensal')?.toISOString().slice(0, 10)).toBe('2026-02-28');
    expect(nextDueDate(new Date('2026-10-18'), 'semanal')?.toISOString().slice(0, 10)).toBe('2026-10-25');
    expect(nextDueDate(new Date('2026-10-18'), 'nenhuma')).toBeNull();
  });
});

describe('eSocial — regras internas', () => {
  const base: PayloadS2220 = {
    tipo: 'S2220',
    empregador: { razaoSocial: 'X', tipoInscricao: 'CNPJ', numeroInscricao: validCnpj('90000001') },
    vinculo: { nome: 'Y', cpf: validCpf('123456789'), matricula: 'M1', codigoCategoria: null },
    exame: { tipo: 'periodico', data: '2026-01-10', resultado: 'apto', medicoEmitente: { nome: 'Dr', registro: '1', uf: 'CE' }, procedimentos: [{ codigo: '0295', data: '2026-01-10', descricao: null }] },
    responsavelMonitoramento: { nome: 'Dra', registro: '2', uf: 'CE' },
  };
  it('sem tabela importada gera apenas aviso', async () => {
    const issues = await validatePayload(base, async () => null);
    expect(issues.filter((i) => i.severidade === 'erro')).toHaveLength(0);
    expect(issues.some((i) => i.severidade === 'aviso' && i.mensagem.includes('não importada'))).toBe(true);
  });
  it('código ausente da tabela importada é erro', async () => {
    const issues = await validatePayload(base, async () => false);
    expect(issues.some((i) => i.severidade === 'erro' && i.campo.includes('procedimentos'))).toBe(true);
  });
  it('detecta dados obrigatórios faltantes e CPF inválido', async () => {
    const p: PayloadS2220 = { ...base, vinculo: { ...base.vinculo, cpf: '12345678900', matricula: null }, exame: { ...base.exame, resultado: null, procedimentos: [] } };
    const campos = (await validatePayload(p, async () => true)).map((i) => i.campo);
    expect(campos).toEqual(expect.arrayContaining(['vinculo.cpf', 'vinculo', 'exame.resultado', 'exame.procedimentos']));
  });
});
