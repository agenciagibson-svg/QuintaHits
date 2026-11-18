"use client";

import { useState } from "react";
import Turnstile, { TURNSTILE_SITE_KEY } from "./Turnstile";
import { mascararWhatsapp, problemaNoWhatsapp } from "@/lib/reserva";

const reais = (centavos: number) => `R$ ${(centavos / 100).toFixed(2).replace(".", ",")}`;

/**
 * Ingresso individual (sem mesa), separado do mapa de mesas. Sai confirmado na hora, com QR de entrada; o cliente paga
 * na portaria. A mesa já inclui a entrada de quem senta nela.
 */
export default function IngressoIndividual({ edicaoId, valorCentavos, restantes, maximo }: { edicaoId: string; valorCentavos: number; restantes: number | null; maximo: number }) {
  const limite = Math.max(Math.min(maximo, restantes ?? maximo), 0);
  const [quantidade, setQuantidade] = useState(1);
  const [nome, setNome] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [erroTelefone, setErroTelefone] = useState("");
  const [armadilha, setArmadilha] = useState("");
  const [politica, setPolitica] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [tokenRobo, setTokenRobo] = useState("");
  const [chaveRobo, setChaveRobo] = useState(0);

  if (limite < 1) {
    return (
      <section className="ingresso placa placa--p" aria-labelledby="ingresso-titulo">
        <div className="eyebrow">Ingresso individual</div>
        <h2 id="ingresso-titulo" className="display h-3">Ingressos esgotados.</h2>
        <p className="muted">Os ingressos individuais desta noite acabaram.</p>
      </section>
    );
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const problema = problemaNoWhatsapp(whatsapp);
    if (problema) {
      setErroTelefone(problema);
      return;
    }
    if (TURNSTILE_SITE_KEY && !tokenRobo) {
      setErro("Aguarde a verificação de segurança terminar.");
      return;
    }
    setErro("");
    setEnviando(true);
    try {
      const res = await fetch("/api/ingressos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ edicao_id: edicaoId, nome, whatsapp, quantidade, site: armadilha, turnstile: tokenRobo, politica }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.id) {
        setErro(j.erro || "Não foi possível emitir seu ingresso.");
        setChaveRobo((c) => c + 1);
        return;
      }
      window.location.href = `/ingresso/${j.id}`;
    } catch {
      setErro("Sem conexão. Tente de novo.");
      setChaveRobo((c) => c + 1);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="ingresso placa placa--p" aria-labelledby="ingresso-titulo">
      <div className="ingresso__topo">
        <div>
          <div className="eyebrow">Ingresso individual</div>
          <h2 id="ingresso-titulo" className="display h-3">{reais(valorCentavos)} por pessoa</h2>
          <p className="muted ingresso__nota">Sem mesa. Pague na portaria e mostre o QR na entrada. Quem reserva mesa não precisa de ingresso.</p>
        </div>
      </div>
      <form className="reserva__form ingresso__form" onSubmit={enviar}>
        <div className="ingresso__qtd">
          <span id="ingresso-qtd-rotulo">Quantos ingressos</span>
          <div className="ingresso__contador" role="group" aria-labelledby="ingresso-qtd-rotulo">
            <button type="button" className="btn btn--vazado btn--p" aria-label="Menos um ingresso" onClick={() => setQuantidade((q) => Math.max(q - 1, 1))} disabled={quantidade <= 1}>−</button>
            <output aria-live="polite">{quantidade}</output>
            <button type="button" className="btn btn--vazado btn--p" aria-label="Mais um ingresso" onClick={() => setQuantidade((q) => Math.min(q + 1, limite))} disabled={quantidade >= limite}>+</button>
          </div>
          <strong className="ingresso__total">Total {reais(valorCentavos * quantidade)} <small>na portaria</small></strong>
        </div>
        <label>
          Seu nome
          <input value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" required maxLength={80} />
        </label>
        <label>
          WhatsApp (com DDD)
          <input
            value={whatsapp}
            onChange={(e) => {
              setWhatsapp(mascararWhatsapp(e.target.value));
              setErroTelefone("");
            }}
            onBlur={() => whatsapp && setErroTelefone(problemaNoWhatsapp(whatsapp) ?? "")}
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            placeholder="(34) 99999-9999"
            aria-invalid={erroTelefone ? true : undefined}
            aria-describedby={erroTelefone ? "erro-whatsapp-ingresso" : undefined}
            required
          />
          {erroTelefone && (
            <small id="erro-whatsapp-ingresso" role="alert" style={{ color: "#B84A32", fontWeight: 600 }}>
              {erroTelefone}
            </small>
          )}
        </label>
        <div className="honeypot" aria-hidden="true">
          <label>
            Site
            <input value={armadilha} onChange={(e) => setArmadilha(e.target.value)} tabIndex={-1} autoComplete="off" />
          </label>
        </div>
        <label className="reserva__consentimento">
          <input type="checkbox" checked={politica} onChange={(e) => setPolitica(e.target.checked)} required />
          <span>Li e concordo com a <a href="/privacidade" target="_blank" rel="noopener noreferrer">Política de Privacidade</a>.</span>
        </label>
        <Turnstile chave={chaveRobo} onToken={setTokenRobo} />
        {erro && <p className="reserva__erro" role="alert">{erro}</p>}
        <button type="submit" className="btn btn--terracota" disabled={enviando || !politica}>
          {enviando ? "Emitindo…" : `Garantir ${quantidade} ingresso${quantidade > 1 ? "s" : ""}`}
        </button>
      </form>
    </section>
  );
}
