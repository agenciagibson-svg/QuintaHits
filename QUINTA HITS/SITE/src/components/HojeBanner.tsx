"use client";

import { useEffect, useState } from "react";

/** Faixa que só aparece quando é quinta-feira em Uberlândia. */
export default function HojeBanner({ reservaUrl }: { reservaUrl: string }) {
  const [quinta, setQuinta] = useState(false);

  useEffect(() => {
    const dia = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", weekday: "short" }).format(new Date());
    setQuinta(dia === "Thu");
  }, []);

  if (!quinta) return null;
  return (
    <div className="hoje" role="status">
      Hoje é quinta. Tem Quinta Hits. —{" "}
      <a href={reservaUrl} target="_blank" rel="noopener noreferrer">
        garanta sua mesa
      </a>
    </div>
  );
}
