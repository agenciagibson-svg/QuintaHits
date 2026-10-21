-- QUINTA HITS — migração (21/10/2026): dados públicos das outras casas (endereço, cidade, quando, Instagram).
--
-- Usados na seção "Onde" da home e na página de reserva da casa (ex.: Harley Grill). Preenchidos no painel
-- (Casa, com a casa escolhida). Vazio = o site mostra "Em breve".
-- ADITIVA e idempotente: só acrescenta colunas em `casas`. Pré-requisito: migracao-2026-10-20-multi-casa.sql.
-- O site funciona sem estas colunas (mostra "Em breve" no endereço).

alter table casas add column if not exists endereco text not null default '';
alter table casas add column if not exists bairro text not null default '';
alter table casas add column if not exists cidade text not null default '';
alter table casas add column if not exists quando text not null default '';
alter table casas add column if not exists instagram text not null default '';

comment on column casas.endereco is 'Rua e número (ex.: "Av. Exemplo, 100"). Vazio = "Em breve" no site.';
comment on column casas.cidade is 'Cidade/UF (ex.: "Uberlândia/MG").';
comment on column casas.quando is 'Texto livre de quando funciona (ex.: "Sábados, a partir das 20h").';
comment on column casas.instagram is 'Instagram da casa, sem @.';

-- Endereço do Harley Grill informado pela equipe em 21/10/2026. Só preenche se ainda estiver vazio (rodar de novo
-- nunca desfaz o que foi mudado depois no painel).
update casas
set endereco = 'Av. Anselmo Alves dos Santos, 1096', bairro = 'Santa Mônica', cidade = 'Uberlândia/MG', updated_at = now()
where id = 'harley-grill' and endereco = '';
