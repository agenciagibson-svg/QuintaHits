---
name: qh-auditoria-de-campanha
description: Roteiro de auditoria de uma campanha da QUINTA HITS já veiculada — o que checar, em que ordem, como diagnosticar cada sintoma e como transformar o resultado em aprendizado registrado. Use ao receber prints ou relatórios de campanha, ou quando pedirem para analisar o que aconteceu com a verba.
---

# Auditoria de campanha — QUINTA HITS

Auditoria não é resumir números: é **encontrar o elo quebrado do funil** e dizer o que
fazer na próxima quinta.

## Ordem de investigação (não pule etapas)

1. **O dinheiro entregou?** gasto ÷ orçamento previsto. Abaixo de ~95% é o problema
   principal — não analise criativo antes de resolver isso.
2. **Alcançou quem importa?** cidade, idade, gênero. Verba fora de Uberlândia ou em
   faixa que não sai numa quinta à noite é desperdício.
3. **O criativo segurou?** retenção de 3s ÷ reproduções iniciais; CTR sobre impressões.
4. **O clique chegou?** visitas ao site ÷ cliques no link. Perda aqui é página, não mídia.
5. **Virou reserva?** reservas registradas com origem. Sem registro, nada é atribuível.
6. **Virou gente na casa?** público presente ÷ gasto = custo por presente.

## Diagnóstico por sintoma

| Sintoma | Causas prováveis | Ação |
|---|---|---|
| Orçamento não entregue | público estreito, janela curta, leilão sem controle, formato limitado (turbinar post) | ampliar público, abrir janela para 4–5 dias, migrar para o Gerenciador |
| CTR baixo com alcance alto | oferta não aparece, criativo genérico, público frio | reescrever primeiro quadro e CTA; testar público mais qualificado |
| Retenção de 3s abaixo de ~35% | abertura sem gancho, sem marca no primeiro segundo | abrir com selo + artista + "QUINTA" |
| Cliques sem visitas ao site | página lenta, link errado, atrito no mobile | testar o link no celular, medir carregamento |
| Visitas sem reserva | oferta confusa, formulário longo, falta de horário/endereço | simplificar reserva, deixar informação explícita |
| Público presente alto e mídia baixa | o resultado vem do orgânico/artista, não da mídia | não atribuir à campanha; medir incremental |
| Faixa jovem ausente | interesses e criativo falam com público mais velho | conjunto separado para a faixa, criativo próprio |

## Baseline da operação (27/08/2026 — Jhean Marcell)

| Métrica | Valor |
|---|---|
| Orçamento previsto / gasto | R$90,00 / R$31,41 (**34,9% entregue**) |
| Impressões / alcance / frequência | 3.449 / 2.917 / 1,18 |
| Cliques no link / visitas ao site | 48 / 39 (perda de 18,8%) |
| CTR / CPC / CPM | 1,39% / R$0,65 / R$9,11 |
| Custo por visita | R$0,81 |
| Vídeo: inícios / 3s | 3.285 / 777 (**retenção 23,7%**) |
| Entrega | 100% MG · 55,2% fem / 44,8% masc · 25-34 = 45,6% · **18-24 = 0%** · 55+ = 17,5% |
| Campo | 90 pessoas presentes · reservas por canal não registradas |

Use esses números como comparação obrigatória. Uma campanha nova só é "melhor" se bater
% de orçamento entregue, custo por visita e retenção de 3s.

## Entregável

```
1. VEREDITO EM UMA LINHA
2. ELO QUEBRADO (a etapa do funil que travou, com o número)
3. COMPARAÇÃO COM O BASELINE
4. O QUE FUNCIONOU (só o que o dado sustenta)
5. AÇÕES PARA A PRÓXIMA QUINTA (máx. 3, priorizadas)
6. O TESTE DA SEMANA (uma variável só)
7. O QUE NÃO FOI POSSÍVEL SABER (e o que passar a registrar)
```

Feche lançando os números em `metricas_campanha.csv` / `demografia_entrega.csv`,
os aprendizados em `aprendizados.csv` e o teste em `testes.csv`.
