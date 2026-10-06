"use client";

import { useEffect, useRef, useState } from "react";
import { instagramUrl } from "@/config/site";
import { formatData, type Edicao } from "@/lib/edicao";
import { mascararWhatsapp, problemaNoWhatsapp, type MesaPublica } from "@/lib/reserva";
import type { ElementoSalao } from "@/lib/planta";
import { formatarReais, type RegrasPublicas } from "@/lib/regrasEdicao";
import MapaMesas, { LegendaMapa } from "./MapaMesas";
import Turnstile, { TURNSTILE_SITE_KEY } from "./Turnstile";
import ConfirmacaoWhatsapp, { type PedidoEnviado } from "./ConfirmacaoWhatsapp";
import PedidoRecebido, { type PedidoManual } from "./PedidoRecebido";

type Mapa = { mesas: MesaPublica[]; ocupadas: string[]; planta?: ElementoSalao[] };

const dataHoraBR = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Regras da noite, exatamente como cadastradas no painel (nada é inventado: campo não definido não aparece). */
function RegrasDaNoite({ r }: { r: RegrasPublicas }) {
  const itens: string[] = [];
  if (r.abertura) itens.push(`Abertura: ${r.abertura}`);
  if (r.reservas_ate) itens.push(`Reservas até ${dataHoraBR(r.reservas_ate)}`);
  if (r.tolerancia_min !== null) itens.push(`Tolerância de chegada: ${r.tolerancia_min} min`);
  if (r.cancelamento_ate_horas !== null) itens.push(`Cancelamento até ${r.cancelamento_ate_horas} h antes`);
  if (r.consumacao_minima_centavos !== null && r.consumacao_minima_centavos > 0) itens.push(`Consumação mínima: ${formatarReais(r.consumacao_minima_centavos)}`);
  if (r.preco_centavos !== null && r.preco_centavos > 0) itens.push(`Valor: ${formatarReais(r.preco_centavos)}`);
  if (itens.length === 0 && !r.instrucoes_chegada) return null;
  return (
    <div className="reserva__regras">
      <strong>Regras desta noite</strong>
      <ul>{itens.map((i) => <li key={i}>{i}</li>)}</ul>
      {r.instrucoes_chegada && <p className="reserva__aviso">{r.instrucoes_chegada}</p>}
    </div>
  );
}

/** `manual`: WhatsApp ainda não conectado — o pedido vai para o painel e a equipe confirma. */
export default function ReservaMesa({ edicoes, instagram, regras, manual = false }: { edicoes: Edicao[]; instagram: string; regras?: Record<string, RegrasPublicas>; manual?: boolean }) {
  const [edicaoId, setEdicaoId] = useState(edicoes[0].id);
  const [mapa, setMapa] = useState<Mapa | null>(null);
  const [erroMapa, setErroMapa] = useState("");
  const [mesa, setMesa] = useState<MesaPublica | null>(null);
  const [nome, setNome] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [erroTelefone, setErroTelefone] = useState("");
  const [pessoas, setPessoas] = useState("");
  const [armadilha, setArmadilha] = useState("");
  const [politica, setPolitica] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [enviada, setEnviada] = useState<PedidoEnviado | null>(null);
  const [recebido, setRecebido] = useState<PedidoManual | null>(null);
  const [tokenRobo, setTokenRobo] = useState("");
  // Token do Turnstile vale para um envio só: trocar a chave gera um novo depois de cada tentativa.
  const [chaveRobo, setChaveRobo] = useState(0);

  const edicao = edicoes.find((e) => e.id === edicaoId) ?? edicoes[0];
  // Troca rápida de quinta: só a resposta da última escolhida pode preencher o mapa.
  const ultimoPedido = useRef(edicaoId);

  async function carregarMapa(id: string) {
    ultimoPedido.current = id;
    setErroMapa("");
    try {
      const res = await fetch(`/api/reservas/mapa?edicao=${encodeURIComponent(id)}`, { cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      if (ultimoPedido.current !== id) return;
      if (!res.ok) throw new Error(j.erro);
      setMapa(j);
    } catch (e) {
      if (ultimoPedido.current !== id) return;
      setMapa(null);
      setErroMapa(e instanceof Error && e.message ? e.message : "Não foi possível carregar o mapa.");
    }
  }

  useEffect(() => {
    setMapa(null);
    setMesa(null);
    carregarMapa(edicaoId);
  }, [edicaoId]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!mesa) return;
    const problemaTelefone = problemaNoWhatsapp(whatsapp);
    if (problemaTelefone) {
      setErroTelefone(problemaTelefone);
      return;
    }
    if (TURNSTILE_SITE_KEY && !tokenRobo) {
      setErro("Aguarde a verificação de segurança terminar.");
      return;
    }
    setErro("");
    setEnviando(true);
    try {
      const res = await fetch("/api/reservas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ edicao_id: edicaoId, mesa_id: mesa.id, nome, whatsapp, pessoas: Number(pessoas), site: armadilha, turnstile: tokenRobo, politica }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(j.erro || "Não foi possível enviar sua reserva.");
        setChaveRobo((c) => c + 1);
        // Mesa pega por outra pessoa: atualiza o mapa para mostrar como está agora.
        if (res.status === 409 || res.status === 404) {
          setMesa(null);
          carregarMapa(edicaoId);
        }
        return;
      }
      if (j.manual) {
        setRecebido({ mesa: j.mesa, data: edicao.data, codigo: j.codigo, nome });
        return;
      }
      setEnviada({ id: j.id, mesa: j.mesa, data: edicao.data, codigo: j.codigo, expiraEm: j.expiraEm, whatsappLink: j.whatsappLink });
    } catch {
      setErro("Sem conexão. Tente de novo.");
      setChaveRobo((c) => c + 1);
    } finally {
      setEnviando(false);
    }
  }

  if (recebido) {
    return (
      <PedidoRecebido
        pedido={recebido}
        onNovaReserva={() => {
          setRecebido(null);
          setMesa(null);
          setChaveRobo((c) => c + 1);
          carregarMapa(edicaoId);
        }}
      />
    );
  }

  if (enviada) {
    return (
      <ConfirmacaoWhatsapp
        pedido={enviada}
        onNovaReserva={() => {
          setEnviada(null);
          setMesa(null);
          setChaveRobo((c) => c + 1);
          carregarMapa(edicaoId);
        }}
      />
    );
  }

  const ocupadas = new Set(mapa?.ocupadas ?? []);

  return (
    <>
      {edicoes.length > 1 && (
        <div className="reserva__edicoes" role="group" aria-label="Escolha a quinta">
          {edicoes.map((e) => (
            <button
              key={e.id}
              type="button"
              className="filtro reserva__edicao"
              aria-pressed={e.id === edicaoId}
              onClick={() => setEdicaoId(e.id)}
            >
              {formatData(e.data)}
              <small>{e.artista || "line-up em breve"}</small>
            </button>
          ))}
        </div>
      )}

      <div className="reserva">
        <div>
          {erroMapa && (
            <div className="vazio">
              <p className="reserva__erro">{erroMapa}</p>
              <a className="btn btn--terracota" href={instagramUrl(instagram)} target="_blank" rel="noopener noreferrer">
                Reserve pelo Instagram
              </a>
            </div>
          )}
          {!mapa && !erroMapa && <p className="muted">Carregando o mapa…</p>}
          {mapa && mapa.mesas.length === 0 && (
            <div className="vazio">
              <p>O mapa de mesas ainda não está disponível.</p>
              <a className="btn btn--terracota" href={instagramUrl(instagram)} target="_blank" rel="noopener noreferrer">
                Reserve pelo Instagram
              </a>
            </div>
          )}
          {mapa && mapa.mesas.length > 0 && (
            <>
              <MapaMesas
                mesas={mapa.mesas}
                elementos={mapa.planta ?? []}
                estado={(m) => (m.id === mesa?.id ? "selecionada" : ocupadas.has(m.id) ? "ocupada" : "livre")}
                onEscolher={(m) => {
                  setMesa(m);
                  setErro("");
                }}
              />
              <LegendaMapa />
            </>
          )}
        </div>

        <div className="placa placa--p placa--vazada reserva__painel">
          <div className="eyebrow">{formatData(edicao.data, "longa")}</div>
          <h2 className="display h-3">{edicao.artista || "Line-up em breve"}</h2>
          {regras?.[edicao.id] && <RegrasDaNoite r={regras[edicao.id]} />}
          {!mesa ? (
            <>
              {/* Erro que tirou a mesa escolhida (ex.: outra pessoa reservou antes) continua visível. */}
              {erro && <p className="reserva__erro" role="alert">{erro}</p>}
              <p className="muted">Toque numa mesa livre no mapa para escolher.</p>
            </>
          ) : (
            <form className="reserva__form" onSubmit={enviar}>
              <p className="mb-0">
                <strong>Mesa {mesa.numero}</strong> · até {mesa.lugares} pessoas{mesa.area ? ` · ${mesa.area}` : ""}
              </p>
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
                  aria-describedby={erroTelefone ? "erro-whatsapp" : undefined}
                  style={erroTelefone ? { borderColor: "#B84A32" } : undefined}
                  required
                />
                {erroTelefone && (
                  <small id="erro-whatsapp" role="alert" style={{ color: "#B84A32", fontWeight: 600 }}>
                    {erroTelefone}
                  </small>
                )}
              </label>
              <label>
                Quantas pessoas
                <input
                  value={pessoas}
                  onChange={(e) => setPessoas(e.target.value)}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={mesa.lugares}
                  required
                />
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
                {enviando ? "Enviando…" : "Pedir reserva"}
              </button>
              <p className="reserva__aviso">
                {manual
                  ? "A mesa fica separada e a nossa equipe confirma a reserva pelo seu WhatsApp. "
                  : "No próximo passo você confirma a reserva mandando um código pelo WhatsApp. "}
                Usamos seus dados só para falar sobre esta reserva; veja os detalhes na <a href="/privacidade">Política de Privacidade</a>.
              </p>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
