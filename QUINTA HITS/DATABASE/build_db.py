#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
QUINTA HITS — build_db.py
Reconstrói o banco SQLite a partir dos CSVs em DATABASE/csv/.

Uso:
    python3 build_db.py            # reconstrói quinta_hits.db
    python3 build_db.py --check    # reconstrói e imprime resumo de linhas

Os CSVs são a FONTE DE VERDADE. O .db é derivado e pode ser apagado
e regenerado a qualquer momento. Nunca edite o .db diretamente.
"""
import csv
import os
import re
import shutil
import sqlite3
import sys
import tempfile

BASE = os.path.dirname(os.path.abspath(__file__))
CSV_DIR = os.path.join(BASE, "csv")
DB_PATH = os.path.join(BASE, "quinta_hits.db")
SCHEMA = os.path.join(BASE, "schema.sql")
VIEWS = os.path.join(BASE, "views.sql")

# Ordem de carga respeitando as chaves estrangeiras
LOAD_ORDER = [
    "locais", "artistas", "parceiros", "eventos", "eventos_artistas",
    "publicos", "criativos", "campanhas", "conjuntos_anuncios", "anuncios",
    "metricas_campanha", "metricas_diarias", "demografia_entrega",
    "metricas_organicas", "reservas", "financeiro", "kpis_metas",
    "copys", "conteudo_calendario", "assinaturas_verbais", "paleta_cores",
    "assets", "aprendizados", "testes", "decisoes",
]


def table_columns(con, table):
    return [r[1] for r in con.execute(f"PRAGMA table_info({table})")]


def coerce(value, decltype):
    """Converte texto do CSV no tipo da coluna. Vazio -> NULL."""
    v = (value or "").strip()
    if v == "":
        return None
    t = (decltype or "").upper()
    if t.startswith("INT") or t.startswith("REAL") or t.startswith("NUM"):
        n = re.sub(r"[R$\s%]", "", v)
        if "," in n and "." in n:
            n = n.replace(".", "").replace(",", ".")   # 1.234,56 -> 1234.56
        elif "," in n:
            n = n.replace(",", ".")
        try:
            return int(round(float(n))) if t.startswith("INT") else float(n)
        except ValueError:
            print(f"  ! valor nao numerico mantido como texto: {v!r}")
            return v
    return v


def main():
    if not os.path.isdir(CSV_DIR):
        sys.exit(f"pasta nao encontrada: {CSV_DIR}")

    # O banco é montado em diretório temporário e copiado no final: pastas
    # sincronizadas/montadas (iCloud, Drive, Cowork) não suportam o lock do SQLite.
    tmp_dir = tempfile.mkdtemp(prefix="qh_build_")
    tmp_db = os.path.join(tmp_dir, "quinta_hits.db")
    con = sqlite3.connect(tmp_db)
    con.executescript(open(SCHEMA, encoding="utf-8").read())

    types = {}
    for t in LOAD_ORDER:
        types[t] = {r[1]: r[2] for r in con.execute(f"PRAGMA table_info({t})")}

    total = 0
    resumo = []
    con.execute("PRAGMA foreign_keys = OFF")  # carga em lote; checado no fim
    for table in LOAD_ORDER:
        path = os.path.join(CSV_DIR, f"{table}.csv")
        if not os.path.exists(path):
            resumo.append((table, "— csv ausente —"))
            continue
        with open(path, newline="", encoding="utf-8-sig") as fh:
            reader = csv.DictReader(fh)
            cols_db = table_columns(con, table)
            cols_csv = [c for c in (reader.fieldnames or []) if c in cols_db]
            extras = [c for c in (reader.fieldnames or []) if c not in cols_db]
            if extras:
                print(f"  ! {table}: colunas ignoradas (nao existem no schema): {extras}")
            rows = []
            for rec in reader:
                if not any((rec.get(c) or "").strip() for c in cols_csv):
                    continue  # linha vazia
                rows.append([coerce(rec.get(c), types[table].get(c)) for c in cols_csv])
            if rows:
                ph = ",".join("?" * len(cols_csv))
                con.executemany(
                    f"INSERT INTO {table} ({','.join(cols_csv)}) VALUES ({ph})", rows
                )
            resumo.append((table, len(rows)))
            total += len(rows)

    con.executescript(open(VIEWS, encoding="utf-8").read())
    con.execute("PRAGMA foreign_keys = ON")
    viol = con.execute("PRAGMA foreign_key_check").fetchall()
    con.commit()

    print("\nQUINTA HITS — banco reconstruido")
    print(f"arquivo : {DB_PATH}")
    for t, n in resumo:
        print(f"  {t:<22} {n}")
    print(f"total de linhas: {total}")
    views = [r[0] for r in con.execute(
        "SELECT name FROM sqlite_master WHERE type='view' ORDER BY name")]
    print(f"views  : {', '.join(views)}")
    con.close()
    try:                                   # remover antes evita problemas de
        if os.path.exists(DB_PATH):        # sobrescrita em pastas montadas
            os.remove(DB_PATH)
    except OSError:
        pass
    shutil.copyfile(tmp_db, DB_PATH)
    shutil.rmtree(tmp_dir, ignore_errors=True)
    con = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)

    if viol:
        print(f"\n!! {len(viol)} violacoes de chave estrangeira:")
        for v in viol[:20]:
            print("   ", v)
        print("   rode validate.py para o diagnostico completo")
    else:
        print("integridade referencial: OK")
    con.close()


if __name__ == "__main__":
    main()
