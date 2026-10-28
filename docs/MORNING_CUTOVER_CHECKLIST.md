# SARA — ranný cutover checklist

## 1. Convex pripojenie

- Získať platné HTTPS hodnoty `VITE_CONVEX_URL` a `CONVEX_SITE_URL` z rovnakého Convex deploymentu.
- Vygenerovať jeden silný `N8N_INTEGRATION_SECRET`; uložiť ho iba do Convex environmentu a n8n credential/secret store.
- Nasadiť Convex funkcie a overiť, že `POST /integrations/n8n/bank-statements` bez Bearer secretu vracia `401`.
- Pripojiť URL a secret k vypnutému uzlu `Convex — import bank statement` vo workflowe `Rog0Z5TIQ6qSpzFX`.

## 2. Drive a deduplikácia

- Nahrať testovací PDF doklad do `01_NA_SPRACOVANIE`.
- Po plánovanom alebo kontrolovanom behu overiť presun do mesiaca podľa dátumu dodania, jeden Drive súbor a jeden register riadok.
- Rovnaký PDF poslať cez Telegram alebo Gmail a potvrdiť, že sa zastaví pred OpenAI a nevytvorí duplikát.

## 3. Bankový výpis

- Pripraviť zodpovedajúci PDF a CSV výpis s rovnakým základom názvu.
- PDF archivovať v správnom mesačnom `Vypisy`; CSV vložiť do rovnakého priečinka.
- Najprv spustiť CSV workflow kontrolovane. Overiť obdobie, maskovaný účet, zostatky, počet transakcií a nulové opakovanie pri druhom importe.
- Až potom zapnúť plán 07:30 a 17:30 Europe/Bratislava.

## 4. Billdu

- Overiť v Billdu dostupnosť API/webhookov a spôsob autentizácie pre aktuálny program.
- Credential uložiť iba v n8n; neposielať token do chatu ani Gitu.
- Prvý pilot obmedziť na jednu vystavenú faktúru a overiť uloženie do `Vystavene_FA` podľa dátumu dodania.

## 5. Záverečný audit

- Gmail, Drive a Telegram SARY aktívne; CSV až po úspešnom pilote.
- NORA aktívna na samostatnom bote.
- Žiadne aktívne `TEMP` workflowy a žiadne nové chybové executiony.
- Macaly dashboard zobrazuje rovnaký stav ako Drive, Sheets a Convex.
