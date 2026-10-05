# Konzept: Fragen-Baukasten

Stand: 05.10.2026 · Status: **vom User freigegeben** („ich stimme allem zu, mach einfach“ –
Abschnitte 1 und 2 einzeln bestätigt, Abschnitte 3–5 vom Controller nach den
festgelegten Leitlinien entschieden)

## Ziel

Organisatoren bauen ihre Umfragen selbst aus Fragen zusammen: Fragen, Antwortmöglichkeiten,
Prüfregeln und Sichtbarkeits-Bedingungen lassen sich anlegen, bearbeiten, sortieren und
**einzeln ein- und ausschalten**. Erste Anwendung bleiben die Urlaubswünsche; die heutige
Wochenauswahl wird ein Fragetyp. Selbst gebaut, Aufwand nachrangig.

## Festgelegte Entscheidungen (mit dem User geklärt)

| Thema | Entscheidung |
|---|---|
| Bedingungen | **Beides**: Sichtbarkeits-Bedingungen und Prüfregeln, jeweils einzeln schaltbar |
| Sichtbarkeit | **Mehrere Bedingungen pro Frage, verknüpft mit „und“ oder „oder“** (keine Verschachtelung) |
| Änderungen nach Antworten | **Schutz**: Texte, Reihenfolge, Schalter immer änderbar; Beantwortetes nicht löschbar, nur ausschaltbar; Fragetyp nur ohne Antworten änderbar; verschärfte Regeln gelten beim nächsten Speichern, Verstöße werden markiert |
| Fragetypen | Urlaubswochen (höchstens einmal pro Umfrage), Einfachauswahl, Mehrfachauswahl, Ja/Nein, Skala, kurzer Text, langer Text, Zahl, Datum, Hinweistext |
| Wiederverwendung | **Umfrage kopieren** (ohne Mitarbeiter und Antworten) |
| Technik | **Weg 1**: eigene Tabellen, Prüfung in der Datenbank; Bedingungen zusätzlich im Browser, abgesichert durch gemeinsame Testfälle |

## 1. Daten

- **Umfrage:** Titel, Frist, Organisator, zusätzliche freie Tage (wie bisher).
- **Frage:** Umfrage, Position, Typ, Text, Hilfetext, Schalter, Verknüpfung der Bedingungen
  („und“/„oder“), typabhängige Einstellungen.
  - Urlaubswochen: Jahr, Bundesland, Arbeitstage pro Woche (5/6), Hinweis zu gesperrten Monaten.
  - Skala: von, bis (Standard 1–5), Beschriftung links/rechts.
  - Andere Typen: keine.
- **Antwortmöglichkeit** (Einfach-/Mehrfachauswahl): Frage, Position, Text, Schalter.
- **Prüfregel:** Frage, Art, Wert, Schalter. Je Frage höchstens eine Regel je Art.

  | Art | Wert | erlaubt bei |
  |---|---|---|
  | pflicht | – | allen außer Hinweistext |
  | min_anzahl / max_anzahl | Zahl | Mehrfachauswahl |
  | max_zeichen | Zahl | kurzer/langer Text |
  | min_zahl / max_zahl | Zahl | Zahl |
  | fruehestens / spaetestens | Datum | Datum |
  | min_wochen / max_wochen / max_am_stueck / max_urlaubstage | Zahl | Urlaubswochen |
  | gesperrte_monate | Liste 1–12 | Urlaubswochen |

- **Bedingung:** Zielfrage, Quellfrage (muss **vor** der Zielfrage stehen), Operator, Wert(e), Schalter.

  | Quelltyp | Operatoren |
  |---|---|
  | Einfachauswahl | ist eine von / ist keine von (Antwortmöglichkeiten) |
  | Mehrfachauswahl | enthält eine von / enthält keine von |
  | Ja/Nein | ist (ja/nein) |
  | Skala, Zahl | gleich / größer als / kleiner als |

- **Abgabe:** pro Mitarbeiter ein Zeitstempel der letzten Änderung.
- **Antwort:** pro Mitarbeiter und Frage ein Wert. Gewählte Antwortmöglichkeiten sind zusätzlich
  so verknüpft, dass die Datenbank das Löschen beantworteter Fragen oder Antwortmöglichkeiten
  **selbst verweigert**.

## 2. Mitarbeiter-Seite

- Zeigt alle eingeschalteten Fragen in Reihenfolge; die Wochenauswahl wie heute als ein Fragenblock.
- Ausgeschaltete Fragen, Antwortmöglichkeiten, Regeln und Bedingungen existieren für Mitarbeiter nicht.
- Sichtbarkeit wird sofort im Browser ausgewertet. Frage ohne eingeschaltete Bedingung ist immer
  sichtbar. Bedingung mit unsichtbarer oder unbeantworteter Quellfrage gilt als **nicht erfüllt**
  (auch bei „ist keine von“).
- Antworten auf Fragen, die beim Absenden unsichtbar sind, werden **verworfen**.
- Pflicht gilt nur für sichtbare Fragen.
- Ein Knopf „Absenden“; die Datenbank prüft alles auf einmal; Fehler erscheinen an der Frage.
- Bestätigung mit allen Antworten; ändern bis zur Frist, danach nur ansehen.
- Handy zuerst, keine externen Ressourcen, persönlicher Link wie bisher.

## 3. Verwaltung (Maske)

- Umfrage-Ansicht bekommt den neuen ersten Reiter **„Fragen“**:
  - Liste der Fragen als Karten: Typ, Text, Schalter, ↑/↓, „Bearbeiten“, „Löschen“
    (nur ohne Antworten; sonst Hinweis „hat Antworten – nur ausschalten möglich“).
  - „Frage hinzufügen“ → Typ wählen → Bearbeitungsbereich der Frage.
  - Bearbeitungsbereich: Fragetext, Hilfetext; bei Auswahlfragen die Antwortmöglichkeiten
    (Text, Schalter, ↑/↓, Löschen nur ohne Antworten, „Antwort hinzufügen“); die für den Typ
    möglichen **Prüfregeln** als Zeilen mit Schalter und Wert; **Bedingungen** mit Auswahl
    „und/oder“ und Zeilen (Quellfrage, Operator, Wert, Schalter, Löschen, „Bedingung hinzufügen“).
  - Bei „Urlaubswochen“ zusätzlich Jahr, Bundesland, Arbeitstage (gesperrt, sobald Antworten
    existieren) und Hinweis zu gesperrten Monaten.
  - Schalter und ↑/↓ speichern sofort; Texte/Werte über „Speichern“ im Bearbeitungsbereich.
  - **„Vorschau“** zeigt das Formular so, wie Mitarbeiter es sehen, inklusive Bedingungen, ohne Speichern.
- Neue Umfrage startet mit einer Frage „Urlaubswochen“ mit den bisherigen Vorgaben
  (6-Tage-Woche, 36 Urlaubstage, 1–6 Wochen, höchstens 3 am Stück, Dezember gesperrt – alles als
  eingeschaltete Regeln).
- Reiter „Einstellungen“: Titel, Frist, zusätzliche freie Tage, **„Umfrage kopieren“**, „Umfrage löschen“.
- Reiter „Mitarbeiter“ wie bisher, Regelverstöße pro Frage markiert.

## 4. Auswertung

- Reiter **„Antworten“** (ersetzt „Wochen“): pro Frage eine Zusammenfassung.
  - Auswahl/Ja-Nein: Anzahl je Antwortmöglichkeit mit Namen (ausgeschaltete gekennzeichnet).
  - Skala/Zahl: Verteilung bzw. kleinster/größter Wert und Durchschnitt.
  - Text/Datum: Liste mit Namen.
  - Urlaubswochen: die bisherige Wochentabelle.
- **Excel**: Blatt „Antworten“ (eine Zeile pro Person, eine Spalte pro Frage, Spalte „Hinweis“
  für Regelverstöße); bei einer Frage „Urlaubswochen“ zusätzlich „Wochen“ und „Matrix“ wie bisher.
- **Kopieren**: neue Umfrage „Kopie von …“ mit Frist, allen Fragen, Antwortmöglichkeiten, Regeln,
  Bedingungen und freien Tagen (Schalterstände bleiben); ohne Mitarbeiter und Antworten.

## 5. Sicherheit, Umstellung, Tests

- Grundsätze unverändert: Tabellen im Schema `urlaub` ohne Zugriff für Browser-Rollen; nur
  geprüfte Funktionen; Organisatoren nur eigene Umfragen; Hauptadmin sieht keine fremden Inhalte.
- Jede Änderung über die Maske prüft Besitz und Schutzregeln in der Datenbank.
- Mitarbeiter-Seite: Laden über den Code; Absenden über eine neue Funktion, die alle Antworten
  gemeinsam prüft. Die alte Funktion zum Speichern nur der Wochen wird entfernt.
- **Umstellung von Stand 2:** wie bisher eine Datei, ganz oder gar nicht. Jede Umfrage erhält eine
  Frage „Urlaubswochen“ mit ihren bisherigen Einstellungen als eingeschaltete Regeln; Abgaben
  werden Antworten dieser Frage; Links bleiben gültig. Stand 1 wird nicht mehr unterstützt
  (live läuft Stand 2).
- Tests: Datenbank (PGlite) für alle Typen, Regeln, Bedingungen, Schutz, Trennung, Kopieren,
  Umstellung von Stand 2; **gemeinsame Bedingungs-Testfälle**, die gegen die Browser- und die
  Datenbank-Auswertung laufen; Browser-Durchlauf; Live-Prüfung.

## Nicht enthalten

Verschachtelte Bedingungen, Bedingungen auf Text-/Datum-/Urlaubswochen-Fragen, Datei-Upload,
mehrere Seiten pro Umfrage, gemeinsame Vorlagen, Versionierung, anonyme Umfragen.
