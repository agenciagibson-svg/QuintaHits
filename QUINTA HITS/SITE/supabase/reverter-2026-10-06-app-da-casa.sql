-- Reverte migracao-2026-10-06-app-da-casa.sql (remove só a tabela de inscrições de notificação).
drop table if exists casa_push;
