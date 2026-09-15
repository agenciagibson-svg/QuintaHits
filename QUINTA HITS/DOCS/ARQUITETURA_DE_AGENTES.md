# Arquitetura de agentes — QUINTA HITS

## Princípio

Um agente = uma responsabilidade que pode ser cobrada. Ninguém opina fora do seu escopo,
ninguém publica sem passar pelo guardião de marca, e nenhuma decisão de mídia é tomada sem
consultar o banco.

```
                         VITOR (decisão final)
                                  │
              ┌───────────────────┼───────────────────┐
              │                   │                   │
      qh-growth-estrategista  qh-head-trafego   qh-curador-programacao
      (4 a 12 semanas)        (a semana)         (quem toca)
              │                   │                   │
              └─────────┬─────────┴─────────┬─────────┘
                        │                   │
                 qh-analista-dados    qh-comercial-reservas
                 (o número)           (clique → mesa)
                        │                   │
                        └────────┬──────────┘
                                 │
                          qh-controller
                          (custo, receita, ROI)

        Produção de peça:  qh-copywriter  +  qh-diretor-arte
                                 │
                        qh-guardiao-marca  ← VETO sobre tudo que é publicado
```

## Quem acionar

| Pedido típico | Agente |
|---|---|
| "como gastar os R$100 desta semana?" | `qh-head-trafego` |
| "analisa esse print da campanha" | `qh-head-trafego` → `qh-analista-dados` |
| "lança esses números" / "quantas visitas tivemos?" | `qh-analista-dados` |
| "escreve a legenda / o anúncio" | `qh-copywriter` |
| "gera os posts do grid" / "exporta em 1080x1350" | `qh-diretor-arte` |
| "pode publicar?" / "essa arte está certa?" | `qh-guardiao-marca` |
| "quem toca quinta?" / "esse artista serve?" | `qh-curador-programacao` |
| "por que ninguém reservou?" | `qh-comercial-reservas` |
| "a edição se pagou?" | `qh-controller` |
| "como fazer a quinta virar hábito?" | `qh-growth-estrategista` |

## Matriz de responsabilidade

| Frente | Executa | Valida | Registra no banco |
|---|---|---|---|
| Plano de campanha | `qh-head-trafego` | Vitor | `campanhas`, `conjuntos_anuncios`, `anuncios` |
| Públicos | `qh-head-trafego` | `qh-analista-dados` | `publicos` |
| Criativo (arte) | `qh-diretor-arte` | `qh-guardiao-marca` | `criativos`, `assets` |
| Criativo (texto) | `qh-copywriter` | `qh-guardiao-marca` | `copys`, `conteudo_calendario` |
| Métricas | `qh-analista-dados` | — | `metricas_*`, `demografia_entrega` |
| Reservas e mesas | `qh-comercial-reservas` | `qh-analista-dados` | `reservas`, `eventos` |
| Line-up | `qh-curador-programacao` | Vitor | `artistas`, `eventos`, `eventos_artistas` |
| Custo e receita | `qh-controller` | Vitor | `financeiro` |
| Testes e metas | `qh-growth-estrategista` | `qh-head-trafego` | `testes`, `kpis_metas`, `aprendizados` |
| Decisões permanentes | quem decidiu | Vitor | `decisoes` |

## Regras de handoff

1. **Nada é publicado sem o `qh-guardiao-marca`.** Ele reprova por regra citada, não por gosto.
2. **Número só vem do banco.** Se um agente precisa de dado, pede ao `qh-analista-dados`;
   não estima.
3. **O head de tráfego não escreve a peça final** e o copywriter não decide verba.
4. **Aprendizado é obrigação de quem executou.** Campanha rodada sem linha em
   `aprendizados.csv` é considerada incompleta.
5. **Decisão que vale para sempre** vai para `decisoes.csv` e passa a ser regra do projeto.
6. **Escopo fechado:** nenhum agente produz peça, campanha ou linha de feed que não foi pedida.

## Skills por agente

| Agente | Skills que usa |
|---|---|
| `qh-head-trafego` | `qh-plano-de-campanha`, `qh-auditoria-de-campanha`, `qh-analise-de-publico`, `qh-naming-e-nomenclatura`, `qh-banco-de-dados` |
| `qh-analista-dados` | `qh-banco-de-dados`, `qh-relatorio-de-edicao`, `qh-analise-de-publico` |
| `qh-guardiao-marca` | `qh-identidade-visual`, `qh-copy-e-tom-de-voz`, `qh-naming-e-nomenclatura` |
| `qh-copywriter` | `qh-copy-e-tom-de-voz`, `qh-naming-e-nomenclatura` |
| `qh-diretor-arte` | `qh-identidade-visual`, `qh-naming-e-nomenclatura` |
| `qh-curador-programacao` | `qh-briefing-de-artista`, `qh-banco-de-dados` |
| `qh-comercial-reservas` | `qh-banco-de-dados`, `qh-relatorio-de-edicao` |
| `qh-controller` | `qh-banco-de-dados`, `qh-relatorio-de-edicao` |
| `qh-growth-estrategista` | `qh-analise-de-publico`, `qh-auditoria-de-campanha`, `qh-banco-de-dados` |

## O que esta arquitetura não faz

- Não decide no lugar do Vitor: entrega recomendação com número e trade-off.
- Não opera a conta de anúncios sozinha — execução no Gerenciador depende de acesso e
  aprovação explícita.
- Não substitui contador nem advogado: `qh-controller` faz apuração gerencial.
