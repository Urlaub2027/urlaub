# Urlaubswünsche 2027

Kleine Web-App, in der Mitarbeiter über einen persönlichen Link ihre Urlaubswochen
für 2027 wünschen (KW 1–47, 1–6 Wochen, 36 Urlaubstage, 6-Tage-Woche,
bayerische Feiertage). Einrichtung und Bedienung: [ANLEITUNG.md](ANLEITUNG.md).

## Aufbau

| Pfad | Inhalt |
|---|---|
| `docs/` | Statische Seite (GitHub Pages): `index.html` für Mitarbeiter, `admin.html` für die Verwaltung |
| `supabase/schema.sql` | Komplette Datenbank: Tabellen, Prüffunktionen, Admin-Funktionen. Einmal im SQL-Editor ausführen; erneutes Ausführen ist unschädlich |
| `tests/` | Tests gegen eine lokale Postgres-Instanz (PGlite) mit nachgebildeten Supabase-Rollen |

Sicherheitsprinzip: Tabellen liegen im Schema `urlaub`, auf das die Rollen `anon`
und `authenticated` keinen Zugriff haben. Der Browser ruft nur
`SECURITY DEFINER`-Funktionen in `public` auf, die den Code bzw. die Admin-Liste prüfen.

## Tests

```
npm install
npm test
```

Der Excel-Test liest die erzeugte Datei mit Python/openpyxl zurück und wird
übersprungen, wenn das nicht installiert ist.
