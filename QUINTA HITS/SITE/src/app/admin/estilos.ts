/** Estilos do painel admin (compartilhados entre as seções). Paleta da marca: verde, creme, terracota e mostarda. */

export const cor = {
  fundo: "#121211",
  lateral: "#0c0c0b",
  cartao: "#1a1a18",
  cartaoAlto: "#222220",
  linha: "rgba(241, 231, 210, 0.09)",
  linhaForte: "rgba(241, 231, 210, 0.18)",
  texto: "#F1E7D2",
  suave: "rgba(241, 231, 210, 0.62)",
  mostarda: "#D5A62A",
  terracota: "#B84A32",
  verde: "#17352B",
  verdeClaro: "#8fd6aa",
  alerta: "#3a3320",
};

const botaoBase: React.CSSProperties = {
  borderRadius: 8,
  padding: "6px 12px",
  marginRight: 6,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 500,
  lineHeight: 1.3,
};

export const s: Record<string, React.CSSProperties> = {
  pagina: { minHeight: "100vh", background: cor.fundo, color: cor.texto, fontFamily: "var(--texto, system-ui, sans-serif)", fontSize: 14, lineHeight: 1.5 },
  topo: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 },
  h1: { margin: 0, fontSize: 22 },
  h2: { margin: "0 0 4px", fontSize: 16, fontWeight: 700, color: cor.texto },
  h3: { margin: "20px 0 6px", fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: cor.mostarda },
  legenda: { margin: "0 0 14px", fontSize: 13, color: cor.suave },
  botaoSair: { background: "transparent", border: `1px solid ${cor.linhaForte}`, color: cor.texto, borderRadius: 8, padding: "6px 14px", cursor: "pointer" },
  aviso: { background: cor.verde, color: "#fff", padding: "10px 14px", borderRadius: 10, marginBottom: 14, fontSize: 13 },
  avisoErro: { background: "rgba(184, 74, 50, 0.16)", border: `1px solid rgba(184, 74, 50, 0.5)`, color: "#f3c3b6", padding: "10px 14px", borderRadius: 10, marginBottom: 14, fontSize: 13 },
  secao: { background: cor.cartao, border: `1px solid ${cor.linha}`, borderRadius: 14, padding: 22, marginBottom: 18 },
  gridConfig: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, alignItems: "end" },
  gridNova: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, alignItems: "end" },
  campo: { display: "flex", flexDirection: "column", gap: 6, fontSize: 12, fontWeight: 500, color: cor.suave },
  input: { padding: "9px 11px", borderRadius: 8, border: `1px solid ${cor.linhaForte}`, background: "#0f0f0e", color: cor.texto, fontSize: 14, fontFamily: "inherit" },
  botaoSalvar: { gridColumn: "1 / -1", justifySelf: "start", background: cor.terracota, color: "#fff", border: "none", borderRadius: 8, padding: "10px 18px", cursor: "pointer", fontWeight: 600, fontSize: 14, marginTop: 4 },
  tabela: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: { textAlign: "left", padding: "10px 12px", borderBottom: `1px solid ${cor.linhaForte}`, color: cor.suave, fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap" },
  td: { padding: "11px 12px", borderBottom: `1px solid ${cor.linha}`, verticalAlign: "middle" },
  inputCelula: { width: "100%", padding: "5px 8px", borderRadius: 6, border: `1px solid ${cor.linhaForte}`, background: "#0f0f0e", color: cor.texto, fontSize: 13, fontFamily: "inherit" },
  botaoMini: { ...botaoBase, background: cor.verde, color: "#fff", border: `1px solid ${cor.verde}` },
  botaoMiniOutline: { ...botaoBase, background: "transparent", color: cor.texto, border: `1px solid ${cor.linhaForte}` },
  botaoMiniPerigo: { ...botaoBase, background: "transparent", color: "#e58a74", border: "1px solid rgba(184, 74, 50, 0.6)" },
  gridMapa: { display: "flex", flexWrap: "wrap", gap: 20, marginTop: 20, alignItems: "flex-start" },
  colunaMapa: { flex: "2 1 420px", minWidth: 0 },
  cartao: { flex: "1 1 220px", background: cor.cartaoAlto, border: `1px solid ${cor.linha}`, borderRadius: 12, padding: 18 },
  selo: { display: "inline-block", borderRadius: 999, padding: "3px 10px", fontSize: 12, fontWeight: 600, lineHeight: 1.4, whiteSpace: "nowrap" },
};

/** Selos (pílulas de status) com as cores da marca. */
export const tom = {
  ok: { background: "rgba(143, 214, 170, 0.14)", color: cor.verdeClaro },
  alerta: { background: "rgba(213, 166, 42, 0.16)", color: cor.mostarda },
  perigo: { background: "rgba(184, 74, 50, 0.2)", color: "#f0a18d" },
  neutro: { background: "rgba(241, 231, 210, 0.08)", color: cor.suave },
} satisfies Record<string, React.CSSProperties>;

export type Tom = keyof typeof tom;
export const selo = (t: Tom): React.CSSProperties => ({ ...s.selo, ...tom[t] });

/** CSS que precisa de media query / hover (o resto é inline). */
export const cssAdmin = `
.qh-shell { color-scheme: dark; accent-color: ${cor.mostarda}; display: grid; grid-template-columns: 248px minmax(0, 1fr); min-height: 100vh; }
.qh-lateral { position: sticky; top: 0; height: 100vh; background: ${cor.lateral}; border-right: 1px solid ${cor.linha}; display: flex; flex-direction: column; padding: 22px 14px; gap: 4px; }
.qh-marca { font-family: var(--display, Impact, sans-serif); font-size: 30px; line-height: 0.9; letter-spacing: 0.02em; color: ${cor.texto}; padding: 0 10px 4px; }
.qh-marca small { display: block; font-family: var(--texto, system-ui); font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: ${cor.mostarda}; margin-top: 8px; }
.qh-nav { display: flex; flex-direction: column; gap: 2px; margin-top: 22px; }
.qh-nav-grupo { font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: rgba(241,231,210,0.38); padding: 14px 12px 6px; }
.qh-item { display: flex; align-items: center; gap: 11px; width: 100%; text-align: left; background: transparent; border: 0; color: ${cor.suave}; padding: 9px 12px; border-radius: 9px; font-size: 14px; font-weight: 500; transition: background .15s, color .15s; }
.qh-item:hover { background: rgba(241,231,210,0.05); color: ${cor.texto}; }
.qh-item[aria-current="page"] { background: rgba(213,166,42,0.12); color: ${cor.texto}; }
.qh-item[aria-current="page"] svg { color: ${cor.mostarda}; }
.qh-item svg { flex: none; }
.qh-badge { margin-left: auto; background: ${cor.terracota}; color: #fff; border-radius: 999px; font-size: 11px; font-weight: 700; padding: 1px 8px; }
.qh-rodape { margin-top: auto; display: flex; flex-direction: column; gap: 8px; padding: 0 4px; }
.qh-main { min-width: 0; padding: 30px clamp(18px, 3.5vw, 44px) 64px; }
.qh-conteudo { max-width: 1120px; margin: 0 auto; }
.qh-cabecalho { display: flex; flex-wrap: wrap; gap: 12px; justify-content: space-between; align-items: flex-end; margin-bottom: 22px; }
.qh-cabecalho h1 { margin: 0; font-family: var(--display, Impact, sans-serif); font-weight: 400; font-size: clamp(30px, 3.4vw, 42px); line-height: 1; letter-spacing: 0.01em; }
.qh-cabecalho p { margin: 6px 0 0; color: ${cor.suave}; font-size: 14px; max-width: 70ch; }
.qh-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 14px; margin-bottom: 18px; }
.qh-kpi { background: ${cor.cartao}; border: 1px solid ${cor.linha}; border-radius: 14px; padding: 18px; display: flex; flex-direction: column; gap: 6px; text-align: left; color: ${cor.texto}; transition: border-color .15s, transform .15s; }
button.qh-kpi:hover { border-color: ${cor.linhaForte}; transform: translateY(-1px); }
.qh-kpi-rotulo { font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: ${cor.suave}; font-weight: 600; }
.qh-kpi-valor { font-family: var(--display, Impact, sans-serif); font-size: 44px; line-height: 0.95; }
.qh-kpi-sub { font-size: 13px; color: ${cor.suave}; }
.qh-duas { display: grid; grid-template-columns: 1.25fr 1fr; gap: 18px; align-items: start; }
.qh-passo { display: flex; gap: 12px; align-items: flex-start; padding: 12px 0; border-bottom: 1px solid ${cor.linha}; }
.qh-passo:last-child { border-bottom: 0; }
.qh-bola { flex: none; width: 24px; height: 24px; border-radius: 999px; display: grid; place-items: center; font-size: 12px; font-weight: 700; }
.qh-barra { height: 6px; border-radius: 999px; background: rgba(241,231,210,0.08); overflow: hidden; margin: 10px 0 6px; }
.qh-barra > span { display: block; height: 100%; background: ${cor.mostarda}; border-radius: 999px; }
.qh-linha-ed { display: flex; align-items: center; gap: 14px; padding: 11px 0; border-bottom: 1px solid ${cor.linha}; }
.qh-linha-ed:last-child { border-bottom: 0; }
.qh-data { flex: none; width: 52px; text-align: center; border-radius: 10px; background: rgba(241,231,210,0.05); padding: 5px 0; }
.qh-data b { display: block; font-family: var(--display, Impact, sans-serif); font-weight: 400; font-size: 24px; line-height: 1; }
.qh-data small { font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: ${cor.suave}; }
.qh-salvar { position: sticky; bottom: 0; padding: 14px 0 18px; background: linear-gradient(to top, ${cor.fundo} 70%, transparent); z-index: 5; }
.qh-tabela tbody tr:hover td { background: rgba(241,231,210,0.025); }
.qh-detalhes summary { cursor: pointer; color: ${cor.suave}; font-size: 13px; padding: 6px 0; }
.qh-detalhes summary:hover { color: ${cor.texto}; }
.qh-main input:focus, .qh-main select:focus, .qh-main textarea:focus { outline: 2px solid rgba(213,166,42,0.5); outline-offset: 1px; border-color: transparent; }
.qh-main button:focus-visible, .qh-item:focus-visible { outline: 2px solid ${cor.mostarda}; outline-offset: 2px; }
.qh-main button:disabled { opacity: .5; cursor: not-allowed; }
@media (max-width: 900px) {
  .qh-shell { grid-template-columns: minmax(0, 1fr); }
  .qh-kpis { grid-template-columns: minmax(0, 1fr) !important; gap: 10px; }
  .qh-kpis.qh-compacto { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
  .qh-kpi { padding: 14px; }
  .qh-kpi-valor { font-size: 34px; }
  .qh-lateral { position: sticky; top: 0; z-index: 20; height: auto; flex-direction: row; align-items: center; padding: 10px 12px; gap: 10px; }
  .qh-marca { font-size: 22px; padding: 0 4px; }
  .qh-marca small { display: none; }
  .qh-nav { flex-direction: row; margin: 0; overflow-x: auto; flex: 1; min-width: 0; scrollbar-width: none; }
  .qh-nav-grupo { display: none; }
  .qh-item { white-space: nowrap; padding: 8px 10px; }
  .qh-item svg { display: none; }
  .qh-rodape { margin: 0; }
  .qh-rodape .qh-site { display: none; }
  .qh-duas { grid-template-columns: minmax(0, 1fr); }
  .qh-main { padding-top: 22px; }
}
`;
