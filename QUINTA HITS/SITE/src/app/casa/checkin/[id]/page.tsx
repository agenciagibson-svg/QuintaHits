import CheckinPorLink from "./CheckinPorLink";

export const dynamic = "force-dynamic";

/** QR lido com a câmera do celular (fora do app): abre aqui, já com login da casa (o middleware exige), e registra a chegada. */
export default async function CheckinPeloQr({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CheckinPorLink id={id} />;
}
