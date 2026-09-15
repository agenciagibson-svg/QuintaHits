"use client";

import { useEffect, useState } from "react";

type Props = { alvoISO: string; dataISO: string };

function partes(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return {
    d: Math.floor(s / 86400),
    h: Math.floor((s % 86400) / 3600),
    m: Math.floor((s % 3600) / 60),
    s: s % 60,
  };
}

/** Contagem regressiva até a próxima quinta, com fuso de Uberlândia resolvido no servidor. */
export default function Countdown({ alvoISO, dataISO }: Props) {
  const [agora, setAgora] = useState<number | null>(null);

  useEffect(() => {
    setAgora(Date.now());
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const alvo = new Date(alvoISO).getTime();
  const hojeUberlandia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const ehHoje = hojeUberlandia === dataISO;

  if (ehHoje) {
    return <p className="contagem--hoje">É hoje. Se é quinta, tem Hits.</p>;
  }

  const p = partes(agora === null ? alvo - Date.now() : alvo - agora);
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div>
      <p className="contagem__titulo">Falta pouco pra próxima quinta</p>
      <div className="contagem" aria-live="off">
        {[
          [p.d, "dias"],
          [p.h, "horas"],
          [p.m, "min"],
          [p.s, "seg"],
        ].map(([n, r]) => (
          <div key={r} className="placa placa--p contagem__bloco">
            <div className="contagem__num" suppressHydrationWarning>{pad(n as number)}</div>
            <div className="contagem__rot">{r}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
