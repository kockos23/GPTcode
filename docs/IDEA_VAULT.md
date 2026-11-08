# Idea Vault — osobný agent na nápady a know-how

Agent, ktorému cez Telegram pošleš čokoľvek, čo ťa zaujme: odkaz, screenshot, fotku, PDF, textový súbor, preposlanú správu alebo hlasovku. Agent obsah prečíta, porovná s tým, čomu sa venuješ, a uloží ho upratane do trezora v dashboarde. Z každého záznamu vytiahne know-how, použiteľné frameworky a biznis nápady. Každý pondelok pošle týždennú syntézu, ktorá spája nápady medzi sebou.

## Ako to funguje

```text
Telegram bot ──> n8n „IDEA VAULT — Telegram intake“
                  │  1. overí, že správa je z tvojho chatu
                  │  2. načíta tvoj profil + opakujúce sa témy z Convex
                  │  3. súbor: stiahne ho, archivuje originál do Drive
                  │       hlasovka → prepis (gpt-4o-transcribe)
                  │       fotka/screenshot, PDF → priamo do AI ako obrázok/súbor
                  │     odkaz: stiahne stránku a vytiahne text
                  │  4. AI analýza (strict JSON schema) voči tvojmu profilu
                  │  5. uloží záznam do Convex  ──> dashboard „Nápady“
                  └─ 6. odpovie v Telegrame krátkym zhrnutím

n8n „IDEA VAULT — týždenný digest“ (pondelok 7:40)
   Convex /ideas/digest-input ──> AI syntéza ──> Convex /ideas/digest ──> Telegram
```

Rozdelenie zodpovednosti zodpovedá [`ARCHITECTURE.md`](ARCHITECTURE.md): n8n orchestruje a volá AI, Convex je databáza a auditná vrstva, Macaly dashboard je rozhranie.

## Čo z každého záznamu vznikne

| Pole | Význam |
| --- | --- |
| Názov, zhrnutie | O čom to je a prečo je to zaujímavé |
| Kategória | Know-how, Framework, Biznis nápad, Nástroj, Inšpirácia, Referencia, Úloha |
| Know-how | Max 7 konkrétnych poznatkov |
| Frameworky | Názov, kedy použiť, kroky (iba ak v obsahu reálne sú) |
| Biznis nápady | Problém, pre koho, prvý krok (naviazané na tvoje projekty) |
| Relevancia 0–100 + prečo | Ako to súvisí s tvojimi oblasťami, projektmi, cieľmi a otázkami |
| Ďalšie kroky | Max 3 konkrétne akcie |
| Tagy, súvisiace záznamy | Prepojenie s tým, čo si uložil predtým (iba overené ID) |
| Signály do profilu | Nový záujem, ktorý agent zbadal; potvrdzuješ ho v dashboarde |

Záznamy prechádzajú stavmi **Nové → Na akciu / Knižnica → Archív**. Záznam s kategóriou *Úloha* ide rovno do *Na akciu*. Ku každému si môžeš pridať vlastnú poznámku a hviezdičku; týždenný digest ich berie ako silnejší signál.

## Profil („čo o mne agent vie“)

V dashboarde **Nápady → Môj profil** upravíš oblasti, aktívne projekty, ciele, otvorené otázky a témy, ktoré ťa nezaujímajú. Prvá verzia je predvyplnená z registra projektov (WOF, Event Platform, AI agentúra, SaaS portfólio, akvizície, RPM). Profil sa pribaľuje ku každej analýze spolu s opakujúcimi sa tagmi za posledných 90 dní a s posledných 40 záznamami, aby agent vedel nápady prepájať.

## Bezpečnosť a ochrana dát

- Bot spracuje iba správy z jedného povoleného chatu (`REPLACE_WITH_OWNER_TELEGRAM_CHAT_ID`). Ostatné ticho ignoruje.
- n8n volá Convex endpointy `/ideas/*` iba s hlavičkou `Authorization: Bearer <IDEA_VAULT_INGEST_TOKEN>`. Token má aspoň 24 znakov a porovnáva sa v konštantnom čase. Bez nastaveného tokenu sú endpointy zatvorené.
- Dashboard dotazy a mutácie vyžadujú prihláseného vlastníka (`OWNER_EMAIL`).
- Obsah sa posiela do OpenAI cez existujúci n8n OpenAI credential. Neposielaj do bota nič, čo nesmie opustiť tvoje prostredie (heslá, citlivé osobné údaje tretích strán).
- Opakované doručenie tej istej Telegram správy záznam neduplikuje (`telegram:<chatId>:<messageId>`), iba obnoví analýzu. Úspešnú analýzu nikdy neprepíše horší výsledok.
- Keď AI zlyhá, záznam sa uloží aj tak (stav „bez analýzy“) a bot ti to povie. Nič sa nestratí.

## Nasadenie (jednorazovo)

1. **Telegram bot**: v @BotFather vytvor bota (`/newbot`), napr. „Idea Vault“. Token ulož iba do n8n ako credential *Telegram API* („Idea Vault bot“). Svoje chat ID zistíš tak, že botovi napíšeš a pozrieš prvý beh triggeru v n8n (`message.chat.id`).
2. **Convex**: nasaď schému a funkcie z Macaly. V prostredí Convex nastav `IDEA_VAULT_INGEST_TOKEN` na náhodnú hodnotu (napr. `openssl rand -hex 32`).
3. **Drive**: vytvor priečinok napr. `Idea Vault/Originály` a skopíruj jeho ID.
4. **n8n credentials**:
   - *Header Auth* „Idea Vault Convex“: meno `Authorization`, hodnota `Bearer <IDEA_VAULT_INGEST_TOKEN>`.
   - existujúce *OpenAI* a *Google Drive* credentials.
5. **Import workflowov** z `n8n/workflows/idea-vault-*.pilot.json`. Nahraď placeholdery:
   - `REPLACE_WITH_CONVEX_SITE_URL` → `CONVEX_SITE_URL` (končí `.convex.site`),
   - `REPLACE_WITH_OWNER_TELEGRAM_CHAT_ID` → tvoje chat ID,
   - `REPLACE_WITH_IDEA_VAULT_DRIVE_FOLDER_ID` → ID priečinka z kroku 3.
   Potom pri každom Telegram, HTTP, OpenAI a Drive node vyber credential.
6. **Pilot** (workflowy sú v exporte neaktívne):
   1. aktivuj intake workflow a pošli botovi text s myšlienkou,
   2. odkaz na článok,
   3. screenshot,
   4. PDF,
   5. hlasovku s nápadom,
   6. tú istú správu prepošli znova a over, že nevznikol duplikát.
   Skontroluj odpoveď bota, záznam v dashboarde a originál v Drive.
7. Digest workflow najprv spusti manuálne a až potom ho aktivuj.

## Limity prvej verzie

- Telegram dovolí botovi stiahnuť súbor najviac 20 MB. Väčší súbor sa uloží iba s popisom.
- Video sa neanalyzuje. Použije sa popis a odkazy (YouTube odkaz → názov a popis stránky).
- Stránky, ktoré vyžadujú JavaScript alebo prihlásenie (LinkedIn, X, Instagram), vrátia málo textu. Pre tie je lepší screenshot alebo text v správe.
- Word/Excel súbory sa automaticky nečítajú. Pošli PDF alebo screenshot.
- Vyhľadávanie v dashboarde je textové (názov, zhrnutie, tagy, poznámky). Sémantické vyhľadávanie je kandidát na ďalšiu verziu.

## Ďalšie možné kroky

- Príkazy v Telegrame: `/hladaj <téma>`, `/tyzden`, `/napad` → odpoveď z trezora.
- Sémantické vyhľadávanie cez Convex vector index.
- Export vybraného frameworku alebo biznis nápadu do Decision Queue alebo úloh Chief of Staff.
- Druhý vstupný kanál: e-mailový label `IDEA_VAULT` (newslettery) cez natívny Gmail trigger.
