-- Auditoria da última campanha com dados lançados.
-- Uso: python3 query.py queries/01_auditoria_ultima_campanha.sql
SELECT
  d.campanha_id, d.nome, d.data_evento, d.tipo, d.objetivo, d.status,
  d.duracao_dias, d.orcamento_previsto, d.orcamento_gasto, d.pct_orcamento_entregue,
  d.impressoes, d.alcance, d.frequencia_calc, d.cliques_link, d.ctr_pct, d.cpc, d.cpm,
  d.visitas_site, d.custo_por_visita, d.retencao_3s_pct, d.curtidas, d.visitas_perfil
FROM vw_desempenho_campanha d
WHERE d.orcamento_gasto IS NOT NULL
ORDER BY d.data_evento DESC
LIMIT 1;
