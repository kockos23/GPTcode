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
- Pilot odhalil nestabilitu n8n `binary.file.id`. Finálny `Doklad ID` teraz používa SHA-256 obsahu prílohy; Gmail message ID a stabilný binárny kľúč zostávajú iba zdrojovou identitou. Dva pilotné review riadky boli bezpečne zmigrované, doplnené o SHA-256 a aktualizované.
- Čerstvý read-only workflow s prázdnym stavom zastavil obe prílohy na trvalej Sheets deduplikácii (`2 existing`, `0 new`) pred OpenAI. Rovnaký súbor sa zachytí aj po preposlaní v inom e-maile.
- Druhý Gmail pilot spracoval jednu PDF faktúru s dátumom vystavenia `2026-10-24` a dátumom dodania `2026-10-21`; správne vybral `2026-10/Doklady`, confidence `90` a bezpečný route bez dôvodu kontroly.
- Pilot odhalil, že n8n Crypto node po SHA-256 odstráni binary payload. Tok preto hash a pôvodnú prílohu znovu spája Merge uzlom pred deduplikáciou; opravený extraction beh prešiel.
- Dokument bol raz nahraný do Drive, raz zapísaný do registra, Gmail správa dostala label `WOF_FINANCE_INTAKE` a čerstvá kontrola potvrdila `1 existing`, `0 new` bez opakovaného OpenAI volania.
- Read-only test presného produkčného dotazu `label:WOF_FINANCE_INTAKE has:attachment` našiel presne označenú pilotnú správu.
- Drive rok `2026` bol doplnený o deväť chýbajúcich mesiacov a 36 kategórií. Nezávislý audit potvrdil 12 mesiacov × presne štyri kategórie; live SARA mapa obsahuje všetkých 48 cieľov.
- Dočasné diagnostické a fixture workflowy boli deaktivované a odstránené.

## Kandidáti na upratanie zo starého manuálneho testu

Starý manuálny test vytvoril v `00_INBOX` dva súbory s rovnakým názvom a v registri `Doklady` dva zodpovedajúce review riadky. Priame SHA-256 porovnanie cez natívny Drive a Crypto node potvrdilo, že súbory nie sú bitovo totožné. Nesmú sa preto automaticky zlúčiť ani zmazať ako duplikát. Konkrétne Drive a register ID sú zámerne vynechané z Git repozitára a zostávajú iba v internom auditnom výstupe.

Oba majú stav `Na kontrolu`, prázdny dátum dodania a prázdne obdobie. Bez kontroly obsahu sa nesmú automaticky presunúť ani zmazať. Potrebné je určiť dátum dodania z faktúry a overiť, či ide o dve prílohy alebo duplikát.

## Zostávajúce jednorazové vstupy

1. Publikovať pripravený cloud environment draft. Pridáva presnú Macaly doménu a `*.convex.cloud`/`*.convex.site`; n8n a GitHub nastavenia zostávajú zachované.
2. Sprístupniť skutočné `VITE_CONVEX_URL` a `CONVEX_SITE_URL` z Macaly/Convex konfigurácie. Aktuálne hodnoty v cloud runtime nie sú platné Convex HTTPS URL.
3. Overiť dátum dodania samostatne v oboch testovacích dokumentoch; OpenAI ho nenašiel a hash test potvrdil, že ide o rozdielny binárny obsah.
4. Na hostingu nastaviť forwarding `finance@wofevents.com` do pripojeného Gmailu a jedným testom potvrdiť, že sa zachová pôvodný príjemca. Live trigger už prijíma `to:finance@wofevents.com`; label `WOF_FINANCE_INTAKE` ostáva ako záloha.

## Aktivačná brána

Kontrolovaný Gmail pilot potvrdil všetky technické body aktivačnej brány:

- spracovanie iba označenej správy,
- správny mesiac podľa dátumu dodania,
- priamy Drive upload do správnej kategórie,
- jeden a iba jeden register row,
- bezpečný review tok pri chýbajúcom alebo neistom dátume,
- nulové použitie Composio.

SARA v2 zostáva neaktívna do overenia reálneho forwardingu z `finance@wofevents.com`.
