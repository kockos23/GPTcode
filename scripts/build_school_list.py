#!/usr/bin/env python3
"""Build a public list of Slovak kindergartens and primary schools from RIS.

Source (MŠVVaM SR / RIS open registers):
  - Schools: https://crinfo.iedu.sk/RISPortal/register/ExportCSV?id=1
  - Founders: https://crinfo.iedu.sk/RISPortal/register/ExportCSV?id=2

Output contains institutional fields only (no director names, phones, or emails).
"""

from __future__ import annotations

import csv
import json
import urllib.request
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "data" / "raw"
OUT_DIR = ROOT / "data" / "processed"

SCHOOLS_URL = "https://crinfo.iedu.sk/RISPortal/register/ExportCSV?id=1"
FOUNDERS_URL = "https://crinfo.iedu.sk/RISPortal/register/ExportCSV?id=2"

OUT_FIELDS = [
    "eduid",
    "kodsko",
    "druh",
    "typ",
    "nazov",
    "nazov_oficialny",
    "adresa",
    "ulica",
    "cislo",
    "obec",
    "psc",
    "okres",
    "kraj",
    "ico_skoly",
    "ico_skoly_zdroj",
    "zriadovatel",
    "zriadovatel_typ",
    "zriadovatel_ico",
    "forma_vlastnictva",
    "organizacna_zlozka",
    "nadradena_eduid",
    "kmenova_eduid",
    "vyucovaci_jazyk",
    "stav",
    "web",
]


def clean(value: str | None) -> str:
    return (value or "").replace("\xa0", " ").strip()


def download(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    print(f"Downloading {url} -> {dest}")
    req = urllib.request.Request(url, headers={"User-Agent": "school-list-builder/1.0"})
    with urllib.request.urlopen(req, timeout=180) as resp, dest.open("wb") as out:
        out.write(resp.read())


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f, delimiter=";"))


def build_address(row: dict[str, str]) -> str:
    street = clean(row.get("Ulica"))
    sc = clean(row.get("SupisneCislo"))
    oc = clean(row.get("OrientacneCislo"))
    if sc and oc and sc != oc:
        num = f"{sc}/{oc}"
    else:
        num = oc or sc

    parts: list[str] = []
    if street and num:
        parts.append(f"{street} {num}")
    elif street:
        parts.append(street)
    elif num:
        parts.append(num)

    obec = clean(row.get("Obec"))
    psc = clean(row.get("PSC"))
    if psc and len(psc) == 5 and psc.isdigit():
        psc_fmt = f"{psc[:3]} {psc[3:]}"
    else:
        psc_fmt = psc

    if psc_fmt and obec:
        parts.append(f"{psc_fmt} {obec}")
    elif obec:
        parts.append(obec)
    elif psc_fmt:
        parts.append(psc_fmt)
    return ", ".join(parts)


def resolve_school_ico(row: dict[str, str], by_eduid: dict[str, dict[str, str]]) -> tuple[str, str]:
    ico = clean(row.get("ICO"))
    if ico:
        return ico, "vlastne"
    self_id = clean(row.get("EDUID"))
    for key in ("KmenovaSaSZ_EDUID", "NadradenaSaSZ_EDUID"):
        parent_id = clean(row.get(key))
        if parent_id and parent_id != self_id and parent_id in by_eduid:
            parent_ico = clean(by_eduid[parent_id].get("ICO"))
            if parent_ico:
                return parent_ico, "z_nadradenej_skoly"
    return "", ""


def is_special_ms(typ: str) -> bool:
    text = typ.lower()
    return any(key in text for key in ("matersk", "šmš"))


def is_special_zs(typ: str) -> bool:
    text = typ.lower()
    if any(x in text for x in ("odborné učilište", "praktická škola", "soš", "gymnázium")):
        return False
    return any(key in text for key in ("základ", "šzš", "špeciálna základná")) or text.startswith("zš")


def make_record(
    row: dict[str, str],
    druh_label: str,
    by_eduid: dict[str, dict[str, str]],
    founders: dict[str, dict[str, str]],
) -> dict[str, str]:
    ico, ico_src = resolve_school_ico(row, by_eduid)
    sc = clean(row.get("SupisneCislo"))
    oc = clean(row.get("OrientacneCislo"))
    cislo = f"{sc}/{oc}" if sc and oc and sc != oc else (oc or sc)
    founder = founders.get(clean(row.get("Zriadovatel_EDUID")), {})
    return {
        "eduid": clean(row.get("EDUID")),
        "kodsko": clean(row.get("KODSKO")),
        "druh": druh_label,
        "typ": clean(row.get("TypSaSZ")),
        "nazov": clean(row.get("Nazov")),
        "nazov_oficialny": clean(row.get("NazovOficialny")) or clean(row.get("Nazov")),
        "adresa": build_address(row),
        "ulica": clean(row.get("Ulica")),
        "cislo": cislo,
        "obec": clean(row.get("Obec")),
        "psc": clean(row.get("PSC")),
        "okres": clean(row.get("Okres")),
        "kraj": clean(row.get("Kraj")),
        "ico_skoly": ico,
        "ico_skoly_zdroj": ico_src,
        "zriadovatel": clean(row.get("Zriadovatel_Nazov")) or clean(founder.get("Nazov")),
        "zriadovatel_typ": clean(row.get("Zriadovatel_Typ")) or clean(founder.get("Typ")),
        "zriadovatel_ico": clean(founder.get("ICO")) or clean(founder.get("Identifikator")),
        "forma_vlastnictva": clean(row.get("FormaVlastnictva")),
        "organizacna_zlozka": "ano" if clean(row.get("OrganizacnaZlozka")) == "1" else "nie",
        "nadradena_eduid": clean(row.get("NadradenaSaSZ_EDUID")),
        "kmenova_eduid": clean(row.get("KmenovaSaSZ_EDUID")),
        "vyucovaci_jazyk": clean(row.get("VyucovaciJazyk")),
        "stav": clean(row.get("STAV")),
        "web": clean(row.get("Web")),
    }


def write_csv(path: Path, rows: list[dict[str, str]]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=OUT_FIELDS, delimiter=";")
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    schools_path = RAW_DIR / "CIS_Reg_SaSZ.csv"
    founders_path = RAW_DIR / "CIS_Reg_Zriad.csv"
    download(SCHOOLS_URL, schools_path)
    download(FOUNDERS_URL, founders_path)

    all_rows = read_csv(schools_path)
    founder_rows = read_csv(founders_path)
    by_eduid = {row["EDUID"]: row for row in all_rows}
    founders = {row["EDUID"]: row for row in founder_rows}

    records: list[dict[str, str]] = []
    for row in all_rows:
        if clean(row.get("STAV")) != "v prevádzke":
            continue
        druh = clean(row.get("DruhSaSZ"))
        typ = clean(row.get("TypSaSZ"))
        if druh == "materská škola":
            records.append(make_record(row, "materská škola", by_eduid, founders))
        elif druh == "základná škola":
            records.append(make_record(row, "základná škola", by_eduid, founders))
        elif druh == "škola pre deti a žiakov so špeciálnymi výchovno-vzdelávacími potrebami":
            if is_special_ms(typ):
                records.append(make_record(row, "špeciálna materská škola", by_eduid, founders))
            elif is_special_zs(typ):
                records.append(make_record(row, "špeciálna základná škola", by_eduid, founders))

    records.sort(
        key=lambda item: (
            item["kraj"],
            item["okres"],
            item["obec"],
            item["druh"],
            item["nazov_oficialny"],
            item["eduid"],
        )
    )

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    write_csv(OUT_DIR / "zoznam_ms_zs_slovensko.csv", records)
    splits = {
        "materská škola": "zoznam_materske_skoly.csv",
        "základná škola": "zoznam_zakladne_skoly.csv",
        "špeciálna materská škola": "zoznam_specialne_materske_skoly.csv",
        "špeciálna základná škola": "zoznam_specialne_zakladne_skoly.csv",
    }
    for label, filename in splits.items():
        write_csv(OUT_DIR / filename, [row for row in records if row["druh"] == label])

    summary = {
        "zdroj_skoly": SCHOOLS_URL,
        "zdroj_zriadovatelia": FOUNDERS_URL,
        "zdroj_nazov": "Register škôl a školských zariadení + Register zriaďovateľov (RIS / MŠVVaM SR)",
        "stav_filter": "v prevádzke",
        "poznamka": (
            "Bez osobných údajov riaditeľov a bez telefónov/e-mailov. "
            "ico_skoly = IČO školy (alebo nadradenej právnej entity). "
            "zriadovatel_ico = IČO zriaďovateľa (obec/súkromník/cirkev), nie IČO školy. "
            "Mnohé obecné MŠ nemajú v RIS vyplnené vlastné IČO."
        ),
        "generovane_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "pocet_spolu": len(records),
        "podla_druhu": dict(Counter(row["druh"] for row in records)),
        "podla_kraja": dict(Counter(row["kraj"] for row in records)),
        "podla_zriadovatel_typ": dict(Counter(row["zriadovatel_typ"] for row in records)),
        "podla_forma_vlastnictva": dict(Counter(row["forma_vlastnictva"] for row in records)),
        "ico_skoly_vyplnene": sum(1 for row in records if row["ico_skoly"]),
        "ico_skoly_chybajuce": sum(1 for row in records if not row["ico_skoly"]),
        "zriadovatel_ico_vyplnene": sum(1 for row in records if row["zriadovatel_ico"]),
    }
    (OUT_DIR / "summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
