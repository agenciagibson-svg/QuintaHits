/**
 * Roteamento dos eventos do webhook por `phone_number_id`.
 *
 *   webhook único do app  →  assinatura  →  phone_number_id
 *     1352142871312651        → QUINTA HITS
 *     outro ID (ex.: 0200)    → NUNCA processado nem respondido: só registro sanitizado + HTTP 200
 *     ausente                 → idem
 */
export type DestinoEvento = "quinta_hits" | "ignorado_outro_numero" | "ignorado_sem_numero";

/**
 * `idEsperado` é o ID que vale como "a QUINTA HITS" neste ambiente (ver `idQuintaHitsParaRoteamento`).
 * Se for null (configuração insegura), nenhum evento é da QUINTA HITS.
 */
export function classificarDestino(phoneNumberId: string | null, idEsperado: string | null): DestinoEvento {
  if (!phoneNumberId) return "ignorado_sem_numero";
  if (idEsperado && phoneNumberId === idEsperado) return "quinta_hits";
  return "ignorado_outro_numero";
}
