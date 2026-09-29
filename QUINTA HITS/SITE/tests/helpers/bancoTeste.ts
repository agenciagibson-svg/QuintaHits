import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Banco dos testes: PostgreSQL 17 EM MEMÓRIA (PGlite) com o schema.sql e a migração REAIS do projeto,
 * mais um adaptador mínimo que fala a linguagem do supabase-js (from/select/insert/update/eq/...).
 * Assim o código de produção roda contra as restrições reais (índices únicos, checks) sem rede e sem
 * nenhuma credencial. Não é o Supabase: não exercita PostgREST nem os papéis reais (limite documentado).
 */

const DIR_SUPABASE = fileURLToPath(new URL("../../supabase/", import.meta.url));
const ler = (arquivo: string) => readFileSync(DIR_SUPABASE + arquivo, "utf8");

// schema.sql pede a extensão pgcrypto; no Postgres 13+ gen_random_uuid() já é nativo.
const BASE = ler("schema.sql").replace(/create extension if not exists pgcrypto;/i, "");
const MIGRACAO = ler("migracao-2026-09-21-agente-whatsapp.sql");
const MIGRACAO_PARTE2 = ler("migracao-2026-09-21-parte2-site-e-atendimento.sql");
const MIGRACAO_PLANTA = ler("migracao-2026-09-29-planta-do-salao.sql");

export type ErroBanco = { code: string; message: string; details: string | null; hint: string | null };
type Resposta<T> = { data: T; error: ErroBanco | null; count: number | null };

const TABELAS_DE_DADOS = [
  "wa_notas_internas", "reservas_historico", "reservas", "edicoes_mesas", "edicoes_regras", "wa_fila_tentativas", "wa_fila_saida",
  "wa_mensagens", "wa_transferencias", "wa_conversas", "wa_contatos", "wa_webhook_eventos", "auditoria",
  "wa_config", "mesas", "site_config", "edicoes",
];

// Relações "embutidas" que o código atual usa em select (ex.: `mesas(numero)`): tabela -> coluna de ligação.
const LIGACAO: Record<string, string> = { mesas: "mesa_id", edicoes: "edicao_id", wa_contatos: "contato_id", wa_conversas: "conversa_id" };

const aspas = (nome: string) => `"${nome.replace(/"/g, '""')}"`;

/** "2026-09-21 12:00:00+00" -> "2026-09-21T12:00:00+00:00" (formato do PostgREST). */
function normalizaTimestamp(v: string): string {
  const t = v.replace(" ", "T");
  return /[+-]\d\d$/.test(t) ? `${t}:00` : t;
}
const PARSERS = { 1082: (v: string) => v, 1114: normalizaTimestamp, 1184: normalizaTimestamp };

function divideColunas(texto: string): string[] {
  const itens: string[] = [];
  let nivel = 0, atual = "";
  for (const c of texto) {
    if (c === "(") nivel++;
    if (c === ")") nivel--;
    if (c === "," && nivel === 0) { itens.push(atual.trim()); atual = ""; } else atual += c;
  }
  if (atual.trim()) itens.push(atual.trim());
  return itens;
}

type Modo = "select" | "insert" | "update" | "delete" | "upsert";

class Consulta<T = unknown> implements PromiseLike<Resposta<T>> {
  private modo: Modo = "select";
  private colunas = "*";
  private valores: Record<string, unknown>[] = [];
  private filtros: string[] = [];
  private params: unknown[] = [];
  private ordens: string[] = [];
  private limite: number | null = null;
  private retorna = false;
  private contagem = false;
  private soContagem = false;
  private unica: "single" | "maybe" | null = null;
  private conflito: { colunas: string[]; ignorar: boolean } | null = null;

  constructor(private pg: PGlite, private tabela: string) {}

  private p(v: unknown): string { this.params.push(v); return `$${this.params.length}`; }

  select(colunas = "*", opcoes?: { count?: string; head?: boolean }) {
    if (this.modo === "select") this.colunas = colunas;
    else { this.retorna = true; this.colunas = colunas; }
    if (opcoes?.count) this.contagem = true;
    if (opcoes?.head) this.soContagem = true;
    return this;
  }
  insert(v: Record<string, unknown> | Record<string, unknown>[]) { this.modo = "insert"; this.valores = Array.isArray(v) ? v : [v]; return this; }
  upsert(v: Record<string, unknown> | Record<string, unknown>[], o?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    this.modo = "upsert"; this.valores = Array.isArray(v) ? v : [v];
    this.conflito = { colunas: (o?.onConflict ?? "id").split(",").map((c) => c.trim()), ignorar: !!o?.ignoreDuplicates };
    return this;
  }
  update(v: Record<string, unknown>) { this.modo = "update"; this.valores = [v]; return this; }
  delete() { this.modo = "delete"; return this; }

  eq(c: string, v: unknown) { this.filtros.push(`${aspas(c)} = ${this.p(v)}`); return this; }
  neq(c: string, v: unknown) { this.filtros.push(`${aspas(c)} <> ${this.p(v)}`); return this; }
  gt(c: string, v: unknown) { this.filtros.push(`${aspas(c)} > ${this.p(v)}`); return this; }
  gte(c: string, v: unknown) { this.filtros.push(`${aspas(c)} >= ${this.p(v)}`); return this; }
  lt(c: string, v: unknown) { this.filtros.push(`${aspas(c)} < ${this.p(v)}`); return this; }
  lte(c: string, v: unknown) { this.filtros.push(`${aspas(c)} <= ${this.p(v)}`); return this; }
  like(c: string, v: string) { this.filtros.push(`${aspas(c)} like ${this.p(v)}`); return this; }
  is(c: string, v: null | boolean) { this.filtros.push(`${aspas(c)} is ${v === null ? "null" : v ? "true" : "false"}`); return this; }
  not(c: string, op: string, v: unknown) {
    if (op === "is") this.filtros.push(`${aspas(c)} is not ${v === null ? "null" : String(v)}`);
    else if (op === "eq") this.filtros.push(`${aspas(c)} <> ${this.p(v)}`);
    else throw new Error(`Adaptador de teste: not(${op}) não suportado`);
    return this;
  }
  in(c: string, lista: unknown[]) {
    if (lista.length === 0) { this.filtros.push("false"); return this; }
    this.filtros.push(`${aspas(c)} in (${lista.map((v) => this.p(v)).join(", ")})`);
    return this;
  }
  order(c: string, o?: { ascending?: boolean }) { this.ordens.push(`${aspas(c)} ${o?.ascending === false ? "desc" : "asc"}`); return this; }
  limit(n: number) { this.limite = n; return this; }
  single() { this.unica = "single"; return this; }
  maybeSingle() { this.unica = "maybe"; return this; }

  private listaSelect(): string {
    if (this.colunas.trim() === "*") return "*";
    return divideColunas(this.colunas).map((item) => {
      const m = /^(\w+)\((.*)\)$/.exec(item);
      if (!m) return aspas(item);
      const [, rel, cols] = m;
      const fk = LIGACAO[rel];
      if (!fk) throw new Error(`Adaptador de teste: relação "${rel}" desconhecida`);
      return `(select to_json(x) from (select ${cols} from ${aspas(rel)} where ${aspas(rel)}.id = ${aspas(this.tabela)}.${aspas(fk)}) x) as ${aspas(rel)}`;
    }).join(", ");
  }

  private sql(): string {
    const onde = this.filtros.length ? ` where ${this.filtros.join(" and ")}` : "";
    const T = aspas(this.tabela);
    const retorno = this.retorna ? ` returning ${this.listaSelect()}` : "";
    if (this.modo === "select") {
      if (this.soContagem) return `select count(*)::int as n from ${T}${onde}`;
      const ord = this.ordens.length ? ` order by ${this.ordens.join(", ")}` : "";
      // Sem limite explícito, single()/maybeSingle() buscam 2 linhas só para detectar "mais de uma".
      const n = this.limite ?? (this.unica ? 2 : null);
      return `select ${this.listaSelect()} from ${T}${onde}${ord}${n !== null ? ` limit ${n}` : ""}`;
    }
    if (this.modo === "delete") return `delete from ${T}${onde}${retorno}`;
    if (this.modo === "update") {
      const [v] = this.valores;
      const sets = Object.entries(v).map(([c, val]) => `${aspas(c)} = ${this.p(this.serializa(val))}`).join(", ");
      return `update ${T} set ${sets}${onde}${retorno}`;
    }
    // insert / upsert
    const cols = [...new Set(this.valores.flatMap((r) => Object.keys(r)))];
    const linhas = this.valores.map((r) => `(${cols.map((c) => (c in r ? this.p(this.serializa(r[c])) : "default")).join(", ")})`).join(", ");
    let sql = `insert into ${T} (${cols.map(aspas).join(", ")}) values ${linhas}`;
    if (this.modo === "upsert" && this.conflito) {
      const alvo = this.conflito.colunas.map(aspas).join(", ");
      if (this.conflito.ignorar) sql += ` on conflict (${alvo}) do nothing`;
      else sql += ` on conflict (${alvo}) do update set ${cols.filter((c) => !this.conflito!.colunas.includes(c)).map((c) => `${aspas(c)} = excluded.${aspas(c)}`).join(", ")}`;
    }
    return sql + retorno;
  }

  private serializa(v: unknown): unknown {
    // objetos simples (jsonb) viram JSON; arrays e datas seguem como estão
    if (v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date)) return JSON.stringify(v);
    return v;
  }

  async executa(): Promise<Resposta<T>> {
    try {
      const sql = this.sql();
      const r = await this.pg.query<Record<string, unknown>>(sql, this.params, { parsers: PARSERS });
      if (this.soContagem) return { data: null as T, error: null, count: Number(r.rows[0]?.n ?? 0) };
      const linhas = r.rows;
      if (this.unica) {
        if (this.unica === "single" && linhas.length !== 1) {
          return { data: null as T, count: null, error: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: `${linhas.length} linhas`, hint: null } };
        }
        if (this.unica === "maybe" && linhas.length > 1) {
          return { data: null as T, count: null, error: { code: "PGRST116", message: "multiple rows returned", details: `${linhas.length} linhas`, hint: null } };
        }
        return { data: (linhas[0] ?? null) as T, error: null, count: this.contagem ? linhas.length : null };
      }
      const semRetorno = this.modo !== "select" && !this.retorna;
      return { data: (semRetorno ? null : linhas) as T, error: null, count: this.contagem ? (semRetorno ? r.affectedRows ?? 0 : linhas.length) : null };
    } catch (e) {
      const err = e as { code?: string; message?: string; detail?: string; hint?: string };
      return { data: null as T, count: null, error: { code: err.code ?? "XX000", message: err.message ?? String(e), details: err.detail ?? null, hint: err.hint ?? null } };
    }
  }

  then<R1 = Resposta<T>, R2 = never>(ok?: ((v: Resposta<T>) => R1 | PromiseLike<R1>) | null, ko?: ((r: unknown) => R2 | PromiseLike<R2>) | null): PromiseLike<R1 | R2> {
    return this.executa().then(ok, ko);
  }
}

export type BancoTeste = {
  pg: PGlite;
  /** Cliente com a mesma interface do supabase-js (só o subconjunto que o projeto usa). */
  supabase: SupabaseClient;
  /** SQL direto (consultas de conferência e preparação de cenário). */
  sql: <T = Record<string, unknown>>(texto: string, params?: unknown[]) => Promise<T[]>;
  /** Apaga TODOS os dados e devolve as linhas únicas de configuração ao padrão. */
  limpar: () => Promise<void>;
};

/** `migracao: false` = banco antigo (sem nada do agente); `parte2: false` = só a parte 1 aplicada (estado do banco antes da parte 2). */
export async function criarBancoTeste(opcoes: { migracao?: boolean; parte2?: boolean; planta?: boolean } = {}): Promise<BancoTeste> {
  const pg = new PGlite();
  await pg.exec("create role anon; create role authenticated; create role service_role;");
  await pg.exec(BASE);
  if (opcoes.migracao !== false) await pg.exec(MIGRACAO);
  if (opcoes.migracao !== false && opcoes.parte2 !== false) await pg.exec(MIGRACAO_PARTE2);
  if (opcoes.planta !== false) await pg.exec(MIGRACAO_PLANTA);
  const temMigracao = opcoes.migracao !== false;

  const supabase = { from: (tabela: string) => new Consulta(pg, tabela) } as unknown as SupabaseClient;
  const sql = async <T = Record<string, unknown>>(texto: string, params: unknown[] = []) =>
    (await pg.query<Record<string, unknown>>(texto, params, { parsers: PARSERS })).rows as T[];

  const limpar = async () => {
    const existentes = (await sql<{ tablename: string }>("select tablename from pg_tables where schemaname = 'public'")).map((r) => r.tablename);
    const alvo = TABELAS_DE_DADOS.filter((t) => existentes.includes(t));
    await pg.exec(`truncate table ${alvo.map(aspas).join(", ")} restart identity cascade`);
    await pg.exec("insert into site_config (id) values (1)");
    if (temMigracao) await pg.exec("insert into wa_config (id) values (1)");
  };
  await limpar();
  return { pg, supabase, sql, limpar };
}
