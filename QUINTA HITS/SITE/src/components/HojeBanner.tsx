"use client";

import { useEffect, useState } from "react";
import { reservaHref } from "@/config/site";

/** Faixa que só aparece quando é quinta-feira em Uberlândia. */
export default function HojeBanner() {
  const [quinta, setQuinta] = useState(false);

  useEffect(() => {
    const dia = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", weekday: "short" }).format(new Date());
    setQuinta(dia === "Thu");
  }, []);

  if (!quinta) return null;
  return (
    <div className="hoje" role="status">
      Hoje é quinta. Tem Quinta Hits. —{" "}
      <a href={reservaHref()} target="_blank" rel="noopener noreferrer">
        garanta sua mesa
      </a>
    </div>
  );
}
