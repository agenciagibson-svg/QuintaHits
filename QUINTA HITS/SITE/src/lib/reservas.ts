import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { hojeISO, type Edicao } from "@/lib/edicao";
import { type MesaPublica } from "@/lib/reserva";
import { estoqueDaEdicao, mesasDoCanal } from "@/lib/disponibilidade";

// A expiração mora em lib/expiracao.ts (evita ciclo com a disponibilidade); segue exportada daqui.
export { expirarPedidosVencidos } from "@/lib/expiracao";

const CAMPOS_EDICAO = "id, data, artista, instagram, tema, genero, horario, local, status, destaque";

/** Só dá para reservar edição cadastrada, de hoje em diante, que não foi cancelada nem já realizada. */
function aceitaReserva(e: Edicao, hoje: string): boolean {
  return e.data >= hoje && (e.status === "confirmada" || e.status === "a_confirmar");
}

/** Edições abertas para reserva, da mais próxima para a mais distante. */
export async function edicoesReservaveis(agora = new Date(), limite = 6): Promise<Edicao[]> {
  const hoje = hojeISO(agora);
  const { data, error } = await supabaseAdmin()
    .from("edicoes")
    .select(CAMPOS_EDICAO)
    .gte("data", hoje)
    .order("data", { ascending: true });
  if (error) throw new Error(`Erro ao buscar edições: ${error.message}`);
  return ((data ?? []) as Edicao[]).filter((e) => aceitaReserva(e, hoje)).slice(0, limite);
}

/** A edição, se ela aceita reserva agora; senão null. */
export async function edicaoReservavel(id: string, agora = new Date()): Promise<Edicao | null> {
  const { data, error } = await supabaseAdmin().from("edicoes").select(CAMPOS_EDICAO).eq("id", id).maybeSingle();
  if (error) throw new Error(`Erro ao buscar edição: ${error.message}`);
  return data && aceitaReserva(data as Edicao, hojeISO(agora)) ? (data as Edicao) : null;
}

/**
 * Mesas que o SITE oferece e quais já estão seguradas na edição. Não devolve nada de quem reservou.
 * Usa a disponibilidade única (lib/disponibilidade.ts): sem configuração de canais, é o comportamento de sempre
 * (todas as mesas ativas); com ela, a mesa desligada para o site some do mapa.
 */
export async function mapaDaEdicao(edicaoId: string): Promise<{ mesas: MesaPublica[]; ocupadas: string[] }> {
  const estoque = await estoqueDaEdicao(edicaoId);
  const mesas = mesasDoCanal(estoque, "site").map(({ id, numero, lugares, area, x, y }) => ({ id, numero, lugares, area, x, y }));
  return { mesas, ocupadas: [...estoque.ocupadas] };
}
