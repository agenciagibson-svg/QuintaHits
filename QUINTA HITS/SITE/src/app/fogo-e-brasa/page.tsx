import PaginaReservaCasa, { metadadosDaCasa } from "@/components/PaginaReservaCasa";
import { edicaoIdValido } from "@/config/casas";

export const dynamic = "force-dynamic";

export const metadata = metadadosDaCasa("fogo-e-brasa");

/** Reserva de mesa do Fogo e Brasa (Caldas Novas/GO). Num domínio próprio da casa, o endereço raiz traz para cá (middleware). `?edicao=` abre direto numa noite. */
export default async function ReservarFogoEBrasa({ searchParams }: { searchParams: Promise<{ edicao?: string }> }) {
  const { edicao } = await searchParams;
  return <PaginaReservaCasa casa="fogo-e-brasa" edicaoInicial={edicaoIdValido(edicao) ? edicao : undefined} />;
}
