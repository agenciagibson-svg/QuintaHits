---
name: qh-relatorio-de-edicao
description: Formato padrão do relatório pós-evento da QUINTA HITS, do funil ao resultado financeiro, com os aprendizados e o próximo teste. Use depois de cada quinta-feira, ou quando pedirem o fechamento, o balanço ou o relatório de uma edição.
---

# Relatório de edição — QUINTA HITS

Uma edição só está encerrada quando existe relatório, dado no banco e aprendizado
registrado. Sem isso, a semana seguinte recomeça do zero.

## Dados a coletar (na sexta seguinte)

| Origem | Dado |
|---|---|
| Gerenciador / print do impulsionamento | gasto, impressões, alcance, cliques, visitas, vídeo |
| Recorte de entrega | idade, gênero, cidade, plataforma |
| Instagram (post orgânico) | alcance, curtidas, comentários, salvamentos, visitas ao perfil |
| Casa / porta | público presente, mesas ocupadas, horário de pico |
| Reservas | quantas, por qual canal, quantas viraram presença |
| Financeiro | cachê, estrutura, bar, couvert, patrocínio |

Dado que não existe fica **vazio** e aparece no relatório como lacuna. Nunca estime.

## Estrutura do relatório

```markdown
# QUINTA HITS — <DD/MM/AAAA> — <ARTISTA>

## 1. Resumo em três linhas
<o que aconteceu, o número que importa, a decisão que sai daqui>

## 2. Funil da edição
alcance pago → cliques → visitas ao site → reservas → público presente
(com custo por etapa e comparação com a edição anterior e com o baseline)

## 3. Mídia
orçamento previsto x gasto (% entregue) · CTR · CPC · CPM · custo por visita ·
retenção de 3s

## 4. Quem foi alcançado
cidade · idade · gênero, e o que isso diz sobre o público real do evento

## 5. Orgânico
desempenho do post da programação e do conteúdo do dia

## 6. Casa
público presente, mesas, leitura de campo (encheu? ficou? consumiu?)

## 7. Financeiro
custos, receitas, resultado, custo de mídia por pessoa presente

## 8. Aprendizados
hipótese → evidência → conclusão → ação (vão para aprendizados.csv)

## 9. Decisões que passam a valer
(vão para decisoes.csv)

## 10. Teste da próxima quinta
uma variável, métrica primária e critério de decisão (vai para testes.csv)

## 11. Lacunas
o que não foi possível medir e o que passar a registrar
```

## Duas saídas, sempre nesta ordem

A estrutura acima é a **versão interna** (`HISTORICO/AAAA-MM-DD_EVT_<ARTISTA>.md`).
Toda edição também gera a **versão sócios** — uma página, derivada da interna,
nunca escrita do zero:

```markdown
# QUINTA HITS — <DD/MM/AAAA> · <ARTISTA> · <CASA>
**Investimento em mídia:** R$ X (de R$ Y previstos) · **Público na casa:** N pessoas

## 1. Resumo            <o que aconteceu + o número que importa + o que ficou na mesa>
## 2. O que o dinheiro comprou   <tabela: alcance → cliques → visitas → presentes → custo por presente>
## 3. Leitura           <máx. 3 bullets "funcionou" + máx. 3 "não funcionou", cada um com número>
## 4. Uma ressalva honesta   <o que o dado ainda não prova>
## 5. Três ações        <tabela: Ação | Por quê (o número) | Quando>
```

Regras da versão sócios:
- Sem jargão de mídia. CTR, CPM, CPC, pixel, retargeting e nomes de CSV **não aparecem**.
- Todo número vem acompanhado do que ele significa em dinheiro ou em gente na porta.
- O custo de mídia por pessoa presente é o número de capa — é o que prova a operação.
- Verba não entregue vira perda declarada em reais, não percentual solto.
- Sempre a seção 4: o que ainda não sabemos. Relatório sem ressalva é propaganda.
- Exatamente 3 ações, executáveis antes da próxima quinta.

## Comandos de apoio

```bash
python3 DATABASE/query.py queries/04_custo_por_resultado.sql
python3 DATABASE/query.py queries/02_evolucao_semanal.sql
python3 DATABASE/query.py queries/05_roi_por_edicao.sql
python3 DATABASE/query.py queries/03_publico_por_idade_genero.sql
```

## Quando os dados ainda não foram lançados

Antes de escrever qualquer coisa, checar no banco se a edição tem gasto e público
lançados (`campanhas.orcamento_gasto` e `eventos.publico_presente`).

Se faltar: **não gerar relatório.** Devolver, em vez dele, a lista de coleta —
o que falta, de qual tela do Gerenciador ou de quem na casa, e o que fica bloqueado
sem isso. Relatório de lacunas não é entrega; é trabalho parecendo trabalho.

Campanha com `status = a_confirmar` é sempre a primeira pergunta:
a campanha chegou a rodar?

## Regras de honestidade

- Com uma ou duas edições medidas, fale em **baseline**, não em tendência.
- Não atribua público presente à mídia sem reserva rastreada — diga que a atribuição
  não existe ainda.
- Compare sempre com o baseline de 27/08 (34,9% de orçamento entregue, R$0,81 por
  visita, 23,7% de retenção, 90 presentes).

Salve o relatório em `HISTORICO/AAAA-MM-DD_EVT_<ARTISTA>.md`.
