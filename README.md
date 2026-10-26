# Zoznam materských a základných škôl na Slovensku

Verejný zoznam **MŠ a ZŠ** (vrátane špeciálnych) podľa oficiálneho registra RIS / MŠVVaM SR.

## Výstup

Súbory v `data/processed/` (CSV, oddeľovač `;`, UTF-8 BOM):

| Súbor | Obsah |
| --- | --- |
| `zoznam_ms_zs_slovensko.csv` | všetky MŠ + ZŠ (+ špeciálne) |
| `zoznam_materske_skoly.csv` | materské školy |
| `zoznam_zakladne_skoly.csv` | základné školy |
| `zoznam_specialne_materske_skoly.csv` | špeciálne MŠ |
| `zoznam_specialne_zakladne_skoly.csv` | špeciálne ZŠ |
| `summary.json` | počty a metadátá |

### Stĺpce

- `nazov` / `nazov_oficialny`, `adresa` (+ `ulica`, `cislo`, `obec`, `psc`, `okres`, `kraj`)
- `ico_skoly` — IČO školy; ak chýba, doplnené z nadradenej/kmeňovej školy (`ico_skoly_zdroj`)
- `zriadovatel`, `zriadovatel_typ`, `zriadovatel_ico`, `forma_vlastnictva`
- `eduid`, `kodsko`, `druh`, `typ`, `web` (institucionálny)

**Nie je zahrnuté:** mená riaditeľov, telefóny, e-maily (osobné / citlivé kontaktné údaje).

## Obnovenie dát

```bash
python3 scripts/build_school_list.py
```

Skript stiahne aktuálne registre z RIS a prepíše `data/processed/`.

## Zdroj

- Register škôl: [RIS ExportCSV id=1](https://crinfo.iedu.sk/RISPortal/register/ExportCSV?id=1)
- Register zriaďovateľov: [RIS ExportCSV id=2](https://crinfo.iedu.sk/RISPortal/register/ExportCSV?id=2)
- Filter: `stav = v prevádzke`
- Licencia / pôvod: otvorené dáta MŠVVaM SR (RIS)

## Poznámky

- Mnohé obecné materské školy **nemajú v RIS vyplnené vlastné IČO**; vtedy je vyplnené `zriadovatel_ico` (IČO obce/zriaďovateľa), nie IČO školy.
- Záznamy so `organizacna_zlozka = ano` sú organizačné zložky (napr. MŠ pri ZŠ s MŠ).
