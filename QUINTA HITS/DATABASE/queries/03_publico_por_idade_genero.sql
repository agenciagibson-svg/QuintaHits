-- Perfil de quem a mídia realmente alcançou, por campanha.
SELECT campanha_id, data_evento, dimensao, segmento, percentual_alcance, alcance, cliques, taxa_clique_pct
FROM vw_demografia
WHERE dimensao IN ('idade','genero','idade_genero')
ORDER BY campanha_id, dimensao, percentual_alcance DESC;
