# Dicionário de dados — QUINTA HITS

25 tabelas em `DATABASE/csv/`. Convenções: IDs `PRE-XXX`, datas `YYYY-MM-DD`, decimal com
ponto, percentual de 0 a 100, moeda BRL, **vazio = não medido** (nunca 0 nem estimativa).
Os valores permitidos de cada campo com enum estão nos `CHECK` de `DATABASE/schema.sql`.

## Cadastros

**`locais`** — casas onde a label opera. `LOC-002` é o Florindos Bar (casa atual, desde set/2026); `LOC-001` é o Tatu Bola,
casa das edições de 27/08 e 10/09, que não faz mais parte do projeto.
Campos-chave: `capacidade_pessoas`, `mesas_total`, `link_reserva`.

**`artistas`** — atrações. `vinculo_gibson` distingue artista da casa de parceiro.
`ja_tocou_qh` alimenta a análise de repetição de line-up.

**`parceiros`** — patrocinador, apoio, fornecedor, venue, mídia, artístico.
`contrapartida` e `vigencia_*` sustentam a conversa comercial.

## Eventos

**`eventos`** — uma linha por quinta-feira. `id` = `EVT-<data>`.
`status`: `planejado → confirmado → em_divulgacao → realizado` (ou `cancelado`,
`a_confirmar`). `publico_presente` é contagem de **pessoas**, `mesas_reservadas` é mesa —
não misture. `concorrencia_na_data` e `clima` explicam outliers.

**`eventos_artistas`** — quem tocou, em que papel (`principal`, `abertura`, `dj`,
`convidado`), ordem, horário e cachê.

## Mídia

**`publicos`** — cada segmentação usada ou proposta, com `tipo`
(`personalizado`, `salvo`, `lookalike`, `retargeting`, `interesses`, `automatico`),
faixa de idade, interesses, exclusões e a hipótese em `observacoes`.

**`criativos`** — cada peça. `tem_horario` / `tem_endereco` / `tem_logo_qh` existem para
auditar informação faltando na arte (origem do aprendizado APR-008).

**`campanhas`** — `tipo` separa `turbinar_post` de `gerenciador`; `orcamento_previsto` x
`orcamento_gasto` mede a entrega; `pixel_ativo` marca a maturidade da medição.

**`conjuntos_anuncios`** e **`anuncios`** — estrutura da conta. No turbinar post, criamos
um conjunto "espelho" para manter o funil comparável entre formatos.

## Métricas

**`metricas_campanha`** — consolidado por campanha/anúncio. `impressoes` é o que o
Instagram chama de "visualizações" no relatório do impulsionamento. Derivados (`cpm`,
`cpc`, `ctr_link_pct`, `frequencia`) são calculados e a origem fica dita em `observacoes`.

**`metricas_diarias`** — mesma informação quebrada por dia; é o que revela subentrega no
meio da veiculação.

**`demografia_entrega`** — recorte da entrega por `dimensao` (`idade`, `genero`,
`localizacao`, `plataforma`, `posicionamento`) e `segmento`. `percentual_alcance` deve
somar ~100% por campanha/dimensão — `validate.py` alerta quando não soma.

**`metricas_organicas`** — desempenho do post não pago, para separar o que é mídia do que
é alcance próprio.

## Conversão e financeiro

**`reservas`** — uma linha por reserva, com `canal` e `origem_trafego`. **É a tabela mais
importante e a mais vazia hoje**: sem ela, nenhuma reserva é atribuível à campanha.

**`financeiro`** — `natureza` (`custo`/`receita`) + `categoria` (cachê, produção,
estrutura, tráfego, bar, couvert, patrocínio…). Alimenta `vw_financeiro_edicao`.

**`kpis_metas`** — indicador, `baseline`, `valor_meta`, `valor_realizado`.
Meta em `a_definir` é honestidade: com uma edição medida, quase tudo ainda é baseline.

## Conteúdo e marca

**`conteudo_calendario`** — calendário editorial. `pilar` classifica a intenção
(`institucional`, `programacao`, `prova_social`, `bastidor`, `conversao`, `reforco_marca`);
`posicao_grid` amarra a peça ao desenho do feed.

**`copys`** — biblioteca de textos aprovados (legenda, bio, assinatura, headline, CTA,
story, texto primário, roteiro). Reutilizar antes de reescrever.

**`assinaturas_verbais`** — frases oficiais da marca, com uso permitido e proibido.

**`paleta_cores`** — os cinco hex oficiais. Fonte para qualquer checagem de cor.

**`assets`** — inventário de arquivos: onde está, versão, se é vetorial, se é oficial.

## Inteligência

**`aprendizados`** — o coração da operação. Estrutura obrigatória:
`hipotese` → `evidencia` → `conclusao` → `acao_recomendada`, com `impacto_esperado`,
`confianca` e `status` (`aberto`, `em_teste`, `validado`, `refutado`, `arquivado`).
Aprendizado sem evidência é opinião e não entra.

**`testes`** — um experimento por semana: variável, variantes, métrica primária, critério
de decisão, resultado e vencedor. Vinculado ao aprendizado que o originou.

**`decisoes`** — o que passou a valer para sempre, com motivo e fonte. É o registro que
evita rediscutir a mesma coisa toda semana.

## Views

`vw_funil_edicao` · `vw_desempenho_campanha` · `vw_demografia` · `vw_financeiro_edicao` ·
`vw_agenda` · `vw_aprendizados_abertos` · `vw_conteudo_pendente` · `vw_historico_semanal`
— descritas na skill `qh-banco-de-dados`.
