# Einzelne Urlaubstage nach den Wochen – Entwurf

Stand: 09.10.2026. Vom User im Chat freigegeben („A“ – Tage erst bei vollen Wochen;
„A, aber es muss eine Erklärung, warum es verboten ist“ – am Stück gilt auch für Tage;
„Teil 1 passt so, Teil 2 A“ – Verhalten wie beschrieben, Tage in derselben Liste).

## Problem

Die Urlaubswochen-Frage kennt nur ganze Kalenderwochen. Liegen Feiertage in den gewählten
Wochen, verbraucht ein Kollege mit 6 von 6 Wochen nicht 36, sondern z. B. nur 33 Urlaubstage
(`arbeitstage` je KW zieht Feiertage schon ab). Die restlichen 3 Tage kann er heute nicht
wünschen.

## Ziel

Hat ein Kollege die Höchstzahl an Wochen gewählt und noch Urlaubstage übrig, darf er den Rest
als **einzelne Tage** wählen – nicht früher, nicht mehr als übrig.

## Entscheidungen

### Schalter
- Neue Regel-Art **`einzeltage`** für die Urlaubswochen-Frage (wie `pflicht`: Wert immer
  `null`, nur ein/aus). Text in der Verwaltung: „Einzelne Tage nach den Wochen erlauben“.
- Einschalten (oder eingeschaltet lassen) ist nur gültig, wenn `max_wochen` **und**
  `max_urlaubstage` eingeschaltet sind. Sonst scheitert `org_regel_setzen` mit
  `UNGUELTIGE_EINSTELLUNG` – auch beim Ausschalten von `max_wochen`/`max_urlaubstage`, solange
  `einzeltage` an ist. Prüfung gemeinsam mit `regeln_widerspruch`.
- Vorlagen und bestehende Umfragen: Regel nicht angelegt = aus. Kein Verhalten ändert sich,
  bis ein Organisator den Schalter setzt.

### Gespeicherte Form (Variante A)
- Die Antwort bleibt **eine Liste**: Zahlen = KWs, Texte `"YYYY-MM-DD"` = einzelne Tage, z. B.
  `[12, 13, 30, 31, 32, 40, "2027-08-17"]`.
- Normalisiert: erst KWs aufsteigend, dann Tage aufsteigend.
- Bestehende Antworten und Sicherungsdateien bleiben gültig (nur Zahlen).
- Die Mischform wird in je **einer** Hilfsfunktion gekapselt: SQL `urlaub.antwort_wochen(jsonb)
  → int[]`, `urlaub.antwort_tage(jsonb) → date[]`; JS `wochenAus(wert)`, `tageAus(wert)` in
  `docs/logik.js`. Alle anderen Stellen nutzen nur diese.

### Welche Tage wählbar sind
Ein Tag `d` ist **grundsätzlich wählbar**, wenn
1. er in einer KW des Kalenders liegt, die nicht gesperrt ist (gesperrte Monate/Wochen),
2. er ein Arbeitstag ist (Mo–Fr bei 5, Mo–Sa bei 6 Arbeitstagen pro Woche),
3. er kein Feiertag und kein freier Tag der Umfrage ist,
4. seine KW nicht schon als ganze Woche gewählt ist.

Dazu im Formular, zur aktuellen Auswahl:
5. **Wochen voll:** Anzahl gewählter Wochen = `max_wochen`. Sonst ist der ganze Tagesbereich
   ausgeblendet.
6. **Tage übrig:** Summe Arbeitstage der Wochen + Anzahl Tage < `max_urlaubstage`. Sonst sind
   alle nicht angehakten Tage gesperrt (Abwählen geht immer).
7. **Nicht am Stück zu lang:** siehe unten.

### „Am Stück“ für einzelne Tage
- Ein **Block** ist eine Folge aufeinanderfolgender gewählter KWs (wie heute).
- Ein Tag **verlängert** einen Block, wenn zwischen dem Ende (bzw. Anfang) des Blocks und dem
  Tag **kein Arbeitstag liegt, der gearbeitet wird**. Überbrückt wird durch Nicht-Arbeitstage
  (Wochenende), Feiertage/freie Tage und andere gewählte Einzeltage.
- Verboten ist, einen Block zu verlängern, der schon `max_am_stueck` Wochen lang ist.
  Blöcke unterhalb der Höchstlänge dürfen verlängert werden.
- Beispiel Block KW 30–32, `max_am_stueck` = 3: Montag KW 33 gesperrt; Dienstag KW 33 erlaubt
  (Montag wird gearbeitet). Montag und Dienstag zusammen geht nicht, weil der Montag gesperrt
  ist. Freitag vor KW 30 gesperrt. Ist der Montag KW 33 ein Feiertag, ist der Dienstag gesperrt.
- **Erklärung sichtbar am Tag** (nicht nur als Tooltip, wegen Handy):
  „Nicht wählbar: würde deinen Urlaub KW 30–32 auf mehr als 3 Wochen am Stück verlängern.“
- Ist `max_am_stueck` aus, entfällt die Prüfung.

### Formular (Mitarbeiter-Seite)
- Unter dem Wochenkalender ein Bereich **„Einzelne Tage“**, sichtbar nur wenn `einzeltage`
  an ist und Bedingung 5 gilt. Überschrift/Text:
  „Du hast noch N Urlaubstage übrig. Du kannst sie als einzelne Tage wählen.“
- Darstellung: pro Monat die grundsätzlich wählbaren Tage als Kästchen
  („Di 17.08.“). Gesperrte Tage (Regel 6/7) ausgegraut, bei Regel 7 mit der Erklärung.
- Zähler: „6 von 6 Wochen gewählt · 2 einzelne Tage · 35 von 36 Urlaubstagen“
  („einzelne Tage“ nur, wenn Tage gewählt sind).
- **Woche abgewählt** → Wochen nicht mehr voll → alle Tage werden aus der Auswahl entfernt,
  Hinweis: „Deine einzelnen Tage wurden entfernt, weil du nicht mehr alle 6 Wochen gewählt
  hast.“ Wird eine Woche gewählt, die einen schon gewählten Tag enthält oder einen Block auf die
  Höchstlänge bringt, an dem ein Tag hängt, werden die betroffenen Tage ebenfalls entfernt
  (gleicher Hinweis sinngemäß: „…, weil sie jetzt in einer gewählten Woche liegen bzw. deinen
  Urlaub zu lang am Stück machen würden.“).
- Beim Laden gespeicherter Antworten fallen Tage weg, die inzwischen nicht mehr grundsätzlich
  wählbar sind (wie heute bei gesperrten Wochen).
- Der Regelhinweis über der Frage erhält den Zusatz „Übrige Urlaubstage danach als einzelne
  Tage.“

### Daten für das Formular
`urlaubswochen` im Fragen-JSON bekommt zusätzlich `freie_tage`: Liste der Feiertage und freien
Tage der Umfrage (`[{"datum": "2027-05-24", "name": "Pfingstmontag"}]`) im Bereich des
Kalenders. Damit rechnet das Formular wählbare Tage selbst; die Datenbank rechnet verbindlich
nach.

### Prüfung in der Datenbank (`urlaub.wochen_verstoss`)
- Elemente: Zahl (KW, wie bisher) oder Text im Format `YYYY-MM-DD`, der ein gültiges Datum ist.
  Sonst `UNGUELTIGE_WOCHE` bzw. neu `UNGUELTIGER_TAG`.
- Bisherige Wochenprüfungen laufen auf `antwort_wochen(...)` unverändert.
- Für Tage, in dieser Reihenfolge:
  - `einzeltage` aus und Tage vorhanden → `UNGUELTIGER_TAG`.
  - Tag nicht grundsätzlich wählbar (1–4) → `UNGUELTIGER_TAG`; doppelter Tag → `DOPPELTER_TAG`.
  - Tage vorhanden, aber Anzahl Wochen ≠ `max_wochen` → `TAGE_ERST_NACH_WOCHEN`.
  - Verlängert ein Tag einen vollen Block → `TAG_ZU_VIELE_AM_STUECK`.
  - `max_urlaubstage`: Summe Wochen-Arbeitstage **+ Anzahl Tage** → wie bisher `ZU_VIELE_TAGE`.
- Fehlertexte (Mitarbeiter-Seite):
  - `UNGUELTIGER_TAG`: „Mindestens ein gewählter Tag ist nicht wählbar.“
  - `DOPPELTER_TAG`: „Ein Tag wurde doppelt gewählt.“
  - `TAGE_ERST_NACH_WOCHEN`: „Einzelne Tage gehen erst, wenn du alle Wochen gewählt hast.“
  - `TAG_ZU_VIELE_AM_STUECK`: „Ein gewählter Tag macht deinen Urlaub zu lang am Stück.“

### Sicherung, Kopieren, Formprüfung
- `urlaub.antwort_form_ok`: Urlaubswochen-Element ist Zahl 1–53 **oder** gültiger Datumstext;
  keine Duplikate. Keine Regelprüfung (wie bisher).
- `urlaub.antwort_normalisiert`: Zahlen und Texte getrennt sortieren (siehe oben); Texte
  dürfen nicht mehr nach `numeric` gecastet werden.
- Regel `einzeltage` läuft über `erlaubte_regeln`/`regelwert` und wird damit beim Kopieren
  und Einspielen mitgenommen.

### Auswertung und Excel
- Wochentabelle unverändert (zählt nur KWs, über `wochenAus`).
- Neu: Tabelle **„Einzelne Tage“** (Datum mit Wochentag, KW, Anzahl, Namen) – nur wenn
  mindestens ein Tag gewählt wurde. In der Ansicht unter der Wochentabelle, in Excel als
  eigenes Blatt.
- Personenansicht/Personenspalte: „KW 12, KW 13, … · Di 17.08., Mi 18.08.“
  (`antwortText` für Urlaubswochen).

## Nicht enthalten
- Halbe Tage.
- Einzelne Tage ohne volle Wochen (bewusst verworfen, Variante „B“ im Chat).
- Umrechnung bestehender Antworten (nicht nötig, Format bleibt kompatibel).
- **Bekannte Lücke:** Zwei kurze Blöcke, die durch eine komplett mit Einzeltagen gefüllte Woche
  verbunden werden (z. B. KW 30–31 + Mo–Fr KW 32 als Tage + KW 33 bei höchstens 3 am Stück),
  werden nicht erkannt – geprüft wird nur das Verlängern eines schon vollen Blocks. Dafür
  müssten so viele Resttage übrig sein wie eine ganze Woche hat; bei Feiertagsresten (typisch
  1–4 Tage) kommt das nicht vor. Bewusst nicht abgedeckt, weil die Regel sonst schwer zu
  erklären wäre.

## Tests
- `tests/logik.test.mjs`: `wochenAus`/`tageAus`, wählbare Tage, Verlängerungsregel (Beispiele
  oben inkl. Feiertag-Brücke und Freitag davor), Zähler, Entfernen beim Abwählen.
- `tests/datenbank.test.mjs` (PGlite): jeder neue Fehlercode; gültige Abgabe 6 Wochen + 3
  Tage; Schalter ohne `max_wochen`/`max_urlaubstage` abgelehnt; Ausschalten von `max_wochen`
  bei aktivem `einzeltage` abgelehnt; Normalisierung der Mischliste.
- `tests/sicherung.test.mjs`: Sicherung mit Tagen hin und zurück; kaputte Datumstexte → Fehler.
- `tests/auswertung.test.mjs`/`excel.test.mjs`: Tagetabelle, Personentext.

## Fachregel-Duplikate
Die Wählbarkeits- und Verlängerungsregel steht in `docs/logik.js` (Anzeige) und in
`supabase/schema.sql` (verbindlich). Beide Stellen tragen einen Hinweis auf die jeweils andere.
