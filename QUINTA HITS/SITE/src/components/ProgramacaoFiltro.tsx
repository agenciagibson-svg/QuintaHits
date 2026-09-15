"use client";

import { useMemo, useState } from "react";
import { GENEROS, type Edicao, type Genero } from "@/lib/programacao";
import EdicaoCard from "./EdicaoCard";

type Props = { proximas: Edicao[]; anteriores: Edicao[] };

const FILTROS: { chave: Genero | "todas"; rotulo: string }[] = [
  { chave: "todas", rotulo: "Todas" },
  ...(Object.keys(GENEROS) as Exclude<Genero, "">[]).map((g) => ({ chave: g, rotulo: GENEROS[g].rotulo })),
];

export default function ProgramacaoFiltro({ proximas, anteriores }: Props) {
  const [filtro, setFiltro] = useState<Genero | "todas">("todas");

  const filtrar = (lista: Edicao[]) => (filtro === "todas" ? lista : lista.filter((e) => e.genero === filtro));
  const prox = useMemo(() => filtrar(proximas), [filtro, proximas]); // eslint-disable-line react-hooks/exhaustive-deps
  const ant = useMemo(() => filtrar(anteriores), [filtro, anteriores]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div className="filtros" role="group" aria-label="Filtrar por estilo">
        {FILTROS.map((f) => (
          <button
            key={f.chave}
            type="button"
            className="filtro"
            aria-pressed={filtro === f.chave}
            onClick={() => setFiltro(f.chave)}
          >
            {f.rotulo}
          </button>
        ))}
      </div>

      <h3 className="display h-3" style={{ margin: "0 0 18px" }}>Próximas quintas</h3>
      {prox.length ? (
        <div className="edicoes">
          {prox.map((e) => <EdicaoCard key={e.id} edicao={e} />)}
        </div>
      ) : (
        <p className="vazio">Nenhuma quinta desse estilo anunciada ainda. Volte em breve.</p>
      )}

      {ant.length > 0 && (
        <>
          <h3 className="display h-3" style={{ margin: "56px 0 18px" }}>Já passaram pela Quinta</h3>
          <div className="edicoes">
            {ant.map((e) => <EdicaoCard key={e.id} edicao={e} passada />)}
          </div>
        </>
      )}
    </>
  );
}
