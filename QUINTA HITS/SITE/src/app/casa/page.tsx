import { dataISOValida } from "@/lib/edicao";
import AppCasa from "./AppCasa";

export const dynamic = "force-dynamic";

/** App da casa: o login é exigido pelo middleware antes de chegar aqui. `?edicao=` vem do toque no aviso de pedido novo. */
export default async function Casa({ searchParams }: { searchParams: Promise<{ edicao?: string }> }) {
  const { edicao } = await searchParams;
  return <AppCasa edicaoInicial={dataISOValida(edicao) ? edicao : undefined} />;
}
