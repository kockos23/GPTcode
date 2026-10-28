# n8n workflowy WOF

## Aktuálny stav

- Pôvodný workflow `d6twgMlkoiJSa4o0` (`SARA — WOF Finance...`) je deaktivovaný. Sledoval všetky Gmail prílohy a ukladal ich do `00_INBOX`.
- Nový workflow `ajAP0czttC0c9syg` (`SARA v2 — WOF Finance (DIRECT Google, PILOT)`) je vytvorený, ale zámerne neaktívny do ukončenia pilotu.
- Rutinné operácie používajú natívne n8n credentials pre Gmail, Google Drive a Google Sheets. Workflow nepoužíva Composio.

## Verziovaný export

`workflows/sara-v2-direct-google.pilot.json` je sanitizovaný export bez credential ID. Live workflow v n8n má credentials pripojené; po importe exportu do inej inštancie treba ručne vybrať:

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

## Lokálny policy test

```bash
node --test n8n/tests/workflow-policy.test.mjs
```

