import nodemailer from 'nodemailer';
import { config } from './config.js';

const transport = config.SMTP_HOST
  ? nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_PORT === 465,
      requireTLS: config.SMTP_PORT !== 465,
      auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASS } : undefined,
    })
  : null;

export const emailEnabled = () => transport !== null;

export async function sendEmail(opts: {
  to: string;
  subject: string;
  text: string;
  attachments?: { filename: string; content: Buffer }[];
}) {
  if (!transport) return false;
  await transport.sendMail({ from: config.SMTP_FROM, ...opts });
  return true;
}
