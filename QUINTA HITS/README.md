# QUINTA HITS — operação, dados e agentes

Pasta de trabalho da label **QUINTA HITS** (GIBSON PROMOÇÕES · Florindos Bar · Uberlândia/MG):
banco de dados da operação, agentes especialistas e skills de processo.

## Comece por aqui

| Arquivo | Para quê |
|---|---|
| `CLAUDE.md` | contexto oficial e regras permanentes — leitura obrigatória |
| `DOCS/ARQUITETURA_DE_AGENTES.md` | quem faz o quê e quando acionar cada agente |
| `DOCS/PLAYBOOK_SEMANAL.md` | a rotina de uma quinta, de D-7 a D+2 |
| `DOCS/DICIONARIO_DE_DADOS.md` | o que cada tabela e campo significa |
| `SITE/README.md` | site oficial (Next.js/Vercel): onde mudar programação, casa e link de reserva |

## Banco de dados

Os **CSVs em `DATABASE/csv/` são a fonte de verdade** (edite no Excel, Numbers ou direto).
O `quinta_hits.db` é derivado e pode ser apagado e regerado a qualquer momento.

```bash
python3 DATABASE/validate.py     # valida os CSVs (erros e alertas)
python3 DATABASE/build_db.py     # reconstrói o SQLite a partir dos CSVs
python3 DATABASE/query.py --tabelas
python3 DATABASE/query.py queries/01_auditoria_ultima_campanha.sql
python3 DATABASE/query.py "SELECT * FROM vw_funil_edicao"
```

25 tabelas · 8 views · 8 consultas prontas. Para abrir à mão no Mac: DB Browser for
SQLite ou TablePlus apontando para `DATABASE/quinta_hits.db`.

## Agentes (`.claude/agents/`)

| Agente | Papel |
|---|---|
| `qh-head-trafego` | estratégia de mídia, plano da semana, decisões de otimização |
| `qh-analista-dados` | lança, valida e consulta o banco; relatórios e séries |
| `qh-guardiao-marca` | revisa tudo antes de publicar — tem veto |
| `qh-copywriter` | legendas, anúncios, stories, bio, CTA |
| `qh-diretor-arte` | especificação e produção de peças, QC de arquivo |
| `qh-curador-programacao` | line-up, calendário, briefing do artista |
| `qh-comercial-reservas` | funil de reserva, mesas, oferta, parceiros |
| `qh-controller` | custo, receita, ROI, custo por pessoa presente |
| `qh-growth-estrategista` | recorrência, testes encadeados, metas da label |

## Skills (`.claude/skills/`)

`qh-banco-de-dados` · `qh-auditoria-de-campanha` · `qh-plano-de-campanha` ·
`qh-naming-e-nomenclatura` · `qh-copy-e-tom-de-voz` · `qh-identidade-visual` ·
`qh-relatorio-de-edicao` · `qh-briefing-de-artista` · `qh-analise-de-publico`

## Rotina mínima por edição

1. **D-7** artista confirmado → `qh-curador-programacao`
2. **D-5** arte e textos aprovados → `qh-diretor-arte` + `qh-copywriter` + `qh-guardiao-marca`
3. **D-4** campanha no ar → `qh-head-trafego` (skill `qh-plano-de-campanha`)
4. **D-2** leitura de entrega e ajuste
5. **D+1** dados lançados → `qh-analista-dados`
6. **D+2** auditoria e aprendizados → skills `qh-auditoria-de-campanha` e `qh-relatorio-de-edicao`

## Pendências conhecidas da operação

- [ ] Meio de pagamento e **pixel** na página de reserva (destrava retargeting e conversão)
- [ ] **Registrar reserva por canal e origem** — sem isso não há atribuição
- [ ] Lançar os dados da edição de **10/09 (NETO FOG)**
- [ ] Definir artista e plano da edição de **17/09**
- [ ] Produzir os três PNGs da primeira linha do grid + SVG vetorial do selo
- [ ] Padronizar rodapé das artes com dia, horário e Florindos Bar
- [ ] Preencher endereço e link de reserva do Florindos Bar em `SITE/src/config/site.ts` e `DATABASE/csv/locais.csv`
- [ ] Atualizar artes, bio e endereço nos criativos para o Florindos Bar (DEC-009)
