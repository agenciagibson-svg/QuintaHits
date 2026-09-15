import Link from "next/link";

export default function NotFound() {
  return (
    <section className="nao">
      <div>
        <div className="eyebrow">Essa página não existe</div>
        <h1 className="display h-1" style={{ margin: "8px 0 20px" }}>Mas a quinta existe.</h1>
        <Link className="btn btn--creme" href="/">Voltar pro início</Link>
      </div>
    </section>
  );
}
