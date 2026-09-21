/**
 * Limite de tentativas em memória (janela deslizante). Simples e sem dependência externa.
 * LIMITE CONHECIDO: vale por instância do servidor (em ambiente serverless, instâncias diferentes não compartilham
 * o contador), então é uma barreira contra abuso casual, não uma garantia; a proteção principal do login segue sendo o
 * Supabase Auth e a do formulário de reserva, o Turnstile.
 */
const tentativas = new Map<string, number[]>();

/** Registra uma tentativa e diz se passou do limite (`max` tentativas em `janelaMs`). */
export function limiteExcedido(chave: string, max: number, janelaMs: number, agora = Date.now()): boolean {
  const recentes = (tentativas.get(chave) ?? []).filter((t) => agora - t < janelaMs);
  recentes.push(agora);
  tentativas.set(chave, recentes);
  // Evita crescer sem fim: descarta chaves antigas de vez em quando.
  if (tentativas.size > 5000) for (const [k, v] of tentativas) if (v.every((t) => agora - t >= janelaMs)) tentativas.delete(k);
  return recentes.length > max;
}

/** Só CONSULTA (não registra): já passou do máximo dentro da janela? */
export function excedeu(chave: string, max: number, janelaMs: number, agora = Date.now()): boolean {
  return (tentativas.get(chave) ?? []).filter((t) => agora - t < janelaMs).length >= max;
}

/** Registra uma tentativa (usado só para as que FALHARAM, como senha errada). */
export function registrarTentativa(chave: string, agora = Date.now()): void {
  tentativas.set(chave, [...(tentativas.get(chave) ?? []), agora]);
}

export const _reiniciarLimites = () => tentativas.clear();
