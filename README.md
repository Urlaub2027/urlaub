# Urlaubswünsche 2027

Kleine Web-App, in der Mitarbeiter über einen persönlichen Link ihre Urlaubswochen
wünschen. Organisatoren legen eigene Umfragen an (Jahr, Bundesland, Urlaubstage,
Wochen- und „am Stück"-Grenzen, gesperrte Monate) und laden weitere Organisatoren
per Einladungslink ein. Einrichtung und Bedienung: [ANLEITUNG.md](ANLEITUNG.md).

## Aufbau

| Pfad | Inhalt |
|---|---|
| `docs/` | Statische Seite (GitHub Pages): `index.html` für Mitarbeiter, `admin.html` für die Verwaltung (Organisatoren) |
| `supabase/schema.sql` | Komplette Datenbank: Tabellen, Prüffunktionen, Admin-Funktionen. Einmal im SQL-Editor ausführen; erneutes Ausführen ist unschädlich |
| `tests/` | Tests gegen eine lokale Postgres-Instanz (PGlite) mit nachgebildeten Supabase-Rollen |

Sicherheitsprinzip: Tabellen liegen im Schema `urlaub`, auf das die Rollen `anon`
und `authenticated` keinen Zugriff haben. Der Browser ruft nur `SECURITY DEFINER`-
Funktionen in `public` auf: `urlaub_*` (Mitarbeiter-Code), `einladung_pruefen`,
`org_*` (nur eigene Umfragen), `haupt_*` (nur Hauptadmin). Registrierungen ohne
gültige Einladung lehnt ein Trigger auf `auth.users` ab.

## Tests

```
npm install
npm test
```

Der Excel-Test liest die erzeugte Datei mit Python/openpyxl zurück und wird
übersprungen, wenn das nicht installiert ist.
