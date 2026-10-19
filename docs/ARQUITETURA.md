# Arquitetura

## Estrutura do repositório

```
apps/
  api/                    Fastify + Prisma (TypeScript)
    prisma/schema.prisma  Modelo de dados e migrações
    prisma/seed.ts        Dados de demonstração (fictícios)
    src/app.ts            Montagem da API (segurança, OpenAPI, módulos)
    src/server.ts         Processo HTTP (também serve apps/web/dist em produção)
    src/worker.ts         Processo de segundo plano (pg-boss)
    src/auth/             Sessão, contexto do cliente, rotas de autenticação/MFA
    src/lib/              Infra comum: config, criptografia, auditoria, CRUD, escopo, arquivos, PDF/planilhas
    src/modules/<módulo>/ admin, org, sst, tasks, documents, alerts, reports, esocial, lgpd
    test/                 Testes unitários e de integração (Vitest)
  web/                    React + Vite
    public/brand/         Logotipos (cópias do Drive) e brand.json (identidade configurável)
    src/components/       Layout, componentes, ResourcePage (cadastro genérico)
    src/pages/            Telas por módulo
docs/                     Documentação
```

## Multi-cliente (separação dos dados)

- **Cliente (`Tenant`)** é a unidade de isolamento: cada organização atendida pela SSMA. Dentro dele ficam empresas (CNPJ) e unidades.
- O usuário pode ter acesso a vários clientes (`Membership`), com **um papel por cliente** e, opcionalmente, restrito a algumas **empresas/unidades**.
- A cada requisição, o cliente ativo vem do cabeçalho `x-tenant-id` e é **validado contra o vínculo do usuário** (`src/auth/context.ts`). Sem vínculo, a requisição não recebe contexto e as rotas protegidas recusam.
- Toda consulta usa `tenantWhere`/`scopedWhere` (`src/lib/tenant.ts`), que acrescentam `tenantId` e o escopo de empresa/unidade. O CRUD genérico (`src/lib/crud.ts`) aplica isso automaticamente.
- Toda chave estrangeira recebida (empresa, unidade, setor, trabalhador, usuário…) é conferida como pertencente ao mesmo cliente (`src/lib/refs.ts`). Isso impede referenciar dados de outro cliente.
- Arquivos são gravados com chave `tenantId/área/aaaa-mm/aleatório` e só são servidos pela API, após checar permissão.
- Testes automatizados cobrem leitura, alteração e referência cruzada entre clientes (`test/api.test.ts`).
- **Reforço recomendado (backlog):** Row-Level Security do PostgreSQL como segunda barreira.

## Autenticação e autorização

- Senhas com **Argon2id**; bloqueio temporário após 5 tentativas; limite de tentativas por IP.
- **Sessão em cookie httpOnly + SameSite=Strict + Secure** (em produção). O banco guarda apenas o SHA-256 do token, e as sessões podem ser revogadas.
- **MFA TOTP** opcional por usuário (segredo criptografado). Sessão com MFA pendente só acessa a verificação.
- Recuperação de senha com token de uso único (1 h), resposta idêntica exista ou não o e-mail, e todas as sessões encerradas após a troca.
- **Permissões por módulo** (`src/lib/permissions.ts`), agrupadas em papéis. Há papéis padrão e personalizados por cliente. Dados de saúde exigem `health.read`/`health.write`.
- A checagem de permissão roda **antes** da validação do corpo (`preValidation`), para não expor detalhes a quem não tem acesso.

## Proteções da API

- Cabeçalhos de segurança (Helmet): CSP restritiva, `frame-ancestors 'none'`, `nosniff` e HSTS em produção.
- **CSRF:** toda escrita exige o cabeçalho `x-requested-with: ssma` (bloqueado entre origens pelo CORS) e, quando há `Origin`, ela precisa ser a da aplicação.
- Validação de todas as entradas com Zod; CPF/CNPJ com dígitos verificadores.
- Upload: lista de tipos permitidos, conferência do conteúdo real (bytes iniciais), limite de tamanho e nome sanitizado; download como anexo.
- Exportação CSV/XLSX neutraliza fórmulas (injeção em planilha).
- Erros internos retornam mensagem genérica; os logs não registram cookies, corpo das requisições nem dados de saúde.

## Módulo eSocial (isolado)

```
registro de origem ──► prepare.ts ──► validate.ts ──► service.ts (versão + status + log)
(acidente/exame/          (dados de        (regras internas   │
 trabalhador+riscos)      domínio)         de consistência)   ├─► exportação p/ conferência (JSON/PDF)
                                                              ├─► leiaute.ts  (adaptador XML — vazio)
                                                              └─► fila pg-boss ─► transmitter.ts (desabilitado)
```

- Comunica-se com o restante apenas lendo os registros de origem. Não altera dados de SST.
- Os dados preparados são guardados **criptografados** e **versionados** (hash SHA-256 por versão).
- `EsocialLog` registra só códigos e contagens, nunca CPF, nome ou dados de saúde (coberto por teste).
- Os estados `enviado`/`processado` só podem vir do transmissor oficial. `recibo_manual` identifica recibos digitados a partir de outro sistema.

## Processo de segundo plano (worker)

| Fila | Agenda | Função |
|---|---|---|
| `alertas-diarios` | 07:00 (Brasília) | Gera notificações de vencimento por usuário (respeitando permissões e escopo) e envia resumo por e-mail, se houver SMTP |
| `relatorios-agendados` | a cada hora | Envia os relatórios devidos, conferindo a permissão de cada destinatário no momento do envio |
| `esocial-transmitir` | sob demanda | Transmissão oficial (só funciona com transmissor habilitado) |

## Identidade visual configurável

`apps/web/public/brand/brand.json` define nome, logotipos, cores e fontes. Esses valores viram variáveis CSS ao carregar a página (`src/brand.ts`). Se o arquivo não carregar, a interface cai num tema neutro. Os PDFs gerados usam o logotipo e as cores da marca.
