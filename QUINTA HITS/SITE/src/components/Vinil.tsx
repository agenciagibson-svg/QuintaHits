"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { site } from "@/config/site";

type Estado = "carregando" | "pronto" | "tocando" | "pausado" | "erro";

type Controller = {
  togglePlay: () => void;
  addListener: (evento: string, cb: (e: { data: { isPaused?: boolean } }) => void) => void;
};

declare global {
  interface Window {
    onSpotifyIframeApiReady?: (api: {
      createController: (el: HTMLElement, opts: Record<string, unknown>, cb: (c: Controller) => void) => void;
    }) => void;
  }
}

/**
 * O selo vira um vinil: gira sempre (devagar em repouso, a 33⅓ quando toca),
 * com braço/agulha que desce sobre o disco quando a seleção está tocando.
 * O áudio vem do player oficial do Spotify (playlist da QUINTA HITS).
 */
export default function Vinil() {
  const alvo = useRef<HTMLDivElement>(null);
  const controle = useRef<Controller | null>(null);
  const [estado, setEstado] = useState<Estado>("carregando");
  const playlist = site.spotifyPlaylistId;

  useEffect(() => {
    if (!playlist || !alvo.current) return;
    window.onSpotifyIframeApiReady = (api) => {
      if (!alvo.current) return;
      api.createController(
        alvo.current,
        { uri: `spotify:playlist:${playlist}`, width: "100%", height: 152, theme: "dark" },
        (c) => {
          controle.current = c;
          c.addListener("ready", () => setEstado("pronto"));
          c.addListener("playback_update", (e) => setEstado(e.data.isPaused ? "pausado" : "tocando"));
        },
      );
    };
    const s = document.createElement("script");
    s.src = "https://open.spotify.com/embed/iframe-api/v1";
    s.async = true;
    s.onerror = () => setEstado("erro");
    document.body.appendChild(s);
    return () => {
      window.onSpotifyIframeApiReady = undefined;
      s.remove();
    };
  }, [playlist]);

  const tocando = estado === "tocando";

  return (
    <div className="vinil">
      <div className={`vinil__toca ${tocando ? "vinil__toca--on" : ""}`}>
        <div className="vinil__prato" aria-hidden="true" />
        <div className="vinil__disco">
          <div className="vinil__sulcos" />
          <div className="vinil__selo">
            <Image src="/brand/selo.svg" alt="Selo: Se é quinta, tem Hits" width={604} height={604} unoptimized />
          </div>
          <div className="vinil__furo" />
        </div>
        {/* braço e agulha */}
        <svg className="vinil__braco" viewBox="0 0 120 260" aria-hidden="true">
          <circle cx="92" cy="28" r="22" fill="#F1E7D2" />
          <circle cx="92" cy="28" r="9" fill="#171717" />
          <path d="M92 28 L92 118 L38 214" stroke="#F1E7D2" strokeWidth="9" strokeLinecap="round" fill="none" />
          <path d="M92 28 L92 118 L38 214" stroke="#171717" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.35" />
          <rect x="18" y="204" width="34" height="22" rx="5" transform="rotate(-60 35 215)" fill="#B84A32" />
          <rect x="8" y="228" width="8" height="12" rx="2" transform="rotate(-60 12 234)" fill="#F1E7D2" />
        </svg>
      </div>

      <div className="vinil__player">
        <div className="eyebrow">Seleção da casa · rock pop anos 2000</div>
        <div className="vinil__controles">
          <button
            type="button"
            className={`btn ${tocando ? "btn--vazado" : "btn--terracota"}`}
            disabled={estado === "carregando" || estado === "erro"}
            onClick={() => controle.current?.togglePlay()}
          >
            {estado === "carregando" ? "Carregando…" : estado === "erro" ? "Player indisponível" : tocando ? "Pausar" : "Tocar a seleção"}
          </button>
          <a
            className="btn btn--vazado btn--p"
            href={`https://open.spotify.com/playlist/${playlist}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Abrir no Spotify
          </a>
        </div>
        <div className="vinil__embed" ref={alvo} />
        {estado === "erro" && (
          <p className="muted" style={{ fontSize: 14, margin: "8px 0 0" }}>
            Não deu pra carregar o player. Abra a seleção direto no Spotify.
          </p>
        )}
      </div>
    </div>
  );
}
