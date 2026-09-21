import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { estoqueDaEdicao, mesasDoCanal, tabelaAusente, type Estoque } from "@/lib/disponibilidade";
import { edicoesReservaveis } from "@/lib/reservas";
import { registrarAuditoria } from "@/lib/auditoria";
import { CAMPOS_REGRAS, REGRAS_VAZIAS, avaliarProntidao, type Prontidao, type RegrasEdicao } from "@/lib/regrasEdicao";
import type { Edicao } from "@/lib/edicao";

const CAMPOS_EDICAO = "id, data, artista, instagram, tema, genero, horario, local, status, destaque";

export type CanalDaMesa = {
  mesa_id: string;
  numero: string;
  area: string;
  lugares_da_mesa: number;
  lugares_ajuste: number | null;
  disponivel_site: boolean;
  disponivel_whatsapp: boolean;
  disponivel_admin: boolean;
  segurada: boolean;
};

export type PainelDeRegras =
  | { migrado: false }
  | { migrado: true; edicao: Edicao | null; regras: RegrasEdicao; prontidao: Prontidao; mesas: CanalDaMesa[] };

async function lerEdicao(id: string): Promise<Edicao | null> {
  const { data, error } = await supabaseAdmin().from("edicoes").select(CAMPOS_EDICAO).eq("id", id).maybeSingle();
  if (error) throw new Error(`Erro ao buscar edição: ${error.message}`);
  return (data as Edicao | null) ?? null;
}

/** null = a tabela não existe (migração não aplicada neste banco). */
async function lerRegras(edicaoId: string): Promise<{ regras: RegrasEdicao | null } | null> {
  const { data, error } = await supabaseAdmin().from("edicoes_regras").select(CAMPOS_REGRAS.join(", ")).eq("edicao_id", edicaoId).maybeSingle();
  if (tabelaAusente(error)) return null;
  if (error) throw new Error(`Erro ao buscar regras: ${error.message}`);
  return { regras: (data as unknown as RegrasEdicao | null) ?? null };
}

function canaisDoEstoque(estoque: Estoque): CanalDaMesa[] {
  return estoque.mesas.map((m) => ({
    mesa_id: m.id,
    numero: m.numero,
    area: m.area,
    lugares_da_mesa: m.lugaresDaMesa,
    lugares_ajuste: m.lugaresAjuste,
    disponivel_site: m.canais.site,
    disponivel_whatsapp: m.canais.whatsapp,
    disponivel_admin: m.canais.admin,
    segurada: estoque.ocupadas.has(m.id),
  }));
}

/** Tudo o que o painel precisa para uma edição: regras, mesas por canal e se ela está pronta para o agente. */
export async function carregarPainelDeRegras(edicaoId: string, agora = new Date()): Promise<PainelDeRegras> {
  const lido = await lerRegras(edicaoId);
  if (!lido) return { migrado: false };
  const [edicao, estoque] = await Promise.all([lerEdicao(edicaoId), estoqueDaEdicao(edicaoId)]);
  const mesasWhatsapp = mesasDoCanal(estoque, "whatsapp").length;
  return {
    migrado: true,
    edicao,
    regras: lido.regras ?? { ...REGRAS_VAZIAS },
    prontidao: avaliarProntidao({ edicao, regras: lido.regras, mesasWhatsapp, agora }),
    mesas: canaisDoEstoque(estoque),
  };
}

export type ItemCanal = { mesa_id: string; disponivel_site: boolean; disponivel_whatsapp: boolean; disponivel_admin: boolean; lugares_ajuste: number | null };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Valida a lista de canais enviada pelo painel. */
export function validarCanais(body: unknown): { erro: string } | { itens: ItemCanal[] } {
  if (!Array.isArray(body)) return { erro: "Lista de mesas inválida." };
  const itens: ItemCanal[] = [];
  for (const x of body) {
    if (typeof x !== "object" || x === null) return { erro: "Mesa inválida." };
    const o = x as Record<string, unknown>;
    if (typeof o.mesa_id !== "string" || !UUID_RE.test(o.mesa_id)) return { erro: "Mesa inválida." };
    for (const c of ["disponivel_site", "disponivel_whatsapp", "disponivel_admin"] as const) {
      if (typeof o[c] !== "boolean") return { erro: `Campo "${c}" inválido.` };
    }
    let ajuste: number | null = null;
    if (o.lugares_ajuste !== null && o.lugares_ajuste !== undefined && o.lugares_ajuste !== "") {
      const n = Number(o.lugares_ajuste);
      if (!Number.isInteger(n) || n < 1 || n > 50) return { erro: "Lugares precisa ser um número de 1 a 50." };
      ajuste = n;
    }
    itens.push({ mesa_id: o.mesa_id, disponivel_site: o.disponivel_site as boolean, disponivel_whatsapp: o.disponivel_whatsapp as boolean, disponivel_admin: o.disponivel_admin as boolean, lugares_ajuste: ajuste });
  }
  return { itens };
}

export type ResultadoSalvar = { ok: true } | { ok: false; status: 404 | 503 | 500; erro: string };

/** Grava regras e/ou canais das mesas de uma edição. */
export async function salvarRegrasECanais(edicaoId: string, entrada: { regras?: Partial<RegrasEdicao>; canais?: ItemCanal[] }, ator = "admin"): Promise<ResultadoSalvar> {
  const db = supabaseAdmin();
  const agora = new Date().toISOString();

  if (entrada.regras && Object.keys(entrada.regras).length > 0) {
    const { error } = await db.from("edicoes_regras").upsert({ edicao_id: edicaoId, ...entrada.regras, updated_at: agora }, { onConflict: "edicao_id" });
    if (tabelaAusente(error)) return { ok: false, status: 503, erro: "A migração do agente ainda não foi aplicada neste banco." };
    if (error?.code === "23503") return { ok: false, status: 404, erro: "Edição não encontrada." };
    if (error) return { ok: false, status: 500, erro: "Não foi possível salvar as regras." };
    await registrarAuditoria({ ator, acao: "regras_edicao_atualizadas", entidade: "edicao", entidadeId: edicaoId, detalhe: { campos: Object.keys(entrada.regras) } });
  }

  if (entrada.canais && entrada.canais.length > 0) {
    const linhas = entrada.canais.map((c) => ({
      edicao_id: edicaoId,
      mesa_id: c.mesa_id,
      disponivel_site: c.disponivel_site,
      disponivel_whatsapp: c.disponivel_whatsapp,
      disponivel_admin: c.disponivel_admin,
      lugares_override: c.lugares_ajuste,
    }));
    const { error } = await db.from("edicoes_mesas").upsert(linhas, { onConflict: "edicao_id,mesa_id" });
    if (tabelaAusente(error)) return { ok: false, status: 503, erro: "A migração do agente ainda não foi aplicada neste banco." };
    if (error?.code === "23503") return { ok: false, status: 404, erro: "Edição ou mesa não encontrada." };
    if (error) return { ok: false, status: 500, erro: "Não foi possível salvar os canais das mesas." };
    await registrarAuditoria({ ator, acao: "canais_mesas_atualizados", entidade: "edicao", entidadeId: edicaoId, detalhe: { mesas: entrada.canais.length } });
  }
  return { ok: true };
}

export type EdicaoPronta = { edicao: Edicao; regras: RegrasEdicao; mesasWhatsapp: number };

/**
 * Edições em que o agente PODE atender agora: futuras, abertas para reserva e com regras completas, liberadas e com
 * mesa oferecida ao WhatsApp. Sem migração ou sem nenhuma pronta, a lista vem vazia (e o agente repassa a humano).
 */
export async function edicoesProntasParaAgente(agora = new Date(), limite = 6): Promise<EdicaoPronta[]> {
  const candidatas = await edicoesReservaveis(agora, limite);
  const prontas: EdicaoPronta[] = [];
  for (const edicao of candidatas) {
    const lido = await lerRegras(edicao.id);
    if (!lido) return [];
    const estoque = await estoqueDaEdicao(edicao.id);
    const mesasWhatsapp = mesasDoCanal(estoque, "whatsapp").length;
    const prontidao = avaliarProntidao({ edicao, regras: lido.regras, mesasWhatsapp, agora });
    if (prontidao.pronta && lido.regras) prontas.push({ edicao, regras: lido.regras, mesasWhatsapp });
  }
  return prontas;
}
