# SSMA Gestão

Sistema web de gestão de **SSMA** — Saúde e Segurança do Trabalho (SST), meio ambiente, documentos, atividades, relatórios e preparação dos eventos SST do **eSocial** (S-2210, S-2220, S-2240). Interface em português do Brasil, com a identidade visual da SSMA Assessoria e Consultoria.

> **Situação: MVP funcional.** Transmissão oficial ao eSocial **não** está habilitada (depende de certificado, procuração e homologação). O sistema prepara, valida e exporta os dados para conferência — e nunca marca um evento como transmitido sem retorno do serviço oficial.

## Início rápido (desenvolvimento)

Requisitos: Node.js 20+ (testado no 22), pnpm 10, PostgreSQL 14+ (testado no 16).

```bash
cp .env.example .env
# gere a chave de criptografia e cole em ENCRYPTION_KEY:
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
ln -s ../../.env apps/api/.env          # o Prisma lê o .env da pasta da API

pnpm install
pnpm db:migrate                          # cria as tabelas
pnpm db:seed                             # dados de demonstração FICTÍCIOS
pnpm dev                                 # API em :3333 e interface em http://localhost:5173
pnpm worker                              # (outro terminal) alertas, relatórios agendados, fila eSocial
```

Documentação da API (OpenAPI/Swagger): http://localhost:3333/api/docs — também exportada em `docs/openapi.json`.

### Usuários de demonstração (dados fictícios)

Senha de todos: `Demo@2026ssma`

| E-mail | Papel | O que demonstra |
|---|---|---|
| `admin@demo.ssma.example` | Administrador do cliente | Acesso total, inclusive saúde e administração |
| `tecnico@demo.ssma.example` | Técnico/Engenheiro de Segurança | SST, documentos, eSocial — **sem** dados de saúde |
| `medica@demo.ssma.example` | Saúde ocupacional | Exames/ASO, atestados, S-2220 |
| `gestor@demo.ssma.example` | Gestor | Indicadores e aprovação de tarefas |
| `colaborador@demo.ssma.example` | Colaborador | Apenas as próprias tarefas e documentos |
| `super@demo.ssma.example` | Superadministrador | Clientes e importação de tabelas oficiais |

Todo o conteúdo do cliente "Cliente Demonstração (DADOS FICTÍCIOS)" é inventado — inclusive CPFs/CNPJs (gerados só para terem dígitos verificadores válidos) e os PDFs, que trazem a marca "DOCUMENTO FICTÍCIO". O seed se recusa a rodar em produção, a menos que `ALLOW_DEMO_SEED=true`.

## Testes

```bash
createdb ssma_test && DATABASE_URL=postgresql://.../ssma_test pnpm --filter api exec prisma migrate deploy
pnpm test     # 31 testes: isolamento entre clientes, permissões, MFA, CSRF, criptografia, fluxos, eSocial, LGPD
```

## Documentação

| Documento | Conteúdo |
|---|---|
| [docs/PROPOSTA.md](docs/PROPOSTA.md) | Proposta: arquitetura, módulos, modelo de dados, integrações e etapas |
| [docs/ARQUITETURA.md](docs/ARQUITETURA.md) | Arquitetura detalhada, multi-cliente, segurança e decisões |
| [docs/INSTALACAO.md](docs/INSTALACAO.md) | Instalação, configuração e implantação em nuvem |
| [docs/ESOCIAL.md](docs/ESOCIAL.md) | Módulo eSocial: o que faz, o que não faz e como evoluir |
| [docs/RELATORIOS.md](docs/RELATORIOS.md) | Indicadores, relatórios, fórmulas e origem dos dados |
| [docs/SEGURANCA_LGPD.md](docs/SEGURANCA_LGPD.md) | Controles de segurança e recursos LGPD |
| [docs/INTEGRACOES.md](docs/INTEGRACOES.md) | Integrações que dependem de contratação, credenciais, certificados ou homologação |
| [docs/IDENTIDADE_VISUAL.md](docs/IDENTIDADE_VISUAL.md) | Identidade visual encontrada no Google Drive e como foi aplicada |
| [docs/BACKLOG.md](docs/BACKLOG.md) | Próximas etapas: meio ambiente, integrações oficiais, automações |
