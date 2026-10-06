import { describe, expect, it } from "vitest";
import { mascararWhatsapp, normalizarWhatsapp, problemaNoWhatsapp } from "@/lib/reserva";

describe("campo WhatsApp do formulário de reserva", () => {
  it("formata enquanto digita: (34) 99710-7006", () => {
    const passos = ["3", "34", "349", "3499710", "34997107", "34997107006"].map(mascararWhatsapp);
    expect(passos).toEqual(["(3", "(34", "(34) 9", "(34) 99710", "(34) 99710-7", "(34) 99710-7006"]);
    expect(mascararWhatsapp("")).toBe("");
  });

  it("ignora letras, corta no 11º dígito e aceita colar com +55", () => {
    expect(mascararWhatsapp("34 9971a0-7006999")).toBe("(34) 99710-7006");
    expect(mascararWhatsapp("+55 34 99710-7006")).toBe("(34) 99710-7006");
    expect(mascararWhatsapp("5534997107006")).toBe("(34) 99710-7006");
  });

  it("o número mascarado passa na mesma validação do servidor", () => {
    expect(normalizarWhatsapp(mascararWhatsapp("34997107006"))).toBe("34997107006");
    expect(problemaNoWhatsapp("(34) 99710-7006")).toBeNull();
  });

  it("explica o que está errado", () => {
    expect(problemaNoWhatsapp("(34) 9971")).toMatch(/completo com DDD/);
    expect(problemaNoWhatsapp("(34) 39710-7006")).toMatch(/começar com 9/);
    expect(problemaNoWhatsapp("(04) 99710-7006")).toMatch(/inválido/);
  });
});
