# Konzept: Mehrere Urlaubsumfragen in einer App

Stand: 05.10.2026 · Status: **zur Freigabe**

## Ziel

Aus der App für *eine* Urlaubsumfrage wird eine App für *viele*. Mehrere
Organisatoren (z. B. Abteilungsleiter) legen jeweils eigene Umfragen an, sehen nur
ihre eigenen und können weitere Organisatoren einladen. Die Seite für Mitarbeiter
bleibt im Kern gleich.

Die bestehende Umfrage 2027 wird Umfrage Nr. 1. **Bereits verschickte Mitarbeiter-Links
bleiben gültig.**

## Rollen

| Rolle | Kann |
|---|---|
| **Mitarbeiter** | Über seinen persönlichen Link Wochen wählen, ändern bis zur Frist, ansehen danach. Sieht nur sich selbst. |
| **Organisator** | Eigene Umfragen anlegen, bearbeiten, löschen; Mitarbeiter anlegen und Links verschicken; Auswertung und Excel; andere Organisatoren einladen; eigenes Passwort ändern. Sieht **nur seine eigenen** Umfragen. |
| **Hauptadmin** | Alles, was ein Organisator kann, plus: Liste aller Organisatoren, einzelne sperren/entsperren. Sieht die Umfragen anderer **nicht** in der App. Zunächst: das bestehende Konto `aw`. |

## Einladung und Registrierung

1. Organisator klickt **„Organisator einladen“** → bekommt einen Einladungslink
   (gültig 7 Tage, nur einmal verwendbar) → schickt ihn z. B. per WhatsApp.
2. Die eingeladene Person öffnet den Link, gibt **Anzeigename, Benutzername und
   Passwort** ein → ist sofort Organisator.
3. **Ohne gültige Einladung kann sich niemand registrieren.** Die Datenbank prüft die
   Einladung schon beim Anlegen des Kontos und lehnt sonst ab.
4. Passwort vergessen: Hauptadmin setzt es per SQL neu (wie bisher). Eingeloggt kann
   jeder sein Passwort selbst ändern.

Hinweis: E-Mails werden nicht verschickt (kostenloser Supabase-Tarif). Logins laufen
wie bisher über Benutzername; intern `benutzername@example.com`.

## Einstellungen pro Umfrage

| Einstellung | Vorgabe | Änderbar |
|---|---|---|
| Titel | „Urlaubswünsche <Jahr>“ | immer |
| Jahr | nächstes Jahr | nur solange niemand abgegeben hat |
| Bundesland (für Feiertage) | Bayern | nur solange niemand abgegeben hat |
| Zusätzliche freie Tage (z. B. Augsburger Friedensfest, Mariä Himmelfahrt) | keine | immer |
| Arbeitstage pro Woche | 6 (Mo–Sa) | 5 oder 6, solange niemand abgegeben hat |
| Urlaubstage | 36 | immer |
| Mindestens / höchstens Wochen | 1 / 6 | immer |
| **Höchstens Wochen am Stück** | 3 | immer |
| Gesperrte Monate | Dezember | immer |
| Hinweis zu gesperrten Monaten | „Im Dezember ist kein Urlaub möglich.“ | immer |
| Frist | 30.11. des Vorjahres, 23:59 | immer |

Werden Regeln nach ersten Abgaben verschärft, bleiben bestehende Abgaben unverändert
gespeichert; die neuen Regeln gelten beim nächsten Speichern. Die Auswertung markiert
Abgaben, die gegen die aktuellen Regeln verstoßen.

## Kalender und Feiertage

- Kalenderwochen nach ISO 8601 für jedes Jahr (auch Jahre mit KW 53).
- Eine Woche gehört zu dem Monat, in dem ihr **Donnerstag** liegt (ISO-Regel). Beispiel
  2027: KW 48 (29.11.–05.12.) gilt als Dezember und ist gesperrt – wie heute.
- Feiertage werden für Jahr + Bundesland **berechnet** (Ostern nach Gauß), alle
  16 Bundesländer, nur landesweit gültige Feiertage. Örtliche Feiertage trägt der
  Organisator als „zusätzliche freie Tage“ ein.
- Kosten einer Woche = Arbeitstage (5 oder 6) minus Feiertage, die auf diese Arbeitstage fallen.
- Prüfung der Berechnung: Tests gegen eine unabhängige Feiertagsliste
  (feiertage-api.de) für 2026–2030 und alle Bundesländer.

## Regeln beim Speichern (in der Datenbank geprüft)

Gültiger Code · Frist nicht abgelaufen · Wochen existieren im Jahr und liegen nicht in
gesperrten Monaten · keine doppelten · Anzahl zwischen Minimum und Maximum ·
**keine Folge von mehr als „höchstens am Stück“ aufeinanderfolgenden KWs** ·
Summe der Urlaubstage ≤ Urlaubstage.

## Was sich für Mitarbeiter ändert

- Titel, Regeln und gesperrte Monate kommen aus „ihrer“ Umfrage.
- Neuer Hinweis bei der Auswahl: „höchstens 3 Wochen am Stück“. Ein Kästchen, das die
  vierte Woche in Folge wäre, ist gesperrt.
- Sonst unverändert.

## Was sich für Organisatoren ändert

Die Verwaltung (`admin.html`) bekommt:
- **Startseite „Meine Umfragen“**: Titel, Jahr, abgegeben x von y, Frist; Knopf „Neue Umfrage“.
- **Umfrage öffnen** → die bekannten Reiter Mitarbeiter · Wochen · Einstellungen + Excel.
- **„Organisator einladen“** und **„Mein Konto“** (Passwort ändern).
- Nur Hauptadmin: Reiter **„Organisatoren“**.

## Sicherheit

- Wie bisher: Browser-Schlüssel ohne Login darf nur „eigenen Eintrag laden/speichern“.
- Jede Verwaltungsfunktion prüft: angemeldet · Organisator · nicht gesperrt ·
  **Umfrage gehört ihm**. Getestet wird ausdrücklich, dass Organisator A die Umfragen,
  Mitarbeiter und Links von Organisator B auch mit geratenen IDs nicht sieht oder ändert.
- Einladungscodes: zufällig (122 Bit), einmalig, 7 Tage gültig.
- Registrierung ohne gültige Einladung wird von der Datenbank abgelehnt.

## Umstellung der bestehenden App

- Eine Umstellungsdatei (`supabase/umstellung-002.sql`), einmal im SQL Editor ausführen:
  bestehende Einstellungen → Umfrage Nr. 1 (Bayern, 2027, zusätzlich Mariä Himmelfahrt
  wie bisher), Mitarbeiter und Abgaben übernehmen, `aw` → Hauptadmin, alte
  Verwaltungsfunktionen entfernen.
- Die Umstellung wird vorher lokal mit dem alten Datenbankstand getestet.
- In Supabase muss danach **„Allow new users to sign up“ wieder an** und
  **„Confirm email“ aus** – abgesichert durch die Einladungsprüfung in der Datenbank.
- Die bisherigen Auswertungs-Ansichten im Supabase-Dashboard entfallen; alles läuft
  über die Verwaltung.

## Nicht enthalten

Andere Umfragearten · mehrere Organisatoren pro Umfrage · E-Mail-Versand ·
Genehmigungsworkflow · eigene Domain.

## Bekannte Grenzen und Risiken

- **Datenschutz:** Alle Umfragen liegen in deinem Supabase-Projekt. Bei Nutzung durch
  andere Abteilungen sollte geklärt sein, dass das in Ordnung ist.
- **Pausieren:** Kostenlose Supabase-Projekte schlafen nach ca. 1 Woche ohne Aufrufe
  ein; Aufwecken per Klick im Dashboard.
- **Freie Registrierung muss technisch eingeschaltet sein**, damit Einladungen
  funktionieren. Die Datenbank lehnt Konten ohne Einladung ab; das wird getestet,
  auch live.
- **Aufwand** ist deutlich größer als bisher (nicht gemessen; grob ein Arbeitstag).

## Tests

- Datenbank (lokal, PGlite): alle bisherigen Fälle pro Umfrage, „am Stück“-Regel,
  Jahre mit 53 KW, 5-Tage-Woche, Feiertage aller Länder 2026–2030 gegen Referenzliste,
  Einladung (gültig/abgelaufen/verbraucht/fehlend), Trennung zwischen Organisatoren,
  Sperren, Umstellung von Stand 1.
- Browser: Mitarbeiter-Seite und Verwaltung durchklicken (Handy und PC).
- Live gegen Supabase: Zugriffsschutz, Registrierung ohne Einladung abgelehnt,
  eine Testumfrage komplett durchspielen.
