/**
 * Telefone do cliente a partir do `wa_id` que a Meta entrega (só dígitos, com país). Sem acesso a banco.
 *
 * As reservas guardam o celular no formato nacional de 11 dígitos (DDD + 9 + 8 dígitos), o mesmo de
 * `normalizarWhatsapp`. A Meta às vezes entrega celular brasileiro sem o 9 extra (55 34 9999-8888): completamos.
 * Retorna null se não for celular brasileiro: o agente NÃO reserva nesse caso e repassa para uma pessoa.
 */
export function telefoneDoWaId(waId: string): string | null {
  const d = waId.replace(/\D/g, "");
  if (!d.startsWith("55")) return null;
  const nacional = d.slice(2);
  if (/^[1-9]{2}9\d{8}$/.test(nacional)) return nacional;
  if (/^[1-9]{2}[6-9]\d{7}$/.test(nacional)) return `${nacional.slice(0, 2)}9${nacional.slice(2)}`;
  return null;
}

/** "34999998888" -> "(34) 99999-8888"; para mostrar no painel. */
export function telefoneParaExibir(telefone: string | null): string {
  if (!telefone) return "número internacional";
  return `(${telefone.slice(0, 2)}) ${telefone.slice(2, 7)}-${telefone.slice(7)}`;
}

/** "34999998888" -> "(34) 9****-8888": mostra só o DDD e os 4 últimos dígitos. Para telas em que o número inteiro não é necessário. */
export function telefoneMascarado(telefone: string | null): string {
  if (!telefone) return "número internacional";
  return `(${telefone.slice(0, 2)}) ${telefone.slice(2, 3)}****-${telefone.slice(-4)}`;
}
