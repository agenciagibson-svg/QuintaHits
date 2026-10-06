-- QUINTA HITS — migração (06/10/2026): app da casa (/casa) — inscrições de notificação no celular do dono do bar.
--
-- ADITIVA e idempotente: só cria uma tabela nova; não altera nem apaga nada. Reversão: reverter-2026-10-06-app-da-casa.sql.
-- Sem esta tabela o app da casa funciona normalmente; só o botão "Ativar avisos" fica indisponível.

create table if not exists casa_push (
  endpoint text primary key,              -- endereço do serviço de push do navegador (Google, Apple, Mozilla, Microsoft)
  p256dh text not null,                   -- chaves públicas da inscrição (criptografia da mensagem)
  auth text not null,
  email text not null,                    -- quem ativou (login do app da casa)
  criada_em timestamptz not null default now(),
  constraint casa_push_endpoint_valido check (endpoint like 'https://%' and char_length(endpoint) <= 1000),
  constraint casa_push_chaves_validas check (char_length(p256dh) between 1 and 200 and char_length(auth) between 1 and 200)
);
comment on table casa_push is 'Celulares que recebem aviso de pedido de mesa novo (app da casa). Sem dados de clientes.';

-- Mesmo modelo de segurança das demais tabelas: RLS ligado, sem policies, sem acesso de anon/authenticated.
alter table casa_push enable row level security;
revoke all on table casa_push from anon, authenticated;
