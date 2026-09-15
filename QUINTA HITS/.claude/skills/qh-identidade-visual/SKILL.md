---
name: qh-identidade-visual
description: Regras de identidade visual da QUINTA HITS — paleta exata, uso do selo, especificação dos posts do grid, padrão de reconstrução vetorial e checklist de controle de qualidade. Use antes de produzir, alterar ou aprovar qualquer arte, PNG, SVG ou peça gráfica da label.
---

# Identidade visual — QUINTA HITS

## Hierarquia de verdade

1. `CLAUDE.md` / documento consolidado do projeto
2. `ID - VISUAL - V1 - PNG.png` (prancha oficial)
3. Imagem de referência do selo
4. Instrução explícita e posterior do Vitor

**A identidade oficial não se reinterpreta, não se redesenha e não se substitui.**
O selo, o símbolo "Q" proprietário, o lettering e as proporções são ativos de marca.
Melhorias permitidas são apenas de execução técnica: vetorização, precisão geométrica,
curvas limpas, correção de serrilhamento, centralização e exportação em alta.

## Conceito

**BOTECO URBANO + NIGHTLIFE EDITORIAL** — tipografia condensada, composição editorial,
placas e selos, estética urbana, personalidade brasileira, logo tipográfica em linguagem
condensed display baseada em Bebas Neue, símbolo "Q" proprietário.

## Paleta (valores exatos, sem aproximação)

| Cor | HEX | RGB | Uso |
|---|---|---|---|
| Deep Bottle Green | `#17352B` | 23, 53, 43 | fundo institucional principal |
| Cream | `#F1E7D2` | 241, 231, 210 | área clara do selo, fundos secundários |
| Terracotta | `#B84A32` | 184, 74, 50 | apoio |
| Mustard | `#D5A62A` | 213, 166, 42 | apoio |
| Near Black | `#171717` | 23, 23, 23 | tipografia, símbolo e linhas |

## Primeira linha institucional do grid

| Post 01 — Esquerda | Post 02 — Centro | Post 03 — Direita |
|---|---|---|
| fundo verde uniforme | fundo verde + selo central | fundo verde uniforme |
| sem nenhum elemento | `SE É QUINTA / Q / TEM HITS` | sem nenhum elemento |

Leitura no grid: **VERDE — SELO — VERDE**, como um campo verde contínuo.
O vazio dos laterais é intencional e faz parte da direção de arte.

### Especificação técnica

- `1080 × 1350 px`, proporção 4:5, RGB, PNG em qualidade máxima, três arquivos independentes.
- Fundo: `#17352B` em 100% do canvas. Sem gradiente, textura, ruído, vinheta, variação de
  luminosidade ou diferença de compressão entre os arquivos.
- Nomes: `01_QUINTA_HITS_GRID_ESQUERDA.png`, `02_QUINTA_HITS_GRID_CENTRO.png`,
  `03_QUINTA_HITS_GRID_DIREITA.png` (+ `02_..._CENTRO.svg` vetorial quando possível).
- Selo: centro matemático `X = 540`, `Y = 675`, com centralização óptica conferida;
  diâmetro entre **68% e 74%** da largura útil. Não tocar as bordas, não parecer tímido,
  não estourar, não deslocar.
- Cores do post central: fundo `#17352B`, interior do selo `#F1E7D2`, lettering/símbolo/
  linhas `#171717`. Na referência o fundo externo é preto — trocar **somente** o fundo
  externo; o interior permanece Cream.
- Conteúdo do selo: `SE É QUINTA` (arco superior), símbolo "Q" ao centro, `TEM HITS`
  (arco inferior), círculos concêntricos e os pequenos elementos laterais da referência.

### Padrão de reconstrução vetorial

Acabamento equivalente a arquivo feito em Illustrator/Figma/Affinity. Nunca upscale,
interpolação ou esticamento de raster. Curvas Bézier com continuidade suave, tangentes
corretas, sem serrilhamento, espessuras consistentes, nós reduzidos e círculos
matematicamente perfeitos. Lettering em path circular real (lógica **Type on Path**):
não rotacionar letra por letra, não deformar caractere, ajustar baseline circular,
kerning, tracking e distribuição angular; conferir o acento em `É`. O símbolo "Q" não é
substituído por letra de fonte nem reinterpretado.

## Proibições em qualquer arte

Mockup · sombra · glow · 3D · relevo · metal · papel · textura vintage · grain ·
iluminação artificial · reflexo · objeto · foto · elemento de bar · copo · garrafa ·
instrumento · ícone extra · e, na primeira linha do grid: data, endereço, arroba,
hashtag, CTA, nome de artista, nome da casa, Uberlândia, GIBSON PROMOÇÕES, logo de parceiro.

## Peça semanal do artista

Vertical 9:16 (`1080 × 1920`). A partir de agora, **rodapé obrigatório** com dia,
horário de início, "Florindos Bar" e selo QH (aprendizado APR-008 — a arte de 10/09 saiu
sem horário e sem endereço).

## Checklist de QC antes da entrega

- [ ] Dimensões exatas em todos os arquivos
- [ ] Hex conferido por amostragem de pixel (não a olho)
- [ ] Fundos idênticos, sem diferença de tom ou compressão
- [ ] Posts 01 e 03 apenas com o fundo verde
- [ ] Selo somente no post 02, centralizado em X=540 / Y=675
- [ ] Interior do selo `#F1E7D2`; textos e linhas `#171717`
- [ ] "SE É QUINTA" e "TEM HITS" corretos, acento do `É` conferido
- [ ] Símbolo "Q" fiel à referência, não trocado por fonte
- [ ] Círculos regulares; lettering acompanhando os arcos
- [ ] Sem caractere deformado, serrilhamento ou pixelização
- [ ] Selo legível na miniatura do grid e íntegro no preview do Instagram
- [ ] Três peças lado a lado formando verde — selo — verde
- [ ] SVG com vetor real e editável, se gerado
- [ ] Arquivos registrados em `assets.csv` e `criativos.csv`

Ordem de prioridade em caso de conflito: fidelidade à arte original → precisão
geométrica → qualidade das curvas → tipografia circular → fidelidade do "Q" →
centralização → cores exatas → acabamento e exportação.
