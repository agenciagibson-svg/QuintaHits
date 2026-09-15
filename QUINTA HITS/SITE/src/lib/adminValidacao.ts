import { HORARIO_RE, ehGenero, ehStatus } from "@/lib/edicao";

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
