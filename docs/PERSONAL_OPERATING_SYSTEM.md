# Personal Operating System — NORA a špecializovaní agenti

## Cieľ

NORA koordinuje spoločný plán naprieč prácou, zdravím, domácnosťou, autami a financiami. Špecializovaní agenti nevykonávajú nekontrolované externé akcie. Zapisujú signály, navrhujú kroky a odovzdávajú výsledky cez auditovanú Convex vrstvu; n8n spúšťa rutiny a integrácie.

## Agenti

- `NORA` — hlavný koordinátor, denný a týždenný plán, konflikty a komunikácia s vlastníkom.
- `HEALTH_COACH` — Garmin/Strava/Freeletics signály, regenerácia a tréningové návrhy; nie lekárska diagnostika.
- `HOME_MANAGER` — ZSE, IMAZ, spotreby, predplatné, revízie a domáca údržba.
- `VEHICLE_MANAGER` — STK/EK, poistky, servis, kilometre, pneumatiky a diaľničné známky.
- `SARA_FINANCE` — existujúca izolovaná finančná oblasť.

## Stavový model

- `personalGoals` — želané výsledky a meradlá úspechu.
- `personalPlans` a `personalPlanSteps` — verziované plány a vykonateľné kroky.
- `personalSignals` — idempotentné udalosti zo zdrojových systémov.
- `personalRoutines` — harmonogram kontrol; samotný scheduler zostáva v n8n.
- `personalAssets` a `personalMaintenance` — domácnosť, merače, autá a termíny údržby.
- `personalHealthDaily` — ohraničený denný súhrn; neukladá surové zdravotné exporty.
- `personalPlannerRuns` — audit každého denného alebo týždenného návrhu.
- `agentHandoffs` — existujúci lease/idempotency protokol medzi agentmi.

## Plánovací cyklus

1. Zdrojový workflow normalizuje udalosť a idempotentne ju zapíše ako signál.
2. Denný alebo týždenný planner zoradí otvorené signály podľa závažnosti a termínu.
3. Planner vytvorí iba `PROPOSED` kroky a priradí doménového agenta.
4. Agent krok spracuje alebo vráti explicitný blokér.
5. NORA spojí výsledky s kalendárom a kapacitou a predloží vlastníkovi zmeny vyžadujúce súhlas.

Externé odoslanie, nákup, rezervácia, platba, mazanie a zmena kalendára vždy vyžadujú súhlas. Zdravotný agent vyžaduje súhlas aj pred zmenou tréningového plánu.

## Rytmus

- ranný plán: 06:30 `Europe/Bratislava`;
- kontrola nových kritických signálov: priebežne;
- večerné uzavretie: 20:30;
- týždenné preplánovanie: nedeľa 18:00;
- mesačný prehľad spotrieb, nákladov a údržby: prvý deň mesiaca.

## Integračné poradie

1. Garmin Connect iba na čítanie; Strava ako sekundárny zdroj aktivít.
2. Freeletics plán z kalendára alebo používateľského potvrdenia; nepredpokladať verejné API.
3. ZSE a IMAZ najskôr z faktúr a manuálnych odpočtov.
4. Register áut a termínov údržby.
5. Home Assistant, Shelly a senzory až po schválení konkrétneho hardvéru.

Apple Health nie je v MVP povinný zdroj.

## Bezpečnostné hranice

- Tajomstvá zostávajú v n8n credential store alebo v správe prostredia.
- Zdravotné payloady sú ohraničené a súkromné; do handoffov ide iba potrebné zhrnutie.
- Signály majú stabilný `dedupeKey`; retry nevytvorí duplicitný plánovací vstup.
- Planner je deterministický a nevykonáva externú akciu.
- Produkčné nasadenie Convex a aktivácia n8n rutín sú samostatné kontrolované kroky.
- Osobné integrácie používajú samostatný `PERSONAL_OPS_INTEGRATION_SECRET`; nerecyklujú finančný ani agent handoff secret.

Pripravené autentizované kontrakty pre n8n:

- `POST /integrations/n8n/personal-ops/signals` — idempotentný, ohraničený signál;
- `POST /integrations/n8n/personal-ops/planner` — denný alebo týždenný návrhový beh.
- `POST /integrations/n8n/personal-ops/health/daily` — ohraničený denný súhrn z Garmin Connect/CIRQA.

Endpointy zlyhajú s `401`, ak samostatný secret nie je nastavený. Planner vytvára iba návrhy a nevykonáva externé akcie.
