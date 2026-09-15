-- Eficiência de cada edição: quanto custou cada visita, cada reserva e cada pessoa presente.
SELECT evento_id, data, artista, gasto_trafego, visitas_site, custo_por_visita,
       reservas_confirmadas,
       ROUND(CASE WHEN reservas_confirmadas > 0 THEN gasto_trafego/reservas_confirmadas END,2) AS custo_por_reserva,
       publico_presente, custo_por_presente,
       taxa_clique_sobre_alcance_pct, taxa_chegada_site_pct
FROM vw_funil_edicao
WHERE gasto_trafego > 0
ORDER BY data DESC;
