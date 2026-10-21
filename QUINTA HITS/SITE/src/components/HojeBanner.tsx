"use client";

import { useEffect, useState } from "react";
import { alvoLink } from "@/config/site";
import { hojeISO, temEdicaoNoDia } from "@/lib/edicao";

/**
 * Faixa que só aparece quando HOJE tem evento da QUINTA HITS na agenda (qualquer dia da semana, não cancelado).
 * As datas vêm do servidor; o dia é decidido no navegador, para valer mesmo com a página em cache.
 */
export default function HojeBanner({
  reservaUrl,
  datasComEvento,
  reservaPorData = {},
}: {
  reservaUrl: string;
  datasComEvento: string[];
  /** Noite de hoje em outra casa (ex.: Harley Grill): a reserva leva à página dela. */
  reservaPorData?: Record<string, string>;
}) {
  const [hoje, setHoje] = useState<string | null>(null);

  useEffect(() => {
    const agora = new Date();
    setHoje(temEdicaoNoDia(agora, datasComEvento) ? hojeISO(agora) : null);
  }, [datasComEvento]);

  if (!hoje) return null;
  const link = reservaPorData[hoje] ?? reservaUrl;
  return (
    <div className="hoje" role="status">
      Hoje tem Quinta Hits. —{" "}
      <a href={link} {...alvoLink(link)}>
        garanta sua mesa
      </a>
    </div>
  );
}
