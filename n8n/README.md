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

- Gmail trigger používa výhradne label `WOF_FINANCE_INTAKE`.
- Doklady sa smerujú podľa dátumu dodania/DUZP; Stripe a bankové výpisy podľa konca explicitného obdobia.
- Dátum emailu, predmet a názov súboru neurčujú účtovný mesiac.
- Automatické uloženie vyžaduje kompletné údaje, confidence aspoň 80 a existujúci overený cieľový priečinok.
- Nejasný doklad ide iba do review registra a neukladá sa do `00_INBOX`.
- Každý doklad zostáva v stave `Na kontrolu`; automatizácia nepotvrdzuje úhradu.
- Workflow sa neaktivuje, kým neprejde fixture testom a kontrolovaným Gmail pilotom.

Label `WOF_FINANCE_INTAKE` bol 28. 10. 2026 vytvorený priamo v pripojenom SARA Gmail účte. Jeho vytvorenie nepoužilo Composio a nezmenilo žiadnu správu.

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

Pred OpenAI volaním teraz workflow načíta stĺpec `Doklad ID` z registra a porovná stabilný ID Gmail prílohy. Pilot odhalil, že n8n `binary.file.id` sa medzi načítaniami mení; ID preto používa stabilný binárny kľúč `attachment_0`, `attachment_1`, … spolu s Gmail message ID. Dva existujúce review riadky boli migrované na nové stabilné ID a aktualizované opravenou extrakciou. Opakovaný read-only test rovnakého e-mailu zastavil obe prílohy ako `existing` a ani jedna sa nedostala k OpenAI. Táto kontrola dopĺňa stavový Remove Duplicates node a zostáva účinná aj po reštarte alebo importe workflowu.

## Lokálny policy test

```bash
node --test n8n/tests/workflow-policy.test.mjs
```

