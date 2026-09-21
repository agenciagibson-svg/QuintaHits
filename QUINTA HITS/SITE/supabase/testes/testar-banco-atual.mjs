// Testa o PACOTE DO BANCO ATUAL (supabase/banco-atual): foto antes/depois, aplicar (sem seed) e verificar,
// num PostgreSQL em memória que imita a produção (dados existentes, reservas em vários status).
// NÃO conecta em nenhum banco real e não lê variáveis de ambiente.
//   cd SITE/supabase/testes && npm install && npm run test:banco-atual
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const SUP = new URL("../", import.meta.url);
const ler = (f) => readFileSync(new URL(f, SUP), "utf8");
const FOTO = ler("banco-atual/1-antes-e-depois.sql");
const APLICAR = ler("banco-atual/2-aplicar.sql");
const VERIFICAR = ler("banco-atual/3-verificar.sql");
const MIGRACAO = ler("migracao-2026-09-21-agente-whatsapp.sql");
const REVERTER = ler("reverter-2026-09-21-agente-whatsapp.sql");
const BASE = ler("schema.sql").replace(/create extension if not exists pgcrypto;/i, "");

let ok = 0, falhas = 0;
const check = (nome, cond, extra = "") => {
  if (cond) { ok++; console.log("  ✓", nome); } else { falhas++; console.log("  ✗ FALHOU:", nome, extra); }
};
const erro = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };

const db = new PGlite();
await db.exec("create role anon; create role authenticated; create role service_role;");
await db.exec(BASE);
const q = async (sql, p) => (await db.query(sql, p)).rows;

console.log("1) O arquivo 2-aplicar.sql é a migração aprovada, sem seed");
check("contém a migração inteira, sem nenhuma alteração", APLICAR.includes(MIGRACAO));
check("acrescenta só a marcação de homologação (uma linha de update em wa_config)", (APLICAR.match(/^update wa_config set ambiente = 'homologacao'/gm) ?? []).length === 1);
check("não contém dados de seed (nenhum insert em edicoes ou mesas)", !/insert into (edicoes|mesas)\b/i.test(APLICAR));
check("não contém nada destrutivo (drop table, truncate, delete)", !/\b(drop table|truncate|delete from)\b/i.test(APLICAR.replace(MIGRACAO, "")) && !/\b(drop table|truncate|delete from)\b/i.test(MIGRACAO));

console.log("2) Banco 'de produção' simulado: dados existentes e foto ANTES");
await db.exec("insert into mesas (numero, lugares, area) values ('1', 4, 'Salão'), ('2', 6, 'Salão'), ('3', 8, 'Varanda')");
const [pa] = await q("select id from mesas where numero='1'");
const [pb] = await q("select id from mesas where numero='2'");
const [pc] = await q("select id from mesas where numero='3'");
await db.query("insert into reservas (edicao_id, mesa_id, nome, whatsapp, pessoas, codigo, expira_em) values ('2026-10-08', $1, 'Cliente Real 1', '34911110001', 2, 'QH-100001', now() + interval '15 minutes')", [pa.id]);
await db.query("insert into reservas (edicao_id, mesa_id, nome, whatsapp, pessoas, codigo, status, confirmada_em) values ('2026-10-15', $1, 'Cliente Real 2', '34911110002', 4, 'QH-100002', 'confirmada', now())", [pb.id]);
await db.query("insert into reservas (edicao_id, mesa_id, nome, whatsapp, pessoas, codigo, status) values ('2026-10-22', $1, 'Cliente Real 3', '34911110003', 3, 'QH-100003', 'cancelada')", [pb.id]);
const foto = async () => Object.fromEntries((await db.query(FOTO)).rows.map((r) => [r.item, r.valor]));
const antes = await foto();
check("pré-requisitos do banco atual: todos OK", Object.entries(antes).filter(([k]) => k.startsWith("PRÉ-REQUISITO")).every(([, v]) => v === "OK"), JSON.stringify(antes));
check("contagens da foto corretas (3 mesas, 3 reservas)", antes["contagem: reservas"] === "3" && antes["contagem: mesas"] === "3");
check("a foto não contém segredos: só OK/FALTA, contagens e hashes", Object.values(antes).every((v) => /^(OK|FALTA|\d+|[0-9a-f]{32}|vazio)$/.test(v)));

console.log("3) Aplicar (1ª vez) e comparar ANTES × DEPOIS");
await db.exec(APLICAR);
const depois = await foto();
const digitais = (o) => Object.entries(o).filter(([k]) => k.startsWith("impressão digital") || k.startsWith("contagem"));
check("contagens e impressões digitais de edicoes, mesas, site_config e reservas IDÊNTICAS às de antes", JSON.stringify(digitais(antes)) === JSON.stringify(digitais(depois)), JSON.stringify({ a: digitais(antes), d: digitais(depois) }));
check("a foto é somente leitura (rodar de novo dá o mesmo resultado)", JSON.stringify(await foto()) === JSON.stringify(depois));
const ver = await q(VERIFICAR);
const reprovadas = ver.filter((r) => r.resultado === "FALHA");
check(`verificação do banco atual APROVA (${ver.length - 1} checagens)`, reprovadas.length === 0 && ver.at(-1).resultado === "APROVADO", JSON.stringify(reprovadas));
check("nenhum dado fictício foi criado (mesas e edições seguem as do banco)", (await q("select count(*)::int n from mesas"))[0].n === 3 && (await q("select count(*)::int n from edicoes where id like '2027-%'"))[0].n === 0);
const cfg = (await q("select * from wa_config"))[0];
check("banco marcado como homologacao, agente e envio DESLIGADOS, restrito a testes e sem números", cfg.ambiente === "homologacao" && !cfg.agente_ativo && !cfg.envio_ativo && cfg.restringir_a_numeros_teste && cfg.numeros_teste.length === 0);
check("retenção desligada e política não validada", !cfg.limpeza_ativa && cfg.politica_retencao_validada_em === null);
check("reservas existentes ficaram com origem_reserva = 'site'", (await q("select count(*)::int n from reservas where origem_reserva = 'site'"))[0].n === 3);

console.log("4) Aplicar de novo e usar o site normalmente");
await db.exec(APLICAR);
check("aplicar DUAS vezes é seguro: mesmas impressões digitais", JSON.stringify(digitais(await foto())) === JSON.stringify(digitais(antes)));
await db.query("insert into reservas (edicao_id, mesa_id, nome, whatsapp, pessoas, codigo, expira_em) values ('2026-10-29', $1, 'Novo Pedido Site', '34922220000', 2, 'QH-200001', now() + interval '15 minutes')", [pc.id]);
check("um pedido do site é gravado normalmente e o histórico de status é registrado", (await q("select count(*)::int n from reservas_historico h join reservas r on r.id = h.reserva_id where r.codigo = 'QH-200001'"))[0].n === 1);
const dup = await erro(() => db.query("insert into reservas (edicao_id, mesa_id, nome, whatsapp, pessoas, codigo, expira_em) values ('2026-10-29', $1, 'Outro', '34933330000', 2, 'QH-200002', now() + interval '15 minutes')", [pc.id]));
check("a trava contra reserva dupla da mesma mesa continua valendo", dup?.code === "23505");

console.log("5) Segurança da verificação e reversão");
await db.exec("grant select on wa_contatos to anon");
check("verificação REPROVA se anon ganhar acesso a uma tabela nova", (await q(VERIFICAR)).at(-1).resultado === "REPROVADO");
await db.exec("revoke all on wa_contatos from anon");
await db.exec("update wa_config set ambiente = 'producao'");
check("verificação REPROVA se o banco não estiver marcado como homologação", (await q(VERIFICAR)).at(-1).resultado === "REPROVADO");
await db.exec("update wa_config set ambiente = 'homologacao'");
check("verificação volta a APROVAR depois de corrigido", (await q(VERIFICAR)).at(-1).resultado === "APROVADO");
const antesDaReversao = digitais(await foto()); // já inclui o pedido do site feito depois de aplicar
await db.exec(REVERTER);
check("REVERSÃO: as tabelas novas somem e os dados do site (inclusive o pedido novo) ficam exatamente como estavam", JSON.stringify(digitais(await foto())) === JSON.stringify(antesDaReversao) && (await q("select 1 from information_schema.tables where table_name = 'wa_conversas'")).length === 0);
await db.exec(APLICAR);
check("e a migração pode ser aplicada de novo depois da reversão", (await q(VERIFICAR)).at(-1).resultado === "APROVADO");

await db.close();
console.log(`\nRESULTADO: ${ok} verificações ok, ${falhas} falhas`);
process.exit(falhas ? 1 : 0);
