import { GENEROS, type Genero } from "@/lib/programacao";

/** Aba de edição pendurada no canto reto da placa — como na identidade. */
export default function Aba({ genero, inline = false }: { genero: Genero; inline?: boolean }) {
  if (!genero) return null;
  const g = GENEROS[genero];
  return <span className={`aba aba--${g.cor} ${inline ? "aba--inline" : ""}`}>{g.rotulo}</span>;
}
