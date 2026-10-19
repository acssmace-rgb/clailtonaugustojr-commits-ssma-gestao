/**
 * Cria (ou redefine a senha de) um superadministrador.
 * Uso: pnpm --filter api exec tsx --env-file=../../.env src/scripts/create-admin.ts email@empresa.com.br "Nome Completo"
 * A senha é lida da variável ADMIN_PASSWORD (nunca passe senhas como argumento de linha de comando).
 */
import { prisma } from '../lib/prisma.js';
import { hashPassword, passwordSchema } from '../lib/password.js';

const [email, name] = process.argv.slice(2);
const password = process.env.ADMIN_PASSWORD;
if (!email || !name || !password) {
  console.error('Uso: ADMIN_PASSWORD=... tsx src/scripts/create-admin.ts <email> "<nome>"');
  process.exit(1);
}
const ok = passwordSchema.safeParse(password);
if (!ok.success) {
  console.error(ok.error.issues.map((i) => i.message).join('; '));
  process.exit(1);
}
const passwordHash = await hashPassword(password);
const user = await prisma.user.upsert({
  where: { email: email.toLowerCase() },
  update: { passwordHash, isSuperAdmin: true, active: true, failedLogins: 0, lockedUntil: null },
  create: { email: email.toLowerCase(), name, passwordHash, isSuperAdmin: true },
});
console.log(`Superadministrador pronto: ${user.email}`);
await prisma.$disconnect();
