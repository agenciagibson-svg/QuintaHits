import { site } from "@/config/site";

export default function Marquee({ texto = site.assinatura }: { texto?: string }) {
  const itens = Array.from({ length: 12 });
  return (
    <div className="marquee" aria-hidden="true">
      <div className="marquee__faixa">
        {itens.map((_, i) => (
          <span key={i} className="marquee__item">
            {texto} <i />
          </span>
        ))}
      </div>
    </div>
  );
}
