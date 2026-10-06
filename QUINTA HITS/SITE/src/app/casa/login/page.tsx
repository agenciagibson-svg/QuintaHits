"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Login do app da casa (dono do bar). Conta criada pela equipe da Gibson; não há cadastro aberto. */
export default function CasaLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setCarregando(true);
    try {
      const res = await fetch("/api/casa/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, senha }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErro(j.erro || "Não foi possível entrar.");
        return;
      }
      router.replace("/casa");
      router.refresh();
    } catch {
      setErro("Sem conexão. Tente de novo.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="cs-login">
      <form onSubmit={entrar}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/casa/icones/icone-192.png" alt="" />
        <h1>Reservas</h1>
        <p>Pedidos de mesa da QUINTA HITS. Entre com o e-mail e a senha que a Gibson Promoções enviou.</p>
        <label>
          E-mail
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" inputMode="email" required />
        </label>
        <label>
          Senha
          <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="current-password" required />
        </label>
        {erro && <div className="cs-erro" role="alert">{erro}</div>}
        <button type="submit" className="cs-btn cs-btn-perigo" disabled={carregando || !email || !senha}>
          {carregando ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}
