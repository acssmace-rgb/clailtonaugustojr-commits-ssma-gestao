# Instalação e configuração

## 1. Desenvolvimento local

Veja o "Início rápido" no [README](../README.md). Resumo:

```bash
cp .env.example .env              # preencha ENCRYPTION_KEY
ln -s ../../.env apps/api/.env
pnpm install && pnpm db:migrate && pnpm db:seed
pnpm dev        # http://localhost:5173 (a API em :3333 recebe /api por proxy)
pnpm worker     # filas e agendamentos
```

## 2. Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|---|---|---|
| `DATABASE_URL` | sim | Conexão PostgreSQL. Em produção, use TLS (`?sslmode=require`) |
| `ENCRYPTION_KEY` | sim | 32 bytes em base64 (AES-256-GCM) para dados de saúde, segredos MFA e eventos eSocial. **Guarde em um serviço de segredos; perdê-la torna esses dados ilegíveis** |
| `APP_ORIGIN` | sim | URL pública da aplicação (CORS, CSRF e links de e-mail) |
| `NODE_ENV` | sim | `production` em produção (ativa cookie `Secure` e HSTS) |
| `SESSION_TTL_HOURS` | não | Duração da sessão (padrão 12) |
| `LOGIN_RATE_LIMIT` | não | Tentativas por IP a cada 15 min (padrão 10) |
| `STORAGE_DRIVER` | não | `local` ou `s3` |
| `STORAGE_DIR` | se local | Pasta dos arquivos (use volume persistente e criptografado) |
| `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | se s3 | Os objetos são gravados com criptografia do lado do servidor (SSE) |
| `MAX_UPLOAD_MB` | não | Tamanho máximo de arquivo (padrão 25) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | não | Sem SMTP, as notificações ficam só no sistema e a recuperação de senha depende do administrador |
| `ESOCIAL_TRANSMITTER` | não | `disabled` (único valor suportado hoje) |
| `ESOCIAL_AMBIENTE` | não | `producao_restrita` ou `producao` |
| `ESOCIAL_LEIAUTE_REFERENCIA` | não | Rótulo da versão de leiaute usada como referência |
| `ALLOW_DEMO_SEED` | não | Mantenha `false` em produção |

## 3. Implantação em nuvem (sugestão)

Qualquer provedor com contêineres e PostgreSQL gerenciado serve (AWS, GCP, Azure, Render, Fly etc.):

1. **Banco:** PostgreSQL gerenciado com criptografia em repouso, backups automáticos e acesso só pela rede privada.
2. **Arquivos:** bucket S3 (ou compatível) privado, com criptografia, versionamento e bloqueio de acesso público.
3. **Segredos:** `ENCRYPTION_KEY`, `DATABASE_URL`, SMTP e S3 no serviço de segredos do provedor, injetados como variáveis de ambiente.
4. **Aplicação:** `docker build -t ssma-gestao .`
   - serviço web: comando padrão da imagem (aplica migrações e sobe a API + interface na porta 3333);
   - worker: mesma imagem com o comando `node dist/worker.js` (uma única instância).
5. **HTTPS:** balanceador/proxy com TLS na frente da porta 3333 (a API confia nos cabeçalhos do proxy).
6. **Primeiro acesso:** crie o superadministrador sem passar a senha na linha de comando:
   ```bash
   ADMIN_PASSWORD='SenhaForte2026' pnpm --filter api exec tsx --env-file=../../.env src/scripts/create-admin.ts voce@empresa.com.br "Seu Nome"
   ```
   Em seguida: Plataforma → criar cliente → Usuários (com o superadministrador, selecione o cliente) → adicionar o administrador do cliente.

Para homologação local com Docker: `docker compose up --build`. O `docker-compose.yml` sobe banco, API e worker. O build da imagem não foi executado no ambiente de desenvolvimento; teste-o antes do primeiro uso.

## 4. Identidade visual

Edite `apps/web/public/brand/brand.json` (nome, logotipos, cores e fontes). Para usar as fontes oficiais (Fauna e Corbel) na interface, coloque os arquivos **licenciados para uso web** em `apps/web/public/brand/fonts/` e preencha `headingFile`/`bodyFile`. Ver [IDENTIDADE_VISUAL.md](IDENTIDADE_VISUAL.md).

## 5. Operação

- **Backups:** banco (diário, com retenção definida) e bucket de arquivos (versionamento).
- **Rotação de chave:** `ENCRYPTION_KEY` não tem rotação automática no MVP (ver backlog). Mantenha cópia segura.
- **Atualizações:** `pnpm db:deploy` (ou o comando padrão da imagem) aplica as migrações pendentes.
- **Documentação da API:** `/api/docs`; `pnpm --filter api openapi` regenera `docs/openapi.json`.
