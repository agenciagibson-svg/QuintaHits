-- Estado de prontidão das próximas edições: campanha, criativos e conteúdo.
SELECT evento_id, data, dias_para_evento, artista, tema, status,
       campanhas_vinculadas, criativos_prontos, conteudos_pendentes
FROM vw_agenda
WHERE dias_para_evento >= -1
ORDER BY data;
