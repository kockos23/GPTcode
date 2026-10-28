# SARA WOF — pilotné zistenia k 28. 10. 2026

## Dokončené bez zásahu používateľa

- n8n API a natívne Gmail, Drive, Sheets a OpenAI credential väzby boli overené.
- Pôvodný workflow `d6twgMlkoiJSa4o0` bol deaktivovaný pred plánovaným behom; nič nebolo zmazané.
- Neaktívny pilot SARA v2 `ajAP0czttC0c9syg` bol vytvorený priamo v n8n.
- Sanitizovaný export bez credential ID je v `n8n/workflows/sara-v2-direct-google.pilot.json`.
- Fixture test priamo v n8n overil routing podľa dátumu dodania/konca obdobia a review vetvu.
- Gmail label `WOF_FINANCE_INTAKE` bol vytvorený v SARA Gmail účte cez natívny OAuth bez zmeny správ.
- Kontrolovaný Gmail pilot načítal jednu správu s dvoma prílohami; obe bezpečne zapísal do review a nevykonal Drive upload.
- AI požiadavka bola následne sprísnená na strict JSON Schema, integer confidence 0–100, low reasoning a vyšší output limit. Syntetický live test opravy prešiel.
- Po výslovnom súhlase boli obe reálne prílohy znovu odoslané do OpenAI v izolovanom extraction-only behu. Obe sa spracovali bez parse chyby, ale chýbal im explicitný dátum dodania/DUZP, preto zostali `Na kontrolu` bez Drive uploadu.
- Pilot odhalil nestabilitu n8n `binary.file.id`. `Doklad ID` teraz používa Gmail message ID a stabilný binárny kľúč prílohy; dva pilotné review riadky boli bezpečne zmigrované a aktualizované.
- Opakovaný read-only test rovnakého Gmail e-mailu zastavil obe prílohy na trvalej Sheets deduplikácii (`2 existing`, `0 new`) pred OpenAI.
- Dočasné diagnostické a fixture workflowy boli deaktivované a odstránené.

## Kandidáti na upratanie zo starého manuálneho testu

Starý manuálny test vytvoril v `00_INBOX` dva súbory s rovnakým názvom a v registri `Doklady` dva zodpovedajúce review riadky. Priame SHA-256 porovnanie cez natívny Drive a Crypto node potvrdilo, že súbory nie sú bitovo totožné. Nesmú sa preto automaticky zlúčiť ani zmazať ako duplikát. Konkrétne Drive a register ID sú zámerne vynechané z Git repozitára a zostávajú iba v internom auditnom výstupe.

Oba majú stav `Na kontrolu`, prázdny dátum dodania a prázdne obdobie. Bez kontroly obsahu sa nesmú automaticky presunúť ani zmazať. Potrebné je určiť dátum dodania z faktúry a overiť, či ide o dve prílohy alebo duplikát.

## Zostávajúce jednorazové vstupy

1. Publikovať pripravený cloud environment draft. Pridáva presnú Macaly doménu a `*.convex.cloud`/`*.convex.site`; n8n a GitHub nastavenia zostávajú zachované.
2. Sprístupniť skutočné `VITE_CONVEX_URL` a `CONVEX_SITE_URL` z Macaly/Convex konfigurácie. Aktuálne hodnoty v cloud runtime nie sú platné Convex HTTPS URL.
3. Overiť dátum dodania samostatne v oboch testovacích dokumentoch; OpenAI ho nenašiel a hash test potvrdil, že ide o rozdielny binárny obsah.

## Aktivačná brána

SARA v2 zostáva neaktívna, kým kontrolovaný Gmail pilot nepotvrdí:

- spracovanie iba označenej správy,
- správny mesiac podľa dátumu dodania,
- priamy Drive upload do správnej kategórie,
- jeden a iba jeden register row,
- bezpečný review tok pri chýbajúcom alebo neistom dátume,
- nulové použitie Composio.
