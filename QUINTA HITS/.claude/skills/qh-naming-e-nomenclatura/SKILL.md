---
name: qh-naming-e-nomenclatura
description: Padrões de nomenclatura da QUINTA HITS — nome da empresa, nome de campanhas, conjuntos, anúncios, públicos, arquivos de arte e IDs do banco. Use antes de nomear qualquer coisa que vá para a conta de anúncios, para o banco de dados ou para a pasta de assets.
---

# Nomenclatura — QUINTA HITS

## Regra número um

A empresa é **GIBSON PROMOÇÕES**. Nunca "Gibson Produções", "GIBSON PRODUÇÕES" ou
qualquer variação. Hashtag institucional: **#GibsonPromoções**.
Vale para legendas, campanhas, prompts, materiais, metadados, documentação e código.

A label é **QUINTA HITS** (duas palavras, caixa alta em peças). Em texto corrido,
"Quinta Hits" é aceitável.

## Conta de anúncios

```
Campanha:  QH | DD-MM | ARTISTA | OBJETIVO
Conjunto:  QH | DD-MM | PUBLICO | RECORTE
Anúncio:   QH | DD-MM | FORMATO | VARIANTE
```

Exemplos:

```
QH | 10-09 | NETO FOG | VISITAS SITE
QH | 10-09 | Uberlandia 23-45 | Rock Nightlife
QH | 10-09 | 9x16 VIDEO | Gancho selo
```

Sem acento e sem caractere especial nos nomes da conta (evita quebra em exportação).
Data sempre `DD-MM` da **data do evento**, não da data de subida da campanha.

## Públicos

```
QH | <CIDADE/RAIO> <IDADE> | <RECORTE>
QH | Retargeting <JANELA>
QH | Lookalike <ORIGEM> <%>
```

## Arquivos de arte

```
<NN>_QUINTA_HITS_<PECA>_<VARIANTE>.<ext>
```

Caixa alta, sem acento, separado por underscore, numerado quando faz parte de sequência:

```
01_QUINTA_HITS_GRID_ESQUERDA.png
02_QUINTA_HITS_GRID_CENTRO.png
02_QUINTA_HITS_GRID_CENTRO.svg
03_QUINTA_HITS_GRID_DIREITA.png
QUINTA_HITS_2026-09-17_ARTISTA_9x16.png
```

## IDs do banco

| Prefixo | Tabela | Exemplo |
|---|---|---|
| `LOC` | locais | `LOC-001` |
| `ART` | artistas | `ART-002` |
| `PRC` | parceiros | `PRC-001` |
| `EVT` | eventos (data no sufixo) | `EVT-2026-09-17` |
| `EVA` | eventos_artistas | `EVA-003` |
| `PUB` | públicos | `PUB-002` |
| `CRI` | criativos | `CRI-004` |
| `CMP` | campanhas | `CMP-002` |
| `CJA` | conjuntos de anúncios | `CJA-001` |
| `ANU` | anúncios | `ANU-001` |
| `MTC` `MTD` `MTO` | métricas (campanha, diária, orgânica) | `MTC-001` |
| `DEM` | demografia de entrega | `DEM-004` |
| `RES` | reservas | `RES-001` |
| `FIN` | financeiro | `FIN-001` |
| `KPI` | metas | `KPI-003` |
| `CNT` | calendário de conteúdo | `CNT-002` |
| `COP` | copys | `COP-001` |
| `ASV` | assinaturas verbais | `ASV-002` |
| `COR` | paleta | `COR-001` |
| `AST` | assets | `AST-003` |
| `APR` | aprendizados | `APR-007` |
| `TST` | testes | `TST-002` |
| `DEC` | decisões | `DEC-004` |

## Pastas

```
ASSETS/identidade/   logo, selo, prancha de identidade
ASSETS/criativos/    peças por edição
ASSETS/referencias/  referências que não são ativos finais
HISTORICO/           um .md por edição realizada: AAAA-MM-DD_EVT_<ARTISTA>.md
DOCS/                documentação da operação
```
