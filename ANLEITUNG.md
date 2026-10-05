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

## Update Oktober 2026 – Vorlagen, Sicherung, Wach-Automatik

Neu: Umfragen aus Vorlagen anlegen, Mitarbeiter-Liste einfügen, Erinnern per WhatsApp,
Sicherung herunterladen und einspielen, tägliche Wach-Automatik. Reihenfolge:

1. Supabase → **SQL Editor** → „New query“ → kompletten Inhalt von `supabase/schema.sql`
   einfügen → **Run**. Erwartet: „Success“.
2. **Erst danach** wird die neue Seite veröffentlicht. Die alte Seite läuft mit dem neuen
   SQL weiter, die neue Seite braucht es.
3. GitHub → Repo → **Actions**: Fragt GitHub, ob Workflows aktiviert werden sollen,
   bestätigen. Den Workflow „Datenbank wachhalten“ öffnen → **Run workflow** → einmal von
   Hand starten. Nach wenigen Sekunden erscheint ein grüner Haken. Danach zeigt die
   Verwaltung unter **Meine Umfragen** die Zeile „Wach-Automatik: zuletzt …“.

## Teil A – Umstellung von Stand 2 auf Stand 3 (einmalig)

Stand 3 bringt den Fragen-Baukasten. Eine Vorabprüfung ist nicht nötig.

**Wichtig – Reihenfolge und Zeitpunkt:** Datenbank und Seite gehören zusammen. Die alte
Seite funktioniert nicht mit der neuen Datenbank, die neue Seite nicht mit der alten
(Mitarbeiter und Organisatoren bekämen Fehlermeldungen). Deshalb die Schritte 1 bis 3
**direkt nacheinander** erledigen, und zwar zu einer ruhigen Zeit (z. B. abends), wenn
voraussichtlich niemand gerade Wünsche einträgt oder Umfragen bearbeitet.

1. Supabase → **SQL Editor** → „New query“ → kompletten Inhalt von `supabase/schema.sql`
   einfügen → **Run**. Erwartet: „Success“.
   Fragt Supabase nach einer Bestätigung, weil die Datei Löschbefehle für alte
   Bestandteile enthält, mit „Run this query“ bestätigen.
2. Zur Kontrolle die Datei direkt ein zweites Mal ausführen – es muss wieder „Success“ erscheinen.
3. **Sofort danach** die neue Seite veröffentlichen: den neuen Stand (Ordner `docs/`) auf
   GitHub in den Branch `main` übernehmen. GitHub Pages stellt ihn nach einigen Minuten bereit.
4. Danach alle offenen Seiten (Verwaltung, Mitarbeiter-Links) **neu laden**. GitHub Pages
   kann die alte Fassung noch bis zu etwa 10 Minuten ausliefern – erscheint noch die alte
   Seite oder eine Fehlermeldung, kurz warten und erneut laden.
5. Die **Auth-Einstellungen** (Supabase → Authentication → Sign In / Providers) bleiben
   wie sie sind: Registrierung an, Confirm email aus, anonyme Anmeldung aus.

**Was sich dadurch ändert:** Jede bestehende Umfrage hat danach eine Frage
**„Urlaubswochen“** mit ihren bisherigen Regeln (Jahr, Bundesland, Arbeitstage,
Wochen- und „am Stück“-Grenzen, gesperrte Monate). Mitarbeiter-Links und bereits
gespeicherte Abgaben bleiben gültig.

## Teil B – Neuinstallation (nur für eine komplett neue Kopie)

1. Supabase-Projekt anlegen (Region Frankfurt), `supabase/schema.sql` im SQL Editor ausführen.
2. Authentication einstellen: Allow new users to sign up **an** (nötig für Einladungen), Confirm email **aus**, Allow anonymous sign-ins **aus**.
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

Verwaltung → **Meine Umfragen** → **Vorlage** wählen → Titel eintragen → **Umfrage anlegen**.

- **Vorlagen:** Urlaubswünsche, Leer, Schicht- und Verfügbarkeitswünsche, Weihnachtsfeier.
- **Jahr** und **Bundesland** erscheinen nur bei Urlaubswünsche. Eine neue Urlaubs-Umfrage
  hat zunächst eine Frage „Urlaubswochen“.
- Lässt du den Titel leer, wird ein Vorschlag eingesetzt (z. B. „Weihnachtsfeier 2026“).
- Bei allen anderen Vorlagen ist die Frist heute + 14 Tage, 23:59 Uhr. Du kannst sie unter
  **Einstellungen** ändern.
- **Weihnachtsfeier:** Die Folgefragen erscheinen erst nach „Ja“. Die Terminvorschläge
  „Termin 1–3“ musst du im Reiter **Fragen** durch die echten Termine ersetzen. Die Frage
  zum Essen (Mit Fleisch/Vegetarisch/Vegan) kannst du ausschalten. Eine Frage nach
  Allergien gibt es bewusst nicht: Das wären Gesundheitsdaten, und die Antworten sind
  nicht anonym.

Jede Umfrage hat vier Reiter: **Fragen**, **Mitarbeiter**, **Antworten**, **Einstellungen**.

### Fragen bearbeiten

Im Reiter **Fragen** baust du das Formular, das die Mitarbeiter sehen.

- **Vorschau** (oben): zeigt das Formular so, wie Mitarbeiter es sehen. Eingaben dort werden nicht gespeichert.
- **Frage hinzufügen:** Typ wählen, **Hinzufügen** klicken, dann **Bearbeiten**.
- **Schalter „aktiv“:** ausgeschaltet = für Mitarbeiter unsichtbar, bleibt aber gespeichert
  (auch mit Antworten). Das gilt ebenso für Antwortmöglichkeiten, Prüfregeln und Bedingungen.
- **↑ / ↓:** Reihenfolge ändern.
- **Löschen:** nur möglich, solange es keine Antworten gibt. Sonst steht an der Frage
  „hat Antworten – nur ausschalten möglich“.

**Fragetypen**

| Typ | Wofür |
|---|---|
| Urlaubswochen | Wochenwahl im Kalender. Höchstens eine pro Umfrage. Hier stehen auch Jahr, Bundesland und Arbeitstage pro Woche (nur änderbar, solange noch niemand Wochen gewählt hat). |
| Einfachauswahl | Eine Antwort aus einer Liste |
| Mehrfachauswahl | Mehrere Antworten aus einer Liste |
| Ja/Nein | Eine Ja/Nein-Frage |
| Skala | Zahl auf einer Skala, optional mit Beschriftung links und rechts |
| Kurzer Text | Eine Zeile Text |
| Langer Text | Mehrzeiliger Text |
| Zahl | Eine Zahl |
| Datum | Ein Datum |
| Hinweistext | Nur Text zum Lesen, keine Antwort |

**Bearbeiten:** Fragetext, Hilfetext (optional), Antwortmöglichkeiten (bei Einfach-/
Mehrfachauswahl, je mit eigenem Schalter, ↑/↓ und Löschen), Prüfregeln und Bedingungen.

- **Mit „Speichern“ übernommen** werden: Typ, Fragetext, Hilfetext, die Skala-Angaben
  (von, bis, Beschriftungen) und bei Urlaubswochen Jahr, Bundesland, Arbeitstage und der
  Hinweis zu den gesperrten Monaten. Erst danach gelten die Änderungen.
- **Sofort gespeichert** werden: alle Schalter, ↑/↓, Prüfregeln, die Verknüpfung der
  Bedingungen und der Text einer Antwortmöglichkeit (beim Verlassen des Feldes). Eine
  bestehende Bedingung hat einen eigenen **Speichern**-Knopf, eine neue wird mit
  **Bedingung hinzufügen** angelegt.

**Was gesperrt ist:**

- Sobald es Antworten gibt: der **Typ** der Frage, bei einer Skala **von** und **bis**,
  bei Urlaubswochen **Jahr**, **Bundesland** und **Arbeitstage**.
- Eine **Antwortmöglichkeit**, die schon gewählt wurde, lässt sich nicht löschen – nur
  ausschalten („hat Antworten – nur ausschalten möglich“).
- Eine Antwortmöglichkeit, die in einer **Bedingung** vorkommt, lässt sich nicht löschen.
- Der **Typ** einer Frage, auf die sich eine Bedingung einer anderen Frage bezieht, lässt
  sich nicht ändern. Zuerst die Bedingung entfernen oder ändern.

**Prüfregeln:** Jede Regel hat einen eigenen Schalter; nur eingeschaltete Regeln prüft die
Datenbank beim Absenden. Änderungen werden sofort gespeichert. Beispiele:
Pflichtfrage, Mindestens/Höchstens auswählen, Höchstens Zeichen, Kleinste/Größte Zahl,
Frühestens/Spätestens (Datum). Bei **Urlaubswochen** außerdem: Mindestens Wochen,
Höchstens Wochen, Höchstens Wochen am Stück, Höchstens Urlaubstage, **Gesperrte Monate**
(mit Hinweis) und **Gesperrte Wochen** (einzelne Kalenderwochen). Gesperrte Monate und
Gesperrte Wochen sind unabhängig voneinander ein- und ausschaltbar. Sind „mindestens“
und „höchstens“ (bzw. „frühestens“ und „spätestens“) beide eingeschaltet, darf der untere
Wert nicht größer sein als der obere; gleich ist erlaubt. „Höchstens Wochen am Stück“ und
„Höchstens Urlaubstage“ sind mindestens 1.

**Bedingungen:** Eine Frage kann nur erscheinen, wenn früher gestellte Fragen passend
beantwortet wurden.

- Als Auslöser sind nur **frühere** Fragen der Typen Einfachauswahl, Mehrfachauswahl,
  Ja/Nein, Skala und Zahl möglich.
- Mehrere Bedingungen verknüpfst du mit **und** (alle müssen zutreffen) oder **oder**
  (eine reicht). Jede Bedingung hat einen eigenen Schalter.
- Ist die Auslöser-Frage unbeantwortet oder selbst ausgeblendet, gilt die Bedingung als nicht erfüllt.
- Beispiel: Frage 1 „Hast du Kinder?“ (Ja/Nein). Frage 2 „Welche Ferienwochen brauchst du?“
  mit der Bedingung **Wenn „Hast du Kinder?“ ist Ja**. Nur wer Ja antwortet, sieht Frage 2.
- Antworten auf Fragen, die beim Absenden durch eine Bedingung ausgeblendet sind, werden
  verworfen. „Pflicht“ gilt nur für sichtbare Fragen.
- Antworten auf **ausgeschaltete** Fragen bleiben dagegen erhalten, auch wenn die Person
  erneut absendet; nach dem Wiedereinschalten sind sie wieder da.

### Einstellungen

Reiter **Einstellungen**: **Titel**, **Frist**, **Zusätzliche freie Tage** (z. B. Augsburger
Friedensfest; sie kosten keinen Urlaubstag), **Umfrage kopieren** (neue Umfrage mit allen
Fragen, Regeln, Bedingungen und freien Tagen – ohne Mitarbeiter und Antworten) und
**Umfrage löschen**.

### Mitarbeiter anlegen und Links verschicken

Reiter **Mitarbeiter** → ins Feld „Neue Mitarbeiter (ein Name pro Zeile)“ die Namen
untereinander einfügen (geht auch aus Excel kopiert) → **Anlegen**. Es erscheint z. B.
„3 Mitarbeiter angelegt.“ Höchstens 200 auf einmal. Es wird ganz oder gar nicht angelegt:
Ist ein Name doppelt, nennt die Meldung ihn, und es wird nichts angelegt. Danach beim Namen
**WhatsApp** (öffnet WhatsApp mit fertiger Nachricht) oder **Link kopieren**.

Solange die Frist läuft, gibt es zwei Hilfen für Nachzügler:

- **Erinnern** (bei jeder Person ohne Abgabe): öffnet WhatsApp mit einem Erinnerungstext
  samt Frist und persönlichem Link.
- **Liste „noch offen“ kopieren (n)** (über der Liste): kopiert nur die Namen derer ohne
  Abgabe, z. B. für einen Gruppen-Chat.

### Sicherung

- **Herunterladen:** Reiter **Einstellungen** → Kasten **Sicherung** → **Sicherung
  herunterladen**. Die Datei heißt z. B. „Weihnachtsfeier-2026_Sicherung-2026-10-05.json“.
- **Inhalt:** Fragen, Regeln, Mitarbeiter, Antworten und die persönlichen Links. Bewahre die
  Datei deshalb sicher auf. Wer sie hat, kann in die Umfrage hineinschauen.
- **Einspielen:** **Meine Umfragen** → Kasten **Sicherung einspielen** → Feld
  „Sicherungsdatei (.json)“ → **Einspielen** (höchstens 5 MB, vorher kommt eine Rückfrage).
  Es entsteht eine neue Umfrage.
- **Alte Links:** Die Links der Mitarbeiter gehen wieder, wenn die ursprüngliche Umfrage
  gelöscht ist und der Link nicht mit **Neuer Link** ersetzt wurde. Sonst entstehen neue
  Links; die Meldung nennt, wie viele. Diese musst du neu verschicken.
- **Empfehlung:** Nach Ablauf der Frist einmal sichern.

### Wach-Automatik

Supabase pausiert kostenlose Projekte nach etwa einer Woche ohne Aufrufe. Damit das nicht
passiert, meldet sich der GitHub-Workflow „Datenbank wachhalten“
(`.github/workflows/wachhalten.yml`) täglich um 05:17 Uhr (Sommerzeit) bzw. 04:17 Uhr
(Winterzeit) bei der Datenbank. Du kannst ihn auch von Hand starten (GitHub → **Actions**
→ **Run workflow**).

- **Status:** Unter **Meine Umfragen** steht „Wach-Automatik: zuletzt …“. Hat sie sich seit
  3 Tagen oder länger nicht gemeldet, steht dort eine rote Warnung mit ⚠.
- Schlägt der Lauf fehl, schickt GitHub eine E-Mail.
- GitHub kann Zeitpläne in öffentlichen Repos abschalten, wenn 60 Tage lang nichts am Repo
  geändert wurde. Dann unter **Actions** den Workflow öffnen und **Enable workflow** klicken.

### Weitere Organisatoren einladen

**Konto & Einladen** → **Einladungslink erzeugen** → per WhatsApp schicken. Der Link
ist 7 Tage gültig und nur einmal verwendbar. Die Person wählt Namen, Benutzername
und Passwort selbst.

### Auswertung

- Oben: wie viele schon abgegeben haben.
- Reiter **Mitarbeiter**: je Person „Abgegeben, Stand …“ (Zeitpunkt der letzten Abgabe)
  oder „Noch nicht abgegeben“. Verstößt eine Abgabe gegen inzwischen geänderte Regeln
  (z. B. später verschärft oder neu zur Pflicht gemacht), steht darunter ein Hinweis mit ⚠.
  Wer welche Wochen gewählt hat, zeigen der Reiter **Antworten** (Namen pro KW) und die
  Excel-Datei.
- Reiter **Antworten**: Zusammenfassung je Frage. Ausgeschaltete Fragen und
  Antwortmöglichkeiten sind mit „(aus)“ markiert. Bei einer Urlaubswochen-Frage: Anzahl
  und Namen pro KW; volle Wochen sind rot hinterlegt.
- **Excel herunterladen**: Blatt *Antworten*; gibt es eine Urlaubswochen-Frage, zusätzlich
  *Wochen* und *Matrix* (Namen × KW).

### Probleme

| Was passiert | Was tun |
|---|---|
| Frage lässt sich nicht löschen | Sie hat Antworten oder wird in einer Bedingung einer anderen Frage verwendet. Ausschalten bzw. die Bedingung entfernen. |
| Frage lässt sich nicht verschieben | Bedingungen dürfen nur auf frühere Fragen zeigen. Bedingung anpassen oder entfernen. |
| Ein Mitarbeiter-Link wurde weitergegeben oder ist verloren | Beim Namen **Neuer Link** → neu verschicken. Abgabe bleibt erhalten. |
| Jemand will seine Abgabe ganz zurückziehen | Person löschen und neu anlegen (neuer Link). |
| Seite meldet „Keine Verbindung“ für alle | Supabase pausiert kostenlose Projekte nach ca. 1 Woche ohne Aufrufe. Bei Supabase anmelden → Projekt → **Restore project**. Daten bleiben erhalten. |
| Eigenes Passwort ändern | Verwaltung → **Konto & Einladen** → Passwort ändern. |
| Organisator hat Passwort vergessen | Hauptadmin im Supabase SQL Editor: `update auth.users set encrypted_password = extensions.crypt('NEUES-PASSWORT', extensions.gen_salt('bf')) where email = '<benutzername>@example.com';` – Fenster danach **nicht** speichern („Discard“). |
| „⚠ Die Wach-Automatik hat sich noch nicht gemeldet …“ oder „… seit N Tagen nicht gemeldet …“ | GitHub → **Actions** → „Datenbank wachhalten“ öffnen. Steht dort ein Hinweis, **Enable workflow** klicken, dann **Run workflow**. Ist die Datenbank schon pausiert: Supabase → **Restore project**. |
| Einspielen meldet „Die Datei ist keine gültige Sicherung oder wurde verändert. Es wurde nichts angelegt.“ | Die Datei unverändert lassen (nicht in Excel oder einem Editor öffnen und speichern). Notfalls die Sicherung neu herunterladen. |
| Einladung abgelaufen | Neuen Einladungslink erzeugen. |
| Organisator soll keinen Zugang mehr haben | Hauptadmin → **Organisatoren** → **Sperren**. |
| Neue Organisator-Registrierung schlägt fehl, obwohl die Einladung gerade erzeugt wurde | Benutzername schon vergeben oder Einladung inzwischen benutzt – neuen Einladungslink erzeugen und einen anderen Benutzernamen wählen. |

---

## Datenschutz und Sicherheit in Kürze

- Gespeichert werden: Name und Zufallscode der Mitarbeiter, gewählte Wochen und Antworten auf die Fragen, Zeitpunkt
  der letzten Änderung; für Organisatoren Anzeigename und Benutzername.
- Keine Cookies, kein Tracking, keine fremden Schriften oder Skripte.
- Mitarbeiter sehen nur ihren eigenen Eintrag; Organisatoren nur ihre eigenen Umfragen.
  Die Datenbank prüft das bei jedem Zugriff selbst.
- Registrieren kann sich nur, wer einen gültigen Einladungslink hat.
- Alle Umfragen liegen im Supabase-Projekt des Betreibers. Wer die App anderen
  Abteilungen anbietet, sollte klären, dass das datenschutzrechtlich in Ordnung ist.
- Eine Sicherungsdatei enthält Namen, Antworten und die persönlichen Links. Sie liegt nur
  dort, wo der Organisator sie speichert.
- Wie bei jedem Webdienst protokollieren GitHub und Supabase technisch IP-Adressen.
