# Proposta — SSMA Gestão

## 1. Ponto de partida

- **Ambiente:** pasta de trabalho vazia, sem repositório nem instruções de projeto (`CLAUDE.md`). Disponíveis: Node.js 22, pnpm, PostgreSQL 16 e Docker.
- **Identidade visual:** encontrada no Google Drive, na pasta *00 - SSMA ASSESSORIA E CONSULTORIA® › 09 - MARKETING E IDENTIDADE VISUAL › LOGO › IDENTIDADE VISUAL SSMA*. Foram usados o manual "Identidade SSMA" (faive design), os logotipos oficiais, a paleta e as tipografias. Os arquivos foram apenas lidos; nada no Drive foi alterado ou movido. Detalhes em [IDENTIDADE_VISUAL.md](IDENTIDADE_VISUAL.md).
- **eSocial:** pela busca, a versão vigente é a **S-1.3, consolidada até a NT 07/2026**. Porém o portal oficial (gov.br) está bloqueado pela política de rede deste ambiente, então os leiautes não puderam ser lidos. Por isso a geração do XML oficial **não foi implementada**; ver [ESOCIAL.md](ESOCIAL.md).

## 2. Arquitetura e tecnologias

Uma arquitetura **monolítica e modular**: um único serviço de API, dividido em módulos independentes, com um processo de segundo plano (worker) para filas e agendamentos. Ela é simples de operar e permite separar módulos depois, se houver necessidade.

```
Navegador (React, pt-BR, responsivo)
        │  HTTPS · cookie de sessão httpOnly · cabeçalho do cliente ativo
        ▼
API Fastify (TypeScript) ── OpenAPI em /api/docs
  ├─ auth / admin (usuários, papéis, auditoria)
  ├─ cadastros · SST · atividades · documentos · alertas · relatórios · LGPD
  └─ eSocial (módulo isolado: preparação → validação → versões → [adaptador de leiaute] → [transmissor])
        │                                   │
        ▼                                   ▼
PostgreSQL (dados + fila pg-boss)    Armazenamento de arquivos (disco local ou S3)
        ▲
Worker (mesmo código): alertas diários, relatórios agendados, fila de transmissão do eSocial
```

| Camada | Escolha | Por quê |
|---|---|---|
| Interface | React 19 + Vite + TanStack Query | Padrão de mercado, rápido, fácil de manter; CSS próprio com os tokens da marca |
| API | Node.js + Fastify + TypeScript | Leve e com bom desempenho; validação com Zod, que também gera a documentação OpenAPI |
| Banco | PostgreSQL + Prisma | Relacional, robusto, migrações versionadas, disponível gerenciado em qualquer nuvem |
| Filas | pg-boss (sobre o próprio PostgreSQL) | Dispensa Redis e outro serviço para operar |
| Arquivos | Disco local (dev) ou S3/compatível (produção) | Versões guardadas com hash SHA-256, acesso apenas pela API |
| Implantação | Uma imagem Docker (API + interface) e o mesmo código como worker | Roda em qualquer nuvem com contêineres |

## 3. Módulos

| Módulo | No MVP | Backlog |
|---|---|---|
| Acesso e administração | Login, recuperação de senha, MFA (TOTP), papéis e permissões por módulo, escopo por empresa/unidade, multi-cliente, auditoria | SSO (Google/Microsoft), política de senha configurável |
| Cadastros | Empresas, unidades, setores/locais, cargos (CBO), trabalhadores | Importação em massa (planilha / eventos S-2200) |
| SST | Inventário de perigos e riscos (P×S), exames/ASO (restritos e criptografados), acidentes/incidentes/quase acidentes com investigação, EPIs (CA, entregas, trocas e comprovantes), treinamentos (registros, certificados e validade) | Inspeções/checklists configuráveis, permissões de trabalho, PPP |
| Documentos | Cadastro, versões com hash, revisão, aprovação com registro profissional declarado, validade e histórico | Assinatura digital ICP-Brasil, modelos para revisão |
| Atividades | Tarefas (responsável, prioridade, prazo, recorrência, evidências), aprovação, comentários, histórico, planos de ação | Fluxos de aprovação em várias etapas |
| Alertas | Vencimentos de documentos, tarefas, exames, treinamentos, EPI/CA e pendências do eSocial; notificações no sistema e por e-mail (se houver SMTP) | WhatsApp/SMS, resumo semanal |
| Relatórios | Painel filtrável, 9 relatórios com fórmulas e origem documentadas, exportação CSV/XLSX/PDF, agendamento com controle de destinatários | Construtor de relatórios, indicadores com horas-homem trabalhadas |
| eSocial | Preparação e validação interna de S-2210/2220/2240, versões, status, recibo manual, exportação para conferência, fila e logs sem dados pessoais | Adaptador de leiaute S-1.3 + XSD, assinatura e transmissão, consulta de retorno |
| Meio ambiente | Licenças como documentos com validade/alertas; tarefas de origem "ambiental" | Aspectos e impactos, resíduos/MTR, condicionantes, indicadores |
| LGPD | Exportação de dados do titular, anonimização com confirmação, revisão de retenção | Registro de consentimentos/bases legais |

## 4. Modelo de dados (resumo)

- **Acesso:** `Tenant` (cliente) · `User` · `Session` · `PasswordResetToken` · `Role` (permissões) · `Membership` (usuário × cliente × papel × escopo) · `AuditLog`
- **Organização:** `Company` → `Unit` (estabelecimento: CNPJ/CAEPF/CNO) → `Sector`; `JobRole` (cargo/CBO); `Worker`
- **SST:** `Risk` (por setor) · `Exam` (ASO; campos clínicos criptografados) · `Accident` (atestado criptografado) · `Ppe` / `PpeDelivery` · `Training` / `TrainingRecord`
- **Gestão:** `ActionPlan` · `Task` · `TaskComment` · `Attachment` (evidências) · `Document` / `DocumentVersion`
- **Notificações e relatórios:** `Notification` · `ReportSchedule`
- **eSocial:** `EsocialEvent` · `EsocialEventVersion` (dados criptografados + pendências) · `EsocialSubmission` · `EsocialLog` · `EsocialTableEntry` (tabelas oficiais importadas)

Toda tabela de dados de cliente tem `tenantId`. O esquema completo está em `apps/api/prisma/schema.prisma`.

## 5. Integrações externas

| Integração | Situação |
|---|---|
| E-mail (SMTP) | Pronta; basta configurar as credenciais |
| Armazenamento S3 | Pronta; basta configurar bucket e credenciais |
| eSocial (webservice oficial) | Interfaces prontas e transmissão desabilitada; exige certificado, procuração, adaptador de leiaute e homologação |
| Tabelas oficiais do eSocial | Importação via CSV pelo superadministrador |

Lista completa e o que cada uma exige: [INTEGRACOES.md](INTEGRACOES.md).

## 6. Etapas

1. ✅ Login, MFA, papéis, permissões e separação por cliente
2. ✅ Cadastro de empresas, unidades e trabalhadores
3. ✅ Atividades, prazos, aprovação e planos de ação
4. ✅ Cadastro e controle de documentos
5. ✅ Alertas e relatórios básicos
6. ✅ Preparação e validação dos dados dos eventos SST do eSocial
7. ⏭ Backlog: geração do XML oficial após a leitura dos leiautes vigentes, transmissão, módulo ambiental completo e automações ([BACKLOG.md](BACKLOG.md))
