# n8n workflowy WOF

## Aktuálny stav

- Pôvodný workflow `d6twgMlkoiJSa4o0` (`SARA — WOF Finance...`) je deaktivovaný. Sledoval všetky Gmail prílohy a ukladal ich do `00_INBOX`.
- Nový workflow `ajAP0czttC0c9syg` (`SARA v2 — WOF Finance (DIRECT Google, PILOT)`) je vytvorený, ale zámerne neaktívny do ukončenia pilotu.
- Rutinné operácie používajú natívne n8n credentials pre Gmail, Google Drive a Google Sheets. Workflow nepoužíva Composio.

## Verziovaný export

`workflows/sara-v2-direct-google.pilot.json` je sanitizovaný export bez credential ID a bez konkrétnych Google resource ID. Live workflow v n8n má credentials a reálne ID pripojené; po importe exportu do inej inštancie treba nahradiť pomenované `REPLACE_WITH_...` hodnoty a ručne vybrať:

- Gmail OAuth: `SARA Gmail — wof.alliance.sk@gmail.com`
- Google Drive OAuth: `Google Drive account`
- Google Sheets OAuth: `Google Sheets account 2`
- OpenAI credential: `OpenAI Angie`

Credential hodnoty ani API kľúče nesmú byť uložené v Gite.

## Bezpečnostné pravidlá pilotu

- Gmail trigger prijíma iba správy s prílohou, ktoré sú adresované na `finance@wofevents.com` alebo majú záložný label `WOF_FINANCE_INTAKE`.
- Doklady sa smerujú podľa dátumu dodania/DUZP; Stripe a bankové výpisy podľa konca explicitného obdobia.
- Dátum emailu, predmet a názov súboru neurčujú účtovný mesiac.
- Automatické uloženie vyžaduje kompletné údaje, confidence aspoň 80 a existujúci overený cieľový priečinok.
- Nejasný doklad ide iba do review registra a neukladá sa do `00_INBOX`.
- Každý doklad zostáva v stave `Na kontrolu`; automatizácia nepotvrdzuje úhradu.
- Workflow sa neaktivuje, kým neprejde fixture testom a kontrolovaným Gmail pilotom.

Label `WOF_FINANCE_INTAKE` bol 28. 10. 2026 vytvorený priamo v pripojenom SARA Gmail účte. Jeho vytvorenie nepoužilo Composio a nezmenilo žiadnu správu.

Adresa `finance@wofevents.com` môže zostať na klasickom hostingu a preposielať poštu do pripojeného Gmailu. SARA trigger filtruje priamo podľa pôvodného príjemcu; label ostáva ako manuálna záložná cesta. Gmail OAuth nemá scope na správu filtrov, preto nie je potrebný Gmail filter ani rozšírenie OAuth. Po nastavení forwardingu treba jediným testom potvrdiť, že hosting zachová `To` alebo ekvivalentnú hlavičku príjemcu.

## Overený n8n fixture test

Interný test bez Gmail/Drive/Sheets zápisov prešiel 28. 10. 2026 priamo v n8n runtime:

- faktúra vystavená v októbri s dátumom dodania `2026-09-30` → `09/2026/Doklady`,
- faktúra bez dátumu dodania → review bez automatického uploadu,
- bankový výpis s koncom obdobia `2026-10-31` → `10/2026/Vypisy`,
- Stripe report s koncom obdobia `2026-09-30` → `09/2026/Stripe`.

Dočasný fixture workflow bol po jedinom úspešnom behu deaktivovaný a odstránený. Tento test overuje routing a review vetvu, nie reálny Gmail download, OpenAI extrakciu ani externý zápis.

## Kontrolovaný Gmail pilot

Testovacia správa z 28. 10. 2026 obsahovala dve podporované prílohy. Gmail download, deduplikácia a OpenAI volanie prebehli. Obe prílohy skončili bezpečne v review registri a do Drive sa nič neuložilo: prvá AI odpoveď nedodržala enum cieľa a druhá minula pôvodný tokenový limit.

Následná oprava používa strict JSON Schema, presný enum destinácie, `confidence` ako integer 0–100, nízky reasoning budget a `max_output_tokens: 4096`. Syntetická faktúra potom v live n8n správne vrátila `Doklady`, dátum vystavenia `2026-10-02`, dátum dodania `2026-09-30` a confidence `90`. Po výslovnom súhlase prebehol aj extraction-only retry reálnych príloh: obe odpovede boli syntakticky platné, obe mali confidence `85` a dátum vystavenia `2026-09-16`, ale ani jedna neobsahovala explicitný dátum dodania/DUZP. Obe preto správne ostali `Na kontrolu`, bez Drive uploadu a bez odvodenia mesiaca z dátumu e-mailu alebo vystavenia.

Pred OpenAI volaním workflow vypočíta SHA-256 obsahu každej prílohy, použije ho ako `Doklad ID` a porovná ho so stĺpcom registra. Pilot odhalil, že n8n `binary.file.id` sa medzi načítaniami mení; stabilný binárny kľúč `attachment_0`, `attachment_1`, … sa preto používa iba ako zdrojová identita v rámci Gmail správy, nie ako finálna identita dokladu. Dva existujúce review riadky boli migrované na obsahové SHA-256 ID, doplnené o hash a aktualizované opravenou extrakciou. Čerstvý read-only workflow s prázdnym stavom zastavil obe prílohy podľa Sheets registra ako `existing` (`2 existing`, `0 new`) ešte pred OpenAI. Rovnaký súbor sa tak deduplikuje aj po preposlaní v inom e-maile a kontrola zostáva účinná po reštarte alebo importe workflowu.

Druhý Gmail pilot použil PDF faktúru s explicitným dátumom dodania. OpenAI vrátil dátum vystavenia `2026-10-24`, dátum dodania `2026-10-21`, cieľ `Doklady`, confidence `90` a routeReady bez dôvodu kontroly. Pilot zároveň odhalil, že Crypto node po výpočte hashu neodovzdával binárny súbor ďalej; paralelná vetva a Merge node teraz spoja hash s pôvodnou prílohou pred deduplikáciou. Opravený beh nahral dokument do `2026-10/Doklady`, pridal presne jeden register riadok, označil Gmail správu labelom `WOF_FINANCE_INTAKE` a čerstvá kontrola potvrdila `1 existing`, `0 new` bez ďalšieho OpenAI volania. Samostatný read-only test produkčného Gmail dotazu našiel presne túto jednu označenú správu.

Drive štruktúra pre rok 2026 je kompletná. Audit najprv potvrdil iba existujúce `07/2026`, `09/2026` a `10/2026`; následne bolo vytvorených presne deväť chýbajúcich mesiacov a 36 kategórií. Nezávislá kontrola potvrdila všetkých 12 mesiacov a v každom presne štyri priečinky `Doklady`, `Stripe`, `Vystavene_FA`, `Vypisy`. Live n8n obsahuje 48 reálnych Drive ID, Git export iba 48 placeholderov.

## Lokálny policy test

```bash
node --test n8n/tests/workflow-policy.test.mjs
```

