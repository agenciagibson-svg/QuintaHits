-- QUINTA HITS — migração (04/11/2026): valor da mesa por tamanho (ex.: 2 lugares R$ 120, 4 lugares R$ 200, 8 lugares R$ 400).
--
-- ADITIVA e idempotente. Pode rodar antes ou depois de publicar o site: sem esta coluna as reservas seguem funcionando,
-- só não dá para gravar a tabela de valores no painel.
-- Reversão: reverter-2026-11-04-valor-por-tamanho-de-mesa.sql.

alter table edicoes_regras add column if not exists precos_mesa jsonb;

alter table edicoes_regras drop constraint if exists edicoes_regras_precos_mesa_objeto;
alter table edicoes_regras add constraint edicoes_regras_precos_mesa_objeto
  check (precos_mesa is null or jsonb_typeof(precos_mesa) = 'object');

comment on column edicoes_regras.precos_mesa is 'Valor por tamanho de mesa: {"lugares": centavos}. NULL = usa preco_centavos.';
