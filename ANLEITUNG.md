# Urlaubswünsche 2027 – Anleitung

Diese Anleitung ist für die Person, die die App einrichtet und betreut. Es braucht
keine Programmierkenntnisse. Die Menüs bei Supabase und GitHub können leicht anders
heißen als hier beschrieben, wenn die Anbieter ihre Seiten umgestalten.

**Die Adressen:**

- Seite für die Mitarbeiter: `https://urlaub2027.github.io/urlaub/#<code>`
  (jeder hat seinen eigenen Code – nie den nackten Link ohne Code verschicken)
- Verwaltung: `https://urlaub2027.github.io/urlaub/admin.html`

---

## Teil A – Supabase einrichten (einmalig, ca. 15 Minuten)

1. **Konto anlegen:** <https://supabase.com> öffnen → „Start your project“ →
   mit GitHub anmelden oder mit E-Mail registrieren.
2. **Projekt anlegen:** „New project“
   - Name: `urlaub-2027`
   - Database Password: auf „Generate a password“ klicken und das Passwort in
     deinem Passwort-Manager speichern. Du brauchst es im Alltag nicht.
   - Region: **Central EU (Frankfurt)**
   - Plan: Free
   - „Create new project“ → etwa 2 Minuten warten.
3. **Datenbank anlegen:** Links im Menü **SQL Editor** → „New query“ → den kompletten
   Inhalt der Datei `supabase/schema.sql` hineinkopieren → **Run**.
   Erwartet: „Success. No rows returned“.
4. **Registrierung abschalten:** Links **Authentication** → **Sign In / Providers**
   (bzw. „Configuration“) → **Allow new users to sign up** ausschalten → Speichern.
   Damit kann sich niemand selbst ein Konto anlegen.
5. **Admin-Konto anlegen:** **Authentication** → **Users** → „Add user“ →
   „Create new user“
   - Email: `aw@example.com` (keine echte Adresse – der Kollege tippt später nur `aw`)
   - Password: das gewünschte Passwort
   - Haken bei **Auto Confirm User**
   - „Create user“
6. **Konto zum Admin machen:** wieder **SQL Editor** → „New query“ → einfügen und **Run**:

   ```sql
   insert into urlaub.admins (user_id, notiz)
   select id, 'aw' from auth.users where email = 'aw@example.com';
   ```

   Erwartet: „Success. 1 row affected“ (bzw. „1 row“). Steht dort 0, stimmt die
   E-Mail-Adresse aus Schritt 5 nicht.
7. **Zugangsdaten für die Webseite kopieren:** **Project Settings** (Zahnrad) →
   **API Keys** bzw. **Data API**:
   - **Project URL** (sieht aus wie `https://abcdefgh.supabase.co`)
   - **Publishable key** (beginnt mit `sb_publishable_`) – falls es den nicht gibt,
     den **anon public** Key.

   Diese beiden Werte sind öffentlich und dürfen weitergegeben werden.
   **Niemals** den „secret“- oder „service_role“-Key weitergeben oder einbauen.

## Teil B – Webseite veröffentlichen (GitHub Pages)

1. Die zwei Werte aus A7 kommen in die Datei `docs/config.js`.
2. Der Code wird in das Repository `Urlaub2027/urlaub` hochgeladen.
3. Auf GitHub im Repository: **Settings** → **Pages** →
   „Build and deployment“ → Source: **Deploy from a branch** →
   Branch: **main**, Ordner: **/docs** → **Save**.
4. 1–2 Minuten warten. Oben auf derselben Seite erscheint
   „Your site is live at https://urlaub2027.github.io/urlaub/“.

## Teil C – Im Alltag

### Mitarbeiter anlegen und Links verschicken

1. `…/admin.html` öffnen → Benutzername `aw` + Passwort.
2. Reiter **Mitarbeiter** → Namen eintragen → **Anlegen**.
   Gibt es zwei Personen mit gleichem Vornamen, unterscheiden: „Anna K.“, „Anna M.“.
3. Beim Namen auf **WhatsApp** tippen → WhatsApp öffnet sich mit fertiger Nachricht
   → Empfänger wählen → senden. Alternativ **Link kopieren** und selbst einfügen.

### Frist und Dezember-Hinweis

Reiter **Einstellungen**. Die Frist gilt in deutscher Zeit. Bis zur Frist können
Mitarbeiter ihre Wahl beliebig oft ändern, danach nur noch ansehen.

**Vor dem ersten Verschicken unbedingt prüfen:** Die Frist ist zunächst auf
30.11.2026, 23:59 Uhr gesetzt und der Dezember-Hinweis lautet nur
„Im Dezember ist kein Urlaub möglich.“

### Auswertung

- Oben steht, wie viele schon abgegeben haben.
- Reiter **Mitarbeiter**: pro Person die gewählten Wochen, Urlaubstage und letzte Änderung.
- Reiter **Wochen**: pro KW Anzahl und Namen; Wochen mit vielen Wünschen sind rot hinterlegt.
- **Excel herunterladen**: eine Datei mit drei Blättern:
  - *Personen* – eine Zeile pro Person
  - *Wochen* – eine Zeile pro KW mit Anzahl und Namen
  - *Matrix* – Namen × KW mit „x“, unten die Summe pro Woche.
    Hier sieht man auf einen Blick, wo sich Wünsche ballen.

### Probleme

| Was passiert | Was tun |
|---|---|
| Ein Link wurde weitergegeben oder ist verloren gegangen | Beim Namen **Neuer Link** → neuen Link verschicken. Der alte funktioniert sofort nicht mehr, die Abgabe bleibt erhalten. |
| Jemand will seine Abgabe ganz zurückziehen | Selbst geht das nicht (mindestens 1 Woche). Für einen kompletten Neustart: Person löschen und neu anlegen – dann neuer Link. |
| Seite meldet „Keine Verbindung“ für alle | Supabase pausiert kostenlose Projekte nach längerer Inaktivität. Bei Supabase anmelden → Projekt öffnen → **Restore project**. Daten bleiben erhalten. |
| Admin-Passwort vergessen | Supabase → Authentication → Users → beim Nutzer „…“ → neues Passwort setzen. |
| Weiterer Admin gewünscht | Schritte A5 und A6 mit anderer Adresse wiederholen, z. B. `chef@example.com` (Login dann mit `chef`). |

---

## Datenschutz und Sicherheit in Kürze

- Gespeichert werden nur: Name, Zufallscode, gewählte Wochen, Zeitpunkt der letzten Änderung.
- Keine Cookies, kein Tracking, keine fremden Schriften oder Skripte.
- Der Code steht hinter dem `#` im Link und wird dadurch nicht an GitHub übertragen.
- Mitarbeiter sehen nur ihren eigenen Eintrag. Die Datenbank prüft jeden Zugriff
  selbst (Code, KW 1–47, höchstens 6 Wochen bzw. 36 Urlaubstage, Frist).
- Wie bei jedem Webdienst protokollieren GitHub und Supabase technisch IP-Adressen
  der Aufrufe in ihren Server-Logs; darauf hat die App keinen Einfluss.
- Das Repository ist öffentlich. Es enthält keine Namen, keine Codes und keine geheimen Schlüssel.
