-- QUINTA HITS — migração 15/09/2026
-- Para bancos criados antes desta data: impede gênero/status fora da lista
-- (valor inválido editado direto no Supabase quebrava as páginas públicas).
-- Rode no Supabase: SQL Editor → New query → colar → Run. Pode rodar mais de uma vez.

alter table edicoes drop constraint if exists edicoes_genero_valido;
alter table edicoes add constraint edicoes_genero_valido
  check (genero in ('', 'rock', 'pop-rock', 'hits', '2000s', 'dj', 'mpb', 'special'));

alter table edicoes drop constraint if exists edicoes_status_valido;
alter table edicoes add constraint edicoes_status_valido
  check (status in ('realizada', 'confirmada', 'a_confirmar', 'cancelada'));
