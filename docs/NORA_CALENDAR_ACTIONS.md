# NORA — zápis do hlavného kalendára

NORA vie z Telegram textu alebo hlasovej správy vytvoriť udalosť a presunúť existujúcu udalosť. Všetky zápisy smerujú výhradne do Google Calendar `primary`.

Jeden príkaz môže obsahovať až 20 udalostí. NORA pri každej zachová názov, začiatok, koniec, relevantný popis, webové odkazy a online alebo fyzické miesto. Celá dávka sa vytvorí až po jednom spoločnom potvrdení. Ak koniec chýba, použije sa 60 minút.

Viacudalostné zadanie spracúva samostatný kalendárový extraktor bez konverzačnej pamäte. Pred vytvorením workflow porovná počet extrahovaných udalostí s počtom explicitných dátumov v zadaní. Ak niektorá položka chýba, nevytvorí nič a požiada o nové zadanie; nesmie potichu vytvoriť iba prvú udalosť.

## Bezpečnostný tok

1. NORA rozpozná `CREATE` alebo `MOVE` a pripraví absolútny termín v časovom pásme `Europe/Bratislava`.
2. Workflow deterministicky overí povinné polia a povolený Telegram účet.
3. Návrh uloží na 30 minút a pošle presné zhrnutie.
4. Zápis vykoná až po samostatnej odpovedi `ÁNO`, `ANO`, `potvrdzujem`, `potvrď` alebo `OK`.
5. `ZRUŠ` návrh zahodí.

Hlasový prepis používa slovenčinu. Počas čakajúceho návrhu krátka hlasovka rozpozná aj chybné STT varianty slovenského „áno“, napríklad `Ah, não`; zrušenie sa vykoná iba po explicitnom slovenskom príkaze `zruš`.

Pri vytvorení bez trvania sa použije 60 minút. Pri presune bez nového konca sa zachová pôvodné trvanie. Presun sa nevykoná, ak vyhľadávanie nenájde práve jednu zodpovedajúcu udalosť.

## Prevádzka

- Provisioner: `scripts/build-nora-calendar-workflow.mjs`
- Google credential sa preberá z existujúceho Chief of Staff snapshot workflowu; jeho ID ani tokeny sa neukladajú do Git.
- Telegram owner chat ID sa dodáva provisioneru iba pri nasadení a nepatrí do Git.
- JSON telá Google požiadaviek pripravujú samostatné Code uzly. HTTP Request uzly dostávajú iba hotový `requestBody`.
- Zlyhaný Google zápis ponechá čakajúci návrh, takže po oprave možno potvrdenie bezpečne zopakovať.

## Overený pilot — 18. 11. 2026

- Vytvorenie `Testovacia udalosť NORA`: 19. 11. 2026, 15:00–15:30.
- Presun tej istej udalosti: 19. 11. 2026, 16:00–16:30.
- Používateľ potvrdil vytvorenie aj presun cez Telegram.
- n8n exekúcie skončili úspešne uzlom `SendResponse`; presun zachoval 30-minútové trvanie.
