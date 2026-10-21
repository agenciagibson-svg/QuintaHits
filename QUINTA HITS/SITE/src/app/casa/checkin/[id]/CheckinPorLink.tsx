"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ResultadoPorta, fazerCheckin, type RespostaCheckin } from "../../Porta";

/**
 * QR lido com a câmera normal do celular: mostra a reserva e só registra a entrada com o toque em "Confirmar entrada".
 * Abrir o link sozinho não muda nada (um link mandado por alguém de fora não aprova pedido nem gasta o QR).
 */
export default function CheckinPorLink({ id }: { id: string }) {
  const router = useRouter();
  const [previa, setPrevia] = useState<(RespostaCheckin & { status: number }) | null>(null);
  const [r, setR] = useState<RespostaCheckin | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    fetch(`/api/casa/checkin?ref=${encodeURIComponent(id)}`, { cache: "no-store" })
      .then(async (res) => {
        if (res.status === 401) return router.replace(`/casa/login?volta=${encodeURIComponent(`/casa/checkin/${id}`)}`);
        const j = await res.json().catch(() => ({}));
        setPrevia({ status: res.status, ok: res.ok, erro: j.erro, reserva: j.reserva ?? null, jaTinhaChegado: j.jaTinhaChegado });
      })
      .catch(() => setPrevia({ status: 0, ok: false, erro: "Sem conexão. Tente de novo." }));
  }, [id, router]);

  async function confirmar() {
    setEnviando(true);
    setR(await fazerCheckin(id));
    setEnviando(false);
  }

  const res = previa?.reserva;
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
        ) : !previa ? (
          <p className="cs-vazio">Buscando a reserva…</p>
        ) : !previa.ok || previa.jaTinhaChegado ? (
          <ResultadoPorta r={previa} />
        ) : (
          <div className="cs-cartao">
            <div className="cs-mesa" aria-hidden="true">
              <small>MESA</small>
              {res?.mesa}
            </div>
            <div className="cs-nome">{res?.nome}</div>
            <div className="cs-detalhes">
              {res?.pessoas} pessoa{(res?.pessoas ?? 0) > 1 ? "s" : ""} · {res?.casaNome}
              {res?.codigo ? ` · ${res.codigo}` : ""}
            </div>
            {res?.status === "aguardando" && <p className="cs-erro" style={{ marginTop: 10 }}>Pedido ainda não aprovado pela equipe. Confirmar a entrada aprova a reserva.</p>}
            <div className="cs-acoes">
              <button type="button" className="cs-btn cs-btn-aprovar" style={{ flexBasis: "100%" }} disabled={enviando} onClick={confirmar}>
                {enviando ? "Registrando…" : res?.status === "aguardando" ? "Aprovar e registrar entrada" : "Confirmar entrada"}
              </button>
            </div>
          </div>
        )}
        <a className="cs-btn cs-btn-neutro" href="/casa" style={{ display: "block", textAlign: "center", marginTop: 16, textDecoration: "none" }}>
          Abrir as reservas da noite
        </a>
      </div>
    </>
  );
}
