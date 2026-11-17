# NORA — WOF e-mail cez Websupport

NORA používa dve samostatné WOF schránky:

- `tomas.kocner@wofevents.com`
- `tomas.kocner@wofexpo.com`

Každá schránka má v n8n vlastný IMAP credential na čítanie a vlastný SMTP credential na odosielanie. Heslá patria výhradne do šifrovaného n8n credential store; nepatria do Git, Convex ani do frontendových premenných.

## Credentials v n8n

Vytvoriť štyri credentials s týmito názvami:

1. `NORA IMAP — tomas.kocner@wofevents.com`
2. `NORA SMTP — tomas.kocner@wofevents.com`
3. `NORA IMAP — tomas.kocner@wofexpo.com`
4. `NORA SMTP — tomas.kocner@wofexpo.com`

Websupport nastavenie treba pred uložením porovnať s aktuálnymi údajmi v administrácii hostingu. Bežné nastavenie je:

- IMAP host `imap.websupport.sk`, port `993`, SSL/TLS zapnuté;
- SMTP host `smtp.websupport.sk`, port `465`, SSL/TLS zapnuté;
- používateľské meno je celá e-mailová adresa;
- heslo je heslo konkrétnej schránky.

Ak Websupport pre danú schránku uvádza SMTP port `587`, použiť STARTTLS namiesto implicitného TLS na porte `465`.

## Bezpečné zapojenie workflowov

- Príjem: samostatný `Email Trigger (IMAP)` pre každý účet, iba neprečítané správy, prílohy zapnuté.
- Normalizácia: oba vstupy musia doplniť `sourceAccount`, `messageId`, odosielateľa, predmet, dátum a textový náhľad.
- Deduplikácia: identita správy je kombinácia `sourceAccount + messageId`; prílohy sa identifikujú obsahovým SHA-256.
- Odosielanie: `Send Email` musí zvoliť SMTP credential podľa `sourceAccount`; workflow nesmie umožniť ľubovoľnú credential voľbu z textu príkazu.
- Odpoveď sa automaticky neposiela. NORA pripraví draft a odoslanie zostáva schvaľovaná akcia, kým samostatný pilot nepotvrdí správne From, Reply-To, HTML aj prílohy.
- Úspešné spracovanie možno označiť ako prečítané až po trvalom uložení normalizovaného záznamu. Chybná správa musí zostať dostupná na retry.

## Kontrolovaný pilot

Pre každý účet samostatne:

1. poslať správu zvonka s jednoznačným predmetom a malou PDF prílohou;
2. overiť jediný prijatý záznam a správny `sourceAccount`;
3. spustiť retry a potvrdiť, že nevznikne duplikát;
4. vytvoriť draft odpovede;
5. až po kontrole používateľom odoslať odpoveď na externú testovaciu adresu;
6. potvrdiť From, Reply-To, text, diakritiku a prílohu.

Aktivácia oboch príjmov naraz je dovolená až po úspešnom pilote oboch schránok.
