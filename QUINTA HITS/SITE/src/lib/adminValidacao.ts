import { HORARIO_RE, ehGenero, ehStatus } from "@/lib/edicao";
import { inteiroEntre, posicaoValida } from "@/lib/reserva";

const LIMITE = 200;

type Resultado = { erro: string } | { campos: Record<string, string> };

/** Lê campos de texto opcionais: ausente = ignora; presente precisa ser string curta (sem espaços nas pontas). */
function lerTextos(body: Record<string, unknown>, nomes: readonly string[]): Resultado {
  const campos: Record<string, string> = {};
  for (const nome of nomes) {
    const v = body[nome];
    if (v === undefined) continue;
    if (typeof v !== "string") return { erro: `Campo "${nome}" inválido.` };
    const valor = v.trim();
    if (valor.length > LIMITE) return { erro: `Campo "${nome}" passa de ${LIMITE} caracteres.` };
    campos[nome] = valor;
  }
  return { campos };
}

function urlHttps(v: string): boolean {
  try {
    return new URL(v).protocol === "https:";
  } catch {
    return false;
  }
}

/** Campos editáveis de uma edição (sem id/data, que são a chave). */
export function validarEdicao(body: Record<string, unknown>): Resultado {
  const r = lerTextos(body, ["artista", "instagram", "tema", "horario", "local", "destaque", "genero", "status"]);
  if ("erro" in r) return r;
  const c = r.campos;
  if (c.instagram) c.instagram = c.instagram.replace(/^@/, "");
  if ("genero" in c && !ehGenero(c.genero)) return { erro: "Gênero inválido." };
  if ("status" in c && !ehStatus(c.status)) return { erro: "Status inválido." };
  if (c.horario && !HORARIO_RE.test(c.horario)) return { erro: 'Horário no formato "20h" ou "20h30".' };
  return r;
}

type CamposMesa = { numero?: string; lugares?: number; area?: string; x?: number; y?: number; ativa?: boolean };

/** Campos de uma mesa do mapa. Ausente = não muda. */
export function validarMesa(body: Record<string, unknown>): { erro: string } | { campos: CamposMesa } {
  const campos: CamposMesa = {};
  if (body.numero !== undefined) {
    const numero = typeof body.numero === "string" ? body.numero.trim() : "";
    if (!numero || numero.length > 20) return { erro: "Número da mesa inválido (até 20 caracteres)." };
    campos.numero = numero;
  }
  if (body.area !== undefined) {
    if (typeof body.area !== "string" || body.area.trim().length > 60) return { erro: "Área inválida (até 60 caracteres)." };
    campos.area = body.area.trim();
  }
  if (body.lugares !== undefined) {
    const lugares = inteiroEntre(body.lugares, 1, 50);
    if (lugares === null) return { erro: "Lugares precisa ser um número de 1 a 50." };
    campos.lugares = lugares;
  }
  for (const eixo of ["x", "y"] as const) {
    if (body[eixo] === undefined) continue;
    const valor = posicaoValida(body[eixo]);
    if (valor === null) return { erro: "Posição da mesa fora do mapa." };
    campos[eixo] = valor;
  }
  if (body.ativa !== undefined) {
    if (typeof body.ativa !== "boolean") return { erro: 'Campo "ativa" inválido.' };
    campos.ativa = body.ativa;
  }
  return { campos };
}

/** Campos da configuração da casa (linha única site_config). */
export function validarConfig(body: Record<string, unknown>): Resultado {
  const r = lerTextos(body, ["casa_endereco", "casa_bairro", "casa_instagram", "reserva_url", "horario_padrao"]);
  if ("erro" in r) return r;
  const c = r.campos;
  if (c.casa_instagram) c.casa_instagram = c.casa_instagram.replace(/^@/, "");
  if (c.horario_padrao && !HORARIO_RE.test(c.horario_padrao)) return { erro: 'Horário padrão no formato "20h" ou "20h30".' };
  if (c.reserva_url && !urlHttps(c.reserva_url)) return { erro: "O link de reserva precisa começar com https://" };
  return r;
}

export type CamposAbertura = { reservas_abrem_dia: number | null; reservas_abrem_hora: string | null };

/**
 * Abertura semanal das reservas (Configurações da casa). Nenhum dos dois campos no corpo = não mexe.
 * Os dois vazios = sem dia fixo; senão precisa dos dois: dia 0 (domingo) a 6 (sábado) e horário "12h" ou "12h30".
 */
export function validarAberturaSemanal(body: Record<string, unknown>): { erro: string } | { campos: CamposAbertura | null } {
  const temDia = body.reservas_abrem_dia !== undefined;
  const temHora = body.reservas_abrem_hora !== undefined;
  if (!temDia && !temHora) return { campos: null };
  const dia = body.reservas_abrem_dia;
  const hora = typeof body.reservas_abrem_hora === "string" ? body.reservas_abrem_hora.trim() : body.reservas_abrem_hora;
  const diaVazio = dia === null || dia === "" || dia === undefined;
  const horaVazia = hora === null || hora === "" || hora === undefined;
  if (diaVazio && horaVazia) return { campos: { reservas_abrem_dia: null, reservas_abrem_hora: null } };
  if (diaVazio || horaVazia) return { erro: "Para a abertura semanal, escolha o dia e o horário (ou deixe os dois vazios)." };
  const n = typeof dia === "string" ? Number(dia) : dia;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > 6) return { erro: "Dia da abertura das reservas inválido." };
  if (typeof hora !== "string" || !HORARIO_RE.test(hora)) return { erro: 'Horário da abertura das reservas no formato "12h" ou "12h30".' };
  return { campos: { reservas_abrem_dia: n, reservas_abrem_hora: hora } };
}
