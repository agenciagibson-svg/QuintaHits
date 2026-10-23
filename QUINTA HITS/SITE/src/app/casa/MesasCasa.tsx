"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import MapaMesas, { LegendaMapa, type EstadoMesa } from "@/components/MapaMesas";
import type { ElementoSalao } from "@/lib/planta";
import { ehTravada, formatarWhatsapp, mascararWhatsapp, problemaNoWhatsapp, type MesaPublica, type StatusReserva } from "@/lib/reserva";
import { linkWhatsappCliente } from "@/lib/mensagemCliente";
import { formatData, hojeISO } from "@/lib/edicao";
import { CASAS, type CasaId } from "@/config/casas";

/** O que o mapa precisa saber de cada reserva da noite (vem da lista que o app já carrega). */
export type ReservaNoMapa = {
  id: string;
  mesa_id: string;
  nome: string;
  whatsapp: string;
  pessoas: number;
  status: StatusReserva;
  codigo: string | null;
  origem_reserva?: string;
  observacoes?: string;
};
type NoiteNoMapa = { id: string; data: string; artista: string; horario: string; local: string; casa: string };
type Feita = { id: string; mesa: string; nome: string; whatsapp: string; pessoas: number; codigo: string | null } | null;

const ROTULO: Partial<Record<StatusReserva, string>> = { aguardando: "Para aprovar", confirmada: "Confirmada" };
const FORM_VAZIO = { nome: "", whatsapp: "", pessoas: "", motivo: "" };

/**
 * Mapa da noite no app da casa: tocar numa mesa livre para RESERVAR para um cliente (telefone, balcão, Instagram — já
 * confirmada) ou TRAVAR a mesa (ninguém reserva; no site aparece como reservada). Mesa travada: destravar. Mesa com
 * cliente: só mostra quem é (aprovar, recusar e cancelar continuam na lista). Mesmas regras do mapa do painel.
 */
export default function MesasCasa({
  noite,
  reservas,
  onFechar,
  onMudou,
  onDestravar,
}: {
  noite: NoiteNoMapa;
  reservas: ReservaNoMapa[];
  onFechar: () => void;
  onMudou: (reservaNova?: { id: string; cliente: boolean }) => void;
  onDestravar: (id: string) => Promise<void>;
}) {
  const router = useRouter();
  const [mesas, setMesas] = useState<MesaPublica[] | null>(null);
  const [planta, setPlanta] = useState<ElementoSalao[]>([]);
  const [erroMapa, setErroMapa] = useState("");
  const [mesaSel, setMesaSel] = useState<string | null>(null);
  const [modo, setModo] = useState<"cliente" | "travar">("cliente");
  const [form, setForm] = useState(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [feita, setFeita] = useState<Feita>(null);
  const quadro = useRef<HTMLElement | null>(null);

  const casa = (noite.casa in CASAS ? noite.casa : "quinta-hits") as CasaId;
  const plantaDaCasa = CASAS[casa].mapa;
  const podeOcupar = noite.data >= hojeISO();

  const carregarMapa = useCallback(async () => {
    setErroMapa("");
    try {
      const res = await fetch(`/api/casa/mapa?edicao=${encodeURIComponent(noite.id)}`, { cache: "no-store" });
      if (res.status === 401) return router.replace("/casa/login");
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.erro);
      setMesas(j.mesas ?? []);
      setPlanta(j.planta ?? []);
    } catch (e) {
      setErroMapa(e instanceof Error && e.message ? e.message : "Sem conexão. Tente de novo.");
    }
  }, [noite.id, router]);

  useEffect(() => {
    setMesas(null);
    setMesaSel(null);
    carregarMapa();
  }, [carregarMapa]);

  // Fecha com o botão "voltar" do Android/navegador em vez de sair do app.
  useEffect(() => {
    if (!history.state?.qhMesas) history.pushState({ qhMesas: true }, "");
    const aoVoltar = () => onFechar();
    window.addEventListener("popstate", aoVoltar);
    return () => window.removeEventListener("popstate", aoVoltar);
  }, [onFechar]);
  const fechar = () => (history.state?.qhMesas ? history.back() : onFechar());

  useEffect(() => {
    if (mesaSel) quadro.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [mesaSel, feita]);

  const daMesa = (id: string) => reservas.find((r) => r.mesa_id === id && (r.status === "confirmada" || r.status === "aguardando"));

  function estado(m: MesaPublica): EstadoMesa {
    const r = daMesa(m.id);
    if (r?.status === "confirmada") return ehTravada(r) ? "travada" : "ocupada";
    if (r?.status === "aguardando") return "pendente";
    return m.id === mesaSel ? "selecionada" : "livre";
  }

  function escolher(m: MesaPublica) {
    setMesaSel((atual) => (atual === m.id ? null : m.id));
    setForm(FORM_VAZIO);
    setErro("");
    setFeita(null);
  }

  const mesa = mesas?.find((m) => m.id === mesaSel);
  const ocupante = mesaSel ? daMesa(mesaSel) : undefined;

  async function ocupar(travar: boolean) {
    if (!mesa || salvando) return;
    setErro("");
    if (!travar) {
      if (form.nome.trim().length < 2) return setErro("Informe o nome do cliente.");
      const problema = problemaNoWhatsapp(form.whatsapp);
      if (problema) return setErro(problema);
      const p = Number(form.pessoas);
      if (!Number.isInteger(p) || p < 1) return setErro("Informe quantas pessoas vão.");
      if (p > mesa.lugares) return setErro(`A mesa ${mesa.numero} é para até ${mesa.lugares} pessoas. Escolha uma mesa maior.`);
    }
    setSalvando(true);
    try {
      const corpo = travar
        ? { edicao_id: noite.id, mesa_id: mesa.id, travar: true, motivo: form.motivo }
        : { edicao_id: noite.id, mesa_id: mesa.id, nome: form.nome, whatsapp: form.whatsapp, pessoas: Number(form.pessoas) };
      const res = await fetch("/api/casa/reservas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
      if (res.status === 401) return router.replace("/casa/login");
      const j = await res.json().catch(() => ({}));
      if (!res.ok) return setErro(j.erro || "Não foi possível salvar.");
      onMudou({ id: j.id, cliente: !travar });
      if (travar) {
        setMesaSel(null);
        setForm(FORM_VAZIO);
      } else {
        setFeita({ id: j.id, mesa: j.mesa ?? mesa.numero, nome: form.nome.trim(), whatsapp: form.whatsapp.replace(/\D/g, "").slice(-11), pessoas: Number(form.pessoas), codigo: j.codigo ?? null });
        setForm(FORM_VAZIO);
      }
    } catch {
      setErro("Sem conexão. Tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  async function destravar(id: string) {
    setSalvando(true);
    await onDestravar(id);
    setSalvando(false);
    setMesaSel(null);
  }

  return (
    <div className="cs-mesas" role="dialog" aria-modal="true" aria-label="Reservar ou travar mesa">
      <div className="cs-mesas-topo">
        <div>
          <div className="cs-mesas-titulo">Mesas</div>
          <div className="cs-mesas-noite">
            {formatData(noite.data, "numerica")}
            {noite.artista ? ` · ${noite.artista}` : ""}
            {casa !== "quinta-hits" ? ` · ${CASAS[casa].nome}` : ""}
          </div>
        </div>
        <button type="button" className="cs-botao-topo" onClick={fechar}>Fechar</button>
      </div>

      <div className="cs-mesas-corpo">
        {erroMapa && (
          <div className="cs-erro" role="alert">
            {erroMapa}{" "}
            <button type="button" className="cs-link" onClick={carregarMapa}>Tentar de novo</button>
          </div>
        )}
        {!mesas && !erroMapa && <p className="cs-vazio">Carregando o mapa…</p>}
        {mesas && mesas.length === 0 && <p className="cs-vazio">Nenhuma mesa cadastrada para esta casa.</p>}

        {mesas && mesas.length > 0 && (
          <>
            <div className="cs-mesas-mapa">
              <MapaMesas
                mesas={mesas}
                elementos={planta}
                planta={plantaDaCasa}
                desativarOcupadas={false}
                estado={estado}
                onEscolher={escolher}
              />
              <LegendaMapa painel destaque={plantaDaCasa.destaque?.rotulo ?? null} />
            </div>
            {!mesaSel && !feita && (
              <p className="cs-mesas-dica">
                {podeOcupar ? "Toque numa mesa livre para reservar para um cliente ou travar." : "Essa noite já passou: dá só para consultar."}
              </p>
            )}
          </>
        )}

        {feita && (
          <section ref={quadro} className="cs-mesas-quadro cs-mesas-feita" aria-live="polite">
            <div className="cs-mesas-quadro-titulo">Mesa {feita.mesa} reservada</div>
            <p>
              <strong>{feita.nome}</strong> · {feita.pessoas} pessoa{feita.pessoas > 1 ? "s" : ""} · {formatarWhatsapp(feita.whatsapp)}
              <br />
              Já entra como confirmada.{feita.codigo ? ` Código ${feita.codigo}.` : ""}
            </p>
            <div className="cs-acoes">
              <a
                className="cs-btn cs-btn-whats"
                href={linkWhatsappCliente({ id: feita.id, nome: feita.nome, whatsapp: feita.whatsapp, pessoas: feita.pessoas, status: "confirmada", codigo: feita.codigo }, noite, feita.mesa)}
                target="_blank"
                rel="noopener noreferrer"
              >
                Avisar cliente no WhatsApp
              </a>
              <button type="button" className="cs-btn cs-btn-neutro" onClick={() => setFeita(null)}>Outra mesa</button>
            </div>
          </section>
        )}

        {mesa && !feita && (
          <section ref={quadro} className="cs-mesas-quadro" aria-live="polite">
            <div className="cs-mesas-quadro-cabeca">
              <div className="cs-mesas-quadro-titulo">
                Mesa {mesa.numero}
                <small> · {mesa.lugares} lugares{mesa.area ? ` · ${mesa.area}` : ""}</small>
              </div>
              <button type="button" className="cs-link" onClick={() => setMesaSel(null)}>Fechar</button>
            </div>

            {ocupante && ehTravada(ocupante) ? (
              <>
                <p>
                  <span className="cs-selo cs-selo-travada">Travada</span>
                  {ocupante.observacoes ? ` ${ocupante.observacoes}` : " Ninguém reserva esta mesa nesta noite."}
                </p>
                {podeOcupar && (
                  <div className="cs-acoes">
                    <button type="button" className="cs-btn cs-btn-neutro" disabled={salvando} onClick={() => destravar(ocupante.id)}>
                      {salvando ? "Salvando…" : "Destravar mesa"}
                    </button>
                  </div>
                )}
              </>
            ) : ocupante ? (
              <>
                <p>
                  <strong>{ocupante.nome}</strong> · {ocupante.pessoas} pessoa{ocupante.pessoas > 1 ? "s" : ""} · {formatarWhatsapp(ocupante.whatsapp)}
                  <span className={`cs-selo cs-selo-${ocupante.status}`}>{ROTULO[ocupante.status]}</span>
                </p>
                <p className="cs-mesas-obs">Para aprovar, recusar ou cancelar, use a lista de reservas.</p>
                <div className="cs-acoes">
                  <button type="button" className="cs-btn cs-btn-neutro" onClick={fechar}>Ver na lista</button>
                </div>
              </>
            ) : !podeOcupar ? (
              <p className="cs-mesas-obs">Essa noite já passou: não dá para reservar nem travar.</p>
            ) : (
              <>
                <div className="cs-abas" role="tablist">
                  <button type="button" role="tab" aria-selected={modo === "cliente"} onClick={() => { setModo("cliente"); setErro(""); }}>
                    Reservar para cliente
                  </button>
                  <button type="button" role="tab" aria-selected={modo === "travar"} onClick={() => { setModo("travar"); setErro(""); }}>
                    Travar mesa
                  </button>
                </div>

                {modo === "cliente" ? (
                  <form
                    className="cs-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      ocupar(false);
                    }}
                  >
                    <label>
                      Nome do cliente
                      <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} maxLength={80} autoComplete="off" required />
                    </label>
                    <label>
                      WhatsApp (com DDD)
                      <input inputMode="tel" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: mascararWhatsapp(e.target.value) })} placeholder="(34) 99999-9999" autoComplete="off" required />
                    </label>
                    <label>
                      Pessoas
                      <input inputMode="numeric" value={form.pessoas} onChange={(e) => setForm({ ...form, pessoas: e.target.value.replace(/\D/g, "").slice(0, 2) })} placeholder={`até ${mesa.lugares}`} required />
                    </label>
                    {erro && <div className="cs-erro" role="alert">{erro}</div>}
                    <button type="submit" className="cs-btn cs-btn-aprovar" disabled={salvando}>
                      {salvando ? "Salvando…" : "Reservar (já confirmada)"}
                    </button>
                  </form>
                ) : (
                  <form
                    className="cs-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      ocupar(true);
                    }}
                  >
                    <p className="cs-mesas-obs">Ninguém consegue reservar esta mesa nesta noite: no site ela aparece como reservada. Dá para destravar depois.</p>
                    <label>
                      Motivo (opcional, só a equipe vê)
                      <input value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} maxLength={200} placeholder="Ex.: mesa do dono, convidados do artista" autoComplete="off" />
                    </label>
                    {erro && <div className="cs-erro" role="alert">{erro}</div>}
                    <button type="submit" className="cs-btn cs-btn-escuro" disabled={salvando}>
                      {salvando ? "Salvando…" : "Travar mesa"}
                    </button>
                  </form>
                )}
              </>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
