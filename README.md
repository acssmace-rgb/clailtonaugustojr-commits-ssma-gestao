# SSMA Gestão

Sistema web de gestão da **SSMA Assessoria & Consultoria em Segurança do Trabalho** (Fortaleza/CE), com a identidade visual SSMA (grafite `#2C302F`, verde `#64E169`, cinza `#BDBFBC`, fonte Corbel).

Funciona direto no navegador, sem instalação nem servidor: basta abrir o `index.html` ou publicar no GitHub Pages.

## Módulos

| Módulo | O que controla |
|---|---|
| **Painel** | Clientes ativos, itens vencidos/a vencer, pendências, situação por cliente (PGR, PCMSO, psicossocial) |
| **Vencimentos e prazos** | Agenda única de documentos, reciclagens, pendências, eSocial, CIPA e auditorias, com exportação CSV |
| **Clientes** | Razão social, CNPJ (validado), CNAE, grau de risco, nº de empregados, contatos DP/RH, serviços contratados, repositório GitHub |
| **Documentos** | PGR, PCMSO, LTCAT, AEP/AET, laudos NR-15/NR-16, PAE, brigada, PCA, PPR, SPDA, CBMCE… com validade padrão por tipo, renovação e histórico de revisões |
| **Psicossocial NR-01** | Checklist das 9 etapas do gerenciamento de riscos psicossociais no GRO/PGR, com geração de pendências |
| **Treinamentos** | Catálogo NR-05, 06, 10, 11, 12, 17, 18, 20, 23, 33, 35, primeiros socorros…; controle de reciclagem; **lista de presença** e **certificados** (certificado + conteúdo programático) no padrão SSMA |
| **CIPA / Designado** | Mandatos e cronograma eleitoral pelos prazos mínimos da NR-05 (edital, inscrições, eleição, posse) |
| **eSocial SST** | S-2210, S-2220 e S-2240 com cálculo automático de prazo e controle de recibo |
| **Visitas técnicas** | Registro e **relatório de visita** imprimível; recomendações viram pendências |
| **Auditorias** | ABVTEX, ISO 9001/14001/45001, auditoria interna, fiscalização; NCs e prazo de tratamento |
| **Pendências** | Plano de ação com etiquetas `prazo`, `aguardando-cliente`, `eSocial`, `auditoria`, `NR-01` e geração do texto/comando da **issue do GitHub** (`[PGR] Título…`) |
| **Configurações** | Dados da SSMA, instrutor padrão, dias de alerta, validades, logo oficial, assinatura digitalizada, backup/restauração |

Cada cliente também gera um **Relatório de situação de SST** (PDF) e o **README.md** do repositório do cliente no padrão SSMA.

## Como usar

1. Abra `index.html` no Chrome/Edge (ou acesse a página publicada no GitHub Pages).
2. Em **Configurações**, carregue a **logo oficial** e a **assinatura digitalizada** (opcional) e confira os dados da SSMA.
3. Cadastre os clientes e os documentos vigentes. Para conhecer o sistema antes, use **Carregar dados de exemplo** (dados fictícios).
4. Para imprimir certificados/listas/relatórios, permita pop-ups e use **Imprimir / Salvar PDF**.

### Publicar no GitHub Pages
*Settings → Pages → Deploy from a branch → `main` / root*. O endereço fica `https://<usuario>.github.io/<repositorio>/`.

## Privacidade e LGPD — importante

- **Os dados ficam somente no navegador** (armazenamento local). Nada de cliente ou de trabalhador é enviado ao GitHub nem a servidor.
- Este repositório contém **apenas o código** do sistema. Nunca faça commit de backups (`ssma-gestao-backup_*.json`), listas de participantes, ASO ou laudos individuais — o `.gitignore` já bloqueia os backups.
- Faça **backup** regularmente (Configurações → Baixar backup) e guarde no Drive da SSMA. Para usar em outro computador, restaure o backup lá.
- A assinatura digitalizada fica só no navegador onde foi carregada.

## Observações técnicas

- HTML + CSS + JavaScript puro, sem dependências nem etapa de build.
- Validades e prazos são **padrões sugeridos**, editáveis em Configurações. Confira sempre o texto vigente da NR antes de usar em documento oficial. Os prazos do eSocial não consideram feriados.

```
index.html
assets/css/style.css     identidade visual SSMA
assets/img/              logo SSMA (SVG)
assets/js/normas.js      catálogos de SST (documentos, cursos, NR-01, eSocial)
assets/js/core.js        armazenamento local e regras de vencimento
assets/js/modulos.js     cadastros (campos, listas e formulários)
assets/js/impressos.js   certificados, lista de presença, relatórios, README/issue
assets/js/app.js         telas, painel e navegação
assets/js/exemplo.js     dados fictícios de demonstração
```
