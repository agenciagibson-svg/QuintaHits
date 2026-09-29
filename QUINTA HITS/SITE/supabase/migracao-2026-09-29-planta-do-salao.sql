-- QUINTA HITS — migração (29/09/2026): planta do salão (palco, bar, entrada...) desenhada no mapa de mesas.
--
-- ADITIVA e idempotente: só acrescenta uma coluna em site_config; não altera nem apaga dados.
-- Reversão: reverter-2026-09-29-planta-do-salao.sql.
-- Formato: {"elementos": [{"id","tipo","rotulo","x","y","w","h"}]} com posições e tamanhos em % do mapa.
-- O site funciona sem esta coluna (o mapa só não mostra os elementos do salão).

alter table site_config add column if not exists planta jsonb not null default '{"elementos": []}'::jsonb;
comment on column site_config.planta is 'Elementos fixos do salão desenhados no mapa de mesas (palco, bar, entrada, banheiro...). Posições em % do mapa.';
