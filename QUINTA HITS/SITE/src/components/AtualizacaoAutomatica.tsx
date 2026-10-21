"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { VERSAO_DO_BUILD, temVersaoNova } from "@/lib/versao";

/** De quanto em quanto tempo pergunta ao servidor se saiu deploy novo (com a página na frente). */
const CONFERIR_A_CADA_MS = 60_000;
const CHAVE_TENTATIVA = "qh-recarregou-para";

/**
 * Atualização automática depois de cada deploy na Vercel — site, páginas das casas e app da casa (PWA).
 * Confere a versão no ar a cada minuto, ao voltar para a página/app e ao voltar a internet. Saiu versão nova:
 *  - ninguém preenchendo formulário → recarrega na hora (na frente ou em segundo plano);
 *  - alguém preenchendo um formulário (ex.: pedido de mesa) ou com o pedido recém-enviado na tela → não perde nada:
 *    mostra a faixa "Nova versão" com o botão Atualizar e recarrega sozinho quando ficar livre.
 * No painel (/admin), onde há formulários abertos o tempo todo, só mostra a faixa com o botão.
 */
export default function AtualizacaoAutomatica() {
  const caminho = usePathname();
  const soAviso = !!caminho?.startsWith("/admin");
  const [nova, setNova] = useState(false);
  const novaRef = useRef(false);

  useEffect(() => {
    if (!VERSAO_DO_BUILD) return; // desenvolvimento local: sem versão, nada a fazer
    let vivo = true;

    const recarregar = (versao: string) => {
      // Proteção contra laço: se já recarregou para esta versão há pouco e ela continua diferente, só avisa.
      try {
        const ultima = JSON.parse(sessionStorage.getItem(CHAVE_TENTATIVA) || "null") as { v: string; t: number } | null;
        if (ultima && ultima.v === versao && Date.now() - ultima.t < 5 * 60_000) return false;
        sessionStorage.setItem(CHAVE_TENTATIVA, JSON.stringify({ v: versao, t: Date.now() }));
      } catch {
        /* sem sessionStorage (modo privado): segue */
      }
      window.location.reload();
      return true;
    };

    let versaoNoAr = "";
    const tentarAplicar = () => {
      if (!novaRef.current || soAviso) return;
      // Ninguém no meio de um formulário (nem com o pedido de mesa recém-enviado na tela): recarrega já, na frente ou
      // em segundo plano (ao voltar para o app a pessoa encontra a versão nova). Senão, avisa e espera ficar livre.
      if (!alguemDigitando() && recarregar(versaoNoAr)) return;
      setNova(true);
    };

    const conferir = async () => {
      try {
        const res = await fetch(`/api/versao?t=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) return;
        const { versao } = (await res.json()) as { versao?: unknown };
        if (!vivo || !temVersaoNova(VERSAO_DO_BUILD, versao)) return;
        versaoNoAr = versao as string;
        novaRef.current = true;
        if (soAviso) setNova(true);
        else tentarAplicar();
      } catch {
        /* sem internet: confere de novo depois */
      }
    };

    const aoVoltar = () => {
      if (document.visibilityState !== "visible") return;
      if (novaRef.current) tentarAplicar();
      else conferir();
    };
    conferir(); // ao abrir (ex.: app reaberto do segundo plano com a página antiga ainda na memória)
    const intervalo = setInterval(() => {
      if (novaRef.current) tentarAplicar();
      else if (document.visibilityState === "visible") conferir();
    }, CONFERIR_A_CADA_MS);
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("online", conferir);
    window.addEventListener("focus", aoVoltar);
    // Formulário que fica livre (saiu do campo) com versão nova pendente: aplica em seguida.
    const aoSairDoCampo = () => setTimeout(() => novaRef.current && tentarAplicar(), 1500);
    document.addEventListener("focusout", aoSairDoCampo);

    return () => {
      vivo = false;
      clearInterval(intervalo);
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("online", conferir);
      window.removeEventListener("focus", aoVoltar);
      document.removeEventListener("focusout", aoSairDoCampo);
    };
  }, [soAviso]);

  if (!nova) return null;
  return (
    <div className="atualizacao" role="status">
      <span>Nova versão do site no ar.</span>
      <button type="button" onClick={() => window.location.reload()}>
        Atualizar
      </button>
    </div>
  );
}

/** Alguém preenchendo formulário (campo em foco ou já com algo digitado) ou tela que não pode sumir (pedido enviado). */
function alguemDigitando(): boolean {
  if (document.querySelector("[data-manter-tela]")) return true;
  const ativo = document.activeElement as HTMLElement | null;
  if (ativo && (ativo.tagName === "INPUT" || ativo.tagName === "TEXTAREA" || ativo.tagName === "SELECT" || ativo.isContentEditable)) return true;
  const campos = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
    'input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([readonly]), textarea:not([readonly])',
  );
  return Array.from(campos).some((c) => c.value.trim() !== "" && c.offsetParent !== null);
}
