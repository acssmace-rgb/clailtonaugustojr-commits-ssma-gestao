# Módulo eSocial (eventos SST)

## Documentação oficial: situação

- A busca na web (18/10/2026) indica que a versão vigente é a **S-1.3, consolidada até a Nota Técnica 07/2026 (rev. 24/09/2026)**. Os esquemas XSD dessa NT entram em produção de forma escalonada, entre 26/10/2026 e 18/01/2027. Fontes: [Documentação Técnica — gov.br/esocial](https://www.gov.br/esocial/pt-br/documentacao-tecnica) e [Leiautes S-1.3 até NT 07/2026 rev.](https://www.gov.br/esocial/pt-br/documentacao-tecnica/leiautes-esocial-v-s-1-3-nt-07-2026-rev-24-09-2026).
- **O portal gov.br está bloqueado pela política de rede do ambiente onde o sistema foi desenvolvido.** Por isso os leiautes, tabelas e XSD oficiais **não foram lidos**, e o sistema não traz nada que dependa da estrutura oficial: XML, nomes de tags, domínios, prazos ou códigos das tabelas.
- O valor `ESOCIAL_LEIAUTE_REFERENCIA` (padrão `S-1.3 (conferir NT vigente)`) é apenas um rótulo gravado em cada versão preparada.

## O que o sistema faz hoje

1. **Preparação** (`prepare.ts`): monta os dados de cada evento a partir do que já existe no sistema:
   - **S-2210**: a partir de uma ocorrência do tipo acidente típico, de trajeto ou doença. Incidentes e quase acidentes não geram CAT.
   - **S-2220**: a partir de um exame/ASO. Exige permissão de saúde.
   - **S-2240**: a partir do trabalhador, do setor (descrição do ambiente), do cargo (atividades) e dos riscos do setor. A data de início e os responsáveis pelos registros ambientais podem ser informados; se ficarem vazios, o sistema sugere o responsável do LTCAT/PGR aprovado.
2. **Validação interna** (`validate.ts`): verifica completude e coerência — CPF/CNPJ, matrícula ou categoria, datas futuras, profissional com registro e UF, códigos obrigatórios, unidade de medida em avaliação quantitativa, CA quando o EPI é eficaz e outras. Classifica como **erro** (impede "validado") ou **aviso** (conferência humana). **Essas regras são internas e não substituem a validação oficial.**
3. **Conferência de códigos**: quando o superadministrador importa uma tabela oficial (CSV `código;descrição`), os códigos informados passam a ser conferidos contra ela. Sem a tabela, aparece um aviso de que o código não pôde ser conferido.
4. **Versões e status**: cada mudança de dados gera uma nova versão (criptografada, com hash). Nova preparação após recibo cria um **evento de retificação** vinculado ao original.
5. **Exportação para conferência** (PDF/JSON), com o aviso "NÃO TRANSMITIDO AO eSOCIAL".
6. **Recibo informado manualmente**: quando o envio é feito em outro sistema (folha, portal web), o recibo pode ser registrado e fica marcado como "informado manualmente — não verificado".
7. **Fila e logs**: a transmissão passa por fila (pg-boss), e os logs técnicos não contêm dados pessoais.

## O que o sistema NÃO faz (e por quê)

| Item | Motivo | Onde implementar |
|---|---|---|
| Gerar o XML oficial | Leiautes vigentes não puderam ser consultados | `src/modules/esocial/leiaute.ts` — `LeiauteAdapter.toXml` |
| Validar contra os XSD | XSD oficiais não disponíveis no ambiente | `LeiauteAdapter.validateXsd` |
| Assinar e transmitir | Exige certificado ICP-Brasil, procuração e homologação | `src/modules/esocial/transmitter.ts` |
| Calcular prazos legais | O sistema não presume prazos; eles são cadastrados em Configurações com a fonte | `settings.esocialDeadlines` |

O botão "Transmitir" retorna erro 409 com a lista de requisitos, e o teste automatizado garante que o status nunca vira `enviado`/`processado` sem resposta oficial.

## Passos para habilitar a geração do XML e o envio

1. Liberar `www.gov.br` na rede do ambiente de desenvolvimento, ou fornecer o pacote de documentação técnica vigente (leiautes HTML/PDF, tabelas e XSD).
2. Implementar um `LeiauteAdapter` por evento, mapeando os dados de domínio (`domain.ts`) para o leiaute vigente, com testes contra os XSD oficiais e exemplos do Manual de Orientação.
3. Importar as tabelas oficiais (parte atingida, agente causador, situação geradora, natureza da lesão, agentes nocivos, procedimentos diagnósticos e categorias), conferindo o número e a versão de cada uma.
4. Implementar o transmissor: assinatura XMLDSig, lote, TLS mútuo com o certificado, consulta de retorno e gravação em `EsocialSubmission`.
5. Homologar em **produção restrita** antes de habilitar produção.
