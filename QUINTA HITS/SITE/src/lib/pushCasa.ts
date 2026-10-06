import "server-only";
import webpush from "web-push";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { emailDaCasa } from "@/lib/casaAuth";

/**
 * Avisos no celular do dono do bar (app da casa) quando chega pedido de mesa novo — Web Push com chaves VAPID.
 * Sem VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY na Vercel, tudo aqui fica desligado (o app funciona igual, sem avisos).
 * A mensagem não leva nome nem telefone do cliente (aparece na tela bloqueada): só mesa, pessoas e a data.
 */

export type InscricaoPush = { endpoint: string; keys: { p256dh: string; auth: string } };

export function chavePublicaPush(): string | null {
  const publica = process.env.VAPID_PUBLIC_KEY?.trim();
  const privada = process.env.VAPID_PRIVATE_KEY?.trim();
  return publica && privada ? publica : null;
}

/** Só serviços de push dos navegadores: o servidor nunca faz requisição para um endereço qualquer vindo do celular. */
const HOSTS_PUSH = [/^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/, /(^|\.)push\.apple\.com$/];
const CHAVE_RE = /^[A-Za-z0-9_-]{1,200}={0,2}$/;

export function validarInscricao(v: unknown): InscricaoPush | null {
  if (typeof v !== "object" || v === null) return null;
  const o = v as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  if (typeof o.endpoint !== "string" || o.endpoint.length > 1000) return null;
  let url: URL;
  try {
    url = new URL(o.endpoint);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !HOSTS_PUSH.some((h) => h.test(url.hostname))) return null;
  const { p256dh, auth } = o.keys ?? {};
  if (typeof p256dh !== "string" || typeof auth !== "string" || !CHAVE_RE.test(p256dh) || !CHAVE_RE.test(auth)) return null;
  return { endpoint: o.endpoint, keys: { p256dh, auth } };
}

const tabelaAusente = (e: { code?: string } | null) => !!e && (e.code === "42P01" || e.code === "PGRST205");

export async function salvarInscricao(insc: InscricaoPush, email: string): Promise<"ok" | "sem_tabela" | "erro"> {
  const { error } = await supabaseAdmin()
    .from("casa_push")
    .upsert({ endpoint: insc.endpoint, p256dh: insc.keys.p256dh, auth: insc.keys.auth, email }, { onConflict: "endpoint" });
  if (tabelaAusente(error)) return "sem_tabela";
  return error ? "erro" : "ok";
}

/** Apaga uma inscrição. Com `email`, só se for de quem pediu (ninguém desliga o aviso do celular de outra pessoa). */
export async function removerInscricao(endpoint: string, email?: string): Promise<void> {
  let consulta = supabaseAdmin().from("casa_push").delete().eq("endpoint", endpoint);
  if (email) consulta = consulta.eq("email", email);
  await consulta;
}

export type AvisoCasa = { titulo: string; corpo: string; url: string };

/**
 * Manda o aviso para todos os celulares inscritos. Inscrição que o navegador já descartou (404/410) é apagada.
 * Nunca lança erro: aviso é complementar e não pode atrapalhar a reserva.
 */
export async function notificarCasa(aviso: AvisoCasa): Promise<{ enviados: number; removidos: number }> {
  const publica = chavePublicaPush();
  const privada = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publica || !privada) return { enviados: 0, removidos: 0 };
  const { data, error } = await supabaseAdmin().from("casa_push").select("endpoint, p256dh, auth, email");
  if (error || !data?.length) return { enviados: 0, removidos: 0 };

  const assunto = process.env.VAPID_SUBJECT?.trim() || "mailto:agenciagibson@gmail.com";
  const carga = JSON.stringify(aviso);
  let enviados = 0;
  let removidos = 0;
  await Promise.all(
    (data as { endpoint: string; p256dh: string; auth: string; email: string }[]).map(async (l) => {
      // Quem saiu de CASA_EMAILS/ADMIN_EMAILS perde também os avisos, na hora: a inscrição é apagada sem envio.
      if (!emailDaCasa(l.email)) {
        await removerInscricao(l.endpoint).catch(() => undefined);
        removidos++;
        return;
      }
      try {
        await webpush.sendNotification({ endpoint: l.endpoint, keys: { p256dh: l.p256dh, auth: l.auth } }, carga, {
          vapidDetails: { subject: assunto, publicKey: publica, privateKey: privada },
          TTL: 6 * 60 * 60,
          urgency: "high",
        });
        enviados++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await removerInscricao(l.endpoint).catch(() => undefined);
          removidos++;
        } else {
          console.error("Aviso da casa não enviado:", status ?? "erro");
        }
      }
    }),
  );
  return { enviados, removidos };
}
