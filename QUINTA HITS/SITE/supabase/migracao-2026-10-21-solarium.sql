-- QUINTA HITS — migração (21/10/2026): nova casa, Solarium Beach Bar, e a primeira data dela na agenda.
--
-- ADITIVA e idempotente. Ainda SEM reserva pelo site (falta o mapa): a casa aparece na seção "Onde" da home e as
-- noites dela entram na agenda única. Endereço informado pela equipe em 21/10/2026 (ajustável no painel → Casa).
-- Pré-requisitos: migracao-2026-10-20-multi-casa.sql e migracao-2026-10-21-dados-das-casas.sql.
-- ORDEM: publique o site novo ANTES (o site no ar ainda não conhece o Solarium e mostraria a data como da Quinta Hits).

insert into casas (id, nome) values ('solarium', 'Solarium Beach Bar') on conflict (id) do nothing;

update casas
set endereco = 'Trevo AMBEV, Condomínio 2000 - Rodovia 452, km 9, Fazenda São Francisco Invernada, chácara 40',
    bairro = 'Represa de Miranda',
    updated_at = now()
where id = 'solarium' and endereco = '';

-- Agenda: Voo Livre em 26/12/2026 no Solarium Beach Bar.
insert into edicoes (id, data, casa, artista, local, status)
values ('2026-12-26_solarium', '2026-12-26', 'solarium', 'Voo Livre', 'Solarium Beach Bar', 'confirmada')
on conflict (id) do nothing;
