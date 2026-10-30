# SARA finance review outbox

Táto integrácia nahrádza produkčné použitie starého Macaly/Convex → Composio review toku. Všetky požiadavky z n8n používajú `Authorization: Bearer <N8N_INTEGRATION_SECRET>` a JSON.

## 1. Vytvorenie alebo aktualizácia review položky

`POST /integrations/n8n/finance-reviews`

Povinné polia: `documentId`, `source`, `sourceFileId`, `sourceFileName`, `fileUrl`, `reviewReason`. Voliteľné extrahované polia: `supplier`, `invoiceNumber`, `totalAmount`, `deliveryDate`, `category`, `currency`.

`documentId` je idempotency key. Opakovanie rovnakej udalosti nevytvorí druhú položku a nesmie znovu otvoriť už dokončenú položku.

## 2. Rozhodnutie v Macaly

Vlastník vyberie skutočný dátum dodania a kategóriu. Pri `Doklady` a `Vystavene_FA` je povinná trojpísmenová mena. Convex uloží rozhodnutie so stavom `READY`; samotné UI nepresúva súbor a nezapisuje do Sheets.

## 3. Dokončenie v n8n

`GET /integrations/n8n/finance-review-resolutions` vráti najviac 50 položiek so stavom `READY`.

Pre každú položku n8n musí v tomto poradí:

1. overiť povolený dátum, kategóriu, menu, `documentId` a pôvodný `sourceFileId`,
2. presunúť a premenovať existujúci Drive súbor bez vytvorenia kópie,
3. aktualizovať existujúci Sheets riadok podľa `Doklad ID`, nie pridať nový,
4. zavolať `POST /integrations/n8n/finance-review-resolutions/complete` s `documentId`, `ok`, `targetFileId` a `targetFileUrl`.

Pri chybe odošle n8n `ok: false` a stručné `error`. Convex ponechá položku viditeľnú ako `FAILED`; opakovaný pokus musí používať ten istý `documentId` a Drive file ID.

## Cutover podmienky

- platná `CONVEX_SITE_URL` a nasadená schema/funkcie,
- rovnaký secret uložený iba v Convex a n8n,
- 401 test bez secretu a úspešný autentizovaný test,
- backfill aktuálnych šiestich Drive review položiek,
- jeden kontrolovaný presun a druhý idempotentný pokus,
- až potom zapojenie Macaly formulára a plánovaného n8n pollingu.
