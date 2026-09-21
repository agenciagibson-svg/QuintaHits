// Testa schema.sql + migração + seed + verificação + reversão num PostgreSQL 17 EM MEMÓRIA (PGlite).
// NÃO conecta em nenhum banco real e não lê nenhuma variável de ambiente.
//   cd SITE/supabase/testes && npm install && npm test
//
// Limite conhecido: o PGlite atende uma conexão por vez, então a "corrida" abaixo é enfileirada pelo próprio
// PGlite. Ela prova o que o BANCO decide (índice único), não paralelismo real de conexões. A corrida real, com
// várias conexões, é testada no projeto Supabase de homologação (ver DOCS/AGENTE_RESERVAS_QUINTA_HITS.md).
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const SUP = new URL("../", import.meta.url);
const ler = (f) => readFileSync(new URL(f, SUP), "utf8");
const MIG = ler("migracao-2026-09-21-agente-whatsapp.sql");
const REV = ler("reverter-2026-09-21-agente-whatsapp.sql");
const SEED = ler("homologacao/seed-ficticio.sql");
const VERIFICAR = ler("homologacao/verificar-homologacao.sql");
// schema.sql pede a extensão pgcrypto; no Postgres 13+ gen_random_uuid() já é nativo, então o teste dispensa a extensão.
const BASE = ler("schema.sql").replace(/create extension if not exists pgcrypto;/i, "");

let ok = 0, falhas = 0;
const check = (nome, cond, extra = "") => {
  if (cond) { ok++; console.log("  ✓", nome); } else { falhas++; console.log("  ✗ FALHOU:", nome, extra); }
};
const erro = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };

const db = new PGlite();
// Papéis que o Supabase já tem; o PGlite não.
await db.exec("create role anon; create role authenticated; create role service_role;");
const q = async (sql, p) => (await db.query(sql, p)).rows;
const contagem = async (t) => Number((await q(`select count(*)::int n from ${t}`))[0].n);
const existeTabela = async (t) => (await q("select 1 from information_schema.tables where table_name = $1", [t])).length > 0;
const existeColuna = async (t, c) => (await q("select 1 from information_schema.columns where table_name=$1 and column_name=$2", [t, c])).length > 0;
const NOVAS = ["wa_config", "edicoes_regras", "edicoes_mesas", "wa_contatos", "wa_conversas", "wa_transferencias", "wa_mensagens", "wa_webhook_eventos", "wa_fila_saida", "wa_fila_tentativas", "auditoria", "reservas_historico"];
const RES = "insert into reservas (edicao_id, mesa_id, nome, whatsapp, pessoas, origem_reserva, status) values ($1, $2, $3, '34999998888', 2, $4, $5)";

console.log("1) Base (schema.sql) e fluxo ATUAL antes da migração");
await db.exec(BASE);
await db.exec("insert into mesas (numero, lugares) values ('M1', 4), ('M2', 6), ('M3', 4)");
const [m1] = await q("select id from mesas where numero='M1'");
const [m2] = await q("select id from mesas where numero='M2'");
const [m3] = await q("select id from mesas where numero='M3'");
// Reserva "do site", exatamente como POST /api/reservas grava hoje (sem nenhuma coluna nova).
await db.query("insert into reservas (edicao_id, mesa_id, nome, whatsapp, pessoas, codigo, expira_em) values ('2026-10-08', $1, 'Cliente Site', '34999998888', 2, 'QH-111111', now() + interval '15 minutes')", [m1.id]);
check("reserva do fluxo atual gravada antes da migração", (await contagem("reservas")) === 1);

console.log("2) Migração (1ª vez) e idempotência (2ª e 3ª vezes)");
await db.exec(MIG); await db.exec(MIG); await db.exec(MIG);
for (const t of NOVAS) check(`tabela ${t} existe`, await existeTabela(t));
check("reserva antiga ganhou origem_reserva = 'site'", (await q("select origem_reserva o from reservas"))[0].o === "site");
check("reserva antiga intacta (nome, código, status)", (await q("select nome, status, codigo from reservas"))[0].codigo === "QH-111111");
const cfg = (await q("select * from wa_config"))[0];
check("wa_config nasce desligada, restrita a testes, sem números, ambiente 'producao'",
  cfg.agente_ativo === false && cfg.envio_ativo === false && cfg.restringir_a_numeros_teste === true &&
  cfg.numeros_teste.length === 0 && cfg.ambiente === "producao");
check("retenção nasce com a política do responsável (90 d / 12 m / 90 d / 30 d / 12 m / 24 m)",
  cfg.retencao_conteudo_mensagens_dias === 90 && cfg.retencao_metadados_meses === 12 && cfg.retencao_logs_erro_dias === 90 &&
  cfg.retencao_eventos_webhook_dias === 30 && cfg.anonimizar_conversas_encerradas_meses === 12 && cfg.retencao_reservas_meses === 24);
check("limpeza de retenção nasce DESLIGADA e política NÃO validada", cfg.limpeza_ativa === false && cfg.politica_retencao_validada_em === null);
const eRet = await erro(() => db.exec("update wa_config set retencao_conteudo_mensagens_dias = 0 where id = 1"));
check("retenção com valor zero é recusada", eRet?.code === "23514", eRet?.message);

console.log("3) Fluxo do site (código QH-NNNNNN) continua igual depois da migração");
const e1 = await erro(() => db.query("insert into reservas (edicao_id, mesa_id, nome, whatsapp, pessoas, codigo, expira_em) values ('2026-10-08', $1, 'Outro Cliente', '34988887777', 2, 'QH-222222', now() + interval '15 minutes')", [m1.id]));
check("mesma mesa na mesma edição continua barrada (23505)", e1?.code === "23505", e1?.message);
const e1b = await erro(() => db.query("insert into reservas (edicao_id, mesa_id, nome, whatsapp, pessoas, codigo, expira_em) values ('2026-10-08', $1, 'Outro', '34988887777', 2, 'QH-111111', now() + interval '15 minutes')", [m2.id]));
check("código QH-NNNNNN repetido entre pedidos aguardando continua barrado", e1b?.code === "23505", e1b?.message);
await db.query("insert into reservas (edicao_id, mesa_id, nome, whatsapp, pessoas, codigo, expira_em) values ('2026-10-08', $1, 'Cliente 3', '34977776666', 2, 'QH-333333', now() + interval '15 minutes')", [m2.id]);
const achada = await q("select id, whatsapp, status from reservas where codigo = 'QH-333333' order by created_at desc limit 1");
check("busca do webhook pelo código (mais recente) encontra o pedido", achada.length === 1 && achada[0].status === "aguardando");
const conf1 = await q("update reservas set status='confirmada', confirmada_em=now(), updated_at=now() where id=$1 and status = any($2) returning id", [achada[0].id, ["aguardando"]]);
const conf2 = await q("update reservas set status='confirmada', confirmada_em=now(), updated_at=now() where id=$1 and status = any($2) returning id", [achada[0].id, ["aguardando"]]);
check("confirmação do webhook: 1ª vez confirma, mensagem repetida NÃO confirma de novo", conf1.length === 1 && conf2.length === 0);
const hist = await q("select status_anterior a, status_novo n from reservas_historico h join reservas r on r.id=h.reserva_id where r.codigo='QH-333333' order by h.id");
check("gatilho gravou histórico (nova→aguardando, aguardando→confirmada)", hist.length === 2 && hist[0].a === null && hist[0].n === "aguardando" && hist[1].a === "aguardando" && hist[1].n === "confirmada", JSON.stringify(hist));
// expiração preguiçosa (expirarPedidosVencidos) e reconfirmação de pedido expirado no prazo
await db.query("insert into reservas (edicao_id, mesa_id, nome, whatsapp, pessoas, codigo, expira_em) values ('2026-10-15', $1, 'Vai Expirar', '34966665555', 2, 'QH-444444', now() - interval '1 minute')", [m3.id]);
await db.exec("update reservas set status='expirada', updated_at=now() where status='aguardando' and expira_em < now()");
check("pedido vencido vira 'expirada' (expirarPedidosVencidos)", (await q("select status s from reservas where codigo='QH-444444'"))[0].s === "expirada");
await db.query("insert into reservas (edicao_id, mesa_id, nome, whatsapp, pessoas, codigo, expira_em) values ('2026-10-15', $1, 'Pegou a Mesa', '34955554444', 2, 'QH-555555', now() + interval '15 minutes')", [m3.id]);
const [exp] = await q("select id from reservas where codigo='QH-444444'");
const eReconf = await erro(() => db.query("update reservas set status='confirmada' where id=$1 and status = any($2)", [exp.id, ["aguardando", "expirada"]]));
check("reconfirmar pedido expirado cuja mesa foi pega por outro dá 23505 (o webhook responde 'mesa liberada')", eReconf?.code === "23505", eReconf?.message);

console.log("4) Novo fluxo e CORRIDA ENTRE CANAIS sobre o mesmo estoque");
await db.exec("insert into wa_contatos (wa_id, telefone, nome) values ('5534999998888', '34999998888', 'Contato Teste')");
const [ct] = await q("select id from wa_contatos");
const e2 = await erro(() => db.query("insert into reservas (edicao_id, mesa_id, nome, whatsapp, pessoas, origem_reserva, contato_id, status) values ('2026-10-08', $1, 'Via Agente', '34999998888', 2, 'whatsapp_agent', $2, 'confirmada')", [m2.id, ct.id]));
check("WhatsApp NÃO consegue mesa já confirmada pelo site (23505)", e2?.code === "23505", e2?.message);
await db.query("insert into reservas (edicao_id, mesa_id, nome, whatsapp, pessoas, origem_reserva, contato_id, status) values ('2026-10-22', $1, 'Via Agente', '34999998888', 2, 'whatsapp_agent', $2, 'confirmada')", [m2.id, ct.id]);
const eSite = await erro(() => db.query("insert into reservas (edicao_id, mesa_id, nome, whatsapp, pessoas, codigo, expira_em) values ('2026-10-22', $1, 'Site Depois', '34988887777', 2, 'QH-666666', now() + interval '15 minutes')", [m2.id]));
check("SITE NÃO consegue mesa já reservada pelo WhatsApp (23505)", eSite?.code === "23505", eSite?.message);
const eAdm = await erro(() => db.query(RES, ["2026-10-22", m2.id, "Painel Depois", "admin", "confirmada"]));
check("PAINEL (admin) NÃO consegue mesa já reservada pelo WhatsApp (23505)", eAdm?.code === "23505", eAdm?.message);
const eMan = await erro(() => db.query(RES, ["2026-10-22", m2.id, "Manual Depois", "manual", "confirmada"]));
check("origem 'manual' também NÃO consegue a mesma mesa (23505)", eMan?.code === "23505", eMan?.message);
const e3 = await erro(() => db.query(RES, ["2026-10-29", m1.id, "X", "qualquer_coisa", "confirmada"]));
check("origem inválida é recusada (check)", e3?.code === "23514", e3?.message);
// Corrida: 12 tentativas "simultâneas" de canais diferentes na MESMA mesa e edição -> só a primeira vale.
const origens = ["site", "whatsapp_agent", "admin", "manual"];
const tentativas = Array.from({ length: 12 }, (_, i) => erro(() => db.query(RES, ["2026-11-05", m1.id, `Corrida ${i}`, origens[i % 4], "confirmada"])));
const resultados = await Promise.all(tentativas);
check("corrida de 12 tentativas de 4 canais: exatamente 1 aceita e 11 recusadas (23505)",
  resultados.filter((r) => r === null).length === 1 && resultados.filter((r) => r?.code === "23505").length === 11,
  JSON.stringify(resultados.map((r) => r?.code ?? "ok")));
const [vencedora] = await q("select origem_reserva o from reservas where edicao_id='2026-11-05' and mesa_id=$1", [m1.id]);
check("a reserva aceita é a da PRIMEIRA tentativa (canal 'site')", vencedora?.o === "site");
// Liberar a mesa (cancelamento) devolve o estoque para QUALQUER canal.
await db.exec("update reservas set status='cancelada' where edicao_id='2026-11-05'");
await db.query(RES, ["2026-11-05", m1.id, "Depois do cancelamento", "whatsapp_agent", "confirmada"]);
check("após cancelar, a mesa volta ao estoque e outro canal reserva", (await contagem("reservas where edicao_id='2026-11-05' and status='confirmada'")) === 1);

console.log("5) Conversas, transferência humana, mensagens, idempotência");
await db.query("insert into wa_conversas (contato_id) values ($1)", [ct.id]);
const e4 = await erro(() => db.query("insert into wa_conversas (contato_id) values ($1)", [ct.id]));
check("segunda conversa aberta do mesmo contato é barrada", e4?.code === "23505");
const [cv] = await q("select id from wa_conversas");
const e5 = await erro(() => db.query("update wa_conversas set estado='INVENTADO' where id=$1", [cv.id]));
check("estado fora da lista é recusado", e5?.code === "23514");
await db.query("insert into wa_transferencias (conversa_id, motivo) values ($1, 'pedido_do_cliente')", [cv.id]);
const e6 = await erro(() => db.query("insert into wa_transferencias (conversa_id, motivo) values ($1, 'reclamacao')", [cv.id]));
check("só uma transferência aberta por conversa", e6?.code === "23505");
await db.query("update wa_transferencias set status='devolvida', devolvida_em=now() where conversa_id=$1", [cv.id]);
await db.query("insert into wa_transferencias (conversa_id, motivo) values ($1, 'reclamacao')", [cv.id]);
check("após devolver ao agente, nova transferência pode abrir", (await contagem("wa_transferencias")) === 2);
await db.query("insert into wa_mensagens (wamid, conversa_id, direcao, autor, status, conteudo) values ('wamid.A', $1, 'entrada', 'cliente', 'recebida', 'oi')", [cv.id]);
const e7 = await erro(() => db.query("insert into wa_mensagens (wamid, conversa_id, direcao, autor, status) values ('wamid.A', $1, 'entrada', 'cliente', 'recebida')", [cv.id]));
check("mesmo wamid duas vezes é barrado (idempotência)", e7?.code === "23505");
await db.query("insert into wa_mensagens (wamid, conversa_id, direcao, autor, status) values (null, $1, 'saida', 'agente', 'na_fila'), (null, $1, 'saida', 'agente', 'na_fila')", [cv.id]);
check("várias saídas ainda sem wamid são permitidas", (await contagem("wa_mensagens")) === 3);
check("mensagem tem coluna de retenção do conteúdo (conteudo_removido_em) e não tem expurgar_em",
  (await existeColuna("wa_mensagens", "conteudo_removido_em")) && !(await existeColuna("wa_mensagens", "expurgar_em")));
await db.query("insert into wa_webhook_eventos (id, tipo, phone_number_id, destino) values ('wamid.A', 'message', '1352142871312651', 'quinta_hits')");
const e8 = await erro(() => db.query("insert into wa_webhook_eventos (id, tipo, phone_number_id, destino) values ('wamid.A', 'message', '1352142871312651', 'quinta_hits')"));
check("evento de webhook repetido é barrado", e8?.code === "23505");
await db.query("insert into wa_webhook_eventos (id, tipo, phone_number_id, destino) values ('wamid.B', 'message', '999', 'ignorado_outro_numero')");
check("evento de outro número é registrado só como 'ignorado_outro_numero'", (await q("select destino d from wa_webhook_eventos where id='wamid.B'"))[0].d === "ignorado_outro_numero");
const eDest = await erro(() => db.query("insert into wa_webhook_eventos (id, tipo, phone_number_id, destino) values ('wamid.C', 'message', '999', 'respondido')"));
check("destino de evento fora da lista (ex.: 'respondido') é recusado", eDest?.code === "23514");
await db.query("insert into wa_fila_saida (conversa_id, para, tipo, payload, chave_idempotencia) values ($1, '5534999998888', 'texto', '{}'::jsonb, 'k1')", [cv.id]);
const e9 = await erro(() => db.query("insert into wa_fila_saida (conversa_id, para, tipo, payload, chave_idempotencia) values ($1, '5534999998888', 'texto', '{}'::jsonb, 'k1')", [cv.id]));
check("mesma chave de envio duas vezes é barrada (sem disparo duplicado)", e9?.code === "23505");
check("wa_id inválido é recusado", (await erro(() => db.query("insert into wa_contatos (wa_id) values ('abc')")))?.code === "23514");
await db.query("insert into wa_contatos (wa_id, nome) values ('anon-0123456789abcdef0123456789abcdef', '')");
check("marcador de contato anonimizado ('anon-<32 hex>') é aceito", (await contagem("wa_contatos")) === 2);

console.log("6) Mesas por canal (uma única fonte de estoque)");
await db.query("insert into edicoes_mesas (edicao_id, mesa_id) values ('2026-10-29', $1)", [m1.id]);
const [padrao] = await q("select disponivel_site s, disponivel_whatsapp w, disponivel_admin a from edicoes_mesas where edicao_id='2026-10-29'");
check("padrão do canal: site e painel oferecem, WhatsApp NÃO (liberação explícita)", padrao.s === true && padrao.w === false && padrao.a === true);
await db.exec("update edicoes_mesas set disponivel_site=false, disponivel_whatsapp=false, disponivel_admin=false where edicao_id='2026-10-29'");
check("'indisponível' = os três canais desligados é aceito", (await contagem("edicoes_mesas where not disponivel_site and not disponivel_whatsapp and not disponivel_admin")) === 1);
check("ajuste de lugares fora de 1–50 é recusado", (await erro(() => db.exec("update edicoes_mesas set lugares_override = 0 where edicao_id='2026-10-29'")))?.code === "23514");
check("tabela de canais não guarda estoque nem status de reserva", !(await existeColuna("edicoes_mesas", "status")) && !(await existeColuna("edicoes_mesas", "quantidade")));

console.log("7) Segurança: RLS ligado e sem acesso de anon/authenticated");
for (const t of NOVAS) check(`RLS ligado em ${t}`, (await q("select relrowsecurity r from pg_class where relname=$1", [t]))[0]?.r === true);
const grants = await q("select table_name t, grantee g from information_schema.role_table_grants where grantee in ('anon','authenticated') and table_name = any($1)", [NOVAS]);
check("anon/authenticated sem nenhuma permissão nas tabelas novas", grants.length === 0, JSON.stringify(grants));
check("nenhuma policy criada nas tabelas novas", (await q("select 1 from pg_policies where tablename = any($1)", [NOVAS])).length === 0);
check("nenhuma view criada", (await q("select 1 from information_schema.views where table_schema='public'")).length === 0);

console.log("8) Seed fictício: travas e conteúdo");
const t1 = await erro(() => db.exec(SEED));
check("seed recusado em banco marcado 'producao'", t1 && /não está marcado como homologação/.test(t1.message), t1?.message);
await db.exec("update wa_config set ambiente='homologacao' where id=1");
const t2 = await erro(() => db.exec(SEED));
check("seed recusado se existem reservas reais", t2 && /não são de teste/.test(t2.message), t2?.message);
await db.exec("delete from reservas");
await db.exec(SEED); await db.exec(SEED);
check("seed aplicado (idempotente): 3 edições fictícias, 6 mesas T01–T06", (await contagem("edicoes where id like '2027-%'")) === 3 && (await contagem("mesas where numero like 'T0%'")) === 6);
check("regras: 07/01 liberada, 14/01 não", (await q("select edicao_id, atendimento_automatico a from edicoes_regras order by 1")).map((r) => r.a).join() === "true,false");
check("07/01: 6 mesas configuradas; WhatsApp oferece 5 (T06 só site e painel); 14/01 nenhuma", (await contagem("edicoes_mesas where edicao_id='2027-01-07'")) === 6 && (await contagem("edicoes_mesas where edicao_id='2027-01-07' and disponivel_whatsapp")) === 5 && (await contagem("edicoes_mesas where edicao_id='2027-01-14'")) === 0);
check("horário de abertura inválido é recusado", (await erro(() => db.query("insert into edicoes_regras (edicao_id, abertura) values ('2027-01-21', '25h')")))?.code === "23514");

console.log("9) Estoque ÚNICO entre canais (mesas oferecidas pelo WhatsApp × site)");
const livres = (canal) => q(`select m.numero from mesas m join edicoes_mesas em on em.mesa_id = m.id
  where em.edicao_id = '2027-01-07' and em.${canal}
    and not exists (select 1 from reservas r where r.edicao_id = em.edicao_id and r.mesa_id = m.id and r.status in ('aguardando','confirmada'))
  order by m.numero`).then((r) => r.map((x) => x.numero).join(","));
check("antes de reservar: WhatsApp vê T01–T05; site vê T01–T06", (await livres("disponivel_whatsapp")) === "T01,T02,T03,T04,T05" && (await livres("disponivel_site")) === "T01,T02,T03,T04,T05,T06");
const [t05] = await q("select id from mesas where numero='T05'");
const [t06] = await q("select id from mesas where numero='T06'");
await db.query("insert into reservas (edicao_id, mesa_id, nome, whatsapp, pessoas, codigo, expira_em) values ('2027-01-07', $1, '[TESTE] Site', '34999998888', 2, 'QH-777777', now() + interval '15 minutes')", [t05.id]);
check("depois do SITE reservar T05: some da lista do WhatsApp E do site (mesmo estoque)", (await livres("disponivel_whatsapp")) === "T01,T02,T03,T04" && (await livres("disponivel_site")) === "T01,T02,T03,T04,T06");
const eOfertada = await erro(() => db.query(RES, ["2027-01-07", t05.id, "[TESTE] WhatsApp", "whatsapp_agent", "confirmada"]));
check("WhatsApp tentando T05 mesmo assim é barrado pelo banco (23505)", eOfertada?.code === "23505");
await db.query(RES, ["2027-01-07", t06.id, "[TESTE] Painel", "admin", "confirmada"]);
check("T06 (não oferecida ao WhatsApp) reservada pelo painel: continua no mesmo estoque", (await livres("disponivel_site")) === "T01,T02,T03,T04" && (await livres("disponivel_whatsapp")) === "T01,T02,T03,T04");

console.log("10) Script de verificação da homologação (verificar-homologacao.sql)");
await db.exec("delete from reservas");
const ver = await q(VERIFICAR);
const falhasVer = ver.filter((r) => r.resultado === "FALHA");
check(`verificação aprova o banco de teste (${ver.length - 1} verificações)`, falhasVer.length === 0 && ver.at(-1).verificacao === "RESULTADO GERAL" && ver.at(-1).resultado === "APROVADO", JSON.stringify(falhasVer));
await db.exec("grant select on wa_contatos to anon");
const ver2 = await q(VERIFICAR);
check("verificação REPROVA se anon ganhar acesso a uma tabela nova", ver2.at(-1).resultado === "REPROVADO" && ver2.some((r) => r.verificacao.includes("wa_contatos") && r.resultado === "FALHA"));
await db.exec("revoke all on wa_contatos from anon");
await db.exec("update wa_config set envio_ativo = true where id = 1");
check("verificação REPROVA se o envio for ligado por engano", (await q(VERIFICAR)).at(-1).resultado === "REPROVADO");
await db.exec("update wa_config set envio_ativo = false where id = 1");

console.log("11) Reversão");
await db.query("insert into reservas (edicao_id, mesa_id, nome, whatsapp, pessoas, origem_reserva, status) select '2027-01-07', id, '[TESTE] Agente', '34999998888', 2, 'whatsapp_agent', 'confirmada' from mesas where numero='T01'");
const r1 = await erro(() => db.exec(REV));
check("reversão RECUSADA enquanto há reserva do agente", r1 && /Reversão recusada/.test(r1.message), r1?.message);
check("...e nada foi removido na tentativa recusada", (await existeTabela("wa_conversas")) && (await existeColuna("reservas", "origem_reserva")));
await db.exec("delete from reservas where origem_reserva <> 'site'");
await db.exec(REV); await db.exec(REV);
for (const t of NOVAS) check(`tabela ${t} removida`, !(await existeTabela(t)));
for (const c of ["origem_reserva", "contato_id", "observacoes", "atendente"]) check(`coluna reservas.${c} removida`, !(await existeColuna("reservas", c)));
check("tabelas originais preservadas (edicoes, mesas, reservas, site_config)", (await Promise.all(["edicoes", "mesas", "reservas", "site_config"].map(existeTabela))).every(Boolean));
check("gatilho e função removidos", (await q("select 1 from pg_trigger where tgname='reservas_historico_trg'")).length === 0 && (await q("select 1 from pg_proc where proname='wa_registrar_historico_reserva'")).length === 0);
check("índice único original de reservas preservado", (await q("select 1 from pg_indexes where indexname='reservas_mesa_ocupada'")).length === 1);
await db.exec(MIG);
check("migração reaplica limpa depois da reversão", await existeTabela("wa_conversas"));

console.log(`\nRESULTADO: ${ok} verificações ok, ${falhas} falhas`);
process.exit(falhas ? 1 : 0);
