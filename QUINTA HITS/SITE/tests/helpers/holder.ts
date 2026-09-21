import type { BancoTeste } from "./bancoTeste";

/** Ponte entre o banco de teste do arquivo e o `vi.mock("@/lib/supabaseAdmin")`, que é içado para o topo. */
let atual: BancoTeste | null = null;

export const definirBanco = (b: BancoTeste | null) => {
  atual = b;
};

export const bancoAtual = (): BancoTeste => {
  if (!atual) throw new Error("Banco de teste não definido: chame definirBanco() no beforeAll.");
  return atual;
};
