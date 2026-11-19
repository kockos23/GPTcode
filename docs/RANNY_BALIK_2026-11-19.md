# Ranný balík — 19. november 2026

Tento dokument obsahuje iba kroky, ktoré nebolo možné dokončiť bez externého prístupu alebo potvrdenia vlastníka.

## Hotové bez zásahu používateľa

- NORA portrét a ikona.
- NORA task inbox, viac úloh z jednej správy a VERA → NORA handoff.
- Health & Performance sekcia, check-in, návyky a suplementový denník.
- Opatrná analytika možných súvislostí bez kauzálnych tvrdení.
- Docker Garmin bridge, MFA bootstrap, token-only unattended režim a scheduler.
- Neaktívny týždenný health review workflow.
- Živý Convex register projektov a rozhodnutí s legacy fallbackom.
- Editovanie projektu a ukladanie rozhodnutí.
- Dynamické tri výsledky dňa.
- Čítanie všetkých vybraných zdieľaných kalendárov, ich označenie a filter v UI.
- Samostatná sekcia Domácnosť & autá s prehľadom spotrieb, údržby, STK, pneumatík a predplatných.
- Zápisy NORY zostávajú výhradne v hlavnom kalendári `primary`.
- Kompletný používateľský manuál a feature audit.
- Kompletné testy: 20 testovacích súborov a 126 testov prešli; TypeScript aj produkčný build prešli.

Nasadzovací GitHub commit vo vetve `work`: `798ec66`.

## Krok 1 — Macaly sync, Convex deploy a Publish

Vlož do Macaly jeden prompt:

> Synchronizuj projekt s GitHub repozitárom `kockos23/GPTcode`, vetva `work`, až po commit `798ec66`. Urob bezpečný 3-way merge a zachovaj všetky existujúce živé dáta, autentifikáciu, environment variables, dashboard routy, n8n integrácie a predchádzajúce Macaly zmeny. Nasaď celý priečinok `convex/` na Live `prod:coordinated-mongoose-77` a následne publikuj frontend. Neaktivuj žiadne nové n8n workflowy. Over, že NORA má portrét, existuje sekcia Zdravie & výkon so suplementmi, sekcia Domácnosť & autá vrátane rýchleho doplnenia aktíva, údržby, odpočtu a predplatného, projekty a rozhodnutia používajú živý register a kalendár má filter všetkých kalendárov. Nič nemaž a nemen credentials.

Po úspechu stačí poslať odpoveď Macaly.

## Krok 2 — Aktualizácia snapshot workflowu v n8n

Cloud runtime momentálne nevie DNS-resolvovať `n8n.viaczakaznikov.sk`, preto nebolo možné spustiť provisioner cez API.

Keď bude n8n API dostupné, spustiť z aktuálnej vetvy:

```bash
node scripts/provision-chief-of-staff-sync.mjs
```

Provisioner zachová credentials, aktualizuje existujúci workflow podľa názvu a pridá:

- načítanie Google Calendar listu,
- udalosti zo všetkých vybraných kalendárov s prístupom reader alebo vyšším,
- calendar ID, názov, farbu a read-only informáciu,
- limit 50 kalendárov, 100 udalostí na kalendár a 500 udalostí v snapshote.

Po aktualizácii workflow spustiť raz manuálne a skontrolovať známe udalosti z kalendárov Coaching, DTI, FAMILY, Narodeniny, NIKÉ, Personal, Rodina, SPORT RELATIONS, WOF EXPO a Úlohy. Až potom ponechať pôvodný aktívny plán.

## Krok 3 — Garmin VPS

Potrebný vstup od vlastníka:

1. názov VPS providera alebo hostingu, kde beží n8n,
2. bezpečný prístup k pripojenému terminálu alebo schválená SSH cesta; heslo neposielať do chatu,
3. Garmin e-mail, heslo a MFA zadať iba priamo v termináli počas bootstrapu.

Na VPS sa použije `integrations/garmin/compose.example.yml`. Postup:

```bash
cp .env.garmin.example .env.garmin
chmod 600 .env.garmin
docker compose -f compose.example.yml build
docker compose -f compose.example.yml run --rm nora-garmin-bridge python /app/bootstrap.py
docker compose -f compose.example.yml up -d
```

Po bootstrape odstrániť Garmin meno a heslo z `.env.garmin`; dlhodobý kontajner používa iba token volume. Potom pripojiť samostatný n8n Header Auth credential, povoliť Convex HTTP node, vykonať jednodňový pilot a až následne aktivovať denný beh.

## Krok 4 — dve produktové voľby, ktoré neblokujú techniku

Tieto odpovede možno doplniť neskôr:

1. meno samostatného asistenta pre zdravie, výkon a návyky,
2. jeho portrét alebo požadovaný vizuálny charakter.

Do rozhodnutia zostáva pracovný názov **Health & Performance** a neutrálna ikona srdca/tepu.

## Dôležité prevádzkové obmedzenia

- Health weekly workflow zostáva neaktívny do Garmin pilotu.
- Garmin workflow zostáva neaktívny, kým nemá samostatný webhook secret a úspešný test.
- NORA môže čítať súhrnný kalendár, ale zapisuje iba do `primary`.
- Projekty a rozhodnutia pri prvom otvorení vložia iba chýbajúce riadky; existujúce dáta neprepisujú.
- Pri výpadku zdroja sa nemaže snapshot ani token volume.
