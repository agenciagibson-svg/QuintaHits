"use client";

import { useEffect, useState } from "react";
import { alvoLink } from "@/config/site";
import { temEdicaoNoDia } from "@/lib/edicao";

/**
 * Faixa que só aparece quando HOJE tem evento da QUINTA HITS na agenda (qualquer dia da semana, não cancelado).
 * As datas vêm do servidor; o dia é decidido no navegador, para valer mesmo com a página em cache.
 */
export default function HojeBanner({ reservaUrl, datasComEvento }: { reservaUrl: string; datasComEvento: string[] }) {
  const [temHoje, setTemHoje] = useState(false);

  useEffect(() => {
    setTemHoje(temEdicaoNoDia(new Date(), datasComEvento));
  }, [datasComEvento]);

  if (!temHoje) return null;
  return (
    <div className="hoje" role="status">
      Hoje tem Quinta Hits. —{" "}
      <a href={reservaUrl} {...alvoLink(reservaUrl)}>
        garanta sua mesa
      </a>
    </div>
  );
}
