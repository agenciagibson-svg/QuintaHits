"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatData } from "@/lib/edicao";

/** O que a API de check-in devolve da reserva. */
export type ReservaNaPorta = {
  id: string;
  casaNome: string;
  data: string;
  mesa: string;
  nome: string;
  pessoas: number;
  status: string;
  codigo: string | null;
  chegou_em: string | null;
};
export type RespostaCheckin = { ok: boolean; erro?: string; reserva?: ReservaNaPorta | null; jaTinhaChegado?: boolean };

const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

export async function fazerCheckin(ref: string, acao: "chegou" | "desfazer" | "nao_veio" = "chegou"): Promise<RespostaCheckin & { status: number }> {
  try {
    const res = await fetch("/api/casa/checkin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ref, acao }) });
    const j = await res.json().catch(() => ({}));
    return { status: res.status, ok: res.ok, erro: j.erro, reserva: j.reserva ?? null, jaTinhaChegado: j.jaTinhaChegado };
  } catch {
    return { status: 0, ok: false, erro: "Sem conexão. Tente de novo." };
  }
}

/** Resultado grande, para ler de longe na porta: verde = pode entrar; amarelo = já tinha entrado; vermelho = problema. */
export function ResultadoPorta({ r, onDesfazer }: { r: RespostaCheckin; onDesfazer?: () => void }) {
  const res = r.reserva;
  const tom = !r.ok ? "erro" : r.jaTinhaChegado ? "aviso" : "ok";
  return (
    <div className={`cs-porta cs-porta-${tom}`} role="status" aria-live="assertive">
      <div className="cs-porta-titulo">{!r.ok ? "Não liberado" : r.jaTinhaChegado ? "Já tinha entrado" : "Pode entrar"}</div>
      {res && (
        <>
          <div className="cs-porta-mesa">Mesa {res.mesa}</div>
          <div className="cs-porta-nome">
            {res.nome} · {res.pessoas} pessoa{res.pessoas > 1 ? "s" : ""}
          </div>
          <div className="cs-porta-det">
            {res.casaNome} · {formatData(res.data, "numerica")}
            {res.codigo ? ` · ${res.codigo}` : ""}
            {r.ok && res.chegou_em ? ` · chegou ${hora(res.chegou_em)}` : ""}
          </div>
        </>
      )}
      {!r.ok && r.erro && <div className="cs-porta-msg">{r.erro}</div>}
      {r.ok && !r.jaTinhaChegado && onDesfazer && (
        <button type="button" className="cs-btn cs-btn-neutro" style={{ marginTop: 10 }} onClick={onDesfazer}>
          Desfazer
        </button>
      )}
    </div>
  );
}

type Detector = { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> };

/**
 * Leitor de QR da porta: câmera de trás do celular. Usa o leitor do próprio navegador (Android/Chrome) e, onde não
 * houver (iPhone), decodifica a imagem com jsQR. Também aceita digitar o código. Lê, registra a chegada e mostra o
 * resultado grande; "Ler próximo" volta à câmera.
 */
export default function LeitorPorta({ onFechar, onRegistrou }: { onFechar: () => void; onRegistrou: () => void }) {
  const video = useRef<HTMLVideoElement | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const fluxo = useRef<MediaStream | null>(null);
  const lendo = useRef(false);
  const [estadoCamera, setEstadoCamera] = useState<"iniciando" | "lendo" | "sem-camera">("iniciando");
  const [resultado, setResultado] = useState<(RespostaCheckin & { ref: string }) | null>(null);
  const [codigo, setCodigo] = useState("");
  const [enviando, setEnviando] = useState(false);

  const parar = useCallback(() => {
    lendo.current = false;
    fluxo.current?.getTracks().forEach((t) => t.stop());
    fluxo.current = null;
  }, []);

  const registrar = useCallback(
    async (ref: string) => {
      setEnviando(true);
      const r = await fazerCheckin(ref);
      setEnviando(false);
      setResultado({ ...r, ref });
      try {
        navigator.vibrate?.(r.ok ? 120 : [80, 60, 80]);
      } catch {
        /* sem vibração */
      }
      if (r.ok) onRegistrou();
    },
    [onRegistrou],
  );

  const iniciar = useCallback(async () => {
    setResultado(null);
    setEstadoCamera("iniciando");
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      fluxo.current = s;
      const v = video.current;
      if (!v) return;
      v.srcObject = s;
      await v.play();
      setEstadoCamera("lendo");
      lendo.current = true;
      // Leitor do navegador quando ele lê QR de verdade (Android); senão (iPhone, desktop) o jsQR.
      const Nativo = (window as unknown as { BarcodeDetector?: (new (o: { formats: string[] }) => Detector) & { getSupportedFormats?: () => Promise<string[]> } }).BarcodeDetector;
      let detector: Detector | null = null;
      try {
        if (Nativo && (await Nativo.getSupportedFormats?.())?.includes("qr_code")) detector = new Nativo({ formats: ["qr_code"] });
      } catch {
        detector = null;
      }
      let jsQR: typeof import("jsqr").default | null = detector ? null : (await import("jsqr")).default;
      const passo = async () => {
        if (!lendo.current || !video.current) return;
        let texto: string | null = null;
        try {
          if (detector) {
            try {
              const achados = await detector.detect(video.current);
              texto = achados[0]?.rawValue ?? null;
            } catch {
              // Leitor do navegador falhou: passa para o jsQR de vez.
              detector = null;
              jsQR = (await import("jsqr")).default;
            }
          } else if (jsQR && canvas.current && video.current.videoWidth) {
            const c = canvas.current;
            const w = Math.min(video.current.videoWidth, 640);
            const h = Math.round((video.current.videoHeight / video.current.videoWidth) * w);
            c.width = w;
            c.height = h;
            const ctx = c.getContext("2d", { willReadFrequently: true });
            if (ctx) {
              ctx.drawImage(video.current, 0, 0, w, h);
              texto = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "dontInvert" })?.data ?? null;
            }
          }
        } catch {
          /* quadro ruim: tenta o próximo */
        }
        if (texto) {
          parar();
          await registrar(texto);
          return;
        }
        setTimeout(() => requestAnimationFrame(passo), 120);
      };
      requestAnimationFrame(passo);
    } catch {
      setEstadoCamera("sem-camera");
    }
  }, [parar, registrar]);

  useEffect(() => {
    iniciar();
    return parar;
  }, [iniciar, parar]);

  async function desfazer() {
    if (!resultado?.reserva) return;
    const r = await fazerCheckin(resultado.reserva.id, "desfazer");
    setResultado(r.ok ? null : { ...r, ref: resultado.ref });
    if (r.ok) onRegistrou();
    if (r.ok) iniciar();
  }

  return (
    <div className="cs-leitor" role="dialog" aria-modal="true" aria-label="Check-in na entrada">
      <div className="cs-leitor-topo">
        <strong>Check-in na entrada</strong>
        <button
          type="button"
          className="cs-botao-topo"
          onClick={() => {
            parar();
            onFechar();
          }}
        >
          Fechar
        </button>
      </div>

      {resultado ? (
        <div className="cs-leitor-corpo">
          <ResultadoPorta r={resultado} onDesfazer={desfazer} />
          <button type="button" className="cs-btn cs-btn-aprovar cs-leitor-proximo" onClick={iniciar}>
            Ler próximo
          </button>
        </div>
      ) : (
        <div className="cs-leitor-corpo">
          <div className="cs-leitor-video">
            <video ref={video} playsInline muted />
            <canvas ref={canvas} hidden />
            {estadoCamera === "lendo" && <div className="cs-leitor-mira" aria-hidden="true" />}
            {estadoCamera === "iniciando" && <p>Abrindo a câmera…</p>}
            {estadoCamera === "sem-camera" && <p>Não deu para abrir a câmera. Libere a câmera para este app ou digite o código abaixo.</p>}
          </div>
          <p className="cs-leitor-dica">Aponte para o QR da reserva no celular do cliente.</p>
        </div>
      )}

      <form
        className="cs-leitor-codigo"
        onSubmit={(e) => {
          e.preventDefault();
          if (!codigo.trim()) return;
          parar();
          registrar(codigo.trim());
          setCodigo("");
        }}
      >
        <input value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} placeholder="Ou digite o código: HG-482193" aria-label="Código da reserva" autoCapitalize="characters" />
        <button type="submit" className="cs-btn cs-btn-aprovar" disabled={enviando || !codigo.trim()}>
          {enviando ? "…" : "Registrar"}
        </button>
      </form>
    </div>
  );
}
