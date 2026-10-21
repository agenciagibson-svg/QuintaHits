import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { criarBancoTeste, type BancoTeste } from "./helpers/bancoTeste";
import { definirBanco } from "./helpers/holder";
import { criarEdicao, liberarEdicaoParaSite } from "./helpers/cenarios";

vi.mock("@/lib/supabaseAdmin", async () => {
  const h = await import("./helpers/holder");
  return { supabaseAdmin: () => h.bancoAtual().supabase };
});
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "www.quintahits.com.br", "x-forwarded-proto": "https" }) }));

import { icsDaNoite, lerNoite, linkGoogleAgenda } from "@/lib/noite";
import Noite, { generateMetadata } from "@/app/noite/[id]/page";
import { GET as agendaIcs } from "@/app/noite/[id]/agenda.ics/route";

let banco: BancoTeste;
beforeAll(async () => { banco = await criarBancoTeste(); });
afterAll(async () => { definirBanco(null); await banco.pg.close(); });

const HG = "2099-01-09_harley-grill";
const ANTES = new Date("2099-01-05T15:00:00Z");

describe("página da noite (/noite/<id>)", () => {
  beforeEach(async () => {
    definirBanco(banco);
    await banco.limpar();
    vi.stubEnv("RESERVAS_SITE_ENABLED", "true");
    await banco.sql("insert into edicoes (id, data, casa, artista, horario, local, status, tema) values ($1, '2099-01-09', 'harley-grill', 'Voo Livre', '20h', 'Harley Grill', 'confirmada', 'Acústico')", [HG]);
    await banco.sql("update casas set endereco = 'Av. Anselmo Alves dos Santos, 1096', bairro = 'Santa Mônica', cidade = 'Uberlândia - MG' where id = 'harley-grill'");
  });

  it("noite do Harley: casa, endereço, horário e reserva em breve (ainda não liberada)", async () => {
    const n = await lerNoite(HG, ANTES);
    expect(n).toMatchObject({ lugar: "Harley Grill", temHorario: true, passou: false, reserva: "em_breve" });
    expect(n?.endereco).toBe("Av. Anselmo Alves dos Santos, 1096 — Santa Mônica — Uberlândia - MG");
    expect(n?.inicio.toISOString()).toBe("2099-01-09T23:00:00.000Z"); // 20h em Uberlândia
  });

  it("liberada para o site: reserva aberta e botão leva ao mapa daquela noite", async () => {
    await banco.sql("insert into mesas (casa, numero, lugares, area) values ('harley-grill', '1', 4, 'Pista')");
    await liberarEdicaoParaSite(banco, HG);
    await banco.sql("update edicoes_regras set reservas_ate = '2099-01-09T21:00:00Z' where edicao_id = $1", [HG]);
    expect((await lerNoite(HG, ANTES))?.reserva).toBe("aberta");
  });

  it("agenda: Google e .ics com horário, endereço e lembrete; sem horário vira dia inteiro", async () => {
    const n = (await lerNoite(HG, ANTES))!;
    const g = new URL(linkGoogleAgenda(n, "https://x/noite/" + HG));
    expect(g.searchParams.get("dates")).toBe("20990109T230000Z/20990110T030000Z");
    expect(g.searchParams.get("text")).toBe("Voo Livre · Harley Grill");
    const ics = icsDaNoite(n, "https://x");
    expect(ics).toContain("DTSTART:20990109T230000Z");
    expect(ics).toContain("TRIGGER:-PT3H");
    expect(ics).toContain("LOCATION:Harley Grill\\, Av. Anselmo Alves dos Santos\\, 1096");
    await criarEdicao(banco, { id: "2099-01-07", horario: "" });
    const semHora = (await lerNoite("2099-01-07", ANTES))!;
    expect(icsDaNoite(semHora, "https://x")).toContain("DTSTART;VALUE=DATE:20990107");
    const r = await agendaIcs(new Request("http://x"), { params: Promise.resolve({ id: HG }) });
    expect(r.headers.get("content-type")).toContain("text/calendar");
  });

  it("página e prévia do link; id inválido ou inexistente = 404", async () => {
    vi.useFakeTimers({ now: ANTES, toFake: ["Date"] });
    try {
      const html = renderToStaticMarkup(await Noite({ params: Promise.resolve({ id: HG }) }));
      expect(html).toContain("Voo Livre");
      expect(html).toContain("Reservas abrem em breve");
      expect(html).toContain("Adicionar à agenda");
      expect(html).toContain(`/noite/${HG}/agenda.ics`);
      const meta = await generateMetadata({ params: Promise.resolve({ id: HG }) });
      expect(meta.openGraph?.title).toBe("Voo Livre · 09/01 · Harley Grill");
      expect(JSON.stringify(meta.openGraph?.images)).toContain(`https://www.quintahits.com.br/noite/${HG}/imagem.png`);
      await expect(Noite({ params: Promise.resolve({ id: "2099-01-01" }) })).rejects.toThrow();
      await expect(Noite({ params: Promise.resolve({ id: "lixo" }) })).rejects.toThrow();
    } finally {
      vi.useRealTimers();
    }
  });

  it("Solarium (sem reserva pelo site): página sem botão de reservar", async () => {
    await banco.sql("insert into edicoes (id, data, casa, artista, horario, local, status) values ('2099-01-10_solarium', '2099-01-10', 'solarium', 'Voo Livre', '17h', 'Solarium Beach Bar', 'confirmada')");
    expect((await lerNoite("2099-01-10_solarium", ANTES))?.reserva).toBe("sem");
  });
});
