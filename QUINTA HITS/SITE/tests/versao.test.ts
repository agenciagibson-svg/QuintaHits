import { describe, expect, it } from "vitest";
import { temVersaoNova } from "@/lib/versao";

describe("atualização automática depois do deploy", () => {
  it("só recarrega quando o servidor responde uma versão diferente da que a página carregou", () => {
    expect(temVersaoNova("dpl_A", "dpl_B")).toBe(true);
    expect(temVersaoNova("dpl_A", "dpl_A")).toBe(false);
    // Sem versão (desenvolvimento) ou resposta estranha: nunca recarrega (evita laço de recarga).
    expect(temVersaoNova("", "dpl_B")).toBe(false);
    expect(temVersaoNova("dpl_A", "")).toBe(false);
    expect(temVersaoNova("dpl_A", undefined)).toBe(false);
    expect(temVersaoNova("dpl_A", 123)).toBe(false);
  });
});
