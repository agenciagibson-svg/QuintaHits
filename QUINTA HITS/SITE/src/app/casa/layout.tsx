import type { Metadata, Viewport } from "next";
import { site } from "@/config/site";
import "./casa.css";

/** App da casa: o dono do bar instala no celular (tela inicial) e só vê reservas. Manifest e ícones próprios. */
export const metadata: Metadata = {
  title: { default: `Reservas · ${site.casa.nome}`, template: `%s · Reservas ${site.casa.nome}` },
  description: `Pedidos de mesa da ${site.nome} no ${site.casa.nome}.`,
  manifest: "/casa/manifest.webmanifest",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "Reservas QH", statusBarStyle: "black-translucent" },
  icons: { icon: "/casa/icones/icone-192.png", apple: "/casa/icones/apple-touch-icon.png" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#17352B",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function CasaLayout({ children }: { children: React.ReactNode }) {
  return <div className="cs">{children}</div>;
}
