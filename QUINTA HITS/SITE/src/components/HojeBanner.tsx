"use client";

import { useEffect, useState } from "react";
import { temEdicaoNoDia } from "@/lib/edicao";

/**
 * Faixa que só aparece quando HOJE realmente tem Quinta Hits em Uberlândia.
 * Quinta cancelada (ex.: 17/09 e 01/10 de 2026) não acende a faixa — antes acendia em
 * qualquer quinta do calendário e anunciava evento em noite que não existe.
 * As datas canceladas vêm do servidor; o dia é decidido no navegador, para valer mesmo com a página em cache.
 */
export default function HojeBanner({ reservaUrl, datasCanceladas }: { reservaUrl: string; datasCanceladas: string[] }) {
  const [temHoje, setTemHoje] = useState(false);

  useEffect(() => {
    setTemHoje(temEdicaoNoDia(new Date(), datasCanceladas));
  }, [datasCanceladas]);

  if (!temHoje) return null;
  return (
    <div className="hoje" role="status">
      Hoje é quinta. Tem Quinta Hits. —{" "}
      <a href={reservaUrl} target="_blank" rel="noopener noreferrer">
        garanta sua mesa
      </a>
    </div>
  );
}
