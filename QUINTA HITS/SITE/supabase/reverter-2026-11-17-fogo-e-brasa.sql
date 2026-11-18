-- Reverte migracao-2026-11-17-fogo-e-brasa.sql: apaga as reservas, os canais, as regras, a noite, as mesas e a casa
-- Fogo e Brasa. As outras casas ficam como estão. Rode ANTES de publicar um site sem o Fogo e Brasa.
delete from reservas where edicao_id in (select id from edicoes where casa = 'fogo-e-brasa');
delete from edicoes_mesas where edicao_id in (select id from edicoes where casa = 'fogo-e-brasa');
delete from edicoes_regras where edicao_id in (select id from edicoes where casa = 'fogo-e-brasa');
delete from edicoes where casa = 'fogo-e-brasa';
delete from mesas where casa = 'fogo-e-brasa';
delete from casas where id = 'fogo-e-brasa';
