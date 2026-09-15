import { GENEROS, type Genero } from "@/lib/edicao";

/** Aba de edição pendurada no canto reto da placa — como na identidade. */
export default function Aba({ genero, inline = false }: { genero: Genero; inline?: boolean }) {
  // gênero fora da lista (ex.: editado direto no banco) não renderiza aba em vez de quebrar a página
  const g = genero ? GENEROS[genero as Exclude<Genero, "">] : undefined;
  if (!g) return null;
  return <span className={`aba aba--${g.cor} ${inline ? "aba--inline" : ""}`}>{g.rotulo}</span>;
}
