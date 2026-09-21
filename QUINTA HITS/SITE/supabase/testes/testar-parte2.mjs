// Testa a MIGRAÇÃO PARTE 2 (habilitação do site, notas internas, lida_ate) num PostgreSQL em memória que imita o banco atual
// (schema + parte 1 aplicados, com dados). NÃO conecta em nenhum banco real e não lê variáveis de ambiente.
//   cd SITE/supabase/testes && npm install && npm run test:parte2
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const SUP = new URL("../", import.meta.url);
const ler = (f) => readFileSync(new URL(f, SUP), "utf8");
const BASE = ler("schema.sql").replace(/create extension if not exists pgcrypto;/i, "");
const PARTE1 = ler("migracao-2026-09-21-agente-whatsapp.sql");
const PARTE2 = ler("migracao-2026-09-21-parte2-site-e-atendimento.sql");
const REVERTER2 = ler("reverter-2026-09-21-parte2-site-e-atendimento.sql");
const VERIFICAR2 = ler("banco-atual/4-verificar-parte2.sql");

let ok = 0, falhas = 0;
const check = (nome, cond, extra = "") => { if (cond) { ok++; console.log("  ✓", nome); } else { falhas++; console.log("  ✗ FALHOU:", nome, extra); } };
const erro = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };

const db = new PGlite();
await db.exec("create role anon; create role authenticated; create role service_role;");
await db.exec(BASE);
await db.exec(PARTE1);
const q = async (sql, p) => (await db.query(sql, p)).rows;

console.log("1) Estado 'banco atual': parte 1 aplicada, dados do site presentes");
await db.exec("insert into mesas (numero, lugares, area) values ('1', 4, 'Salão'), ('2', 6, 'Salão')");
const [m1] = await q("select id from mesas where numero='1'");
await db.query("insert into reservas (edicao_id, mesa_id, nome, whatsapp, pessoas, codigo, status, confirmada_em) values ('2026-10-08', $1, 'Cliente Real', '34911110001', 2, 'QH-100001', 'confirmada', now())", [m1.id]);
await db.exec("insert into edicoes_regras (edicao_id, abertura) values ('2026-10-08', '20h')");
const digital = async () => (await q("select (select md5(string_agg(r::text, '|' order by id)) from reservas r) as r, (select md5(string_agg(m::text, '|' order by id)) from mesas m) as m, (select md5(string_agg(e::text, '|' order by id)) from edicoes e) as e, (select count(*)::int from edicoes_regras) as regras"))[0];
const antes = await digital();

console.log("2) Aplicar a parte 2");
await db.exec(PARTE2);
const depois = await digital();
check("reservas, mesas e edições IDÊNTICAS (impressão digital) antes e depois", antes.r === depois.r && antes.m === depois.m && antes.e === depois.e);
check("as regras já existentes foram preservadas e NENHUMA edição ficou liberada para o site", depois.regras === 1 && (await q("select count(*)::int n from edicoes_regras where reservas_site"))[0].n === 0);
check("aplicar DUAS vezes é seguro", !(await erro(() => db.exec(PARTE2))));
const ver = await q(VERIFICAR2);
check(`verificação da parte 2 APROVA (${ver.length - 1} checagens)`, ver.at(-1).resultado === "APROVADO" && ver.every((r) => r.resultado !== "FALHA"), JSON.stringify(ver.filter((r) => r.resultado === "FALHA")));

console.log("3) Segurança");
const priv = (await q("select has_table_privilege('anon','wa_notas_internas','SELECT,INSERT,UPDATE,DELETE') a, has_table_privilege('authenticated','wa_notas_internas','SELECT,INSERT,UPDATE,DELETE') b"))[0];
check("anon e authenticated sem acesso a wa_notas_internas", !priv.a && !priv.b);
check("RLS ligado e sem policy", (await q("select relrowsecurity from pg_class where oid = 'wa_notas_internas'::regclass"))[0].relrowsecurity && (await q("select count(*)::int n from pg_policies where tablename='wa_notas_internas'"))[0].n === 0);
await db.exec("grant select on wa_notas_internas to anon");
check("a verificação REPROVA se anon ganhar acesso", (await q(VERIFICAR2)).at(-1).resultado === "REPROVADO");
await db.exec("revoke all on wa_notas_internas from anon");

console.log("4) Regras da tabela de notas e da coluna");
await db.exec("insert into wa_contatos (wa_id, nome) values ('5534999998888', '[TESTE]')");
const [c] = await q("select id from wa_contatos limit 1");
const [conv] = await q("insert into wa_conversas (contato_id) values ($1) returning id", [c.id]);
const [tr] = await q("insert into wa_transferencias (conversa_id, motivo) values ($1, 'outro') returning id", [conv.id]);
await db.query("insert into wa_notas_internas (transferencia_id, conversa_id, autor, texto) values ($1, $2, 'equipe@exemplo.com', 'ligar amanhã')", [tr.id, conv.id]);
check("nota vazia é recusada", (await erro(() => db.query("insert into wa_notas_internas (transferencia_id, conversa_id, autor, texto) values ($1,$2,'x','')", [tr.id, conv.id])))?.code === "23514");
check("nota com mais de 1000 caracteres é recusada", (await erro(() => db.query("insert into wa_notas_internas (transferencia_id, conversa_id, autor, texto) values ($1,$2,'x',$3)", [tr.id, conv.id, "a".repeat(1001)])))?.code === "23514");
await db.exec("update edicoes_regras set reservas_site = true where edicao_id = '2026-10-08'");
check("reservas_site pode ser marcada explicitamente", (await q("select reservas_site from edicoes_regras where edicao_id='2026-10-08'"))[0].reservas_site === true);
await db.exec("update edicoes_regras set reservas_site = false");
await db.exec("delete from wa_transferencias");
check("apagar o atendimento apaga as notas (cascata)", (await q("select count(*)::int n from wa_notas_internas"))[0].n === 0);

console.log("5) Bloqueio contra reserva duplicada continua valendo");
await db.query("insert into reservas (edicao_id, mesa_id, nome, whatsapp, pessoas, codigo, expira_em) values ('2026-10-15', $1, 'A', '34922220001', 2, 'QH-200001', now() + interval '15 minutes')", [m1.id]);
check("segunda reserva ativa da mesma mesa e edição é recusada", (await erro(() => db.query("insert into reservas (edicao_id, mesa_id, nome, whatsapp, pessoas, codigo, expira_em) values ('2026-10-15', $1, 'B', '34922220002', 2, 'QH-200002', now() + interval '15 minutes')", [m1.id])))?.code === "23505");

console.log("6) Reversão da parte 2");
const meio = await digital();
await db.exec(REVERTER2);
const pos = await digital();
check("a reversão remove só o da parte 2 e preserva os dados do site e a parte 1", (await q("select to_regclass('public.wa_notas_internas') t"))[0].t === null && pos.r === meio.r && pos.m === meio.m && (await q("select to_regclass('public.wa_conversas') t"))[0].t !== null);
check("reverter DUAS vezes é seguro", !(await erro(() => db.exec(REVERTER2))));
await db.exec(PARTE2);
check("a parte 2 reaplica limpa depois da reversão", (await q(VERIFICAR2)).at(-1).resultado === "APROVADO");

await db.close();
console.log(`\nRESULTADO: ${ok} verificações ok, ${falhas} falhas`);
process.exit(falhas ? 1 : 0);
