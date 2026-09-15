---
name: qh-banco-de-dados
description: Como ler, consultar e alimentar o banco de dados da QUINTA HITS (CSVs + SQLite). Use sempre que for lançar métricas, reservas, custos, eventos, aprendizados ou qualquer dado da operação, e antes de responder qualquer pergunta que comece com quanto, quantos, qual a evolução ou compare.
---

# Banco de dados da QUINTA HITS

## Arquitetura

```
DATABASE/
├── csv/              25 tabelas — FONTE DE VERDADE (editáveis à mão ou no Excel)
├── schema.sql        estrutura, tipos, enums (CHECK) e chaves estrangeiras
├── views.sql         8 views analíticas
├── build_db.py       csv/ → quinta_hits.db
├── validate.py       validação dos csv/ (roda sem precisar do .db)
├── query.py          executa SQL contra o banco
├── queries/          8 consultas prontas
└── quinta_hits.db    DERIVADO — nunca editar direto, pode ser apagado e regerado
```

## Comandos

```bash
python3 DATABASE/validate.py                       # antes de commitar dado novo
python3 DATABASE/build_db.py                       # reconstrói o .db
python3 DATABASE/query.py --tabelas                # inventário com contagem de linhas
python3 DATABASE/query.py queries/02_evolucao_semanal.sql
python3 DATABASE/query.py "SELECT * FROM vw_funil_edicao"
python3 DATABASE/query.py queries/05_roi_por_edicao.sql --csv /tmp/roi.csv
```

`query.py` copia o `.db` para uma pasta temporária antes de ler — pastas
sincronizadas/montadas não suportam o lock do SQLite. Para abrir o banco à mão no Mac,
use DB Browser for SQLite ou TablePlus apontando para `DATABASE/quinta_hits.db`.

## As 25 tabelas

| Grupo | Tabelas |
|---|---|
| Cadastros | `locais`, `artistas`, `parceiros` |
| Eventos | `eventos`, `eventos_artistas` |
| Mídia | `publicos`, `criativos`, `campanhas`, `conjuntos_anuncios`, `anuncios` |
| Métricas | `metricas_campanha`, `metricas_diarias`, `demografia_entrega`, `metricas_organicas` |
| Conversão / grana | `reservas`, `financeiro`, `kpis_metas` |
| Conteúdo e marca | `conteudo_calendario`, `copys`, `assinaturas_verbais`, `paleta_cores`, `assets` |
| Inteligência | `aprendizados`, `testes`, `decisoes` |

## Views

| View | Para que serve |
|---|---|
| `vw_funil_edicao` | funil completo por edição, do alcance ao público presente |
| `vw_desempenho_campanha` | campanha com CTR, CPC, CPM, retenção e % do orçamento entregue |
| `vw_demografia` | quem a mídia alcançou, por dimensão |
| `vw_financeiro_edicao` | receita, custo, resultado e ROI por edição |
| `vw_agenda` | próximas edições e prontidão (campanha, criativos, conteúdo) |
| `vw_aprendizados_abertos` | fila de aprendizados por impacto e confiança |
| `vw_conteudo_pendente` | calendário editorial não publicado |
| `vw_historico_semanal` | série histórica das edições realizadas |

## Convenções obrigatórias

- **IDs:** prefixo de 3 letras + sequência — `EVT-2026-08-27`, `CMP-001`, `PUB-002`,
  `CRI-004`, `APR-007`, `DEC-003`. Evento usa a data como sufixo.
- **Datas:** `YYYY-MM-DD`. Sem exceção.
- **Decimal com ponto** (`31.41`). Moeda BRL implícita, sem "R$" na célula.
- **Percentual** em número de 0 a 100 (`45.6`), não fração.
- **Vazio é vazio.** Nunca preencha com 0, "n/a" ou estimativa: campo em branco
  documenta o que a operação ainda não mede.
- **Enums:** os valores permitidos estão nos `CHECK` do `schema.sql`. `validate.py`
  reprova valor fora da lista.
- **`observacoes` é obrigatória na prática:** registre a origem do número (print do
  Instagram, relatório do Gerenciador, contagem na porta) e qualquer ressalva.

## Fato x cálculo

Entra como fato: o que está no relatório da plataforma ou foi contado na casa.
É calculado (e dito em `observacoes`): CPM, CPC, CTR, frequência, retenção de 3s,
custo por visita, custo por presente, ROI. Nunca lance um cálculo como se fosse
número oficial da plataforma.

## Onde lançar o quê

| Chegou isso | Vai para |
|---|---|
| Print do resultado do impulsionamento / Gerenciador | `metricas_campanha.csv` (+ `metricas_diarias.csv` se houver quebra por dia) |
| Recorte de idade, gênero, cidade, plataforma | `demografia_entrega.csv` |
| Números do post orgânico | `metricas_organicas.csv` |
| Contagem de gente na porta | `eventos.publico_presente` |
| Mesas e reservas | `reservas.csv` + `eventos.mesas_reservadas` |
| Cachê, estrutura, bar, patrocínio | `financeiro.csv` |
| "Descobrimos que..." | `aprendizados.csv` |
| "A partir de agora sempre..." | `decisoes.csv` |
| "Vamos testar A contra B" | `testes.csv` |

## Ao terminar qualquer lançamento

1. `validate.py` limpo (erros zerados).
2. `build_db.py` rodado.
3. Um aprendizado registrado, se o dado mudou o entendimento da operação.
