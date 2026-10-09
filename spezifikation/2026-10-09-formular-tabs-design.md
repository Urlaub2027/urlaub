# Formular in Tabs: Urlaubswochen, Einzelne Tage, Zusatzfragen – Entwurf

Stand: 09.10.2026. Vom User im Chat freigegeben („erster Tab Urlaubs-KW, zweiter Tab Einzelne
Tage ausgegraut, dritter Tab Zusatzfrage“; Absenden „A“ = Schritt für Schritt; Hervorhebung „A“
statt Blinken; Entwurf „ok“).

## Problem

Seit es einzelne Tage gibt, ist das Mitarbeiter-Formular sehr lang: unter rund 46 Wochen hängt
die Tagesliste, darunter die übrigen Fragen. Wer die Wochen gewählt hat, findet die Resttage und
die Zusatzfragen nur durch langes Scrollen.

## Ziel

Die Seite wird in Tabs geteilt, immer nur ein Tab ist sichtbar. Der Weg führt Schritt für Schritt
von den Wochen über die einzelnen Tage zu den Zusatzfragen und zum Absenden.

## Entscheidungen

### Wann es Tabs gibt
- Nur bei Umfragen **mit** Urlaubswochen-Frage. Andere Umfragen (z. B. Vorlage Weihnachtsfeier)
  bleiben unverändert ohne Tabs.
- Tabs in dieser Reihenfolge, jeweils nur wenn vorhanden:
  1. **„Urlaubswochen“** – immer (wenn die Frage aktiv ist).
  2. **„Einzelne Tage“** – nur wenn die Urlaubswochen-Frage einzelne Tage erlaubt
     (Regel `einzeltage` an und `max_wochen`, `max_urlaubstage` gesetzt).
  3. **„Zusatzfragen“** – nur wenn es außer der Urlaubswochen-Frage weitere aktive Fragen gibt
     (auch Hinweistexte). Alle in ihrer bisherigen Reihenfolge, auch solche, die vor der
     Urlaubswochen-Frage stehen.

### Tab „Einzelne Tage“
- **Gesperrt** (ausgegraut, nicht anklickbar), solange nicht alle Wochen gewählt sind oder keine
  Tage übrig sind und keine Tage gewählt sind.
- **Hervorgehoben**, wenn alle Wochen gewählt sind und noch Tage übrig sind: Akzentfarbe,
  Abzeichen „· N übrig“; beim Freischalten (Wechsel gesperrt → frei) leuchtet er **einmal**
  ca. 1 Sekunde auf. Kein Dauerblinken (Barrierefreiheit). Respektiert `prefers-reduced-motion`
  (dann kein Aufleuchten).
- Frei, aber nicht hervorgehoben, wenn alle Tage verplant sind (gewählte Tage bleiben änderbar).
- Inhalt: Text „Du hast noch N Urlaubstage übrig …“ und die Tagesliste; alle Monate starten
  **zugeklappt**, offen ist nur, was der Nutzer öffnet.
- Ist Tab 2 gesperrt und man steht darin (Woche in Tab 1 abgewählt, dann zurück), springt die
  Ansicht auf Tab 1.

### Mitlaufender Zähler (Tab 1)
- Bleibt wie heute. Zweite Zeile bei vollen Wochen und Resttagen:
  „Noch N Urlaubstage übrig → [Weiter zu den einzelnen Tagen]“; der Knopf wechselt zu Tab 2.
- Der bisherige Sprung zum ersten passenden Tag entfällt (der Tab ist kurz genug).

### Weiter und Absenden (Schritt für Schritt)
- Der Knopf in der angehefteten Leiste unten heißt **„Weiter →“**, solange ein späterer Tab
  erreichbar ist, und im letzten erreichbaren Tab **„Antworten absenden“** bzw.
  „Änderung speichern“ (wie heute).
- „Weiter“ führt zum nächsten **nicht gesperrten** Tab. Aus Tab 1: zu Tab 2, wenn er frei ist,
  sonst zu Tab 3; gibt es keinen weiteren Tab, ist der Knopf schon „Absenden“.
- Die Tabs oben sind jederzeit anklickbar (außer gesperrtem Tab 2); „Weiter“ ist ein Angebot,
  kein Zwang.
- Absenden ist nur im letzten erreichbaren Tab möglich.
- Nach jedem Tabwechsel springt die Seite an den Anfang der Tabs.

### Fehler beim Absenden
- Die Datenbank meldet Fehler je Frage (wie heute). Das Formular wechselt in den **ersten Tab mit
  Fehler**; jeder Tab mit Fehler bekommt eine rote Markierung, bis der Fehler behoben ist bzw. die
  Frage geändert wurde.

### Sonderfälle
- **Nur lesen** (Frist abgelaufen): Tabs frei anklickbar, kein „Weiter“, kein Absenden.
- **Vorschau in der Verwaltung**: zeigt dieselben Tabs (gleiches Formular).
- **Bestätigungsseite** nach dem Absenden: unverändert.
- **Laden mit gespeicherten Antworten**: Start immer in Tab 1.

### Zugänglichkeit
- Tab-Leiste mit `role="tablist"`, Tabs `role="tab"` mit `aria-selected`, `aria-controls`,
  `aria-disabled`; Inhalte `role="tabpanel"`. Pfeiltasten links/rechts wechseln zwischen freien
  Tabs.

### Technik
- Reine Logik in `docs/formular-logik.js`: welche Tabs es gibt, welcher gesperrt/hervorgehoben
  ist, Ziel von „Weiter“, letzter erreichbarer Tab, erster Tab mit Fehler.
- `docs/formular.js` baut die Fragenblöcke wie bisher und verteilt sie auf Tab-Bereiche; die
  Bausteine der einzelnen Fragetypen bleiben unverändert. Die Tagesliste wird ein eigener
  Tab-Bereich statt eines Kastens unter dem Kalender.
- `docs/app.js` schaltet Text und Aktion des Leistenknopfs über eine neue Schnittstelle von
  `baueFormular` um (z. B. `tabs.weiter()`, `tabs.istLetzter()`, Rückmeldung bei Tabwechsel).
- CSS für Tab-Leiste, Abzeichen, Aufleuchten, Fehlermarkierung.
- Datenbank, Auswertung, Excel: unverändert.

## Nicht enthalten
- Kürzerer Wochenkalender in Tab 1 (z. B. zuklappbare Monate) – nicht verlangt.
- Tabs für Umfragen ohne Urlaubswochen-Frage.
- Fortschrittsanzeige („Schritt 2 von 3“).

## Tests
- Unit-Tests der Tab-Logik in `tests/formular-logik.test.mjs`: alle Kombinationen aus
  Einzeltage an/aus, Zusatzfragen ja/nein, Wochen voll/nicht voll, Tage übrig/nicht übrig,
  gewählte Tage vorhanden; Weiter-Ziel; letzter Tab; erster Tab mit Fehler; nur lesen.
- `npm test` vollständig grün.
- Browser-Test gegen lokale Datenbank (Wegwerf-Harness außerhalb des Repos): Umfrage mit
  Urlaubswochen + Einzeltage + Zusatzfrage; Ablauf Tab 1 → Weiter → Tab 2 (hervorgehoben) →
  Weiter → Tab 3 → Absenden; Pflichtfehler in Tab 3 springt dorthin; Umfrage ohne
  Urlaubswochen ohne Tabs; Rollen und Pfeiltasten der Tab-Leiste.
