import Image from "next/image";
import Link from "next/link";
import { instagramUrl } from "@/config/site";
import { getSiteConfig, reservaHrefFrom } from "@/lib/siteConfig";

export default async function Footer() {
  const site = await getSiteConfig();
  const ano = new Date().getFullYear();
  return (
    <footer className="footer">
      <div className="wrap">
        <div className="footer__in">
          <div className="footer__marca">
            <Image src="/brand/wordmark-horizontal.svg" alt={site.nome} width={868} height={170} unoptimized />
            <p>
              {site.slogan} Música, amigos, drinks e encontros. Toda quinta, no {site.casa.nome}, em {site.cidade}.
            </p>
          </div>
          <div className="footer__col">
            <Link href="/programacao">Programação</Link>
            <a href={reservaHrefFrom(site)} target="_blank" rel="noopener noreferrer">Reservar mesa</a>
            <a href={instagramUrl(site.instagram)} target="_blank" rel="noopener noreferrer">@{site.instagram}</a>
            <a href={site.casa.mapsUrl} target="_blank" rel="noopener noreferrer">Como chegar</a>
          </div>
          <div className="footer__col">
            <span className="footer__empresa">Uma label {site.empresa}</span>
            <span className="muted">{site.hashtagEmpresa}</span>
            <span className="muted">{site.cidade}/{site.uf}</span>
          </div>
        </div>
        <div className="footer__base">
          <span>© {ano} {site.nome} · {site.empresa}</span>
          <span>{site.assinatura}</span>
        </div>
      </div>
    </footer>
  );
}
