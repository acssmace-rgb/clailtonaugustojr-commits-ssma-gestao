# Indicadores e relatórios — fórmulas e origem dos dados

Todos os relatórios respeitam o cliente ativo, o escopo de empresa/unidade do usuário e as permissões do módulo. Filtros disponíveis: empresa, unidade e período (de/até). As mesmas fórmulas aparecem na tela (Relatórios → "Origem dos dados e fórmulas"), no rodapé dos PDFs e na aba "Metodologia" das planilhas. A fonte da verdade é `apps/api/src/modules/reports/definitions.ts`.

## Painel

| Indicador | Fórmula | Origem | Permissão |
|---|---|---|---|
| Trabalhadores ativos | contagem com status ≠ desligado | Worker | workers.read |
| Tarefas em aberto | status ∈ {aberta, em andamento, aguardando aprovação} | Task | tasks.read |
| Tarefas atrasadas | status ∈ {aberta, em andamento} e prazo < hoje | Task | tasks.read |
| Conclusão no prazo | concluídas no período até o fim do dia do prazo ÷ concluídas no período com prazo × 100 | Task | tasks.read |
| Documentos vencidos | não obsoletos com validade < hoje | Document | documents.read |
| Documentos a vencer | hoje ≤ validade ≤ hoje + antecedência configurada | Document | documents.read |
| Exames vencidos | trabalhadores ativos cujo exame mais recente tem próximo vencimento < hoje | Exam | health.read |
| Sem exame registrado | trabalhadores ativos sem nenhum exame | Worker/Exam | health.read |
| Treinamentos vencidos | registros com validade < hoje (inclui os já renovados) | TrainingRecord | trainings.read |
| Ocorrências no período | acidentes, incidentes e quase acidentes no período | Accident | accidents.read |
| Eventos eSocial com pendência | status ∈ {com pendências, rejeitado, erro de transmissão} | EsocialEvent | esocial.read |

Gráficos: tarefas por status, ocorrências por tipo, riscos por classe e eventos eSocial por status.

**Ainda não calculado:** taxas de frequência e gravidade de acidentes. Elas dependem das horas-homem trabalhadas, que o sistema ainda não registra (backlog).

## Relatórios

| Relatório | Regras principais |
|---|---|
| Tarefas e planos de ação | "Atrasada" = prazo < hoje e status aberta/em andamento; período pela data de criação |
| Documentos e validade | Vencido / a vencer / vigente pela antecedência de documentos; mostra a versão aprovada vigente |
| Trabalhadores | CPF sempre mascarado (minimização — LGPD) |
| Exames (ASO) | Último exame de cada trabalhador não desligado; sem procedimentos nem observações clínicas |
| Acidentes e ocorrências | Período pela data da ocorrência |
| Inventário de riscos | Nível = P × S; classe pela matriz configurada (padrão: Moderado ≥ 5, Alto ≥ 10, Crítico ≥ 17 — **ajuste com o responsável técnico**) |
| Treinamentos | Situação pela antecedência de treinamentos; período pela conclusão |
| Entregas de EPI | Situação da troca pela antecedência de EPI; período pela entrega |
| Eventos eSocial | Erros = pendências do tipo erro na versão atual; recibos manuais identificados |

## Exportação e agendamento

- Formatos: **PDF** (com a identidade SSMA), **XLSX** (cabeçalho congelado, filtros e aba de metodologia) e **CSV** (separador `;`, UTF-8 com BOM).
- Agendamento diário, semanal ou mensal. Os destinatários precisam ser usuários do cliente. **A cada envio, a permissão do destinatário é reconferida**: quem perdeu acesso não recebe. O conteúdo respeita o escopo de cada destinatário.
- Toda exportação é registrada na auditoria.
