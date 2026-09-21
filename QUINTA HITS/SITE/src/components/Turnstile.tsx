"use client";

import { useEffect, useRef } from "react";

type TurnstileApi = {
  render: (el: HTMLElement, opcoes: Record<string, unknown>) => string;
  remove: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

/** Carrega o script da Cloudflare uma vez só, mesmo com vários widgets ou remontagens. */
let carregando: Promise<void> | null = null;
function carregarScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  carregando ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      carregando = null;
      reject(new Error("Falha ao carregar o Turnstile"));
    };
    document.head.appendChild(s);
  });
  return carregando;
}

export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

/**
 * Verificação "não sou robô" do Cloudflare Turnstile. Quase sempre passa sozinha, sem clique.
 * Cada token vale para um envio: troque `chave` para gerar outro depois de uma tentativa.
 */
export default function Turnstile({ onToken, chave }: { onToken: (token: string) => void; chave: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !ref.current) return;
    let widgetId: string | null = null;
    let ativo = true;
    onTokenRef.current("");
    carregarScript()
      .then(() => {
        if (!ativo || !ref.current || !window.turnstile) return;
        widgetId = window.turnstile.render(ref.current, {
          sitekey: TURNSTILE_SITE_KEY,
          language: "pt-br",
          callback: (token: string) => onTokenRef.current(token),
          "expired-callback": () => onTokenRef.current(""),
          "error-callback": () => onTokenRef.current(""),
        });
      })
      .catch((e) => console.error(e));
    return () => {
      ativo = false;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [chave]);

  if (!TURNSTILE_SITE_KEY) return null;
  return <div ref={ref} style={{ minHeight: 65 }} />;
}
