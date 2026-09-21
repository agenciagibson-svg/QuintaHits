-- QUINTA HITS — seed FICTÍCIO para o projeto Supabase de HOMOLOGAÇÃO
--
-- *** NUNCA RODAR EM PRODUÇÃO. *** Tudo aqui é inventado para teste: nomes, valores, regras e mesas.
-- Nenhum dado pessoal real. Números de WhatsApp de teste NÃO entram aqui: cadastre-os pelo painel
-- (wa_config.numeros_teste), um a um, só de pessoas que autorizaram.
--
-- Ordem no projeto de homologação:
--   1) schema.sql   2) migracao-2026-09-21-agente-whatsapp.sql
--   3) update wa_config set ambiente = 'homologacao' where id = 1;
--   4) este arquivo
-- Pode rodar mais de uma vez (idempotente).

-- Travas: só roda se o banco foi marcado como homologação e se não há reserva de gente de verdade.
do $$
begin
  if coalesce((select ambiente from wa_config where id = 1), 'producao') <> 'homologacao' then
    raise exception 'Seed recusado: este banco não está marcado como homologação. Confirme que é o projeto de HOMOLOGAÇÃO e rode: update wa_config set ambiente = ''homologacao'' where id = 1;';
  end if;
  if exists (select 1 from reservas where nome not like '[TESTE]%') then
    raise exception 'Seed recusado: existem reservas que não são de teste. Este NÃO parece um banco de homologação.';
  end if;
end $$;

-- Três quintas de 2027 (datas longe da agenda real): completa, incompleta e cancelada.
insert into edicoes (id, data, artista, instagram, tema, genero, horario, local, status, destaque) values
('2027-01-07', '2027-01-07', '[TESTE] Artista A e DJ Teste', '', '', '', '20h', 'Florindos Bar', 'confirmada', '[FICTÍCIO] Edição completa: o agente pode atender'),
('2027-01-14', '2027-01-14', '[TESTE] Artista B', '', '', '', '', 'Florindos Bar', 'confirmada', '[FICTÍCIO] Regras incompletas: o agente deve transferir para humano'),
('2027-01-21', '2027-01-21', '', '', '', '', '', 'Florindos Bar', 'cancelada', '[FICTÍCIO] Edição cancelada')
on conflict (id) do nothing;

-- Mesas fictícias (T01…T06), posições só para o mapa aparecer.
insert into mesas (numero, lugares, area, x, y, ativa) values
('T01', 2, 'Salão', 15, 20, true),
('T02', 4, 'Salão', 35, 20, true),
('T03', 4, 'Salão', 55, 20, true),
('T04', 6, 'Salão', 75, 20, true),
('T05', 8, 'Varanda', 30, 70, true),
('T06', 10, 'Varanda', 70, 70, true)
on conflict (numero) do nothing;

-- Regras: 07/01 completa e liberada; 14/01 incompleta e não liberada; 21/01 sem regra nenhuma.
insert into edicoes_regras (edicao_id, abertura, reservas_ate, tolerancia_min, cancelamento_ate_horas,
  capacidade_maxima, consumacao_minima_centavos, instrucoes_chegada, atendimento_automatico, observacoes) values
('2027-01-07', '19h', '2027-01-07T15:00:00-03:00', 15, 24, 120, 5000,
  '[FICTÍCIO] Instruções de chegada de teste.', true, '[FICTÍCIO] Valores de teste; não são a regra da casa.'),
('2027-01-14', '19h', null, 15, null, null, null, null, false, '[FICTÍCIO] Propositalmente incompleta.')
on conflict (edicao_id) do nothing;

-- Canais por mesa na edição completa: T01–T05 no site, WhatsApp e painel; T06 só no site e no painel
-- (serve para testar "mesa que o WhatsApp não oferece, mas que continua no mesmo estoque").
insert into edicoes_mesas (edicao_id, mesa_id, disponivel_site, disponivel_whatsapp, disponivel_admin)
select '2027-01-07', id, true, numero <> 'T06', true from mesas where numero in ('T01', 'T02', 'T03', 'T04', 'T05', 'T06')
on conflict (edicao_id, mesa_id) do nothing;
