# SARA WOF — cieľová produkčná architektúra

## Rozhodnutie

Macaly zostáva miestom, kde sa projekt vyvíja a kde používateľ pracuje s rozhraním. Convex je operačná databáza, API a auditná vrstva. n8n je jediná automatizačná/orchestračná vrstva. Bežné operácie Google služieb používajú natívne n8n konektory a vlastné Google OAuth poverenia; nemajú prechádzať cez Composio.

```text
Gmail ──native OAuth──> n8n ──validated events──> Convex ──> Macaly UI
                         │                         │
                         ├──native OAuth──> Drive  └── review/outbox
                         ├──native OAuth──> Sheets
                         └──native OAuth──> Calendar
```

Composio zostáva voliteľná výnimka pre jednorazové agentné úlohy, ktoré nemajú vhodný priamy konektor. Nesmie byť v hlavnej ceste príjmu dokladov, synchronizácie tabuliek, bankových výpisov ani live briefingu.

## Vlastníctvo dát

| Oblasť | System of record | Poznámka |
| --- | --- | --- |
| Binárny účtovný doklad | Google Drive | Finálny súbor je uložený podľa dátumu dodania/DUZP. |
| Stav spracovania, review a audit | Convex | UI nečíta prevádzkový stav priamo zo Sheets. |
| Zdrojová správa a príloha pred zaradením | Gmail | Pri nejasnom dátume ostáva príloha v Gmaili; Convex drží stabilné ID správy/prílohy. |
| Banková transakcia | Convex + nemenný zdrojový výpis v Drive | Opakovaný import je idempotentný podľa účtu a ID operácie. |
| Účtovný/reportovací register | Google Sheets | Synchronizovaná kompatibilná/reportovacia vrstva, nie workflow engine. |
| Workflow definície a vykonávanie | n8n | Export workflowov sa po pripojení n8n verziuje v repozitári bez credential ID a tajomstiev. |

## Povinné n8n workflowy

### `wof-finance-01-gmail-intake`

- Trigger: Gmail label `WOF_FINANCE_INTAKE` cez natívny Gmail Trigger.
- Každá príloha dostane idempotency key `gmail:<messageId>:<attachmentId>`.
- Text/OCR určí dátum dodania/DUZP, typ dokumentu a dôkaz použitý pri klasifikácii.
- Emailový dátum, predmet ani názov súboru nikdy neurčuje účtovný mesiac.
- Jednoznačný doklad sa uloží cez natívny Google Drive node a n8n zapíše výsledok do Convex.
- Nejednoznačný doklad sa nezaradí; Convex vytvorí review položku s odkazom na pôvodnú Gmail prílohu.

### `wof-finance-02-review-resolution`

- Trigger: podpísaná požiadavka/outbox udalosť z Convex po rozhodnutí používateľa.
- n8n znovu načíta konkrétnu Gmail prílohu natívnym konektorom, vytvorí mesačný priečinok, ak chýba, a uloží súbor.
- Dokončenie sa zapíše do Convex; opakovanie tej istej udalosti nevytvorí duplikát.

### `wof-finance-03-bank-import`

- Trigger: nový CSV/PDF súbor vo vyhradenom priečinku Drive alebo plánované kontrolné vyhľadanie.
- Stiahne súbor natívnym Drive node, zachová zdrojový súbor a odovzdá normalizované údaje do Convex.
- Párovanie vytvára iba návrhy. Potvrdenie používateľom je samostatná auditovaná udalosť.

### `wof-finance-04-sheets-sync`

- Trigger: Convex outbox + pravidelná reconciliation kontrola.
- Zapisuje zmeny do Sheets natívnym Google Sheets node.
- Každý zápis má event ID a posledný synchronizačný stav; retry nesmie duplikovať riadok.
- Konflikt sa zaradí do review, nie je potichu prepísaný.

### `wof-core-05-live-briefing-sync`

- Plánovane načíta Calendar, Gmail a potrebné rozsahy Sheets cez natívne nodes.
- Do Convex uloží časovo obmedzený snapshot. Načítanie dashboardu preto nespúšťa sériu externých API volaní.

## Prevádzkové pravidlá

- Credential hodnoty sú iba v n8n credential store alebo správe tajomstiev prostredia; nikdy nie vo workflow JSON, Gite, Convex dátach ani Macaly promptoch.
- n8n volá iba autentizované Convex HTTP endpointy. Každá udalosť má event ID, čas, zdroj a verziu payloadu.
- Retry používa exponenciálny backoff. Po vyčerpaní pokusov vznikne viditeľná review/incident položka.
- Mazanie alebo presun zdrojového emailu nie je súčasťou automatizácie.
- Produkčné workflowy sa najprv spúšťajú s testovacím Gmail labelom a testovacím Drive koreňom.
- `WOF_FINANCE_EMAIL_CRON_ENABLED` ostáva `false`; po migrácii plánuje príjem výlučne n8n.

## Cutover gates

1. n8n API je dostupné pre administráciu a jeho verzia je zaznamenaná.
2. Google credentials sú pripojené priamo v n8n a úspešne prejdú read-only testom pre Gmail, Drive, Sheets a Calendar.
3. Convex URL a autentizovaný integračný endpoint sú nasadené.
4. Workflow exporty sú v Gite bez tajomstiev a prešli fixture testami.
5. Pilot potvrdí správny mesiac podľa dátumu dodania, idempotenciu, review tok a bezpečný retry.
6. Až potom sa aktivujú n8n workflowy. Pôvodný Composio cron sa neaktivuje.

## Aktuálny stav

n8n API na `n8n.viaczakaznikov.sk` je pripojené. Audit potvrdil funkčné natívne Gmail, Google Drive, Google Sheets a OpenAI credentials. Pôvodný aktívny workflow bol deaktivovaný, pretože používal široký Gmail filter a pevný `00_INBOX` cieľ.

Neaktívny pilot `SARA v2 — WOF Finance (DIRECT Google, PILOT)` je vytvorený priamo v n8n a jeho sanitizovaný export je verziovaný v `n8n/workflows/`. Pilot používa existujúce priečinky `07/2026`, `09/2026` a `10/2026`; neznáme obdobie smeruje do review namiesto automatického vytvorenia alebo nesprávneho uloženia. Pred aktiváciou zostáva vykonať kontrolovaný test na označenom Gmail vlákne a následne doplniť bezpečné dynamické provisionovanie budúcich mesiacov.

Routing prešiel interným n8n fixture testom pre septembrovú faktúru doručenú v októbri, chýbajúce DUZP, bankový výpis a Stripe report. Test nevykonal externé zápisy. Pred aktiváciou naďalej zostáva end-to-end pilot s označenou Gmail správou.

Repozitár stále obsahuje prechodné Macaly/Convex volania `composio-execute`. Nie sú cieľovým produkčným riešením a zostávajú vypnuté, kým ich nenahradia autentizované Convex endpointy a n8n synchronizácia.
