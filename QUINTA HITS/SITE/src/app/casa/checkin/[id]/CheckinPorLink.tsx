"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ResultadoPorta, fazerCheckin, type RespostaCheckin } from "../../Porta";

export default function CheckinPorLink({ id }: { id: string }) {
  const router = useRouter();
  const [r, setR] = useState<RespostaCheckin | null>(null);
  const feito = useRef(false);

  useEffect(() => {
    if (feito.current) return; // modo estrito do React roda o efeito duas vezes em desenvolvimento
    feito.current = true;
    fazerCheckin(id).then((x) => {
      if (x.status === 401) return router.replace(`/casa/login?volta=${encodeURIComponent(`/casa/checkin/${id}`)}`);
      setR(x);
    });
  }, [id, router]);

  return (
    <>
      <header className="cs-topo">
        <div className="cs-topo-linha">
          <div>
            <div className="cs-marca">QUINTA HITS · ENTRADA</div>
            <h1 className="cs-titulo">Check-in</h1>
          </div>
        </div>
      </header>
      <div className="cs-conteudo">
        {r ? (
          <ResultadoPorta
            r={r}
            onDesfazer={async () => {
              const d = await fazerCheckin(id, "desfazer");
              setR(d.ok ? { ok: false, erro: "Check-in desfeito.", reserva: d.reserva } : d);
            }}
          />
        ) : (
          <p className="cs-vazio">Registrando a chegada…</p>
        )}
        <a className="cs-btn cs-btn-neutro" href="/casa" style={{ display: "block", textAlign: "center", marginTop: 16, textDecoration: "none" }}>
          Abrir as reservas da noite
        </a>
      </div>
    </>
  );
}
