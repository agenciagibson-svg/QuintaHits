import PaginaReservaCasa, { metadadosDaCasa } from "@/components/PaginaReservaCasa";
import { edicaoIdValido } from "@/config/casas";

export const dynamic = "force-dynamic";

export const metadata = metadadosDaCasa("harley-grill");

/** Reserva de mesa do Harley Grill. No domínio próprio do Harley, o endereço raiz traz para cá (middleware). `?edicao=` abre direto numa noite. */
export default async function ReservarHarleyGrill({ searchParams }: { searchParams: Promise<{ edicao?: string }> }) {
  const { edicao } = await searchParams;
  return <PaginaReservaCasa casa="harley-grill" edicaoInicial={edicaoIdValido(edicao) ? edicao : undefined} />;
}
