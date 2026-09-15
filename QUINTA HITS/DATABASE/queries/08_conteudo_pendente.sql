-- O que ainda não foi publicado no calendário editorial.
SELECT id, data_prevista, canal, pilar, posicao_grid, tema, status, responsavel
FROM vw_conteudo_pendente
ORDER BY COALESCE(data_prevista,'9999-12-31');
