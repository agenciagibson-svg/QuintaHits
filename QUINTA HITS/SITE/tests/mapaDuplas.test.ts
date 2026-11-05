import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import MapaMesas, { LegendaMapa } from "@/components/MapaMesas";
import type { MesaPublica } from "@/lib/reserva";

const mesa = (id: string, lugares: number) => ({ id, numero: id, lugares, area: "Bar", x: 10, y: 10 }) as MesaPublica;

describe("mesas de 2 lugares no mapa", () => {
  const mapa = (marcarDuplas: boolean) => renderToStaticMarkup(createElement(MapaMesas, { mesas: [mesa("1", 2), mesa("2", 4)], estado: () => "livre" as const, marcarDuplas }));

  it("com a marcação ligada, só a mesa de 2 lugares ganha a classe", () => {
    expect(mapa(true).match(/mapa__mesa--dupla/g)).toHaveLength(1);
  });
  it("sem a marcação (painel), nada muda", () => {
    expect(mapa(false)).not.toContain("mapa__mesa--dupla");
  });
  it("a legenda mostra o rótulo só quando há mesas de 2 lugares", () => {
    expect(renderToStaticMarkup(createElement(LegendaMapa, { duplas: "2 lugares · R$ 100,00" }))).toContain("2 lugares · R$ 100,00");
    expect(renderToStaticMarkup(createElement(LegendaMapa, {}))).not.toContain("mapa__legenda-mesa--dupla");
  });
});
