import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { expirarPedidosVencidos } from "@/lib/expiracao";
import { STATUS_OCUPA_MESA } from "@/lib/reserva";

/**
 * DISPONIBILIDADE ÚNICA de mesas: site, WhatsApp e painel consultam ESTA função. Não existe estoque paralelo.
 *
 * O estoque é um só: `mesas` (o que existe) + `reservas` (o que está segurado) + o índice único parcial
 * `(edicao_id, mesa_id)` do banco, que decide qualquer disputa. `edicoes_mesas` só diz QUEM PODE OFERECER
 * cada mesa em cada edição (site, WhatsApp, painel), nunca quantas existem nem quais estão livres.
 *
 * Padrão de uma mesa SEM linha em `edicoes_mesas` (é o comportamento de hoje): site e painel oferecem;
 * o WhatsApp NÃO oferece (liberação explícita). Os três canais desligados = "indisponível".
 */
export type Canal = "site" | "whatsapp" | "admin";

export type MesaDoEstoque = {
  id: string;
  numero: string;
  /** Lugares efetivos: o ajuste da edição (`lugares_override`), se houver; senão o da mesa. */
  lugares: number;
  /** Lugares cadastrados na mesa e o ajuste desta edição (null = sem ajuste), para o painel mostrar os dois. */
  lugaresDaMesa: number;
  lugaresAjuste: number | null;
  area: string;
  x: number;
  y: number;
  canais: Record<Canal, boolean>;
};

export type Estoque = {
  mesas: MesaDoEstoque[];
  /** ids das mesas seguradas (aguardando/confirmada) na edição, por QUALQUER canal. */
  ocupadas: Set<string>;
  /** false quando a migração do agente não foi aplicada (tabela ausente): vale o comportamento de hoje. */
  canaisConfigurados: boolean;
};

const PADRAO: Record<Canal, boolean> = { site: true, whatsapp: false, admin: true };

type ErroBanco = { code?: string; message?: string } | null;
/** A tabela não existe (banco sem a migração): Postgres 42P01 ou "schema cache" do PostgREST. */
export const tabelaAusente = (e: ErroBanco): boolean =>
  !!e && (e.code === "42P01" || e.code === "PGRST205" || /schema cache|does not exist/i.test(e.message ?? ""));

// Sem a migração, evita repetir a consulta que falha a cada carregamento do mapa.
let semTabelaAte = 0;
export const _reiniciarCacheDeCanais = () => {
  semTabelaAte = 0;
};

type ConfigCanal = { mesa_id: string; disponivel_site: boolean; disponivel_whatsapp: boolean; disponivel_admin: boolean; lugares_override: number | null };

async function configuracaoDosCanais(edicaoId: string): Promise<ConfigCanal[] | null> {
  if (Date.now() < semTabelaAte) return null;
  const { data, error } = await supabaseAdmin()
    .from("edicoes_mesas")
    .select("mesa_id, disponivel_site, disponivel_whatsapp, disponivel_admin, lugares_override")
    .eq("edicao_id", edicaoId);
  if (tabelaAusente(error)) {
    semTabelaAte = Date.now() + 60_000;
    return null;
  }
  if (error) throw new Error(`Erro ao buscar canais das mesas: ${error.message}`);
  return (data ?? []) as ConfigCanal[];
}

/** Lê o estoque de uma edição: mesas ativas, ocupação e a configuração de canais. Expira pedidos vencidos antes. */
export async function estoqueDaEdicao(edicaoId: string): Promise<Estoque> {
  await expirarPedidosVencidos();
  const db = supabaseAdmin();
  const [resMesas, resReservas, canais] = await Promise.all([
    db.from("mesas").select("id, numero, lugares, area, x, y").eq("ativa", true).order("numero"),
    db.from("reservas").select("mesa_id").eq("edicao_id", edicaoId).in("status", STATUS_OCUPA_MESA),
    configuracaoDosCanais(edicaoId),
  ]);
  if (resMesas.error) throw new Error(`Erro ao buscar mesas: ${resMesas.error.message}`);
  if (resReservas.error) throw new Error(`Erro ao buscar reservas: ${resReservas.error.message}`);

  const porMesa = new Map((canais ?? []).map((c) => [c.mesa_id, c]));
  const mesas: MesaDoEstoque[] = (resMesas.data ?? []).map((m) => {
    const c = porMesa.get(m.id);
    return {
      id: m.id,
      numero: m.numero,
      lugares: c?.lugares_override ?? m.lugares,
      lugaresDaMesa: m.lugares,
      lugaresAjuste: c?.lugares_override ?? null,
      area: m.area,
      x: Number(m.x),
      y: Number(m.y),
      canais: c ? { site: c.disponivel_site, whatsapp: c.disponivel_whatsapp, admin: c.disponivel_admin } : { ...PADRAO },
    };
  });
  return { mesas, ocupadas: new Set((resReservas.data ?? []).map((r) => r.mesa_id as string)), canaisConfigurados: canais !== null };
}

/** Mesas que o CANAL pode oferecer nesta edição (ocupadas ou não). O mapa do site mostra as ocupadas em cinza. */
export const mesasDoCanal = (estoque: Estoque, canal: Canal): MesaDoEstoque[] => estoque.mesas.filter((m) => m.canais[canal]);

/** Mesas LIVRES para o canal, opcionalmente com lugares suficientes para o grupo. */
export async function mesasLivres(edicaoId: string, canal: Canal, pessoas?: number): Promise<MesaDoEstoque[]> {
  const estoque = await estoqueDaEdicao(edicaoId);
  return mesasDoCanal(estoque, canal).filter((m) => !estoque.ocupadas.has(m.id) && (pessoas === undefined || m.lugares >= pessoas));
}

export type MotivoIndisponivel = "mesa_inexistente" | "canal_indisponivel" | "lugares_insuficientes" | "ocupada";

/**
 * Este canal pode reservar ESTA mesa agora? A última palavra continua sendo do índice único do banco na gravação;
 * esta checagem só dá a resposta certa ao cliente antes de tentar.
 */
export async function verificarMesa(edicaoId: string, mesaId: string, canal: Canal, pessoas: number): Promise<{ ok: true; mesa: MesaDoEstoque } | { ok: false; motivo: MotivoIndisponivel; mesa?: MesaDoEstoque }> {
  const estoque = await estoqueDaEdicao(edicaoId);
  const mesa = estoque.mesas.find((m) => m.id === mesaId);
  if (!mesa) return { ok: false, motivo: "mesa_inexistente" };
  if (!mesa.canais[canal]) return { ok: false, motivo: "canal_indisponivel", mesa };
  if (pessoas > mesa.lugares) return { ok: false, motivo: "lugares_insuficientes", mesa };
  if (estoque.ocupadas.has(mesa.id)) return { ok: false, motivo: "ocupada", mesa };
  return { ok: true, mesa };
}
