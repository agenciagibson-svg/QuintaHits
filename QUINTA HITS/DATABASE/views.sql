-- =====================================================================
-- QUINTA HITS — VIEWS ANALÍTICAS
-- Aplicadas automaticamente por build_db.py depois da carga dos CSVs.
-- =====================================================================

DROP VIEW IF EXISTS vw_funil_edicao;
CREATE VIEW vw_funil_edicao AS
SELECT
  e.id                              AS evento_id,
  e.data,
  e.tema,
  a.nome_artistico                  AS artista,
  e.status,
  COALESCE(SUM(m.alcance),0)        AS alcance_pago,
  COALESCE(SUM(m.impressoes),0)     AS impressoes_pago,
  COALESCE(SUM(m.cliques_link),0)   AS cliques_link,
  COALESCE(SUM(m.visitas_site),0)   AS visitas_site,
  COALESCE(SUM(m.gasto),0)          AS gasto_trafego,
  (SELECT COUNT(*) FROM reservas r WHERE r.evento_id = e.id AND r.status IN ('confirmada','realizada')) AS reservas_confirmadas,
  e.mesas_reservadas,
  e.publico_presente,
  ROUND(CASE WHEN SUM(m.alcance)      > 0 THEN 100.0*SUM(m.cliques_link)/SUM(m.alcance) END, 2) AS taxa_clique_sobre_alcance_pct,
  ROUND(CASE WHEN SUM(m.cliques_link) > 0 THEN 100.0*SUM(m.visitas_site)/SUM(m.cliques_link) END, 2) AS taxa_chegada_site_pct,
  ROUND(CASE WHEN SUM(m.visitas_site) > 0 THEN SUM(m.gasto)/SUM(m.visitas_site) END, 2)            AS custo_por_visita,
  ROUND(CASE WHEN e.publico_presente  > 0 THEN SUM(m.gasto)/e.publico_presente END, 2)             AS custo_por_presente
FROM eventos e
LEFT JOIN artistas a          ON a.id = e.artista_principal_id
LEFT JOIN campanhas c         ON c.evento_id = e.id
LEFT JOIN metricas_campanha m ON m.campanha_id = c.id
GROUP BY e.id
ORDER BY e.data DESC;

DROP VIEW IF EXISTS vw_desempenho_campanha;
CREATE VIEW vw_desempenho_campanha AS
SELECT
  c.id                AS campanha_id,
  c.nome,
  c.evento_id,
  e.data              AS data_evento,
  c.tipo,
  c.objetivo,
  c.status,
  c.duracao_dias,
  c.orcamento_previsto,
  c.orcamento_gasto,
  ROUND(CASE WHEN c.orcamento_previsto > 0 THEN 100.0*c.orcamento_gasto/c.orcamento_previsto END, 1) AS pct_orcamento_entregue,
  m.impressoes, m.alcance,
  ROUND(CASE WHEN m.alcance > 0 THEN 1.0*m.impressoes/m.alcance END, 2) AS frequencia_calc,
  m.cliques_link, m.visitas_site,
  ROUND(CASE WHEN m.impressoes  > 0 THEN 100.0*m.cliques_link/m.impressoes END, 2) AS ctr_pct,
  ROUND(CASE WHEN m.cliques_link > 0 THEN m.gasto/m.cliques_link END, 2)           AS cpc,
  ROUND(CASE WHEN m.impressoes  > 0 THEN 1000.0*m.gasto/m.impressoes END, 2)       AS cpm,
  m.custo_por_visita,
  ROUND(CASE WHEN m.video_inicios > 0 THEN 100.0*m.video_3s/m.video_inicios END, 1) AS retencao_3s_pct,
  m.curtidas, m.comentarios, m.visitas_perfil
FROM campanhas c
LEFT JOIN eventos e           ON e.id = c.evento_id
LEFT JOIN metricas_campanha m ON m.campanha_id = c.id
ORDER BY e.data DESC;

DROP VIEW IF EXISTS vw_demografia;
CREATE VIEW vw_demografia AS
SELECT
  d.campanha_id, c.evento_id, e.data AS data_evento,
  d.dimensao, d.segmento, d.alcance, d.percentual_alcance, d.cliques, d.resultados,
  ROUND(CASE WHEN d.alcance > 0 THEN 100.0*d.cliques/d.alcance END, 2) AS taxa_clique_pct
FROM demografia_entrega d
LEFT JOIN campanhas c ON c.id = d.campanha_id
LEFT JOIN eventos e   ON e.id = c.evento_id
ORDER BY d.campanha_id, d.dimensao, d.percentual_alcance DESC;

DROP VIEW IF EXISTS vw_financeiro_edicao;
CREATE VIEW vw_financeiro_edicao AS
SELECT
  e.id AS evento_id, e.data, e.tema,
  ROUND(COALESCE(SUM(CASE WHEN f.natureza='receita' THEN f.valor END),0),2) AS receita_total,
  ROUND(COALESCE(SUM(CASE WHEN f.natureza='custo'   THEN f.valor END),0),2) AS custo_total,
  ROUND(COALESCE(SUM(CASE WHEN f.categoria='trafego_pago' THEN f.valor END),0),2) AS custo_trafego,
  ROUND(COALESCE(SUM(CASE WHEN f.categoria='cache_artista' THEN f.valor END),0),2) AS custo_cache,
  ROUND(COALESCE(SUM(CASE WHEN f.natureza='receita' THEN f.valor END),0)
      - COALESCE(SUM(CASE WHEN f.natureza='custo'   THEN f.valor END),0),2) AS resultado,
  ROUND(CASE WHEN COALESCE(SUM(CASE WHEN f.natureza='custo' THEN f.valor END),0) > 0
    THEN 100.0*(COALESCE(SUM(CASE WHEN f.natureza='receita' THEN f.valor END),0)
              - SUM(CASE WHEN f.natureza='custo' THEN f.valor END))
              / SUM(CASE WHEN f.natureza='custo' THEN f.valor END) END, 1) AS roi_pct,
  e.publico_presente,
  ROUND(CASE WHEN e.publico_presente > 0
    THEN COALESCE(SUM(CASE WHEN f.natureza='receita' THEN f.valor END),0)/e.publico_presente END,2) AS receita_por_presente
FROM eventos e
LEFT JOIN financeiro f ON f.evento_id = e.id
GROUP BY e.id
ORDER BY e.data DESC;

DROP VIEW IF EXISTS vw_agenda;
CREATE VIEW vw_agenda AS
SELECT
  e.id AS evento_id, e.data, e.dia_semana, e.tema,
  a.nome_artistico AS artista, a.instagram AS artista_instagram,
  e.status,
  (SELECT COUNT(*) FROM campanhas c  WHERE c.evento_id = e.id) AS campanhas_vinculadas,
  (SELECT COUNT(*) FROM criativos cr WHERE cr.evento_id = e.id AND cr.status IN ('aprovado','publicado')) AS criativos_prontos,
  (SELECT COUNT(*) FROM conteudo_calendario cc WHERE cc.evento_id = e.id AND cc.status NOT IN ('publicado','cancelado')) AS conteudos_pendentes,
  CAST(julianday(e.data) - julianday('now','localtime') AS INTEGER) AS dias_para_evento
FROM eventos e
LEFT JOIN artistas a ON a.id = e.artista_principal_id
ORDER BY e.data;

DROP VIEW IF EXISTS vw_aprendizados_abertos;
CREATE VIEW vw_aprendizados_abertos AS
SELECT id, data, categoria, conclusao, acao_recomendada, impacto_esperado, confianca, status, evento_id, campanha_id
FROM aprendizados
WHERE status IN ('aberto','em_teste')
ORDER BY CASE impacto_esperado WHEN 'alto' THEN 1 WHEN 'medio' THEN 2 ELSE 3 END,
         CASE confianca WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END;

DROP VIEW IF EXISTS vw_conteudo_pendente;
CREATE VIEW vw_conteudo_pendente AS
SELECT cc.id, cc.data_prevista, cc.canal, cc.pilar, cc.tema, cc.status, cc.responsavel,
       e.data AS data_evento, cc.posicao_grid
FROM conteudo_calendario cc
LEFT JOIN eventos e ON e.id = cc.evento_id
WHERE cc.status NOT IN ('publicado','cancelado')
ORDER BY cc.data_prevista;

DROP VIEW IF EXISTS vw_historico_semanal;
CREATE VIEW vw_historico_semanal AS
SELECT
  e.data, e.id AS evento_id, a.nome_artistico AS artista, e.tema,
  f.gasto_trafego, f.alcance_pago, f.cliques_link, f.visitas_site,
  f.custo_por_visita, e.mesas_reservadas, e.publico_presente,
  f.custo_por_presente, fin.resultado AS resultado_financeiro
FROM eventos e
LEFT JOIN artistas a            ON a.id = e.artista_principal_id
LEFT JOIN vw_funil_edicao f     ON f.evento_id = e.id
LEFT JOIN vw_financeiro_edicao fin ON fin.evento_id = e.id
WHERE e.status = 'realizado'
ORDER BY e.data;
