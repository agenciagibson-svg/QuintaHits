-- Fila de aprendizados abertos, ordenada por impacto e confiança.
SELECT a.id, a.data, a.categoria, a.conclusao, a.acao_recomendada,
       a.impacto_esperado, a.confianca, a.status,
       (SELECT GROUP_CONCAT(t.id) FROM testes t WHERE t.aprendizado_id = a.id) AS testes_vinculados
FROM vw_aprendizados_abertos a
LEFT JOIN aprendizados x ON x.id = a.id
ORDER BY CASE a.impacto_esperado WHEN 'alto' THEN 1 WHEN 'medio' THEN 2 ELSE 3 END,
         CASE a.confianca WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END;
