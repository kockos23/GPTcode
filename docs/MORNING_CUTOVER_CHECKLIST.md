# SARA — ranný cutover checklist

## 1. Convex pripojenie

- Získať platné HTTPS hodnoty `VITE_CONVEX_URL` a `CONVEX_SITE_URL` z rovnakého Convex deploymentu.
- Vygenerovať jeden silný `N8N_INTEGRATION_SECRET`; uložiť ho iba do Convex environmentu a n8n credential/secret store.
- Nasadiť Convex funkcie a overiť, že `POST /integrations/n8n/bank-statements` bez Bearer secretu vracia `401`.
- Pripojiť URL a secret k vypnutému uzlu `Convex — import bank statement` vo workflowe `Rog0Z5TIQ6qSpzFX`.

## 2. Drive a deduplikácia

- [x] Nahrať testovacie PDF doklady do `01_NA_SPRACOVANIE`.
- [x] Overiť presun podľa dátumu dodania, jeden Drive súbor a jeden register riadok. Beh 509 spracoval 20 dokumentov: 15 zaradil a 5 bezpečne ponechal na kontrolu; následná oprava pridala na kontrolu aj doklad bez meny.
- Rovnaký PDF poslať cez Telegram alebo Gmail a potvrdiť, že sa zastaví pred OpenAI a nevytvorí duplikát.

## 2a. Review outbox

- [x] Pripraviť Convex tabuľku a autentizované n8n endpointy pre review udalosti, rozhodnutia a potvrdenie dokončenia.
- [x] Validovať skutočný dátum, povolenú kategóriu a povinnú menu faktúr; opakovaná udalosť nesmie vytvoriť druhú review položku.
- Po sprístupnení platnej Convex URL pripojiť review vetvu Drive/Gmail/Telegram workflowov a backfillovať šesť aktuálnych položiek.
- [x] Pripraviť neaktívny live n8n review resolution workflow s reálnymi Drive/Sheets credentials a bez Composio; aktivovať ho až po 401/auth pilote Convex endpointov.
- Až po kontrolovanom pilote prepnúť Macaly review formulár zo starej Composio cesty na nový outbox.

## 3. Bankový výpis

- Pripraviť zodpovedajúci PDF a CSV výpis s rovnakým základom názvu.
- [x] PDF archivovať v správnom mesačnom `Vypisy`; CSV vložiť do rovnakého priečinka.
- [x] Read-only pilot overil jeden PDF/CSV pár, obdobie, maskovaný účet, menu, zostatky a 75 transakcií bez Convex zápisu.
- Najprv spustiť CSV workflow kontrolovane. Overiť obdobie, maskovaný účet, zostatky, počet transakcií a nulové opakovanie pri druhom importe.
- Až potom zapnúť plán 07:30 a 17:30 Europe/Bratislava.

Parser pred importom odmieta neplatné alebo nemožné dátumy, nečíselné sumy, zmiešané meny, duplicitné ID operácie, transakcie mimo obdobia a nesediacu rovnicu počiatočný stav + príjmy - výdavky = konečný stav.

## 4. Billdu

- Overiť v Billdu dostupnosť API/webhookov a spôsob autentizácie pre aktuálny program.
- Credential uložiť iba v n8n; neposielať token do chatu ani Gitu.
- Prvý pilot obmedziť na jednu vystavenú faktúru a overiť uloženie do `Vystavene_FA` podľa dátumu dodania.

## 5. Záverečný audit

- Gmail, Drive a Telegram SARY aktívne; CSV až po úspešnom pilote.
- NORA aktívna na samostatnom bote.
- Žiadne aktívne `TEMP` workflowy a žiadne nové chybové executiony.
- Macaly dashboard zobrazuje rovnaký stav ako Drive, Sheets a Convex.

Read-only audit 30. 10. 2026 potvrdil aktívnu NORU, aktívne Gmail/Drive/Telegram vstupy SARY, neaktívny bankový zápisový workflow, žiadny `TEMP` workflow a žiadne nové produkčné chyby. Drive behy 512, 513 a 514 boli úspešné.

Error workflow `SARA — Finance workflow error alerts` je aktívny pre sedem explicitne povolených SARA finance workflowov. Bankový import, review resolution, register sync a command processor ho už majú nastavený ako Error Workflow. Používa SARA Telegram credential a overený owner chat; kontrolovaný delivery test prešiel 30. 10. 2026. NORA nie je v jeho allowliste.

NORA má od 30. 10. 2026 vlastný aktívny error workflow. Sleduje iba hlavný NORA workflow, používa `NORA Telegram Bot` a posiela do overeného owner chatu. Nie je prepojený so SARA monitoringom.
