-- Série histórica das edições realizadas: mídia, funil e público presente.
SELECT data, artista, tema, gasto_trafego, alcance_pago, cliques_link, visitas_site,
       custo_por_visita, mesas_reservadas, publico_presente, custo_por_presente,
       resultado_financeiro
FROM vw_historico_semanal
ORDER BY data;
