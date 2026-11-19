# Chief of Staff HQ — kompletný používateľský manuál

Stav manuálu: 18. november 2026. Časové údaje v aplikácii sa zobrazujú v pásme `Europe/Bratislava`.

## 1. Čo je Chief of Staff HQ

Chief of Staff HQ je súkromné riadiace centrum Tomáša. Spája prehľad práce, e-mailov, kalendára, rozhodnutí, úloh, projektov, agentov, financií, nápadov a osobných oblastí. Dashboard je používateľské rozhranie; Convex uchováva operačné dáta a audit; n8n vykonáva synchronizácie a automatizácie; Google služby zostávajú zdrojom e-mailov, kalendára, súborov a niektorých registrov.

Základné pravidlo systému:

- dashboard ukazuje stav a prijíma pokyny,
- NORA koordinuje všeobecné a medziodborové zadania,
- špecializované asistentky riešia svoju oblasť,
- nevratné alebo citlivé operácie vyžadujú potvrdenie,
- pri výpadku externého zdroja sa má zachovať posledný bezpečný snapshot.

## 2. Prihlásenie a bezpečnosť

1. Otvor publikovanú Macaly adresu Chief of Staff HQ.
2. Prihlás sa povoleným Google účtom.
3. Aplikácia porovná prihlásený e-mail s `OWNER_EMAIL`. Iný účet uvidí obrazovku bez oprávnenia.
4. Po prihlásení sa automaticky načíta posledný Convex snapshot a aplikácia sa pokúsi obnoviť živý briefing.

Nikdy neposielaj do Telegramu, dashboardového príkazu ani Macaly promptu heslá, API kľúče, bankové prihlasovacie údaje alebo Garmin MFA tokeny. Credentials patria do n8n credential store, Convex environment variables alebo VPS secret store.

## 3. Orientácia v rozhraní

### Ľavé menu na počítači

- **Dnes** — denná centrála, Command Center a súhrny.
- **Rozhodnutia** — položky, ktoré čakajú na Tomášovu voľbu.
- **Projekty** — Master Project Register.
- **Úlohy** — osobné úlohy a AI Work Queue.
- **NORA** — osobný inbox úloh a návrhy agentov.
- **Zdravie & výkon** — Garmin, regenerácia, check-iny a návyky.
- **VERA** — Idea Vault, poznámky, myšlienky a know-how.
- **Agent Control** — stav agentov, napojení a blokérov.
- **WOF Finance** — záväzky, doklady, bankové výpisy a review.

V spodnej časti je informácia o pracovnej verzii, prihlásený vlastník a odhlásenie.

### Mobilná navigácia

Na úzkej obrazovke sa hlavné moduly zobrazujú v spodnej lište. Položka **Viac** otvorí zoznam všetkých modulov. Červené/číselné odznaky upozorňujú najmä na čakajúce rozhodnutia.

### Horná lišta

Obsahuje názov otvoreného modulu a indikátor „Živé riadiace centrum“ s dátumom snapshotu. Dátum snapshotu neznamená, že každá externá služba bola práve teraz načítaná; presný čas posledného obnovenia je v dennom briefingu a Agent Control.

## 4. Dnes — denná centrála

### Denný briefing

Karta vpravo hore ukazuje stav načítania:

- **Živé zdroje** — posledný briefing bol načítaný,
- **Načítavam** — prebieha synchronizácia Gmailu, Kalendára a Control Center,
- **Obnovenie zlyhalo** — zostáva posledný snapshot; použi ikonu obnovenia,
- informácia o pripojení — zdroje sú nakonfigurované, ale briefing ešte nemusí byť aktuálny.

Tlačidlo s kruhovou šípkou obnoví briefing. Opakované klikanie nevytvára nové úlohy, iba načíta stav.

### Command Center

Command Center je hlavný vstup pre nové pokyny.

1. Vyber adresáta. NORA je predvolená pre všeobecné a komplexné zadania. SARA je určená pre WOF Finance. Ostatní asistenti predstavujú špecializované smerovanie.
2. Napíš požiadavku do textového poľa.
3. Klikni **Zaradiť príkaz**.
4. Príkaz sa uloží do spoločnej fronty. Potvrdenie na obrazovke uvádza prideleného agenta.

Rýchle čipy iba predvyplnia text; príkaz odošleš až tlačidlom. Ak si Command Center otvoril z e-mailu, nad poľom sa zobrazí kontext konkrétnej správy. Krížik kontext odstráni.

Príklady:

- „Priprav mi dnešné priority.“
- „Z tohto e-mailu priprav draft odpovede.“
- „Pridaj úlohu zavolať dodávateľovi v piatok.“
- „Priprav podklady k zajtrajšiemu stretnutiu.“

### Tri výsledky dňa

Ide o krátky navigačný zoznam zostavený zo živého rozhodovacieho radu, projektu s prioritou Teraz a počtu otvorených úloh. Kliknutie otvorí príslušné rozhodnutie, projekt alebo úlohy. Je to operačná skratka, nie plnohodnotný AI plán dňa.

### Metriky

- **Aktívne portfólio** otvorí projekty.
- **Na rozhodnutie** otvorí rozhodovací rad.
- **Otvorené úlohy** otvorí osobné a delegované úlohy.

### E-mailový prehľad

Zobrazuje filtrované neprečítané správy z posledných siedmich dní. Promo, sociálne siete a fóra sú štandardne vyradené. Pri správe môžeš:

- otvoriť originál v Gmaili,
- pripraviť draft odpovede,
- poslať e-mail do kalendárového toku,
- požiadať o uloženie príloh na Drive.

Akcia najprv pripraví príkaz v Command Center; neznamená automatické odoslanie e-mailu ani okamžitý zápis do kalendára.

### Kalendár, rozhodnutia a úlohy

Pravý stĺpec zobrazuje najbližšie udalosti a rozhodnutia. Spodné panely ukazujú otvorené úlohy, odporúčané kroky Chief of Staff a projekty s prioritou **Teraz**.

## 5. Inbox Radar

Inbox Radar je čítací a triage pohľad nad kľúčovými správami.

- Ľavý stĺpec je prioritný prúd správ.
- Kliknutím vyberieš správu.
- Pravý panel ukáže predmet, odosielateľa, bezpečný náhľad a NORA summary.
- **Otvoriť správu** otvorí Gmail, kde je celý obsah a prílohy.
- **Zadať Nore úlohu** vráti používateľa do Command Center.

Záložky „Na schválenie“, „Partneri & investori“ a „Vybavené / Archív“ sú zatiaľ vizuálne pripravené; plné serverové filtrovanie sa má dopracovať. Dashboard úmyselne nezobrazuje celý citlivý obsah e-mailu.

## 6. Kalendár

Kalendár zobrazuje udalosti zo živého briefingu v čase Bratislavy.

- Horný pás ukazuje okolité dni.
- Súhrn uvádza počet udalostí, bloky hlbokej práce a stav AI triage.
- Ľavý zoznam obsahuje udalosti zoradené podľa času.
- Pravý detail obsahuje názov, čas, odkaz do Google Calendar a priestor pre NORA briefing.

Prepínače Deň/Týždeň/Mesiac a Filter sú v aktuálnej verzii prevažne prezentačné; hlavný funkčný pohľad je denný zoznam.

### Zadávanie cez Telegram NORA

NORA vie vytvoriť a presunúť udalosť iba v hlavnom Google kalendári `primary`.

1. Pošli text alebo hlasovku s názvom, dátumom a časom.
2. NORA pošle presný návrh.
3. Odpovedz textom **ÁNO**, **ANO**, **potvrdzujem**, **potvrď** alebo **OK**.
4. NORA až potom vykoná zápis a oznámi výsledok.

Hlasové potvrdenie môže prepisovač nesprávne rozpoznať; pri dôležitých udalostiach používaj textové „áno“. `ZRUŠ` návrh zahodí. Čakajúci návrh platí 30 minút.

Jeden príkaz môže obsahovať viac udalostí. NORA zachová explicitný rozsah času, popis, odkazy a miesto. Ak koniec chýba, predvolene použije 60 minút. Pri presune zachová pôvodné trvanie, ak nový koniec neuvedieš. Presun vykoná iba vtedy, keď nájde práve jednu zodpovedajúcu udalosť.

Príklad:

> Daj do kalendára v pondelok 16:00–17:30 „Ako rásť v 2027“, miesto Google Meet, link … a do popisu pridaj, že join link je osobný.

## 7. Rozhodnutia

Decision Queue oddeľuje informácie od volieb, ktoré musí urobiť vlastník.

Každá karta obsahuje otázku, odporúčanie, dôvod, dopad, alternatívy, deadline, zdroj a súvisiaci projekt. Dostupné akcie:

- **Schváliť** — prijme odporúčanie,
- **Vlastná odpoveď** — uloží vlastné riešenie alebo podmienku,
- **Potrebujem podklady** — označí, že rozhodnutie ešte nemá dosť informácií,
- **Odložiť** — presunie rozhodnutie mimo aktuálneho radu.

Filtre menia pohľad podľa stavu. Kliknutie na projekt otvorí jeho detail. Pri vlastnej odpovedi sa zmena uloží až tlačidlom **Uložiť odpoveď**.

Pri prvom otvorení po nasadení sa pôvodný register bezpečne prenesie do Convexu. Existujúce lokálne stavy rozhodnutí sa použijú pri bootstrapovaní prázdneho registra. Ďalšie rozhodnutia sa ukladajú do živého registra; lokálna kópia zostáva iba ako prechodná poistka.

## 8. Projekty

Master Project Register ukazuje otvorené pracovné aj osobné iniciatívy.

### Priorita verzus stav

- **Teraz (P0)** — vyžaduje pozornosť teraz.
- **Dôležité (P1)** — aktívna dôležitá téma.
- **Neskôr (P2)** — momentálne nie je nutné riešiť.

Stav je nezávislý: Aktívny, Plánovaný, Čaká alebo Pozastavený.

### Ovládanie

- textové vyhľadávanie prehľadáva názov a oblasť,
- filtre: priorita, stav, oblasť,
- prepínač Karty/Riadky sa pamätá v prehliadači,
- kliknutie otvorí detail s ownerom, horizontom, deadline, progressom, najbližším krokom, blokérom a tým, na koho sa čaká.

Pri prvom otvorení sa pôvodný projektový register vloží do Convexu bez prepisovania existujúcich riadkov. V detaile projektu je možné upraviť stav, prioritu, progress, najbližší krok a blokér. Pôvodná verzia v kóde zostáva ako fallback pre prípad, že backend ešte nie je nasadený.

## 9. Úlohy — Execution Center

### Moje úlohy

Obsahujú úlohy vytvorené z dashboardu, NORA workflowov a importovaného snapshotu.

- Quick capture vyžaduje názov.
- Voliteľne vyber prioritu a deadline.
- Po uložení sa úloha objaví po obnovení briefingu.
- Filtre: Otvorené, Rozpracované, Čaká, Hotovo, Všetky.

Karta zobrazuje zdroj, prioritu, detaily, ownera, deadline, pripomienku a projekt.

### AI Work Queue

Ukazuje prácu delegovanú agentom. Karta obsahuje ownera/agenta, prioritu, očakávaný výstup, projekt, poslednú aktualizáciu, ďalšieho agenta, schvaľovanie a prípadnú chybu.

Položku v stave **ČAKÁ NA SCHVÁLENIE** možno schváliť alebo odložiť. Schválenie mení stav fronty; samo osebe nemusí vykonať externú akciu, pokiaľ nie je zapojený príslušný worker.

## 10. NORA

NORA je Chief of Staff a hlavný osobný operačný inbox. V navigácii aj v hlavičke má vlastný portrét.

### Pridanie úlohy v dashboarde

Vyplň názov, voliteľný kontext, prioritu a deadline. **Pridať Nore** uloží úlohu do spoločného registra.

### Telegram text a hlasovky

NORE môžeš večer poslať viac úloh v jednej správe. Workflow ich rozdelí maximálne na 25 samostatných položiek a zapíše do úloh aj Convexu. Jasne oddeľ jednotlivé body, napríklad:

> Nora, zapíš mi: 1. zavolať Martinovi, 2. poslať rozpočet, 3. v piatok objednať servis auta.

### NORA Inbox

Zobrazuje otvorené úlohy zo všetkých vstupov. Pri úlohe môžeš:

- **Do kalendára** — vytvorí návrh príkazu na kalendárovú udalosť; ešte nejde o okamžitý zápis,
- **Hotovo** — označí úlohu ako dokončenú.

### Návrhy agentov

Ide o kroky pripravené Personal Ops plannerom. Zobrazujú prioritu, prideleného agenta a informáciu, či čakajú na owner approval. Planner má pripravovať návrhy, nie vykonávať citlivé zmeny bez potvrdenia.

## 11. Zdravie & výkon

Sekcia spája šport, zdravie, regeneráciu a návyky. Nie je zdravotníckou pomôckou a neposkytuje diagnózu.

### Automatické metriky

Po spustení Garmin bridge sa budú zobrazovať najmä:

- dĺžka spánku,
- pokojový tep,
- Body Battery minimum/maximum, ak ho zariadenie poskytne,
- kroky, aktívne kalórie, stress, intenzívne minúty a počet aktivít.

Zdrojom bude Garmin Connect, ktorý agreguje Fenix 3 a CIRQA. Strava dnes prevažne preberá dáta z Garminu, preto nemá byť primárnym zdrojom. Apple Health je odložený, kým neprinesie konkrétnu pridanú hodnotu. Freeletics je kandidát na neskorší import dokončených tréningov.

### Denný check-in

Každé pole je voliteľné a používa škálu 1–10:

- nálada,
- energia,
- svalová únava,
- vnímaný stres,
- kvalita spánku,
- voľná poznámka (choroba, alkohol, cestovanie, náročný deň a podobne).

Odporúčanie: vypĺňaj krátko a približne v rovnakom čase. Konzistentnosť je užitočnejšia než falošná presnosť.

### Návyky

Pridaj názov, denný cieľ a jednotku. Tlačidlo **Dnes splnené** zapíše hodnotu za aktuálny bratislavský deň. Začni 2–4 návykmi, napríklad mobilita, bez alkoholu, meditácia alebo čítanie.

### Suplementy a vyhodnocovanie

Suplementový denník eviduje názov, dávku, jednotku, dátum a voliteľnú poznámku. Posledné záznamy sa zobrazia priamo v sekcii. Telegram capture suplementov je ďalší krok.

Systém smie hovoriť iba o „možnej pozorovanej súvislosti“. Vyžaduje aspoň sedem párových dní a minimálne tri dni v oboch porovnávaných skupinách. Výsledok musí uviesť vzorku a obdobie a nesmie tvrdiť príčinu. Zmenu liekov alebo zdravotnej liečby systém nesmie odporúčať.

## 12. VERA — Idea Vault a poznámky

VERA je kurátorka myšlienok, poznámok, know-how a inšpirácie. Cez Telegram prijíma text, hlasovku, odkaz, screenshot, fotku, PDF alebo menší dokument.

### Čo VERA vytvorí

- názov a zhrnutie,
- kategóriu,
- poznatky a frameworky,
- možné biznis nápady,
- relevanciu a dôvod,
- ďalšie kroky a tagy,
- signály nových záujmov do profilu.

Záznam môžeš označiť hviezdičkou, doplniť vlastnú poznámku a meniť stav: Nové, Na akciu, Knižnica, Archív.

### Úloha pre NORU

Pri vhodnom zázname použi akciu **Úloha pre NORU**. VERA vytvorí úlohu so zdrojovým kontextom a odošle ju do NORA registra. VERA tým odovzdá realizáciu, ale pôvodný záznam zostáva v Idea Vaulte.

### Môj profil

Profil obsahuje oblasti, projekty, ciele, otvorené otázky a nezaujímavé témy. Potvrdené signály zlepšujú budúcu analýzu. Každý riadok je samostatná položka.

### Týždenný digest

Digest spája nové záznamy, zvýrazňuje vzorce a navrhuje ďalšie kroky. Hviezdičky a vlastné poznámky majú väčšiu váhu.

Telegram limit súboru je 20 MB. Pri prihlasovaných alebo dynamických stránkach je vhodnejší screenshot či vložený text. VERA nemá slúžiť na ukladanie hesiel alebo citlivých údajov tretích osôb.

## 13. Agent Control

Agent Control odpovedá na otázky: kto je pripojený, kto pracuje a kde sa tok zastavil.

Stavy:

- **PRIPOJENÝ** — reálne fungujúce napojenie,
- **MANUÁLNY HANDOFF** — výsledok sa prenáša ručne,
- **PLÁNOVANÉ** — agent alebo integrácia ešte nie je aktívna,
- čakajúce/blokované/stale úlohy — vyžadujú kontrolu.

Karta agenta ukazuje napojenie, aktuálnu úlohu, ďalší krok a čas poslednej kontroly. SARA obsahuje priame odkazy na register dokladov a archív WOF. **Obnoviť** načíta nový snapshot; nemaže starý stav.

Komunikačný model: NORA vidí celý systém, špecialistka iba svoju oblasť a výsledok zapisuje do spoločného registra.

## 14. WOF Finance

Táto sekcia je pracovný modul firmy, nie osobných financií.

### Faktúry a záväzky

Zobrazuje dodávateľa, číslo dokladu, splatnosť, sumu, menu, spôsob a stav úhrady, súvisiace dokumenty a poznámky. Vyhľadávanie a filtre zužujú záznamy. Ručné pridanie vytvorí auditovaný príkaz; zápis do Google registra vykoná n8n worker.

### Ručný zápis záväzku

Vyplň dodávateľa, účel, sumu, menu, dátumy a spôsob platby. Platba kartou alebo paušál môže byť podľa formulára označená ako uhradená. Bankový prevod ostáva otvorený do spárovania alebo ručného potvrdenia.

### Review front

Sem prídu doklady, pri ktorých automatizácia nevie bezpečne určiť dátum dodania, kategóriu alebo menu. Používateľ doplní údaje; n8n následne presunie pôvodný súbor a dokončí register. Nejednoznačný doklad sa nemá automaticky zaradiť do nesprávneho mesiaca.

### Bankové výpisy

Importované výpisy a transakcie sa ukladajú idempotentne. Automatické párovanie vytvára iba návrhy. Potvrdenie alebo odmietnutie je samostatný auditovaný krok.

### Health stav financií

Modul sleduje čerstvosť registra, čakajúce/zlyhané príkazy, review, bankový import a Billdu import. Chyba znamená prevádzkový problém synchronizácie; nie automaticky chybný účtovný údaj.

## 15. Telegram — praktické rozdelenie

- **NORA bot** — úlohy, kalendár, zmeny udalostí, všeobecná koordinácia.
- **VERA bot/workflow** — poznámky, myšlienky, odkazy, hlasovky, obsah a know-how.
- **SARA bot** — finančné dokumenty po samostatnom bezpečnom aktivovaní.

Pri kalendári očakávaj potvrdzovací krok. Pri obyčajnom zozname úloh má NORA položky uložiť bez predstierania, že ich už vykonala. Ak bot odpovie iba „pripravím“, ale v dashboarde alebo kalendári sa nič neobjaví, ide o neúplný workflow a treba skontrolovať n8n execution.

## 16. Čo je živé a čo je ešte pripravené

### Živé alebo pilotne overené

- prihlásenie vlastníka,
- dashboard snapshot Gmail/Calendar/Control Center,
- NORA Telegram text a hlasové zadania,
- vytvorenie a presun udalosti po potvrdení,
- viacudalostné kalendárové zadanie,
- NORA task inbox a rozdelenie viacerých úloh,
- VERA Idea Vault a handoff úlohy Nore,
- Personal Ops planner a briefing,
- hlavné WOF Finance registre a pripravené auditované toky podľa ich samostatného runbooku.

### Pripravené, ale vyžaduje dokončenie nasadenia alebo pilot

- Garmin bridge na súkromnom VPS a jeho n8n webhook,
- pravidelný prísun Garmin metrík do Health & Performance,
- plný Telegram capture návykov, check-inov a suplementov,
- Freeletics adaptér,
- plné editovanie projektov a rozhodnutí z Convexu,
- funkčné Inbox Radar kategórie a týždenný/mesačný kalendárový pohľad,
- Universal Inbox a Ciele & RPM.

## 17. Odporúčaný denný rytmus

### Ráno — 5 až 10 minút

1. Otvor **Dnes** a obnov briefing.
2. Skontroluj tri výsledky dňa.
3. Vyčisti urgentné rozhodnutia.
4. Skontroluj najbližšie udalosti a NORA briefing.
5. Po aktivovaní health workflowu pozri regeneráciu a urob krátky check-in.

### Počas dňa

- nové požiadavky zadávaj cez Command Center alebo NORA Telegram,
- myšlienky bez okamžitej realizácie posielaj VERE,
- pri e-maile používaj kontextové akcie,
- citlivé vykonanie vždy potvrď až po kontrole návrhu.

### Večer — 5 minút

1. Nadiktuj Nore otvorené úlohy.
2. Označ splnené návyky a doplň check-in.
3. Skontroluj, čo čaká na rozhodnutie alebo schválenie.
4. Nechaj Nore pripraviť návrh priorít na ďalší deň.

### Týždenne

- prečisti projekty a blokéry,
- skontroluj VERA digest,
- vyhodnoť Health & Performance trendy až pri dostatočných dátach,
- skontroluj Agent Control a chyby workflowov,
- prehodnoť, ktoré návyky má zmysel sledovať.

## 18. Riešenie problémov

### Dashboard ukazuje staré dáta

Klikni obnoviť briefing. Potom otvor Agent Control a pozri zdrojové chyby a čas poslednej kontroly. Ak sync zlyhal, posledný snapshot zostáva zámerne zachovaný.

### NORA odpovedala, ale nevytvorila kalendár

Skontroluj, či poslala presný návrh a či si odpovedal textovým potvrdením do 30 minút. Potom skontroluj, či potvrdila „Hotovo“. Bez záverečného potvrdenia skontroluj poslednú n8n execution a Google Calendar credential.

### Hlasové „áno“ bolo pochopené zle

Použi textové `áno`. Zrušenie má byť iba explicitné `zruš`.

### Úloha sa nezobrazuje

Obnov briefing. Pozri NORA Inbox aj Úlohy, pretože zobrazujú súvisiace, ale nie úplne rovnaké pohľady. Pri Telegram úlohe skontroluj, či workflow zapísal Convex aj pôvodný task register.

### VERA nespracovala odkaz alebo dokument

Pri stránkach za prihlásením pošli screenshot alebo text. Skontroluj limit 20 MB a Telegram odpoveď. Aj pri zlyhaní AI má vzniknúť záznam bez analýzy.

### Garmin údaje chýbajú

Kým nebude nasadený VPS bridge, je to očakávané. Po nasadení skontroluj Docker log `garmin_sync_finished`, n8n webhook execution a Convex endpoint. Garmin heslo nemá zostať v dlhodobom kontajneri; používa sa token volume.

### Finance údaje sa nezhodujú

Nerob opakovaný ručný import naslepo. Skontroluj čas cache, stav command processoru, review front a zdrojový dokument alebo výpis. Idempotency chráni pred duplikátmi, ale konflikt patrí do review.

## 19. Slovník stavov

- **Snapshot** — ohraničená kópia externých dát v Convexe.
- **System of record** — zdroj, ktorý je pre daný údaj autoritatívny.
- **PROPOSED** — návrh pripravený plannerom, ešte nevykonaný.
- **OWNER approval** — vyžaduje Tomášovo potvrdenie.
- **Idempotentný zápis** — bezpečné opakovanie nevytvorí duplikát.
- **Review** — ľudská kontrola nejednoznačnej položky.
- **Handoff** — odovzdanie práce medzi agentmi.
- **Stale** — stav alebo úloha nebola primerane dlho aktualizovaná.
- **Live** — produkčné prostredie a reálne dáta, nie iba preview.

## 20. Zásady pre ďalší rozvoj

Pri každom novom module treba určiť:

1. zdroj pravdy,
2. kto smie čítať a zapisovať,
3. ktoré akcie vyžadujú potvrdenie,
4. idempotency key a audit,
5. správanie pri výpadku,
6. čo je živé a čo iba vizuálne pripravené,
7. ako sa funkcia testuje end-to-end.

Tento manuál má byť aktualizovaný pri každom produkčnom rozšírení. Rozdiel medzi „zobrazuje sa“, „ukladá sa“ a „vykonáva externú akciu“ musí zostať vždy explicitný.
