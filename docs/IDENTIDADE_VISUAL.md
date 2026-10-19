# Identidade visual

## Origem (Google Drive, somente leitura)

Pasta: **00 - SSMA ASSESSORIA E CONSULTORIA® › 09 - MARKETING E IDENTIDADE VISUAL › LOGO › IDENTIDADE VISUAL SSMA**

| Material | Arquivo no Drive | Uso |
|---|---|---|
| Manual "Identidade SSMA" (faive design) | `APRESENTAÇÃO VISUAL SSMA.pdf` | Atributos, cores e tipografias |
| Logotipos sem fundo | `1 - LOGOTIPO › SEM FUNDO › 1.png, 2.png, 3.png, 5.png, 7.png, 10.png, 12.png` | Cópias em `apps/web/public/brand/originais/` |
| Paleta RGB | `2 - PALETA DE CORES › RGB › 1.jpg` | Confirmação do verde |
| Tipografias | `3 - TIPOGRAFIAS › 1 - PRINCIPAL › Fauna.otf`, `2 - SECUNDÁRIA › Corbel*.ttf` | Referência (não incluídas no repositório) |

Nenhum arquivo do Drive foi alterado, movido ou compartilhado. Os logotipos foram baixados como cópia. As versões em `apps/web/public/brand/*.png` são as mesmas imagens, apenas recortadas (sem a margem transparente) e redimensionadas para a web. As cópias integrais ficam em `originais/`.

## O que o manual define

- **Atributos:** moderna, séria, corporativa, elegante. A marca **não** é simples, infantil nem tradicional.
- **Símbolo:** construído a partir da letra "S"; tipografia geométrica.
- **Cores:** `#63E168` (verde), `#BCBFBC` (natural/cinza), `#2C302E` (grafite) — "tons de preto e verde: seriedade e modernidade". O manual também mostra `#121b47` junto da amostra tipográfica; por não estar na paleta (pasta de cores), essa cor não foi usada.
- **Tipografias:** Fauna (principal; amostra "Fauna Thin") e Corbel (secundária).

## Como foi aplicada

| Elemento | Aplicação |
|---|---|
| Menu lateral e login | Fundo grafite `#2C302E` com o logotipo verde/branco (versão para fundo escuro) |
| Ação principal, destaques e foco | Verde `#63E168` com texto grafite. O verde não é usado como cor de texto sobre branco por falta de contraste (acessibilidade) |
| Bordas e elementos neutros | Derivados de `#BCBFBC` |
| PDFs | Faixa verde, logotipo para fundo claro e cabeçalhos de tabela em grafite |
| Fontes | `Fauna` nos títulos e `Corbel` no texto, quando instaladas no computador do usuário; caso contrário, fontes do sistema semelhantes |

**Cores funcionais (fora da marca):** vermelho, âmbar e verde-escuro para estados (vencido, a vencer, ok). São necessárias para a leitura de alertas e não substituem a paleta.

## Fontes

Os arquivos de fonte do Drive **não foram incluídos**. A Corbel é distribuída pela Microsoft com o Windows/Office, e a licença da Fauna não está documentada na pasta. Antes de publicá-las na web, confirme as licenças de uso web. Com as licenças em mãos, copie os arquivos para `apps/web/public/brand/fonts/` e preencha `fonts.headingFile`/`fonts.bodyFile` em `brand.json`.

## Trocar a marca

Edite `apps/web/public/brand/brand.json`. Se o arquivo for removido ou ficar inacessível, a interface usa um tema neutro.
