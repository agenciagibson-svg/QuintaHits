# Playbook semanal — QUINTA HITS

Uma quinta-feira bem executada é a mesma sequência repetida, com a variável do teste
mudando. Este é o ciclo **campanha → dados → aprendizado → otimização**.

## D-7 · quinta anterior

- Confirmar artista da próxima edição — `qh-curador-programacao`, skill `qh-briefing-de-artista`
- Criar a linha em `eventos.csv` (`status = confirmado`) e o vínculo em `eventos_artistas.csv`
- Solicitar material do artista (foto em alta, vídeo vertical, repertório, @ conferido)
- Definir o **teste da semana** — uma variável só — em `testes.csv`

## D-5 · sábado

- Arte vertical 9:16 com **dia, horário, Florindos Bar e selo QH no rodapé** — `qh-diretor-arte`
- Vídeo com gancho nos primeiros 0,5s (selo + artista + "QUINTA")
- Legenda de programação + texto primário e headline em 2–3 variantes — `qh-copywriter`
- Aprovação do `qh-guardiao-marca` (sem isso nada sobe)
- Registrar em `criativos.csv`, `copys.csv` e `conteudo_calendario.csv`

## D-4 · domingo

- Publicar o post orgânico da programação
- Subir a campanha — `qh-head-trafego`, skill `qh-plano-de-campanha`
  - janela de **4 a 5 dias** (nunca 2)
  - 70% da verba no público base, 30% no teste
  - nomenclatura no padrão `QH | DD-MM | ...`
  - link de reserva testado no celular
- Criar as linhas em `campanhas.csv`, `conjuntos_anuncios.csv`, `anuncios.csv`

## D-2 · terça

- Primeira leitura de entrega: o gasto está no ritmo? — `qh-analista-dados`
- Se a entrega estiver atrasada: ampliar público ou subir orçamento diário **no mesmo dia**
- Lançar o parcial em `metricas_diarias.csv`

## D-1 · quarta

- Stories de lembrete com CTA de reserva
- Checar mesas já reservadas — `qh-comercial-reservas`

## D0 · quinta

- Stories: "Hoje é quinta. Tem Quinta Hits." / últimas mesas
- Registrar **toda reserva** com canal e origem em `reservas.csv`
- Na casa: contagem de público, horário de pico, leitura de campo

## D+1 · sexta

- Lançar tudo no banco — `qh-analista-dados`
  - `metricas_campanha.csv`, `demografia_entrega.csv`, `metricas_organicas.csv`
  - `eventos.publico_presente`, `eventos.mesas_reservadas`
  - `financeiro.csv` (cachê, estrutura, tráfego, receitas)
- `python3 DATABASE/validate.py && python3 DATABASE/build_db.py`
- Publicar prova social da noite

## D+2 · sábado

- Auditoria — skill `qh-auditoria-de-campanha`
- Relatório da edição em `HISTORICO/AAAA-MM-DD_EVT_<ARTISTA>.md` — skill `qh-relatorio-de-edicao`
- Aprendizados em `aprendizados.csv`; decisões permanentes em `decisoes.csv`
- Resultado do teste em `testes.csv` e o teste da próxima semana definido
- Revisão de metas quando houver base — `qh-growth-estrategista`

## Metas mínimas por campanha

| Indicador | Mínimo | Baseline 27/08 |
|---|---|---|
| % do orçamento entregue | ≥ 95% | 34,9% |
| Custo por visita ao site | ≤ R$0,81 | R$0,81 |
| Retenção de vídeo em 3s | ≥ 35% | 23,7% |
| Alcance em Uberlândia | ≥ 90% | não medido |
| Participação de 18-24 no alcance | ≥ 15% | 0% |
| Reservas com origem registrada | 100% | 0% |

## Regra de ouro

Uma semana só está fechada quando existe **dado no banco + aprendizado registrado +
teste da próxima semana definido**. Campanha sem aprendizado é verba perdida duas vezes.
