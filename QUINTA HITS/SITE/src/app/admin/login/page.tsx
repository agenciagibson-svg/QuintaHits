"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLogin() {
  const router = useRouter();
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setCarregando(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senha }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErro(j.erro || "Não foi possível entrar.");
        return;
      }
      router.push("/admin");
      router.refresh();
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div style={estilos.pagina}>
      <form onSubmit={entrar} style={estilos.card}>
        <h1 style={estilos.titulo}>QUINTA HITS — Admin</h1>
        <p style={estilos.sub}>Entre com a senha do painel.</p>
        <input
          type="password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          placeholder="Senha"
          autoFocus
          style={estilos.input}
        />
        {erro && <p style={estilos.erro}>{erro}</p>}
        <button type="submit" disabled={carregando || !senha} style={estilos.botao}>
          {carregando ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}

const estilos: Record<string, React.CSSProperties> = {
  pagina: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#171717", padding: 24 },
  card: { background: "#F1E7D2", borderRadius: 16, padding: 32, width: "100%", maxWidth: 360, display: "flex", flexDirection: "column", gap: 12 },
  titulo: { margin: 0, fontSize: 20, color: "#17352B" },
  sub: { margin: 0, color: "#3a3a3a", fontSize: 14 },
  input: { padding: "10px 12px", borderRadius: 8, border: "1px solid #ccc", fontSize: 15 },
  botao: { padding: "10px 12px", borderRadius: 8, border: "none", background: "#B84A32", color: "#fff", fontWeight: 600, cursor: "pointer" },
  erro: { color: "#B84A32", fontSize: 13, margin: 0 },
};
