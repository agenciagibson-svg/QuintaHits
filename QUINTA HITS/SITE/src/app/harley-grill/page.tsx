import PaginaReservaCasa, { metadadosDaCasa } from "@/components/PaginaReservaCasa";

export const dynamic = "force-dynamic";

export const metadata = metadadosDaCasa("harley-grill");

/** Reserva de mesa do Harley Grill. No domínio próprio do Harley, o endereço raiz traz para cá (middleware). */
export default function ReservarHarleyGrill() {
  return <PaginaReservaCasa casa="harley-grill" />;
}
