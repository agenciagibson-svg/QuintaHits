-- QUINTA HITS — migração (17/11/2026): nova casa, Fogo e Brasa (Caldas Novas/GO), mapa do salão e a noite
-- "Torresmo e Modão" com Cauã Alves em 26/12/2026, a partir das 20h. Reservas pelo site da Quinta Hits (/fogo-e-brasa).
--
-- Igual ao Harley Grill: casa própria no mesmo sistema, mesas e mapa só dela, pedidos no mesmo painel (código FB).
-- Mapa redesenhado a partir do "Mapa do Salão" enviado (lotação máxima 220 pessoas): Deck (mesas 1 a 27) e Salão
-- (33 a 52), todas de 4 lugares, e as 5 redondas de 6 lugares (53, 54, 55, 56 e 58), área "Patrocinadora".
-- A numeração é a da planta da casa (não existem 28 a 32 nem 57). Tudo ajustável no painel (Mesas).
-- Valores informados pela equipe: mesa para 4 R$ 100,00, mesa patrocinadora R$ 180,00, ingresso R$ 25,00 por pessoa.
--
-- ADITIVA e idempotente. Pré-requisitos: multi-casa (20/10), dados-das-casas (21/10) e valor-por-tamanho (04/11).
-- ORDEM: publique o site novo ANTES (o site no ar ainda não conhece o Fogo e Brasa e mostraria a data como da Quinta Hits).
-- Reversão: reverter-2026-11-17-fogo-e-brasa.sql.

insert into casas (id, nome) values ('fogo-e-brasa', 'Fogo e Brasa') on conflict (id) do nothing;

update casas set cidade = 'Caldas Novas/GO', updated_at = now() where id = 'fogo-e-brasa' and cidade = '';

insert into mesas (casa, numero, lugares, area, x, y) values
  ('fogo-e-brasa', '1', 4, 'Deck', 39.0, 27.9),
  ('fogo-e-brasa', '2', 4, 'Deck', 33.1, 27.9),
  ('fogo-e-brasa', '3', 4, 'Deck', 28.1, 25.7),
  ('fogo-e-brasa', '4', 4, 'Deck', 22.3, 25.7),
  ('fogo-e-brasa', '5', 4, 'Deck', 16.2, 27.0),
  ('fogo-e-brasa', '6', 4, 'Deck', 9.8, 31.9),
  ('fogo-e-brasa', '7', 4, 'Deck', 4.4, 41.3),
  ('fogo-e-brasa', '8', 4, 'Deck', 2.9, 52.4),
  ('fogo-e-brasa', '9', 4, 'Deck', 4.0, 61.6),
  ('fogo-e-brasa', '10', 4, 'Deck', 7.8, 70.8),
  ('fogo-e-brasa', '11', 4, 'Deck', 14.1, 77.1),
  ('fogo-e-brasa', '12', 4, 'Deck', 22.0, 79.2),
  ('fogo-e-brasa', '13', 4, 'Deck', 31.2, 73.0),
  ('fogo-e-brasa', '14', 4, 'Deck', 37.3, 73.0),
  ('fogo-e-brasa', '15', 4, 'Deck', 37.9, 61.6),
  ('fogo-e-brasa', '16', 4, 'Deck', 31.8, 61.6),
  ('fogo-e-brasa', '17', 4, 'Deck', 25.6, 61.6),
  ('fogo-e-brasa', '18', 4, 'Deck', 19.3, 61.6),
  ('fogo-e-brasa', '19', 4, 'Deck', 13.2, 61.6),
  ('fogo-e-brasa', '20', 4, 'Deck', 13.2, 50.8),
  ('fogo-e-brasa', '21', 4, 'Deck', 19.3, 50.8),
  ('fogo-e-brasa', '22', 4, 'Deck', 25.6, 50.8),
  ('fogo-e-brasa', '23', 4, 'Deck', 31.8, 50.8),
  ('fogo-e-brasa', '24', 4, 'Deck', 37.9, 50.8),
  ('fogo-e-brasa', '25', 4, 'Deck', 30.7, 40.0),
  ('fogo-e-brasa', '26', 4, 'Deck', 24.6, 40.0),
  ('fogo-e-brasa', '27', 4, 'Deck', 18.4, 40.0),
  ('fogo-e-brasa', '33', 4, 'Salão', 55.9, 32.9),
  ('fogo-e-brasa', '34', 4, 'Salão', 55.9, 41.6),
  ('fogo-e-brasa', '35', 4, 'Salão', 55.9, 50.3),
  ('fogo-e-brasa', '36', 4, 'Salão', 55.9, 59.2),
  ('fogo-e-brasa', '37', 4, 'Salão', 55.9, 67.9),
  ('fogo-e-brasa', '38', 4, 'Salão', 62.8, 67.9),
  ('fogo-e-brasa', '39', 4, 'Salão', 62.8, 59.2),
  ('fogo-e-brasa', '40', 4, 'Salão', 62.8, 50.3),
  ('fogo-e-brasa', '41', 4, 'Salão', 62.8, 41.6),
  ('fogo-e-brasa', '42', 4, 'Salão', 62.8, 32.9),
  ('fogo-e-brasa', '43', 4, 'Salão', 69.4, 35.1),
  ('fogo-e-brasa', '44', 4, 'Salão', 69.4, 43.8),
  ('fogo-e-brasa', '45', 4, 'Salão', 69.4, 52.5),
  ('fogo-e-brasa', '46', 4, 'Salão', 69.4, 61.1),
  ('fogo-e-brasa', '47', 4, 'Salão', 69.4, 69.8),
  ('fogo-e-brasa', '48', 4, 'Salão', 77.0, 37.3),
  ('fogo-e-brasa', '49', 4, 'Salão', 77.0, 46.0),
  ('fogo-e-brasa', '50', 4, 'Salão', 77.0, 54.9),
  ('fogo-e-brasa', '51', 4, 'Salão', 77.0, 63.7),
  ('fogo-e-brasa', '52', 4, 'Salão', 77.0, 72.4),
  ('fogo-e-brasa', '53', 6, 'Patrocinadora', 83.6, 91.3),
  ('fogo-e-brasa', '54', 6, 'Patrocinadora', 78.0, 89.4),
  ('fogo-e-brasa', '55', 6, 'Patrocinadora', 72.3, 87.5),
  ('fogo-e-brasa', '56', 6, 'Patrocinadora', 66.9, 85.6),
  ('fogo-e-brasa', '58', 6, 'Patrocinadora', 61.2, 83.5)
on conflict (casa, numero) do nothing;

update casas
set planta = '{"elementos": [{"id": "deck", "tipo": "area", "rotulo": "Deck", "x": 24.1, "y": 48.5, "w": 47.4, "h": 71.0}, {"id": "salao", "tipo": "area", "rotulo": "Salão", "x": 74.7, "y": 50.9, "w": 50.1, "h": 98.3}, {"id": "palco", "tipo": "palco", "rotulo": "Palco", "x": 56.2, "y": 21.8, "w": 12.8, "h": 10.6}, {"id": "rechaud", "tipo": "texto", "rotulo": "Rechaud", "x": 71.8, "y": 23.5, "w": 11.9, "h": 3.8}, {"id": "escadas", "tipo": "texto", "rotulo": "Escadas Mezanino", "x": 72.2, "y": 14.1, "w": 15.6, "h": 3.5}, {"id": "adega", "tipo": "texto", "rotulo": "Adega", "x": 80.0, "y": 18.7, "w": 6.7, "h": 3.2}, {"id": "parrilha", "tipo": "texto", "rotulo": "Parrilha", "x": 87.7, "y": 24.5, "w": 6.4, "h": 17.9}, {"id": "cozinha", "tipo": "texto", "rotulo": "Cozinha", "x": 95.6, "y": 30.0, "w": 8.4, "h": 44.1}, {"id": "bar", "tipo": "bar", "rotulo": "Bar", "x": 87.6, "y": 57.6, "w": 7.0, "h": 34.9}, {"id": "wc-masc", "tipo": "banheiro", "rotulo": "WC Masc.", "x": 97.3, "y": 58.6, "w": 4.9, "h": 12.1}, {"id": "wc-fem", "tipo": "banheiro", "rotulo": "WC Fem.", "x": 97.3, "y": 70.6, "w": 4.9, "h": 12.1}, {"id": "kids", "tipo": "area", "rotulo": "Área Kids", "x": 92.9, "y": 88.2, "w": 13.7, "h": 23.0}, {"id": "caixa", "tipo": "caixa", "rotulo": "Caixa", "x": 52.7, "y": 84.9, "w": 6.1, "h": 7.0}, {"id": "entrada-salao", "tipo": "entrada", "rotulo": "Entrada", "x": 53.9, "y": 79.5, "w": 7.8, "h": 3.5}, {"id": "entrada-rua", "tipo": "entrada", "rotulo": "Entrada da Rua", "x": 46.2, "y": 30.6, "w": 2, "h": 15.9}, {"id": "entrada-deck", "tipo": "entrada", "rotulo": "Entrada", "x": 43.6, "y": 78.3, "w": 7.2, "h": 3.5}, {"id": "tv-1", "tipo": "telao", "rotulo": "TV", "x": 36.0, "y": 22.7, "w": 7.8, "h": 2}, {"id": "tv-2", "tipo": "telao", "rotulo": "TV", "x": 34.2, "y": 79.0, "w": 7.8, "h": 2}, {"id": "tv-3", "tipo": "telao", "rotulo": "TV", "x": 50.4, "y": 56.0, "w": 2, "h": 9.5}, {"id": "tv-4", "tipo": "telao", "rotulo": "TV", "x": 83.2, "y": 46.7, "w": 2, "h": 9.5}, {"id": "tv-5", "tipo": "telao", "rotulo": "TV", "x": 83.2, "y": 68.9, "w": 2, "h": 9.5}, {"id": "parede-0", "tipo": "parede", "rotulo": "", "x": 84.1, "y": 24.5, "w": 0.4, "h": 17.9}, {"id": "parede-1", "tipo": "parede", "rotulo": "", "x": 91.1, "y": 41.5, "w": 0.4, "h": 67.1}]}'::jsonb, updated_at = now()
where id = 'fogo-e-brasa' and planta is null;

-- Agenda: Torresmo e Modão com Cauã Alves, 26/12/2026, a partir das 20h.
insert into edicoes (id, data, casa, artista, tema, horario, local, status)
values ('2026-12-26_fogo-e-brasa', '2026-12-26', 'fogo-e-brasa', 'Cauã Alves', 'Torresmo e Modão', '20h', 'Fogo e Brasa', 'confirmada')
on conflict (id) do nothing;

-- Valores da noite. Prazos (reservar até, tolerância, cancelamento) ficam para o painel: não foram informados.
-- A liberação das reservas no site também é pelo painel (Regras da noite), depois de conferir.
insert into edicoes_regras (edicao_id, abertura, capacidade_maxima, consumacao_minima_centavos, preco_centavos, precos_mesa, instrucoes_chegada)
values ('2026-12-26_fogo-e-brasa', '20h', 220, 0, 10000, '{"4": 10000, "6": 18000}'::jsonb,
        'Ingresso: R$ 25,00 por pessoa. Mesa para 4: R$ 100,00. Mesa patrocinadora: R$ 180,00.')
on conflict (edicao_id) do nothing;
