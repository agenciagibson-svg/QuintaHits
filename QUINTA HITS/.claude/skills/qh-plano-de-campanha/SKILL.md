---
name: qh-plano-de-campanha
description: Estrutura padrão de uma campanha semanal de tráfego pago da QUINTA HITS — objetivo, públicos, orçamento por dia, janela, criativos, textos, medição e critério de sucesso. Use para planejar a divulgação de uma edição, montar campanha no Gerenciador da Meta ou decidir como gastar a verba da semana.
---

# Plano de campanha semanal — QUINTA HITS

## Premissas fixas

- Objetivo primário: **tráfego qualificado para reserva de mesa** (DEC-008).
  Secundários: engajamento qualificado, alcance, marca, novos públicos, recorrência.
- Evento recorrente: toda quinta, Florindos Bar, Uberlândia/MG (casa nova desde 17/09 — a mudança
  de casa é mensagem obrigatória nas primeiras campanhas).
- Sem pixel maduro, otimize por cliques no link / visitas ao site e trate reserva como
  dado de campo.
- Verba de referência: R$100 por edição. Verba pequena = **um teste por semana**.

## Cronograma da semana

| Dia | O que acontece |
|---|---|
| **D-7 (quinta anterior)** | artista definido, tema e assets solicitados |
| **D-5 (sábado)** | arte e vídeo prontos e aprovados pelo guardião de marca |
| **D-4 (domingo)** | post orgânico da programação publicado |
| **D-4 a D-3** | campanha no ar — 60% da verba nos primeiros 3 dias |
| **D-2 (terça)** | primeira leitura de entrega; ajuste de público se o gasto estiver atrasado |
| **D-1 (quarta)** | reforço com lembrete de reserva; stories |
| **D0 (quinta)** | stories no dia ("Hoje é quinta. Tem Quinta Hits."), últimas mesas |
| **D+1 (sexta)** | prova social, contagem de público, lançamento dos dados no banco |
| **D+2 (sábado)** | auditoria e aprendizados registrados |

Janela mínima de veiculação: **4 a 5 dias**. Dois dias foi a causa direta da
subentrega de 27/08 (APR-001).

## Estrutura de conta

```
Campanha:  QH | <DD-MM> | <ARTISTA> | <OBJETIVO>
├── Conjunto A: QH | <DD-MM> | Uberlandia 23-45 | Rock/Nightlife      (70% da verba)
└── Conjunto B: QH | <DD-MM> | Teste da semana                        (30% da verba)
     Anúncio:   QH | <DD-MM> | <FORMATO> | <VARIANTE>
```

Nomenclatura completa: skill `qh-naming-e-nomenclatura`.

## Públicos

- **Base (70%):** Uberlândia + raio a partir do endereço do Florindos Bar, 23–45 anos,
  todos os gêneros, interesses de rock/pop rock/música ao vivo/bares/vida noturna.
- **Teste (30%):** uma hipótese por semana — faixa 18-24, retargeting de engajados,
  público amplo, ou interesse específico do artista.
- Públicos cadastrados e propostos: `DATABASE/csv/publicos.csv`.

## Criativos mínimos

1. Vídeo vertical 9:16 com gancho nos primeiros 0,5s (selo + artista + "QUINTA").
2. Estático 9:16 ou 4:5 com dia, horário, Florindos Bar e selo QH no rodapé (APR-008).
3. Texto primário curto + CTA único de reserva.

## Medição — definir ANTES de subir

| Indicador | Meta mínima | Fonte |
|---|---|---|
| % do orçamento entregue | ≥ 95% | `vw_desempenho_campanha` |
| Custo por visita ao site | ≤ R$0,81 | `metricas_campanha` |
| Retenção de 3s | ≥ 35% | `metricas_campanha` |
| Alcance em Uberlândia | ≥ 90% | `demografia_entrega` |
| Reservas com origem registrada | 100% das reservas | `reservas.csv` |

## Checklist antes de publicar

- [ ] Link de reserva testado no celular
- [ ] Peça com dia, horário e local
- [ ] Texto aprovado pelo guardião de marca
- [ ] Nome da campanha/conjunto/anúncio no padrão
- [ ] Verba e janela conferidas (não repetir a janela de 2 dias)
- [ ] Teste da semana definido e registrado em `testes.csv`
- [ ] Linhas criadas em `campanhas.csv`, `conjuntos_anuncios.csv`, `anuncios.csv`

## Plano só está pronto com

objetivo · público · orçamento distribuído por dia · janela · criativos · textos ·
link · o que será medido · critério de sucesso · **o que fazer se falhar até D-2**.
