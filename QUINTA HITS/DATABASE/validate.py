#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
QUINTA HITS — validate.py
Valida os CSVs antes/depois da carga. Roda SEM depender do .db existir
(ele é reconstruído em memória).

Verifica:
  1. IDs duplicados e IDs fora do padrao PREFIXO-XXX
  2. campos obrigatorios vazios (NOT NULL)
  3. valores fora dos enums definidos no schema (CHECK)
  4. chaves estrangeiras orfas
  5. datas fora do formato ISO YYYY-MM-DD
  6. somas de percentual_alcance por campanha/dimensao (alerta se != 100 +-2)
  7. incoerencias de funil (visitas_site > cliques_link, gasto > orcamento)

Uso: python3 validate.py
"""
import csv, os, re, sqlite3, sys
from collections import defaultdict

BASE = os.path.dirname(os.path.abspath(__file__))
CSV_DIR = os.path.join(BASE, "csv")
sys.path.insert(0, BASE)
from build_db import LOAD_ORDER, coerce  # noqa: E402

ID_PREFIX = re.compile(r"^[A-Z]{3}-[A-Za-z0-9\-]+$")
ISO = re.compile(r"^\d{4}-\d{2}-\d{2}$")
DATE_COLS = ("data", "data_inicio", "data_fim", "data_prevista", "data_publicado",
             "periodo_inicio", "periodo_fim", "data_solicitacao", "data_publicacao",
             "vigencia_inicio", "vigencia_fim", "data_aprovacao")

erros, alertas = [], []


def main():
    con = sqlite3.connect(":memory:")
    con.executescript(open(os.path.join(BASE, "schema.sql"), encoding="utf-8").read())
    meta = {}
    for t in LOAD_ORDER:
        meta[t] = {r[1]: (r[2], r[3]) for r in con.execute(f"PRAGMA table_info({t})")}
    sql_schema = open(os.path.join(BASE, "schema.sql"), encoding="utf-8").read()
    # enums (CHECK ... IN) extraidos por tabela, nao globalmente
    checks = defaultdict(dict)
    for blk in re.finditer(r"CREATE TABLE (\w+)\s*\((.*?)\n\);", sql_schema, re.S):
        tname, body = blk.group(1), blk.group(2)
        for m in re.finditer(r"(\w+)\s+TEXT\s+CHECK\(\1 IN \(([^)]*)\)\)", body):
            checks[tname][m.group(1)] = {v.strip().strip("'") for v in m.group(2).split(",")}

    dados = {}
    for table in LOAD_ORDER:
        path = os.path.join(CSV_DIR, f"{table}.csv")
        if not os.path.exists(path):
            alertas.append(f"{table}.csv ausente")
            continue
        with open(path, newline="", encoding="utf-8-sig") as fh:
            rows = [r for r in csv.DictReader(fh)
                    if any((v or "").strip() for v in r.values())]
        dados[table] = rows
        ids = [r.get("id", "").strip() for r in rows]
        for i in ids:
            if i and not ID_PREFIX.match(i):
                alertas.append(f"{table}: id fora do padrao -> {i}")
        dup = {i for i in ids if i and ids.count(i) > 1}
        for d in dup:
            erros.append(f"{table}: id duplicado -> {d}")
        for n, r in enumerate(rows, 2):
            for col, (decl, notnull) in meta[table].items():
                val = (r.get(col) or "").strip()
                if notnull and not val:
                    erros.append(f"{table} linha {n}: campo obrigatorio vazio -> {col}")
                enum = checks.get(table, {}).get(col)
                if val and enum and val not in enum:
                    erros.append(f"{table} linha {n}: valor invalido em {col} -> '{val}' "
                                 f"(esperado: {sorted(v for v in enum if v)})")
                if val and col in DATE_COLS and not ISO.match(val):
                    erros.append(f"{table} linha {n}: data fora do ISO em {col} -> {val}")

    # chaves estrangeiras
    fks = re.findall(r"(\w+)\s+TEXT[^,]*REFERENCES (\w+)\(id\)", sql_schema)
    universo = {t: {r.get("id", "").strip() for r in dados.get(t, [])} for t in LOAD_ORDER}
    for table, rows in dados.items():
        for col, ref in fks:
            if col not in meta[table]:
                continue
            for n, r in enumerate(rows, 2):
                v = (r.get(col) or "").strip()
                if v and v not in universo.get(ref, set()):
                    erros.append(f"{table} linha {n}: {col}='{v}' nao existe em {ref}")

    # percentuais de demografia
    soma = defaultdict(float)
    for r in dados.get("demografia_entrega", []):
        try:
            soma[(r["campanha_id"], r["dimensao"])] += float(r.get("percentual_alcance") or 0)
        except ValueError:
            pass
    for (c, d), s in soma.items():
        if s and abs(s - 100) > 2:
            alertas.append(f"demografia_entrega: {c}/{d} soma {s:.1f}% (esperado ~100%)")

    # coerencia de funil
    for r in dados.get("metricas_campanha", []):
        def num(k):
            try:
                return float(r.get(k) or 0)
            except ValueError:
                return 0
        if num("visitas_site") > num("cliques_link") > 0:
            alertas.append(f"metricas_campanha {r['id']}: visitas_site > cliques_link")
        if num("alcance") > num("impressoes") > 0:
            erros.append(f"metricas_campanha {r['id']}: alcance > impressoes")
    orc = {r["id"]: r for r in dados.get("campanhas", [])}
    for cid, r in orc.items():
        try:
            if r.get("orcamento_gasto") and r.get("orcamento_previsto") and \
               float(r["orcamento_gasto"]) > float(r["orcamento_previsto"]):
                alertas.append(f"campanhas {cid}: gasto acima do orcamento previsto")
        except ValueError:
            pass

    print("QUINTA HITS — validacao do banco\n" + "=" * 42)
    print(f"tabelas lidas: {len(dados)} | linhas: {sum(len(v) for v in dados.values())}")
    if erros:
        print(f"\nERROS ({len(erros)}):")
        for e in erros:
            print("  x", e)
    if alertas:
        print(f"\nALERTAS ({len(alertas)}):")
        for a in alertas:
            print("  !", a)
    if not erros and not alertas:
        print("\nnenhum problema encontrado.")
    print()
    sys.exit(1 if erros else 0)


if __name__ == "__main__":
    main()
