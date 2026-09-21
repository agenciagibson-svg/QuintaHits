"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useRouter } from "next/navigation";
import MapaMesas from "@/components/MapaMesas";
import type { Mesa, MesaPublica } from "@/lib/reserva";
import { s } from "./estilos";

const NOVA_VAZIA = { numero: "", lugares: "4", area: "" };

/** Margem para a mesa não ficar cortada na borda do mapa. */
const limitar = (v: number) => Math.min(97, Math.max(3, Math.round(v * 10) / 10));

export default function MesasEditor() {
  const router = useRouter();
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");
  const [nova, setNova] = useState({ ...NOVA_VAZIA });
  const [selecionadaId, setSelecionadaId] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState({ numero: "", lugares: "", area: "" });
  const mapaRef = useRef<HTMLDivElement>(null);

  const selecionada = mesas.find((m) => m.id === selecionadaId) ?? null;

  function avisar(texto: string) {
    setErro("");
    setMsg(texto);
    setTimeout(() => setMsg(""), 3000);
  }

  /** Resposta com erro: sessão expirada volta ao login; o resto vira aviso. Retorna true se deu erro. */
  async function falhou(res: Response, padrao: string): Promise<boolean> {
    if (res.ok) return false;
    if (res.status === 401) {
      router.replace("/admin/login");
      return true;
    }
    const j = await res.json().catch(() => ({}));
    setErro(j.erro || padrao);
    return true;
  }

  async function carregar() {
    const res = await fetch("/api/admin/mesas");
    if (!(await falhou(res, "Não foi possível carregar as mesas."))) setMesas((await res.json()).mesas ?? []);
    setCarregando(false);
  }

  useEffect(() => {
    carregar();
  }, []);

  function selecionar(m: Mesa) {
    setSelecionadaId(m.id);
    setRascunho({ numero: m.numero, lugares: String(m.lugares), area: m.area });
  }

  async function atualizar(id: string, campos: Partial<Mesa>, aviso?: string) {
    const res = await fetch(`/api/admin/mesas/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(campos),
    });
    if (await falhou(res, "Não foi possível salvar a mesa.")) {
      carregar(); // desfaz na tela o que não foi salvo (ex.: posição arrastada)
      return;
    }
    const { mesa } = await res.json();
    setMesas((ms) => ms.map((m) => (m.id === id ? { ...mesa, x: Number(mesa.x), y: Number(mesa.y) } : m)));
    if (aviso) avisar(aviso);
  }

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/admin/mesas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ numero: nova.numero, lugares: Number(nova.lugares), area: nova.area }),
    });
    if (await falhou(res, "Não foi possível criar a mesa.")) return;
    const { mesa } = await res.json();
    setMesas((ms) => [...ms, { ...mesa, x: Number(mesa.x), y: Number(mesa.y) }]);
    setNova({ ...NOVA_VAZIA, lugares: nova.lugares, area: nova.area });
    selecionar({ ...mesa, x: Number(mesa.x), y: Number(mesa.y) });
    avisar(`Mesa ${mesa.numero} criada no centro do mapa — arraste até o lugar certo.`);
  }

  async function excluir(m: Mesa) {
    if (!confirm(`Excluir a mesa ${m.numero}? Essa ação não pode ser desfeita.`)) return;
    const res = await fetch(`/api/admin/mesas/${m.id}`, { method: "DELETE" });
    if (await falhou(res, "Não foi possível excluir a mesa.")) return;
    setMesas((ms) => ms.filter((x) => x.id !== m.id));
    setSelecionadaId(null);
    avisar(`Mesa ${m.numero} excluída.`);
  }

  /** Arrastar: segue o ponteiro pelo mapa e salva a posição ao soltar. Clique sem arrastar só seleciona. */
  function iniciarArrasto(e: ReactPointerEvent<HTMLButtonElement>, publica: MesaPublica) {
    const mapa = mapaRef.current;
    const mesa = mesas.find((m) => m.id === publica.id);
    if (!mapa || !mesa || e.button !== 0) return;
    e.preventDefault();
    const area = mapa.getBoundingClientRect();
    const inicio = { x: e.clientX, y: e.clientY };
    let pos = { x: mesa.x, y: mesa.y };
    let moveu = false;

    const mover = (ev: PointerEvent) => {
      if (!moveu && Math.hypot(ev.clientX - inicio.x, ev.clientY - inicio.y) < 4) return;
      moveu = true;
      pos = { x: limitar(((ev.clientX - area.left) / area.width) * 100), y: limitar(((ev.clientY - area.top) / area.height) * 100) };
      setMesas((ms) => ms.map((m) => (m.id === mesa.id ? { ...m, ...pos } : m)));
    };
    const soltar = () => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      window.removeEventListener("pointercancel", soltar);
      selecionar(mesa);
      if (moveu) atualizar(mesa.id, pos);
    };
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
    window.addEventListener("pointercancel", soltar);
  }

  if (carregando) return <p style={s.legenda}>Carregando mesas…</p>;

  return (
    <>
      {msg && <div style={s.aviso}>{msg}</div>}
      {erro && <div style={s.avisoErro}>{erro}</div>}

      <form onSubmit={criar} style={s.gridNova}>
        <label style={s.campo}>
          <span>Número da mesa</span>
          <input style={s.input} value={nova.numero} onChange={(e) => setNova({ ...nova, numero: e.target.value })} placeholder="12" required />
        </label>
        <label style={s.campo}>
          <span>Lugares</span>
          <input style={s.input} type="number" min={1} max={50} value={nova.lugares} onChange={(e) => setNova({ ...nova, lugares: e.target.value })} required />
        </label>
        <label style={s.campo}>
          <span>Área (opcional)</span>
          <input style={s.input} value={nova.area} onChange={(e) => setNova({ ...nova, area: e.target.value })} placeholder="Varanda, salão…" />
        </label>
        <button type="submit" style={s.botaoSalvar}>Adicionar mesa</button>
      </form>

      <div style={s.gridMapa}>
        <div style={s.colunaMapa}>
          {mesas.length === 0 ? (
            <p style={s.legenda}>Nenhuma mesa ainda. Adicione a primeira acima.</p>
          ) : (
            <MapaMesas
              refMapa={mapaRef}
              mesas={mesas}
              desativarOcupadas={false}
              estado={(m) =>
                m.id === selecionadaId ? "selecionada" : mesas.find((x) => x.id === m.id)?.ativa === false ? "inativa" : "livre"
              }
              onPointerDownMesa={iniciarArrasto}
            />
          )}
          <p style={s.legenda}>Arraste as mesas para a posição real no salão. Clique numa mesa para editar.</p>
        </div>

        <div style={s.cartao}>
          {!selecionada ? (
            <p style={s.legenda}>Selecione uma mesa no mapa.</p>
          ) : (
            <form
              style={{ display: "grid", gap: 10 }}
              onSubmit={(e) => {
                e.preventDefault();
                atualizar(selecionada.id, { numero: rascunho.numero, lugares: Number(rascunho.lugares), area: rascunho.area }, "Mesa salva.");
              }}
            >
              <strong>Mesa {selecionada.numero}</strong>
              <label style={s.campo}>
                <span>Número</span>
                <input style={s.input} value={rascunho.numero} onChange={(e) => setRascunho({ ...rascunho, numero: e.target.value })} required />
              </label>
              <label style={s.campo}>
                <span>Lugares</span>
                <input style={s.input} type="number" min={1} max={50} value={rascunho.lugares} onChange={(e) => setRascunho({ ...rascunho, lugares: e.target.value })} required />
              </label>
              <label style={s.campo}>
                <span>Área</span>
                <input style={s.input} value={rascunho.area} onChange={(e) => setRascunho({ ...rascunho, area: e.target.value })} />
              </label>
              <button type="submit" style={s.botaoMini}>Salvar</button>
              <button
                type="button"
                style={s.botaoMiniOutline}
                onClick={() =>
                  atualizar(
                    selecionada.id,
                    { ativa: !selecionada.ativa },
                    selecionada.ativa ? "Mesa desativada — some do site." : "Mesa ativada — aparece no site.",
                  )
                }
              >
                {selecionada.ativa ? "Desativar (tirar do site)" : "Ativar"}
              </button>
              <button type="button" style={s.botaoMiniPerigo} onClick={() => excluir(selecionada)}>
                Excluir
              </button>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
