-- =====================================================================
-- QUINTA HITS — BANCO DE DADOS OPERACIONAL
-- Label de entretenimento da GIBSON PROMOÇÕES | Tatu Bola — Uberlândia/MG
-- Fonte de dados: DATABASE/csv/*.csv (1 arquivo = 1 tabela)
-- Gerado por: python3 build_db.py
-- Convenções: datas ISO (YYYY-MM-DD) | decimal com ponto | moeda BRL
-- =====================================================================

PRAGMA foreign_keys = ON;

-- ============================ 1. CADASTROS ===========================

CREATE TABLE locais (
  id                  TEXT PRIMARY KEY,            -- LOC-001
  nome                TEXT NOT NULL,
  endereco            TEXT,
  bairro              TEXT,
  cidade              TEXT,
  uf                  TEXT,
  capacidade_pessoas  INTEGER,
  mesas_total         INTEGER,
  instagram           TEXT,
  link_reserva        TEXT,
  observacoes         TEXT
);

CREATE TABLE artistas (
  id                    TEXT PRIMARY KEY,          -- ART-001
  nome_artistico        TEXT NOT NULL,
  instagram             TEXT,
  genero_musical        TEXT,
  formato_show          TEXT,                      -- banda, voz e violao, dj, duo
  vinculo_gibson        TEXT CHECK(vinculo_gibson IN ('sim','nao','parceiro','')),
  seguidores_instagram  INTEGER,
  cidade_base           TEXT,
  contato               TEXT,
  ja_tocou_qh           TEXT CHECK(ja_tocou_qh IN ('sim','nao','')),
  observacoes           TEXT
);

CREATE TABLE parceiros (
  id               TEXT PRIMARY KEY,               -- PRC-001
  nome             TEXT NOT NULL,
  tipo             TEXT CHECK(tipo IN ('patrocinador','apoio','fornecedor','venue','midia','artistico','')),
  contato          TEXT,
  responsavel      TEXT,
  contrapartida    TEXT,
  valor_acordado   REAL,
  vigencia_inicio  TEXT,
  vigencia_fim     TEXT,
  status           TEXT CHECK(status IN ('ativo','prospeccao','negociacao','encerrado','')),
  observacoes      TEXT
);

-- ======================= 2. EVENTOS / EDIÇÕES ========================

CREATE TABLE eventos (
  id                   TEXT PRIMARY KEY,           -- EVT-2026-08-27
  data                 TEXT NOT NULL,
  dia_semana           TEXT,
  edicao_numero        INTEGER,
  local_id             TEXT REFERENCES locais(id),
  tema                 TEXT,
  artista_principal_id TEXT REFERENCES artistas(id),
  horario_inicio       TEXT,
  horario_fim          TEXT,
  tipo_entrada         TEXT,                       -- free, couvert, consumacao
  couvert_valor        REAL,
  status               TEXT CHECK(status IN ('planejado','confirmado','em_divulgacao','realizado','cancelado','a_confirmar','')),
  publico_meta         INTEGER,
  publico_presente     INTEGER,
  mesas_meta           INTEGER,
  mesas_reservadas     INTEGER,
  clima                TEXT,
  concorrencia_na_data TEXT,
  observacoes          TEXT
);

CREATE TABLE eventos_artistas (
  id          TEXT PRIMARY KEY,                    -- EVA-001
  evento_id   TEXT NOT NULL REFERENCES eventos(id),
  artista_id  TEXT NOT NULL REFERENCES artistas(id),
  papel       TEXT CHECK(papel IN ('principal','abertura','dj','convidado','')),
  ordem       INTEGER,
  horario     TEXT,
  cache       REAL,
  observacoes TEXT
);

-- ======================== 3. TRÁFEGO PAGO ============================

CREATE TABLE publicos (
  id               TEXT PRIMARY KEY,               -- PUB-001
  nome             TEXT NOT NULL,
  tipo             TEXT CHECK(tipo IN ('personalizado','salvo','lookalike','automatico','retargeting','interesses','')),
  localizacao      TEXT,
  raio_km          REAL,
  idade_min        INTEGER,
  idade_max        INTEGER,
  generos          TEXT,                           -- todos, feminino, masculino
  interesses       TEXT,
  comportamentos   TEXT,
  exclusoes        TEXT,
  tamanho_estimado TEXT,
  origem           TEXT,                           -- turbinar_post, gerenciador, pixel
  status           TEXT CHECK(status IN ('ativo','arquivado','rascunho','')),
  observacoes      TEXT
);

CREATE TABLE criativos (
  id                TEXT PRIMARY KEY,              -- CRI-001
  evento_id         TEXT REFERENCES eventos(id),
  nome_arquivo      TEXT,
  tipo              TEXT CHECK(tipo IN ('video','imagem','carrossel','story','outro','')),
  formato_proporcao TEXT,                          -- 9:16, 4:5, 1:1
  dimensoes_px      TEXT,
  duracao_s         REAL,
  tem_horario       TEXT CHECK(tem_horario IN ('sim','nao','')),
  tem_endereco      TEXT CHECK(tem_endereco IN ('sim','nao','')),
  tem_logo_qh       TEXT CHECK(tem_logo_qh IN ('sim','nao','')),
  headline          TEXT,
  chamada_principal TEXT,
  cta               TEXT,
  caminho_asset     TEXT,
  status            TEXT CHECK(status IN ('briefado','em_producao','aprovado','publicado','reprovado','')),
  observacoes       TEXT
);

CREATE TABLE campanhas (
  id                 TEXT PRIMARY KEY,             -- CMP-001
  evento_id          TEXT REFERENCES eventos(id),
  nome               TEXT,
  plataforma         TEXT,                         -- instagram, facebook, meta, google
  conta_anuncios     TEXT,
  tipo               TEXT CHECK(tipo IN ('turbinar_post','gerenciador','organico','outro','')),
  objetivo           TEXT,                         -- visitas_site, engajamento, alcance, mensagens
  data_inicio        TEXT,
  data_fim           TEXT,
  duracao_dias       INTEGER,
  orcamento_previsto REAL,
  orcamento_gasto    REAL,
  moeda              TEXT DEFAULT 'BRL',
  link_destino       TEXT,
  pixel_ativo        TEXT CHECK(pixel_ativo IN ('sim','nao','')),
  status             TEXT CHECK(status IN ('planejada','ativa','pausada','finalizada','nao_executada','a_confirmar','')),
  observacoes        TEXT
);

CREATE TABLE conjuntos_anuncios (
  id              TEXT PRIMARY KEY,                -- CJA-001
  campanha_id     TEXT NOT NULL REFERENCES campanhas(id),
  nome            TEXT,
  publico_id      TEXT REFERENCES publicos(id),
  otimizacao      TEXT,                            -- cliques_link, alcance, visualizacoes
  posicionamentos TEXT,
  orcamento_diario REAL,
  lance_tipo      TEXT,
  data_inicio     TEXT,
  data_fim        TEXT,
  status          TEXT CHECK(status IN ('ativo','pausado','finalizado','rascunho','')),
  observacoes     TEXT
);

CREATE TABLE anuncios (
  id                TEXT PRIMARY KEY,              -- ANU-001
  conjunto_id       TEXT REFERENCES conjuntos_anuncios(id),
  campanha_id       TEXT REFERENCES campanhas(id),
  criativo_id       TEXT REFERENCES criativos(id),
  nome              TEXT,
  post_organico_url TEXT,
  tipo_veiculacao   TEXT,
  data_inicio       TEXT,
  data_fim          TEXT,
  status            TEXT CHECK(status IN ('ativo','pausado','finalizado','reprovado','')),
  observacoes       TEXT
);

-- ========================== 4. MÉTRICAS ==============================

CREATE TABLE metricas_campanha (
  id                TEXT PRIMARY KEY,              -- MTC-001
  campanha_id       TEXT REFERENCES campanhas(id),
  anuncio_id        TEXT REFERENCES anuncios(id),
  periodo_inicio    TEXT,
  periodo_fim       TEXT,
  impressoes        INTEGER,                       -- "visualizacoes" no turbinar post
  alcance           INTEGER,
  frequencia        REAL,
  cliques_link      INTEGER,
  cliques_total     INTEGER,
  visitas_site      INTEGER,
  gasto             REAL,
  custo_por_visita  REAL,
  cpm               REAL,
  cpc               REAL,
  ctr_link_pct      REAL,
  video_inicios     INTEGER,
  video_3s          INTEGER,
  video_100pct      INTEGER,
  curtidas          INTEGER,
  comentarios       INTEGER,
  compartilhamentos INTEGER,
  salvamentos       INTEGER,
  visitas_perfil    INTEGER,
  seguidores_novos  INTEGER,
  conversas_iniciadas INTEGER,
  observacoes       TEXT
);

CREATE TABLE metricas_diarias (
  id           TEXT PRIMARY KEY,                   -- MTD-001
  campanha_id  TEXT REFERENCES campanhas(id),
  anuncio_id   TEXT REFERENCES anuncios(id),
  data         TEXT NOT NULL,
  impressoes   INTEGER,
  alcance      INTEGER,
  cliques_link INTEGER,
  visitas_site INTEGER,
  gasto        REAL,
  video_3s     INTEGER,
  observacoes  TEXT
);

CREATE TABLE demografia_entrega (
  id                 TEXT PRIMARY KEY,             -- DEM-001
  campanha_id        TEXT REFERENCES campanhas(id),
  dimensao           TEXT CHECK(dimensao IN ('idade','genero','idade_genero','localizacao','plataforma','posicionamento','')),
  segmento           TEXT,                         -- 25-34, feminino, Minas Gerais
  alcance            INTEGER,
  impressoes         INTEGER,
  cliques            INTEGER,
  resultados         INTEGER,
  gasto              REAL,
  percentual_alcance REAL,                         -- 0-100
  observacoes        TEXT
);

CREATE TABLE metricas_organicas (
  id                TEXT PRIMARY KEY,              -- MTO-001
  evento_id         TEXT REFERENCES eventos(id),
  conteudo_id       TEXT,
  canal             TEXT,                          -- feed, stories, reels
  url               TEXT,
  data_publicacao   TEXT,
  tipo              TEXT,
  alcance           INTEGER,
  impressoes        INTEGER,
  curtidas          INTEGER,
  comentarios       INTEGER,
  compartilhamentos INTEGER,
  salvamentos       INTEGER,
  visualizacoes     INTEGER,
  visitas_perfil    INTEGER,
  cliques_link_bio  INTEGER,
  observacoes       TEXT
);

-- ==================== 5. CONVERSÃO E FINANCEIRO ======================

CREATE TABLE reservas (
  id                      TEXT PRIMARY KEY,        -- RES-001
  evento_id               TEXT REFERENCES eventos(id),
  data_solicitacao        TEXT,
  canal                   TEXT CHECK(canal IN ('site','whatsapp','direct','telefone','presencial','outro','')),
  pessoas                 INTEGER,
  mesas                   INTEGER,
  status                  TEXT CHECK(status IN ('solicitada','confirmada','realizada','no_show','cancelada','')),
  valor_consumo_minimo    REAL,
  origem_trafego          TEXT,                    -- pago, organico, indicacao, direto
  campanha_id             TEXT REFERENCES campanhas(id),
  observacoes             TEXT
);

CREATE TABLE financeiro (
  id               TEXT PRIMARY KEY,               -- FIN-001
  evento_id        TEXT REFERENCES eventos(id),
  campanha_id      TEXT REFERENCES campanhas(id),
  parceiro_id      TEXT REFERENCES parceiros(id),
  data             TEXT,
  natureza         TEXT CHECK(natureza IN ('custo','receita','')),
  categoria        TEXT CHECK(categoria IN ('cache_artista','producao','estrutura','trafego_pago','conteudo','equipe','bebida','taxa_plataforma','patrocinio','receita_mesa','receita_bar','receita_couvert','outro','')),
  descricao        TEXT,
  valor            REAL,
  forma_pagamento  TEXT,
  status           TEXT CHECK(status IN ('previsto','pago','recebido','pendente','cancelado','')),
  observacoes      TEXT
);

CREATE TABLE kpis_metas (
  id              TEXT PRIMARY KEY,                -- KPI-001
  indicador       TEXT NOT NULL,
  unidade         TEXT,
  escopo          TEXT CHECK(escopo IN ('edicao','campanha','mes','label','')),
  periodo         TEXT,
  baseline        REAL,
  valor_meta      REAL,
  valor_realizado REAL,
  fonte_dado      TEXT,
  status          TEXT CHECK(status IN ('a_definir','vigente','atingida','nao_atingida','arquivada','')),
  observacoes     TEXT
);

-- ====================== 6. CONTEÚDO E MARCA ==========================

CREATE TABLE conteudo_calendario (
  id             TEXT PRIMARY KEY,                 -- CNT-001
  evento_id      TEXT REFERENCES eventos(id),
  data_prevista  TEXT,
  data_publicado TEXT,
  canal          TEXT CHECK(canal IN ('feed','stories','reels','outdoor','whatsapp','outro','')),
  formato        TEXT,
  posicao_grid   TEXT,                             -- linha1-esquerda, linha1-centro...
  pilar          TEXT CHECK(pilar IN ('institucional','programacao','prova_social','bastidor','conversao','reforco_marca','')),
  tema           TEXT,
  copy_id        TEXT REFERENCES copys(id),
  criativo_id    TEXT REFERENCES criativos(id),
  hashtags       TEXT,
  responsavel    TEXT,
  status         TEXT CHECK(status IN ('ideia','briefado','em_producao','aprovado','agendado','publicado','cancelado','')),
  url_publicado  TEXT,
  observacoes    TEXT
);

CREATE TABLE copys (
  id             TEXT PRIMARY KEY,                 -- COP-001
  tipo           TEXT CHECK(tipo IN ('legenda','bio','assinatura','headline','cta','story','anuncio_primario','roteiro','')),
  titulo         TEXT,
  texto          TEXT NOT NULL,
  hashtags       TEXT,
  contexto_uso   TEXT,
  aprovado       TEXT CHECK(aprovado IN ('sim','nao','rascunho','')),
  data_aprovacao TEXT,
  autor          TEXT,
  observacoes    TEXT
);

CREATE TABLE assinaturas_verbais (
  id            TEXT PRIMARY KEY,                  -- ASV-001
  texto         TEXT NOT NULL,
  funcao        TEXT,
  uso_permitido TEXT,
  uso_proibido  TEXT,
  status        TEXT CHECK(status IN ('oficial','em_teste','descontinuada','')),
  observacoes   TEXT
);

CREATE TABLE paleta_cores (
  id            TEXT PRIMARY KEY,                  -- COR-001
  token         TEXT NOT NULL,
  nome          TEXT,
  hex           TEXT NOT NULL,
  rgb           TEXT,
  uso_principal TEXT,
  observacoes   TEXT
);

CREATE TABLE assets (
  id            TEXT PRIMARY KEY,                  -- AST-001
  nome_arquivo  TEXT NOT NULL,
  categoria     TEXT CHECK(categoria IN ('logo','selo','identidade','arte_post','video','referencia','documento','outro','')),
  formato       TEXT,
  dimensoes_px  TEXT,
  vetorial      TEXT CHECK(vetorial IN ('sim','nao','')),
  caminho       TEXT,
  versao        TEXT,
  status        TEXT CHECK(status IN ('oficial','rascunho','pendente','obsoleto','')),
  data          TEXT,
  observacoes   TEXT
);

-- ===================== 7. INTELIGÊNCIA / GROWTH ======================

CREATE TABLE aprendizados (
  id                TEXT PRIMARY KEY,              -- APR-001
  data              TEXT,
  evento_id         TEXT REFERENCES eventos(id),
  campanha_id       TEXT REFERENCES campanhas(id),
  categoria         TEXT CHECK(categoria IN ('publico','criativo','orcamento','oferta','canal','timing','operacao','marca','conversao','')),
  hipotese          TEXT,
  evidencia         TEXT,
  conclusao         TEXT,
  acao_recomendada  TEXT,
  impacto_esperado  TEXT CHECK(impacto_esperado IN ('alto','medio','baixo','')),
  confianca         TEXT CHECK(confianca IN ('alta','media','baixa','')),
  status            TEXT CHECK(status IN ('aberto','em_teste','validado','refutado','arquivado','')),
  fonte             TEXT
);

CREATE TABLE testes (
  id               TEXT PRIMARY KEY,               -- TST-001
  nome             TEXT NOT NULL,
  evento_id        TEXT REFERENCES eventos(id),
  campanha_id      TEXT REFERENCES campanhas(id),
  hipotese         TEXT,
  variavel_testada TEXT,
  variante_a       TEXT,
  variante_b       TEXT,
  metrica_primaria TEXT,
  criterio_decisao TEXT,
  data_inicio      TEXT,
  data_fim         TEXT,
  resultado_a      TEXT,
  resultado_b      TEXT,
  vencedor         TEXT,
  status           TEXT CHECK(status IN ('planejado','rodando','concluido','inconclusivo','cancelado','')),
  aprendizado_id   TEXT REFERENCES aprendizados(id),
  observacoes      TEXT
);

CREATE TABLE decisoes (
  id                       TEXT PRIMARY KEY,       -- DEC-001
  data                     TEXT,
  tema                     TEXT,
  decisao                  TEXT NOT NULL,
  motivo                   TEXT,
  alternativas_consideradas TEXT,
  impacto                  TEXT,
  autor                    TEXT,
  fonte                    TEXT,
  status                   TEXT CHECK(status IN ('vigente','revisada','revogada','')),
  observacoes              TEXT
);

-- ============================ ÍNDICES ================================
CREATE INDEX idx_eventos_data          ON eventos(data);
CREATE INDEX idx_campanhas_evento      ON campanhas(evento_id);
CREATE INDEX idx_mtc_campanha          ON metricas_campanha(campanha_id);
CREATE INDEX idx_mtd_data              ON metricas_diarias(data);
CREATE INDEX idx_dem_campanha_dim      ON demografia_entrega(campanha_id, dimensao);
CREATE INDEX idx_reservas_evento       ON reservas(evento_id);
CREATE INDEX idx_financeiro_evento     ON financeiro(evento_id);
CREATE INDEX idx_conteudo_evento       ON conteudo_calendario(evento_id);
CREATE INDEX idx_aprendizados_status   ON aprendizados(status);
