# Integrações que dependem de contratação, credenciais, certificados, procurações ou homologação

| # | Integração | Depende de | Situação no sistema |
|---|---|---|---|
| 1 | **Transmissão de eventos ao eSocial** (webservice) | Certificado digital ICP-Brasil (A1 ou A3) do empregador ou do procurador; **procuração eletrônica** no e-CAC quando a SSMA transmitir em nome do cliente; homologação em **produção restrita** | Interface `Transmitter` pronta e **desabilitada** |
| 2 | **Leiautes, XSD e tabelas oficiais do eSocial** (S-1.3 e NT vigentes) | Acesso ao portal gov.br/esocial (bloqueado no ambiente de desenvolvimento) e implementação/teste do adaptador | Adaptador de leiaute **não implementado**; importação de tabelas via CSV pronta |
| 3 | Consulta de retorno e recibos do eSocial | Itens 1 e 2 | Modelo `EsocialSubmission` e fila prontos |
| 4 | Assinatura digital de documentos (PGR, PCMSO, LTCAT, PPP) | Certificado ICP-Brasil dos profissionais ou contratação de plataforma de assinatura | Hoje a aprovação registra usuário, data, registro profissional declarado e hash do arquivo |
| 5 | **E-mail transacional** (SMTP ou provedor) | Conta e credenciais de envio; domínio com SPF/DKIM | Pronto; configurar `SMTP_*` |
| 6 | **Armazenamento de arquivos** (S3 ou compatível) | Conta no provedor, bucket e credenciais | Pronto; configurar `S3_*` |
| 7 | Banco PostgreSQL gerenciado e hospedagem em nuvem | Contratação do provedor | Imagem Docker e compose prontos |
| 8 | Validação de CA de EPI na base oficial | Acesso à consulta oficial de CA (sem API pública documentada; avaliar) | Hoje o CA e sua validade são digitados |
| 9 | Importação de trabalhadores da folha/eSocial (S-2200/S-2300) | Integração com o sistema de folha do cliente, ou acesso aos eventos | Backlog |
| 10 | Manifesto de Transporte de Resíduos (MTR) | Credenciais nos sistemas estaduais/federais de resíduos | Backlog (módulo ambiental) |
| 11 | SSO corporativo (Google/Microsoft) | Registro de aplicativo no provedor de identidade de cada cliente | Backlog |
| 12 | Notificações por WhatsApp/SMS | Contratação de provedor (ex.: API oficial do WhatsApp Business) | Backlog |
| 13 | Antivírus para uploads | Serviço de varredura (ex.: do provedor de nuvem) | Backlog |

> Atenção: o Google Drive tem um arquivo de certificado digital (`.pfx`) da SSMA. Ele **não** foi acessado nem usado. Certificados devem ser instalados apenas no ambiente de produção, por um serviço de segredos ou HSM, e nunca versionados ou enviados por canais comuns.
