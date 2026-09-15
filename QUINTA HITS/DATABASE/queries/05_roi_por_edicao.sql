-- Resultado financeiro por edição (só é confiável com financeiro.csv preenchido).
SELECT evento_id, data, tema, receita_total, custo_total, custo_cache, custo_trafego,
       resultado, roi_pct, publico_presente, receita_por_presente
FROM vw_financeiro_edicao
ORDER BY data DESC;
