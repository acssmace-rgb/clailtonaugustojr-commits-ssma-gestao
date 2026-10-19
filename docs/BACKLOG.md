# Backlog

Prioridade sugerida: **P1** (próximo ciclo), **P2** e **P3**.

## eSocial e integrações oficiais
- **P1** Ler a documentação técnica vigente (S-1.3 + NT em vigor) e implementar `LeiauteAdapter` para S-2210, S-2220 e S-2240, com testes contra os XSD oficiais.
- **P1** Importar e versionar as tabelas oficiais (com data/NT de origem) e conferir os números das tabelas.
- **P1** Cadastrar no sistema os prazos de envio conforme o Manual de Orientação vigente, com alertas.
- **P2** Transmissor: assinatura XMLDSig, envio em lote, TLS mútuo, consulta de protocolo e tratamento de ocorrências/retornos. Homologação em produção restrita.
- **P2** Eventos de exclusão (S-3000) e retificação completos.
- **P3** Importação de vínculos (S-2200/S-2300) a partir da folha.

## Meio ambiente (módulo completo)
- **P1** Aspectos e impactos ambientais (matriz de significância configurável) por unidade/atividade.
- **P1** Licenças e **condicionantes** com prazos próprios, responsáveis, evidências e alertas.
- **P2** Resíduos: inventário, classificação, destinadores, MTR/CDF e controle de quantidades.
- **P2** Inspeções ambientais e planos de ação vinculados.
- **P2** Indicadores ambientais configuráveis (fórmula, unidade, meta, frequência e origem documentadas).

## SST
- **P1** Inspeções e checklists configuráveis (modelos, respostas, não conformidades → planos de ação), com uso em celular.
- **P1** Permissões de trabalho (altura, espaço confinado, a quente, elétrica) com etapas de liberação e encerramento.
- **P2** PPP: montagem a partir do histórico de exposições, exames e cargos, para revisão do responsável.
- **P2** Horas-homem trabalhadas por período, para as taxas de frequência e gravidade.
- **P2** Rotina de exames por PCMSO (periodicidade por risco/cargo) gerando a programação.
- **P3** Ficha de EPI com assinatura do trabalhador (assinatura eletrônica ou biometria).

## Plataforma, segurança e automação
- **P1** MFA obrigatório configurável por papel (ex.: saúde e administração).
- **P1** Row-Level Security no PostgreSQL como segunda camada de isolamento.
- **P2** Rotação de `ENCRYPTION_KEY` com recriptografia em segundo plano.
- **P2** Varredura antivírus de uploads; pré-visualização de PDF no navegador.
- **P2** SSO (Google/Microsoft) e convites com expiração configurável.
- **P2** Fluxos de aprovação em várias etapas e delegação.
- **P3** Construtor de relatórios e painéis personalizados; exportação programada para BI.
- **P3** Notificações por WhatsApp/SMS; resumo semanal por e-mail.
- **P3** Aplicativo offline (PWA) para inspeções em campo.
