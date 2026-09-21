import Link from "next/link";
import Image from "next/image";
import { alvoLink, instagramUrl } from "@/config/site";
import { getSiteConfig, reservaHrefFrom } from "@/lib/siteConfig";

export default async function Header() {
  const site = await getSiteConfig();
  return (
    <header className="header">
      <div className="wrap header__in">
        <Link href="/" className="header__logo" aria-label={`${site.nome} — início`}>
          <Image src="/brand/wordmark-horizontal.svg" alt={site.nome} width={868} height={170} priority unoptimized />
        </Link>
        <nav className="nav" aria-label="Principal">
          <Link href="/programacao">Programação</Link>
          <a className="nav__oculto-m" href={instagramUrl(site.instagram)} target="_blank" rel="noopener noreferrer">
            Instagram
          </a>
          <a className="btn btn--terracota btn--p" href={reservaHrefFrom(site)} {...alvoLink(reservaHrefFrom(site))}>
            Reservar mesa
          </a>
        </nav>
      </div>
    </header>
  );
}
