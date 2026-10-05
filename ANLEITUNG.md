# Urlaubswünsche – Anleitung

Für alle, die die App betreuen oder Umfragen organisieren. Es braucht keine
Programmierkenntnisse. Menüs bei Supabase und GitHub können leicht anders heißen.

**Adressen**

- Verwaltung: `https://urlaub2027.github.io/urlaub/admin.html`
- Mitarbeiter-Links: `https://urlaub2027.github.io/urlaub/#<code>` – werden in der
  Verwaltung erzeugt, jeder Link ist persönlich.

**Rollen**

- **Organisator:** legt eigene Umfragen an, sieht nur seine eigenen, kann andere einladen.
- **Hauptadmin:** zusätzlich Übersicht aller Organisatoren, kann sperren. Sieht fremde
  Umfragen nicht.

---

## Teil A – Umstellung der bestehenden Installation (einmalig)

0. **Vorab prüfen:** Im SQL Editor ausführen:

   ```sql
   select a.user_id, u.email from urlaub.admins a join auth.users u on u.id = a.user_id;
   ```

   Erwartet: genau eine Zeile mit `aw@example.com`. Wenn nicht: **abbrechen und nachfragen**.

1. Supabase → **SQL Editor** → „New query“ → kompletten Inhalt von `supabase/schema.sql`
   einfügen → **Run**. Erwartet: „Success. No rows returned“.
   Die bisherige Umfrage wird dabei zu „Urlaubswünsche 2027“; alle Mitarbeiter-Links
   bleiben gültig; das Konto `aw` wird Hauptadmin.

   Fragt Supabase nach einer Bestätigung, weil die Datei Löschbefehle für alte Bestandteile enthält, mit „Run this query“ bestätigen.

   Falls der SQL Editor eine Meldung mit „UMSTELLUNG abgebrochen“ zeigt, wurde nichts verändert. Die Meldung nennt den Grund (z. B. zwei Mitarbeiter, deren Namen sich nur in Groß-/Kleinschreibung unterscheiden). Den Grund beheben und die Datei erneut ausführen.

2. Supabase → **Authentication** → **Sign In / Providers**:
   - **Allow new users to sign up: an** (nötig für Einladungen – die Datenbank lehnt
     jede Registrierung ohne gültige Einladung ab)
   - **Confirm email: aus** (es werden keine E-Mails verschickt)
   - **Allow anonymous sign-ins: aus**
   - **Save changes**
3. Neue Konten entstehen **nur noch über Einladungslinks**. „Add user“ im Supabase-
   Dashboard funktioniert dafür nicht mehr.
4. Zur Kontrolle die Datei direkt ein zweites Mal ausführen – es muss wieder „Success“ erscheinen.

**Hinweis:** Die Regel „höchstens 3 Wochen am Stück“ gilt ab der Umstellung auch für die bestehende Umfrage. Bereits gespeicherte Abgaben bleiben erhalten; verstößt eine dagegen, wird sie in der Verwaltung markiert.

## Teil B – Neuinstallation (nur für eine komplett neue Kopie)

1. Supabase-Projekt anlegen (Region Frankfurt), `supabase/schema.sql` im SQL Editor ausführen.
2. Authentication wie in Teil A Schritt 2 einstellen.
3. In `docs/config.js` Project URL und Publishable key eintragen; die Seite auf GitHub
   Pages veröffentlichen (Settings → Pages → Branch `main`, Ordner `/docs`).
4. Adresse der Seite eintragen und den ersten Zugang erzeugen – im SQL Editor:

   ```sql
   update urlaub.app set link_basis = 'https://<deine-adresse>/';
   select urlaub.start_einladung();
   ```

   Den angezeigten Link öffnen und registrieren – dieses Konto wird Hauptadmin.

## Teil C – Im Alltag

### Umfrage anlegen

Verwaltung → **Meine Umfragen** → Titel, Jahr, Bundesland → **Umfrage anlegen**.
Dann im Reiter **Einstellungen** prüfen: Frist, Urlaubstage, Wochen (mindestens,
höchstens, höchstens am Stück), gesperrte Monate mit Hinweis, Arbeitstage pro Woche.
Örtliche Feiertage (z. B. Augsburger Friedensfest) unter **Zusätzliche freie Tage**.

Jahr, Bundesland und Arbeitstage pro Woche lassen sich nur ändern, solange noch
niemand abgegeben hat.

### Mitarbeiter anlegen und Links verschicken

Reiter **Mitarbeiter** → Namen eintragen → **Anlegen** → beim Namen **WhatsApp**
(öffnet WhatsApp mit fertiger Nachricht) oder **Link kopieren**.

### Weitere Organisatoren einladen

**Konto & Einladen** → **Einladungslink erzeugen** → per WhatsApp schicken. Der Link
ist 7 Tage gültig und nur einmal verwendbar. Die Person wählt Namen, Benutzername
und Passwort selbst.

### Auswertung

- Oben: wie viele schon abgegeben haben.
- Reiter **Mitarbeiter**: gewählte Wochen, Urlaubstage, letzte Änderung. Eine Warnung
  erscheint, wenn eine Abgabe gegen später verschärfte Regeln verstößt.
- Reiter **Wochen**: Anzahl und Namen pro KW; volle Wochen sind rot hinterlegt.
- **Excel herunterladen**: Blätter *Personen*, *Wochen* und *Matrix* (Namen × KW).

### Probleme

| Was passiert | Was tun |
|---|---|
| Ein Mitarbeiter-Link wurde weitergegeben oder ist verloren | Beim Namen **Neuer Link** → neu verschicken. Abgabe bleibt erhalten. |
| Jemand will seine Abgabe ganz zurückziehen | Person löschen und neu anlegen (neuer Link). |
| Seite meldet „Keine Verbindung“ für alle | Supabase pausiert kostenlose Projekte nach ca. 1 Woche ohne Aufrufe. Bei Supabase anmelden → Projekt → **Restore project**. Daten bleiben erhalten. |
| Eigenes Passwort ändern | Verwaltung → **Konto & Einladen** → Passwort ändern. |
| Organisator hat Passwort vergessen | Hauptadmin im Supabase SQL Editor: `update auth.users set encrypted_password = extensions.crypt('NEUES-PASSWORT', extensions.gen_salt('bf')) where email = '<benutzername>@example.com';` – Fenster danach **nicht** speichern („Discard“). |
| Einladung abgelaufen | Neuen Einladungslink erzeugen. |
| Organisator soll keinen Zugang mehr haben | Hauptadmin → **Organisatoren** → **Sperren**. |
| Neue Organisator-Registrierung schlägt fehl, obwohl die Einladung gerade erzeugt wurde | Benutzername schon vergeben oder Einladung inzwischen benutzt – neuen Einladungslink erzeugen und einen anderen Benutzernamen wählen. |

---

## Datenschutz und Sicherheit in Kürze

- Gespeichert werden: Name und Zufallscode der Mitarbeiter, gewählte Wochen, Zeitpunkt
  der letzten Änderung; für Organisatoren Anzeigename und Benutzername.
- Keine Cookies, kein Tracking, keine fremden Schriften oder Skripte.
- Mitarbeiter sehen nur ihren eigenen Eintrag; Organisatoren nur ihre eigenen Umfragen.
  Die Datenbank prüft das bei jedem Zugriff selbst.
- Registrieren kann sich nur, wer einen gültigen Einladungslink hat.
- Alle Umfragen liegen im Supabase-Projekt des Betreibers. Wer die App anderen
  Abteilungen anbietet, sollte klären, dass das datenschutzrechtlich in Ordnung ist.
- Wie bei jedem Webdienst protokollieren GitHub und Supabase technisch IP-Adressen.
