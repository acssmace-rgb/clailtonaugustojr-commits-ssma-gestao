import ExcelJS from 'exceljs';
import type { PdfColumn } from './pdf.js';

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const cell = (v: unknown) => {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10).replace(ISO, '$3/$2/$1');
  return typeof v === 'string' ? v.replace(ISO, '$3/$2/$1') : v;
};

/** CSV com separador ";" e BOM UTF-8 (abre corretamente no Excel em português). */
export function toCsv(columns: PdfColumn[], rows: Record<string, unknown>[]) {
  const esc = (v: unknown) => {
    let s = String(cell(v));
    // Neutraliza injeção de fórmulas em planilhas
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.map((c) => esc(c.label)).join(';'), ...rows.map((r) => columns.map((c) => esc(r[c.key])).join(';'))];
  return Buffer.from(`﻿${lines.join('\r\n')}`, 'utf8');
}

export async function toXlsx(opts: { title: string; columns: PdfColumn[]; rows: Record<string, unknown>[]; notes?: string[] }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SSMA Gestão';
  const ws = wb.addWorksheet(opts.title.slice(0, 31).replace(/[\\/?*[\]:]/g, ' '));
  ws.columns = opts.columns.map((c) => ({ header: c.label, key: c.key, width: Math.round(14 * (c.width ?? 1)) }));
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2C302E' } };
  for (const r of opts.rows) {
    const row: Record<string, unknown> = {};
    for (const c of opts.columns) {
      const v = cell(r[c.key]);
      row[c.key] = typeof v === 'string' && /^[=+\-@]/.test(v) ? `'${v}` : v;
    }
    ws.addRow(row);
  }
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: opts.columns.length } };
  if (opts.notes?.length) {
    const info = wb.addWorksheet('Metodologia');
    info.getColumn(1).width = 120;
    info.addRow(['Origem dos dados e fórmulas']).font = { bold: true };
    for (const n of opts.notes) info.addRow([n]);
    info.addRow([`Gerado em ${new Date().toISOString()}`]);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
