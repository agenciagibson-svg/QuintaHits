import type { Metadata, Viewport } from "next";
import "./globals.css";
import { site } from "@/config/site";
import { getSiteConfig, reservaHrefFrom } from "@/lib/siteConfig";
import { datasComEvento, reservaDasOutrasCasas } from "@/lib/programacao";
import ForaDoAdmin from "@/components/ForaDoAdmin";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import HojeBanner from "@/components/HojeBanner";

const GOOGLE_FONTS =
  "https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700&display=swap";

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: { default: `${site.nome} — ${site.slogan}`, template: `%s — ${site.nome}` },
  description: site.descricao,
  keywords: ["Quinta Hits", "Uberlândia", "música ao vivo", "agenda", "bar", "Florindos Bar", "Harley Grill", "nightlife", "HITS PRODUÇÕES"],
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
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#17352B",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cfg = await getSiteConfig();
  // Falha do banco não derruba o layout (login do admin, 404): a faixa "hoje tem" só não aparece.
  const comEvento = await datasComEvento().catch(() => [] as string[]);
  const outrasCasas = await reservaDasOutrasCasas().catch(() => ({}) as Record<string, string>);
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
  };

  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={GOOGLE_FONTS} />
      </head>
      <body>
        <ForaDoAdmin>
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
          <HojeBanner reservaUrl={reservaHrefFrom(cfg)} datasComEvento={comEvento} reservaPorData={outrasCasas} />
          <Header />
        </ForaDoAdmin>
        <main>{children}</main>
        <ForaDoAdmin>
          <Footer />
        </ForaDoAdmin>
      </body>
    </html>
  );
}
