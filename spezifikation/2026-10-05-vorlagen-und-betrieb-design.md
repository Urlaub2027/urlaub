# Vorlagen, Sicherung, Mitarbeiter-Liste, Erinnern, Wach-Automatik – Entwurf

Stand: 05.10.2026. Vom User freigegeben im Chat („ja 1-4, dann leer, Schicht- und
Verfügbarkeitswünsche, Weihnachtsfeier und GO“).

## Ziel

Fünf Verbesserungen für Organisatoren und den Betrieb, ohne das Sicherheitsprinzip zu ändern
(Tabellen im Schema `urlaub`, Browser ruft nur geprüfte Funktionen in `public`):

1. **Wach-Automatik** – Supabase pausiert kostenlose Projekte nach ~7 Tagen ohne
   Datenbank-Aktivität. Ein GitHub-Zeitplan schreibt täglich ein Lebenszeichen; die
   Verwaltung warnt, wenn es ausbleibt.
2. **Sicherung** – ganze Umfrage (Fragen, Regeln, Bedingungen, freie Tage, Mitarbeiter mit
   Link-Code, Abgaben, Antworten) als JSON-Datei herunterladen und als neue Umfrage einspielen.
3. **Mitarbeiter-Liste** – viele Namen auf einmal anlegen (ein Name pro Zeile, ganz oder gar nicht).
4. **Erinnern** – WhatsApp-Erinnerung je Person ohne Abgabe; Liste „noch offen“ kopieren.
5. **Vorlagen** beim Anlegen: Urlaubswünsche (wie bisher), Leer, Schicht- und
   Verfügbarkeitswünsche, Weihnachtsfeier.

## Entscheidungen

### 1. Wach-Automatik
- Tabelle `urlaub.lebenszeichen` (eine Zeile, Zeitstempel). `public.lebenszeichen()` (anon)
  schreibt `now()`, höchstens einmal pro Minute. `public.org_lebenszeichen()` liefert den
  Zeitstempel für die Verwaltung.
- `.github/workflows/wachhalten.yml`: täglich 03:17 UTC und per Hand startbar; liest URL und
  öffentlichen Schlüssel aus `docs/config.js` (eine Quelle, kein Geheimnis nötig); schlägt bei
  HTTP-Fehler fehl (GitHub mailt dann). Zweiter Schritt versucht, den Zeitplan per API aktiv
  zu halten (GitHub schaltet Zeitpläne öffentlicher Repos nach 60 Tagen ohne Repo-Aktivität
  ab; ob der API-Aufruf das verhindert, ist **nicht geprüft** – deshalb die Warnung).
- Verwaltung („Meine Umfragen“): „Wach-Automatik: zuletzt …“; ab 3 Tagen ohne Lebenszeichen
  oder ohne jedes Lebenszeichen eine rote Warnung mit Verweis auf die Anleitung.
- Recherche-Hinweis: Mehrere Quellen berichten, dass reine Lese-Anfragen die Pause nicht
  verhindern; daher ein Schreibzugriff.

### 2. Sicherung
- Format `{"format":"urlaub-sicherung","version":1, umfrage, freie_tage, fragen[…],
  mitarbeiter[…]}` mit den alten IDs; Antworten als `{"<frage_id>": wert}`.
- `urlaub.umfrage_json(id, mit_mitarbeiter)` erzeugt es, `urlaub.umfrage_aus_json(organisator,
  daten, titel)` baut daraus eine neue Umfrage (IDs alt → neu, auch Options-IDs in
  Bedingungen und Antworten). **„Umfrage kopieren“ nutzt künftig denselben Weg**
  (ohne Mitarbeiter, Titel „Kopie von …“) – eine Logik statt zwei.
- Einspielen prüft alles so streng wie der Editor: Regeln über `urlaub.regelwert` und
  `erlaubte_regeln`, widersprüchliche Regelpaare abgelehnt, Bedingungen über
  `urlaub.bedingung_werte`, Antworten über eine neue Formprüfung `urlaub.antwort_form_ok`
  (Typ, Optionen der Frage, Wertebereiche – aber ohne Regeln und auch für ausgeschaltete
  Optionen, weil gespeicherte Antworten später verschärfte Regeln verletzen dürfen).
  Jeder Fehler → `SICHERUNG_UNGUELTIG`, es wird nichts angelegt.
- Link-Codes: Der alte Code wird übernommen, wenn es ihn nirgends mehr gibt (Original
  gelöscht) – dann funktionieren die alten Links wieder. Sonst neuer Code; die Anzahl
  meldet die Verwaltung („bitte neu verschicken“).
- Download im Reiter „Einstellungen“, Einspielen unter „Meine Umfragen“ (Datei wählen,
  höchstens 5 MB). Hinweis im Text: Die Datei enthält die persönlichen Links.

### 3. Mitarbeiter-Liste
- `public.org_mitarbeiter_anlegen_liste(umfrage, text[])`: Enden trimmen, leere Zeilen
  überspringen; keine Namen → `NAME_LEER`; mehr als 200 → `ZU_VIELE_NAMEN`; ein Name doppelt
  (in der Liste oder schon vorhanden, Groß/klein egal) → `NAME_DOPPELT` mit dem Namen im
  Detail, nichts angelegt. Rückgabe: Anzahl.
- Oberfläche: Textfeld statt Einzelfeld; Meldung „3 Mitarbeiter angelegt.“
- `org_mitarbeiter_anlegen` (einzeln) bleibt für ältere Seiten bestehen.

### 4. Erinnern
- Nur Oberfläche. Bei jeder Person ohne Abgabe, solange die Frist läuft: Knopf „Erinnern“
  (WhatsApp mit Text inkl. Frist und persönlichem Link).
- Über der Liste: „Liste „noch offen“ kopieren (n)“ – nur Namen, ohne Links (für Gruppen-Chats).

### 5. Vorlagen
- `public.org_umfrage_anlegen(titel, vorlage, jahr, bundesland)` mit
  `vorlage ∈ {urlaub, leer, schicht, feier}`. Die alte Fassung mit drei Parametern bleibt als
  Weiterleitung auf `urlaub`, damit die Seite vor und nach dem Update funktioniert, egal in
  welcher Reihenfolge SQL und Seite live gehen.
- Frist: Urlaub wie bisher 30.11. des Vorjahres; sonst heute + 14 Tage, 23:59 Uhr.
- Jahr und Bundesland fragt die Seite nur bei „Urlaubswünsche“ ab.
- Inhalte (alle Fragen eingeschaltet, im Editor frei änderbar):
  - **Schicht- und Verfügbarkeitswünsche**: Hinweis; Mehrfach „An welchen Tagen kannst du
    arbeiten?“ (Mo–So, Pflicht, mind. 1); Einfach „Welche Schicht ist dir am liebsten?“
    (Früh/Spät/Nacht/Egal, Pflicht); Zahl „Wie viele Tage pro Woche möchtest du arbeiten?“
    (Pflicht, 1–6); Ja/Nein „Kannst du bei Bedarf kurzfristig einspringen?“ (Pflicht);
    Text lang „Gibt es Zeiten, in denen du nicht arbeiten kannst?“ (höchstens 500 Zeichen).
  - **Weihnachtsfeier**: Ja/Nein „Möchtest du zur Weihnachtsfeier kommen?“ (Pflicht); nur bei
    „Ja“: Mehrfach „An welchen Terminen kannst du?“ (Termin 1–3, Pflicht), Einfach „Was
    möchtest du essen?“ (Mit Fleisch/Vegetarisch/Vegan, Pflicht), Ja/Nein „Bringst du eine
    Begleitung mit?“ (Pflicht), Text lang „Hast du noch Wünsche oder Ideen für die Feier?“
    (höchstens 500 Zeichen).
  - Bewusst **keine** Frage nach Allergien/Unverträglichkeiten: Gesundheitsdaten sind nach
    DSGVO Art. 9 besonders geschützt und die Antworten sind nicht anonym.
  - **Leer**: keine Fragen.

## Nicht im Umfang
Anonyme Umfragen, eigene gespeicherte Vorlagen (dafür gibt es „Umfrage kopieren“),
Massenversand, automatische Sicherung auf GitHub (Daten gehören nicht in ein öffentliches Repo).

## Reihenfolge beim Live-Gang
Erst `schema.sql` im Supabase SQL-Editor ausführen, dann die Seite pushen. Umgekehrt
fehlen der neuen Seite kurz die neuen Funktionen; die alte Seite läuft mit dem neuen SQL weiter.
