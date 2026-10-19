# Segurança e LGPD

## Controles implementados

| Área | Controle |
|---|---|
| Transporte | HTTPS obrigatório em produção (via proxy/balanceador); HSTS; cookies `Secure` |
| Repouso | Criptografia AES-256-GCM na aplicação para campos clínicos (procedimentos e observações do ASO, dados de atestado), segredos MFA e conteúdo dos eventos eSocial. Para o restante, use banco e bucket com criptografia do provedor (SSE nos uploads S3) |
| Segredos | Somente em variáveis de ambiente ou serviço de segredos; `.env` fora do Git; mensagens de erro de configuração não exibem valores |
| Autenticação | Argon2id, bloqueio após 5 falhas, limite por IP, MFA TOTP, sessões revogáveis (token guardado apenas como hash), redefinição com token de uso único |
| Autorização | Permissões por módulo, papéis por cliente, escopo por empresa/unidade, dados de saúde em permissão separada |
| Isolamento | `tenantId` obrigatório em todas as consultas; FKs conferidas contra o cliente; testes de acesso cruzado |
| Entradas | Validação Zod em todas as rotas; CPF/CNPJ; uploads com conferência de conteúdo real; neutralização de fórmulas em CSV/XLSX |
| Navegador | CSP restritiva, anti-clickjacking, `nosniff`, proteção CSRF (cabeçalho customizado + checagem de origem) |
| Auditoria | `AuditLog` com usuário, ação, entidade, IP e resumo das alterações; campos sensíveis mascarados; inclui logins, downloads, exportações e aprovações |
| Logs técnicos | Sem cookies, cabeçalhos de autenticação, corpo de requisição ou dados pessoais nos logs do eSocial |
| Minimização | CPF mascarado para quem não edita trabalhadores e em todos os relatórios; relatório de exames sem dados clínicos |

## Recursos LGPD

- **Acesso/portabilidade:** Privacidade (LGPD) → exportar dados do titular (JSON). Os dados de saúde só entram se o operador tiver `health.read`.
- **Anonimização:** exige digitar o nome do titular, informar o motivo e confirmar que as obrigações legais de guarda foram verificadas. Substitui os identificadores e remove dados clínicos e o conteúdo dos eventos eSocial. É irreversível e fica auditada.
- **Retenção:** o cliente define um período após o desligamento para **sinalizar** titulares para revisão. O sistema não apaga nada automaticamente, porque registros de SST podem ter prazos legais de guarda que o responsável precisa verificar.

## Pontos para o responsável (fora do código)

- Definir as bases legais e o registro das operações de tratamento, e atualizar o aviso de privacidade.
- Estabelecer contratos de operador com os provedores de nuvem, e-mail e armazenamento.
- Definir uma política de backup e retenção alinhada às obrigações de guarda de documentos de SST.
- Fazer um teste de intrusão antes de colocar o sistema em produção.

## Limitações conhecidas (backlog)

- Sem Row-Level Security no PostgreSQL (o isolamento é feito na aplicação e coberto por testes).
- Sem rotação automática de `ENCRYPTION_KEY`.
- Sem antivírus nos uploads (recomenda-se varredura no bucket).
- MFA opcional; recomenda-se torná-lo obrigatório para papéis com acesso a dados de saúde.
