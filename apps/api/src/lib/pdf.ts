import PDFDocument from 'pdfkit';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const LOGO = process.env.BRAND_LOGO_PDF ?? path.resolve(here, '../../../web/public/brand/logo-horizontal-fundo-claro.png');

// Cores da identidade visual SSMA (manual "Identidade SSMA")
const VERDE = '#63E168';
const GRAFITE = '#2C302E';
const CINZA = '#BCBFBC';

export interface PdfColumn {
  key: string;
  label: string;
  width?: number;
}

function header(doc: PDFKit.PDFDocument, title: string, subtitle?: string, warning?: string) {
  doc.rect(0, 0, doc.page.width, 6).fill(VERDE);
  if (existsSync(LOGO)) doc.image(LOGO, 40, 20, { height: 26 });
  doc.fillColor(GRAFITE).fontSize(15).font('Helvetica-Bold').text(title, 40, 58);
  if (subtitle) doc.fontSize(9).font('Helvetica').fillColor('#555').text(subtitle);
  if (warning) {
    doc.moveDown(0.4);
    const y = doc.y;
    doc.rect(40, y, doc.page.width - 80, 22).fill('#FFF4D6');
    doc.fillColor('#6B4E00').fontSize(8.5).font('Helvetica-Bold').text(warning, 46, y + 7, { width: doc.page.width - 92 });
    doc.y = y + 28;
  }
  doc.moveDown(0.5);
}

function footer(doc: PDFKit.PDFDocument) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.fontSize(7.5).fillColor('#777').font('Helvetica')
      .text(`SSMA Gestão — gerado em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Fortaleza' })} — página ${i + 1} de ${range.count}`, 40, doc.page.height - 30, {
        width: doc.page.width - 80,
        align: 'center',
        lineBreak: false,
      });
  }
}

function finish(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    footer(doc);
    doc.end();
  });
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const fmt = (v: unknown) => {
  if (v === null || v === undefined) return '';
  const s = v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
  return s.replace(ISO, '$3/$2/$1');
};

export function tablePdf(opts: { title: string; subtitle?: string; warning?: string; columns: PdfColumn[]; rows: Record<string, unknown>[]; notes?: string[] }) {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 40, bufferPages: true });
  header(doc, opts.title, opts.subtitle, opts.warning);
  const usable = doc.page.width - 80;
  const totalW = opts.columns.reduce((a, c) => a + (c.width ?? 1), 0);
  const widths = opts.columns.map((c) => ((c.width ?? 1) / totalW) * usable);
  const drawHead = () => {
    const y = doc.y;
    doc.rect(40, y, usable, 16).fill(GRAFITE);
    let x = 40;
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#fff');
    opts.columns.forEach((c, i) => {
      doc.text(c.label, x + 3, y + 4, { width: widths[i] - 6, lineBreak: false, ellipsis: true });
      x += widths[i];
    });
    doc.y = y + 18;
  };
  drawHead();
  doc.font('Helvetica').fontSize(8);
  opts.rows.forEach((row, idx) => {
    const cells = opts.columns.map((c) => fmt(row[c.key]));
    const h = Math.max(14, ...cells.map((t, i) => doc.heightOfString(t, { width: widths[i] - 6 }) + 5));
    if (doc.y + h > doc.page.height - 50) {
      doc.addPage();
      drawHead();
      doc.font('Helvetica').fontSize(8);
    }
    const y = doc.y;
    if (idx % 2) doc.rect(40, y, usable, h).fill('#F3F4F3');
    let x = 40;
    doc.fillColor(GRAFITE);
    cells.forEach((t, i) => {
      doc.text(t, x + 3, y + 3, { width: widths[i] - 6 });
      x += widths[i];
    });
    doc.y = y + h;
  });
  if (!opts.rows.length) doc.fillColor('#555').text('Nenhum registro para os filtros selecionados.', 40, doc.y + 6);
  if (opts.notes?.length) {
    doc.moveDown(1).fillColor('#555').fontSize(7.5).font('Helvetica');
    for (const n of opts.notes) doc.text(n, 40, doc.y, { width: usable });
  }
  doc.moveTo(40, doc.y + 4).lineTo(40 + usable, doc.y + 4).strokeColor(CINZA).stroke();
  return finish(doc);
}

/** Documento com seções de pares chave/valor (ex.: conferência de evento eSocial). */
export function sectionsPdf(opts: { title: string; subtitle?: string; warning?: string; sections: { title: string; rows: [string, string][] }[] }) {
  const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
  header(doc, opts.title, opts.subtitle, opts.warning);
  const usable = doc.page.width - 80;
  for (const s of opts.sections) {
    if (doc.y > doc.page.height - 100) doc.addPage();
    doc.moveDown(0.4).font('Helvetica-Bold').fontSize(10).fillColor(GRAFITE).text(s.title, 40);
    doc.moveTo(40, doc.y + 1).lineTo(40 + usable, doc.y + 1).strokeColor(VERDE).lineWidth(1.5).stroke();
    doc.moveDown(0.3);
    for (const [k, v] of s.rows) {
      if (doc.y > doc.page.height - 60) doc.addPage();
      const y = doc.y;
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#444').text(k, 40, y, { width: 170 });
      const hk = doc.y - y;
      doc.font('Helvetica').fillColor(GRAFITE).text(v || '—', 215, y, { width: usable - 175 });
      doc.y = Math.max(doc.y, y + hk) + 2;
    }
  }
  return finish(doc);
}
