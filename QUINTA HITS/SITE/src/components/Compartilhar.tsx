"use client";

import { useState } from "react";

export default function Compartilhar({ titulo, texto, url }: { titulo: string; texto: string; url: string }) {
  const [aviso, setAviso] = useState("");

  async function compartilhar() {
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: titulo, text: texto, url });
        return;
      }
      await navigator.clipboard.writeText(`${texto} ${url}`);
      setAviso("Link copiado. Manda pra turma.");
      setTimeout(() => setAviso(""), 2600);
    } catch {
      /* usuário cancelou */
    }
  }

  return (
    <>
      <button type="button" className="btn btn--vazado" onClick={compartilhar}>
        Chamar a turma
      </button>
      {aviso && <div className="toast" role="status">{aviso}</div>}
    </>
  );
}
