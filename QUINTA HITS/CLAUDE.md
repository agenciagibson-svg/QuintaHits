# QUINTA HITS — contexto oficial do projeto

> Leia este arquivo inteiro antes de criar arquivos, campanhas, textos, artes ou
> automações. Ele é a fonte de verdade da operação.

## O que é

**QUINTA HITS** é uma label de entretenimento e um evento recorrente que acontece
**todas as quintas-feiras**, no **Florindos Bar**, em **Uberlândia/MG**. Opera junto com a
operação comercial e artística da **GIBSON PROMOÇÕES** e funciona como plataforma de
apresentação e desenvolvimento de artistas de pequeno e médio alcance.

Ponto de partida cultural: *Quinta já é quase sexta.*
Experiência: **boteco gourmet contemporâneo + música ao vivo + nightlife.**
Não é balada tradicional, não é festival, não é evento sofisticado.

## Idioma

Todo conteúdo deste projeto — documentação, textos, commits, nomes de arquivo,
relatórios e conversa — em **português do Brasil**.

## Hierarquia de verdade (em caso de conflito)

1. Este `CLAUDE.md`
2. `ID - VISUAL - V1 - PNG.png` — prancha oficial de identidade visual
3. A imagem de referência do selo
4. Instrução explícita e posterior do Vitor

## Regras permanentes

1. **A empresa é GIBSON PROMOÇÕES.** Nunca "Gibson Produções" ou variação. Hashtag:
   **#GibsonPromoções**. Vale para legendas, campanhas, prompts, metadados e código.
2. **A identidade visual não se reinterpreta.** Selo, símbolo "Q", lettering e proporções
   são ativos de marca. Melhoria permitida é só de execução técnica (vetorização,
   precisão geométrica, curvas limpas, centralização, exportação).
3. **Cores pelos valores exatos:** `#17352B` · `#F1E7D2` · `#B84A32` · `#D5A62A` · `#171717`.
4. **A comunicação institucional não depende do artista da semana.**
5. **Não inventar dado.** Número sem fonte não entra no banco nem no relatório. Campo sem
   informação fica vazio — vazio documenta o que a operação ainda não mede.
6. **Máximo 5 hashtags**, sempre no fim da legenda.
7. **Nada de avançar escopo** sem pedido: não produzir novas peças, campanhas ou linhas do
   feed que não foram solicitadas.
8. **Cíntia Férsi não faz parte da QUINTA HITS** (citada por engano em briefing antigo).
9. **A casa é o FLORINDOS BAR** (desde set/2026). O Tatu Bola foi a casa das edições de 27/08 e 10/09 e
   **não faz mais parte do projeto** — nenhuma peça nova o cita como casa da QUINTA HITS (DEC-009).

## Posicionamento

Território mental: **o lugar para estar na quinta-feira.**
Associação a construir: **"Hoje é quinta. Tem Quinta Hits."**

> A programação traz o público. A experiência faz o público voltar. A marca cria o hábito.

| Assinatura | Função |
|---|---|
| **A quinta oficial de Uberlândia.** | declaração de posicionamento (bio, institucional) |
| **Se é quinta, tem Hits.** | assinatura publicitária (campanhas e peças semanais) |

## Objetivo de mídia

Primário: **tráfego qualificado para reserva de mesa.**
Secundários: engajamento qualificado, alcance estratégico, fortalecimento da marca,
novos públicos, recorrência semanal.

## Onde a operação está hoje (15/09/2026)

- Uma campanha medida: 27/08 (Jhean Marcell), via "Turbinar post" — **R$31,41 de R$90,00
  entregues (34,9%)**, 2.917 de alcance, 48 cliques, 39 visitas ao site, R$0,81 por visita,
  retenção de vídeo de 23,7%, **zero alcance na faixa 18-24**, 90 pessoas na casa.
- Edição de 10/09 (NETO FOG, "Quinta Hits Pop Rock") realizada — **dados de campanha e de
  público ainda não lançados**.
- Conta de anúncios da Meta criada; **meio de pagamento e pixel pendentes**.
- **Nenhuma reserva registrada por canal** — maior lacuna da operação: sem isso não há
  atribuição de mídia para reserva.
- Próxima edição: **17/09** — **primeira quinta no Florindos Bar**, sem artista definido.
- Site oficial em Next.js/Vercel (`SITE/`), preview publicado em 15/09; faltam link de reserva e endereço da casa.

## Estrutura da pasta

```
QUINTA HITS - CLAUDE/
├── CLAUDE.md                  este arquivo
├── README.md                  como usar o projeto
├── .claude/
│   ├── agents/                9 agentes especialistas
│   └── skills/                9 skills de processo
├── DATABASE/                  banco da operação (CSV = verdade, SQLite = derivado)
├── DOCS/                      arquitetura de agentes, dicionário de dados, playbook
├── HISTORICO/                 um relatório .md por edição realizada
├── ASSETS/                    identidade, criativos e referências
└── SITE/                      site oficial (Next.js) publicado na Vercel
```

## Como trabalhar aqui

1. **Consulte o banco antes de opinar.**
   `python3 DATABASE/query.py --tabelas` · `python3 DATABASE/query.py queries/02_evolucao_semanal.sql`
2. **Acione o agente certo** (`DOCS/ARQUITETURA_DE_AGENTES.md`). Nada que toque marca,
   nome, cor ou selo sai sem passar pelo `qh-guardiao-marca`.
3. **Registre o que aprendeu.** Dado novo em `DATABASE/csv/`, validação com
   `python3 DATABASE/validate.py`, reconstrução com `python3 DATABASE/build_db.py`.
4. **Entregue arquivo, não instrução**, quando o pedido é o arquivo final.
5. **Relate limitação real** em vez de contornar com suposição.
