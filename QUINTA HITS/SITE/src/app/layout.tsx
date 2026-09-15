import type { Metadata, Viewport } from "next";
import "./globals.css";
import { site } from "@/config/site";
import { getSiteConfig, reservaHrefFrom } from "@/lib/siteConfig";
import { datasCanceladas } from "@/lib/programacao";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import HojeBanner from "@/components/HojeBanner";

const GOOGLE_FONTS =
  "https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700&display=swap";

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: { default: `${site.nome} — ${site.slogan}`, template: `%s — ${site.nome}` },
  description: site.descricao,
  keywords: ["Quinta Hits", "Uberlândia", "quinta-feira", "música ao vivo", "bar", "Florindos Bar", "nightlife", "GIBSON PROMOÇÕES"],
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: site.nome,
    title: `${site.nome} — ${site.slogan}`,
    description: site.descricao,
    url: site.url,
  },
  twitter: { card: "summary_large_image", title: `${site.nome} — ${site.slogan}`, description: site.descricao },
  robots: { index: true, follow: true },
  alternates: { canonical: "/" },
};

export const viewport: Viewport = {
  themeColor: "#17352B",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cfg = await getSiteConfig();
  // Falha do banco não derruba o layout (login do admin, 404): a faixa só deixa de filtrar canceladas.
  const canceladas = await datasCanceladas().catch(() => [] as string[]);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "EventSeries",
    name: site.nome,
    description: site.descricao,
    url: site.url,
    organizer: { "@type": "Organization", name: site.empresa },
    location: {
      "@type": "Place",
      name: site.casa.nome,
      address: { "@type": "PostalAddress", addressLocality: site.cidade, addressRegion: site.uf, addressCountry: "BR" },
    },
    eventSchedule: { "@type": "Schedule", byDay: "https://schema.org/Thursday", repeatFrequency: "P1W" },
  };

  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={GOOGLE_FONTS} />
      </head>
      <body>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <HojeBanner reservaUrl={reservaHrefFrom(cfg)} datasCanceladas={canceladas} />
        <Header />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
