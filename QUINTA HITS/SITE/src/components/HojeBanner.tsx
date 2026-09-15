"use client";

import { useEffect, useState } from "react";
import { reservaHref } from "@/config/site";
import { temEdicaoHoje } from "@/lib/programacao";

/**
 * Faixa que só aparece quando HOJE realmente tem Quinta Hits em Uberlândia.
 * Quinta cancelada (ex.: 17/09 e 01/10 de 2026) não acende a faixa — antes acendia em
 * qualquer quinta do calendário e anunciava evento em noite que não existe.
 */
export default function HojeBanner() {
  const [temHoje, setTemHoje] = useState(false);

  useEffect(() => {
    setTemHoje(temEdicaoHoje(new Date()));
  }, []);

  if (!temHoje) return null;
  return (
    <div className="hoje" role="status">
      Hoje é quinta. Tem Quinta Hits. —{" "}
      <a href={reservaHref()} target="_blank" rel="noopener noreferrer">
        garanta sua mesa
      </a>
    </div>
  );
}
