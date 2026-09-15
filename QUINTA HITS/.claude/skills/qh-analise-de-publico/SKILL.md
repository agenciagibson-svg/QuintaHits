---
name: qh-analise-de-publico
description: Como ler o recorte de entrega da QUINTA HITS (idade, gênero, cidade, plataforma), transformar isso em hipótese de segmentação e montar o próximo público. Use ao receber dados demográficos de campanha, ao definir público novo ou ao investigar por que a verba alcançou quem alcançou.
---

# Análise de público — QUINTA HITS

## O que os dados dizem hoje (campanha 27/08 — baseline)

| Dimensão | Entrega |
|---|---|
| Localização | 100% Minas Gerais — **sem recorte por cidade** no relatório do turbinar post |
| Gênero | 55,2% feminino · 44,8% masculino |
| Idade | 25-34 = **45,6%** · 35-44 = 22,2% · 45-54 = 14,7% · 55-64 = 11,2% · 65+ = 6,3% · **18-24 = 0%** |

Três leituras, nessa ordem de importância:

1. **18-24 zerada.** Para um evento de nightlife, a faixa que sai na quinta à noite
   simplesmente não foi alcançada.
2. **17,5% em 55+.** Verba provavelmente gasta com quem não sai numa quinta à noite.
3. **Concentração em Uberlândia não comprovada.** "100% MG" não prova cidade — pode haver
   verba fora da área de influência da casa.

## Como interpretar recorte de entrega

- Entrega **não é preferência do público**: é onde o algoritmo achou mais barato entregar
  com a configuração dada. Idade dominante pode ser consequência de custo, não de afinidade.
- Compare sempre **participação no alcance × taxa de clique do segmento**. Um segmento com
  10% do alcance e o dobro de cliques é mais interessante que o de 45% inerte.
- Com público pequeno e verba baixa, um recorte estreito trava a entrega — foi o que
  aconteceu em 27/08 (34,9% do orçamento gasto).
- Cruze com o público que **realmente apareceu** na casa. Se a mídia alcança 35-54 e a
  casa está cheia de 22-30, o alcance está errado, não a casa.

```bash
python3 DATABASE/query.py queries/03_publico_por_idade_genero.sql
```

## Públicos cadastrados

`DATABASE/csv/publicos.csv` — do histórico (`PUB-001 Uberlândia JHEAN`) às propostas em
rascunho (23-45 com interesses, retargeting 30d, lookalike 1%).

## Recomendação vigente de segmentação

- **Base:** Uberlândia + raio a partir do endereço do Florindos Bar (Av. Francisco Galassi, 990,
  Morada da Colina), 23–45 anos, todos os gêneros, interesses de rock/pop rock/música ao
  vivo/bares/vida noturna. Sem 55+ na primeira rodada.
- **Teste paralelo:** 18–24 em conjunto separado, com criativo próprio — a faixa não
  respondeu porque não foi buscada, e isso precisa ser testado, não presumido.
- **Assim que o pixel existir:** retargeting de visitantes da página de reserva e de
  engajados de 30 dias; lookalike só com volume mínimo de eventos de reserva.

## Ao propor público novo

Registre em `publicos.csv` com hipótese em `observacoes`, vincule ao conjunto em
`conjuntos_anuncios.csv`, e crie o teste correspondente em `testes.csv` com métrica
primária e critério de decisão. Público novo sem hipótese escrita é chute caro.
