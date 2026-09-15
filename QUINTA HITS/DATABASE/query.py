#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
QUINTA HITS — query.py
Executa SQL contra o banco. O arquivo .db é copiado para uma pasta temporária
antes da leitura: pastas montadas/sincronizadas não suportam o lock do SQLite,
e isso garante que a consulta funcione em qualquer ambiente.

Uso:
    python3 query.py "SELECT * FROM vw_funil_edicao"
    python3 query.py queries/01_auditoria_ultima_campanha.sql
    python3 query.py queries/05_roi_por_edicao.sql --csv saida.csv
    python3 query.py --tabelas
"""
import csv, os, shutil, sqlite3, sys, tempfile

BASE = os.path.dirname(os.path.abspath(__file__))
DB = os.path.join(BASE, "quinta_hits.db")


def abrir():
    if not os.path.exists(DB) or os.path.getsize(DB) == 0:
        sys.exit("banco ausente ou vazio — rode: python3 build_db.py")
    tmp = os.path.join(tempfile.mkdtemp(prefix="qh_query_"), "qh.db")
    shutil.copyfile(DB, tmp)
    con = sqlite3.connect(tmp)
    con.row_factory = sqlite3.Row
    return con


def imprimir(rows):
    if not rows:
        print("(nenhuma linha)")
        return
    cols = rows[0].keys()
    larg = {c: max(len(str(c)), *(len(str(r[c])) if r[c] is not None else 1 for r in rows)) for c in cols}
    larg = {c: min(v, 42) for c, v in larg.items()}
    print(" | ".join(str(c)[:larg[c]].ljust(larg[c]) for c in cols))
    print("-+-".join("-" * larg[c] for c in cols))
    for r in rows:
        print(" | ".join(("" if r[c] is None else str(r[c]))[:larg[c]].ljust(larg[c]) for c in cols))
    print(f"\n{len(rows)} linha(s)")


def main():
    args = [a for a in sys.argv[1:]]
    if not args or args[0] in ("-h", "--help"):
        print(__doc__)
        return
    con = abrir()
    if args[0] == "--tabelas":
        for r in con.execute("SELECT type, name FROM sqlite_master "
                             "WHERE type IN ('table','view') ORDER BY type DESC, name"):
            n = con.execute(f"SELECT COUNT(*) FROM {r['name']}").fetchone()[0]
            print(f"{r['type']:<5} {r['name']:<28} {n}")
        return
    destino = None
    if "--csv" in args:
        i = args.index("--csv")
        destino = args[i + 1]
        args = args[:i] + args[i + 2:]
    alvo = args[0]
    sql = open(os.path.join(BASE, alvo) if not os.path.isabs(alvo) else alvo,
               encoding="utf-8").read() if alvo.endswith(".sql") else alvo
    blocos = []
    for b in sql.split(";"):
        # remove linhas de comentario para nao descartar o statement inteiro
        corpo = "\n".join(l for l in b.splitlines() if not l.strip().startswith("--")).strip()
        if corpo:
            blocos.append(corpo)
    for b in blocos:
        rows = con.execute(b).fetchall()
        imprimir(rows)
        if destino and rows:
            with open(destino, "w", newline="", encoding="utf-8") as fh:
                w = csv.writer(fh)
                w.writerow(rows[0].keys())
                w.writerows([tuple(r) for r in rows])
            print(f"csv salvo em {destino}")
        print()


if __name__ == "__main__":
    main()
