"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CASAS, type CasaId } from "@/config/casas";
import { s } from "./estilos";

type Dados = { endereco: string; bairro: string; cidade: string; quando: string; instagram: string };

const CAMPOS: { k: keyof Dados; rotulo: string; exemplo: string }[] = [
  { k: "endereco", rotulo: "Endereço", exemplo: "Av. Exemplo, 100" },
  { k: "bairro", rotulo: "Bairro", exemplo: "Centro" },
  { k: "cidade", rotulo: "Cidade/UF", exemplo: "Uberlândia/MG" },
  { k: "quando", rotulo: "Quando (texto livre)", exemplo: "Sábados, a partir das 20h" },
  { k: "instagram", rotulo: "Instagram da casa", exemplo: "sem @" },
];

/** Dados públicos de outra casa (ex.: Harley Grill): aparecem na seção "Onde" da home e na página de reserva dela. */
export default function DadosCasaPainel({ casa }: { casa: CasaId }) {
  const router = useRouter();
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/admin/casas?casa=${casa}`);
      if (res.status === 401) return router.replace("/admin/login");
      if (!res.ok) return setErro("Não foi possível carregar os dados da casa.");
      setDados((await res.json()).dados);
    })();
  }, [casa, router]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setSalvando(true);
    const res = await fetch(`/api/admin/casas?casa=${casa}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(dados) });
    setSalvando(false);
    if (res.status === 401) return router.replace("/admin/login");
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return setErro(j.erro || "Não foi possível salvar.");
    setDados(j.dados);
    setMsg("Dados salvos. O site atualiza em até 1 minuto.");
    setTimeout(() => setMsg(""), 4000);
  }

  if (!dados) return erro ? <div style={s.avisoErro}>{erro}</div> : <p style={s.legenda}>Carregando…</p>;

  return (
    <section style={s.secao}>
      {msg && <div style={s.aviso}>{msg}</div>}
      {erro && <div style={s.avisoErro}>{erro}</div>}
      <p style={s.legenda}>
        Aparecem na seção &quot;Onde&quot; da home (abaixo do Florindos Bar) e no topo da página de reserva ({CASAS[casa].pagina}). Campo vazio não aparece; sem endereço, o site mostra &quot;Em breve&quot;.
      </p>
      <form onSubmit={salvar} style={s.gridConfig}>
        {CAMPOS.map(({ k, rotulo, exemplo }) => (
          <label key={k} style={s.campo}><span>{rotulo}</span>
            <input style={s.input} value={dados[k]} maxLength={120} placeholder={exemplo} onChange={(e) => setDados({ ...dados, [k]: e.target.value })} /></label>
        ))}
        <button type="submit" style={s.botaoSalvar} disabled={salvando}>{salvando ? "Salvando…" : "Salvar dados da casa"}</button>
      </form>
    </section>
  );
}
