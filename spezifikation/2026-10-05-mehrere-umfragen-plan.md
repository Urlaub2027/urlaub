# Mehrere Urlaubsumfragen – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Urlaubswunsch-App so erweitern, dass mehrere Organisatoren eigene Umfragen (beliebiges Jahr, Bundesland, Regeln inkl. „höchstens X Wochen am Stück“) anlegen, nur ihre eigenen sehen und weitere Organisatoren per Einladungslink hinzufügen.

**Architecture:** Statische Seite (`docs/`, GitHub Pages) + Supabase (Postgres/PostgREST/Auth). Alle Tabellen im Schema `urlaub` ohne Zugriff für `anon`/`authenticated`; der Browser ruft nur `SECURITY DEFINER`-Funktionen in `public` auf, die Code, Organisator-Besitz oder Hauptadmin-Rolle selbst prüfen. Registrierung nur mit Einladung, erzwungen durch einen Trigger auf `auth.users`. `supabase/schema.sql` ist eine Datei für Neuinstallation **und** Umstellung von Stand 1.

**Tech Stack:** PostgreSQL (Supabase, PG 15/17), plain ES-Module-JavaScript ohne Bibliotheken, Node 24 `node:test` + PGlite für Tests, Python/openpyxl optional für den Excel-Test.

**Spec:** `spezifikation/2026-10-05-mehrere-umfragen-design.md`

**Abweichung von der Spec (bewusst):** Statt einer separaten `umstellung-002.sql` erkennt `schema.sql` den alten Stand selbst und stellt um. Der User muss so nur eine Datei kennen.

## Global Constraints

- Jede Funktion: `set search_path = ''`, alle Namen voll qualifiziert (`urlaub.…`, `public.…`, `auth.uid()`).
- `security definer` nur für Funktionen in `public` und für den Trigger `urlaub.neuer_benutzer`.
- Jede Funktion in `public`: explizit `revoke all … from public, anon, authenticated` und danach nur die nötigen `grant execute`. Am Ende von `schema.sql`: `revoke all on all tables in schema urlaub …` und `revoke all on all functions in schema urlaub …`.
- `schema.sql` muss mehrfach hintereinander fehlerfrei laufen (neu und umgestellt).
- Fehler an den Browser nur als `raise exception '<CODE>'` mit diesen Codes: `LINK_UNGUELTIG, FRIST_ABGELAUFEN, KEINE_WOCHE, UNGUELTIGE_WOCHE, DOPPELTE_WOCHE, ZU_WENIGE_WOCHEN, ZU_VIELE_WOCHEN, ZU_VIELE_AM_STUECK, ZU_VIELE_TAGE, KEIN_ZUGRIFF, UMFRAGE_NICHT_GEFUNDEN, MITARBEITER_NICHT_GEFUNDEN, NAME_LEER, NAME_DOPPELT, TITEL_LEER, FRIST_LEER, GRUNDDATEN_GESPERRT, UNGUELTIGE_EINSTELLUNG, DATUM_FALSCHES_JAHR, NICHT_SELBST, NICHT_GEFUNDEN, EINLADUNG_FEHLT, EINLADUNG_UNGUELTIG`.
- Browser-Code: keine externen Ressourcen, kein `innerHTML`, alle Texte über `textContent`; CSP in den HTML-Dateien unverändert lassen.
- Oberfläche komplett Deutsch, Handy zuerst.
- Bestehende Mitarbeiter-Codes und `public.urlaub_laden(text)` / `public.urlaub_speichern(text, int[])` behalten ihre Signatur.
- Commit-Nachrichten enden mit `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Tests: `npm test` (= `node --test tests/*.test.mjs`) muss nach jedem Task grün sein.

## Review Focus

1. Organisator A ruft Funktionen mit **geratenen IDs** von Umfragen/Mitarbeitern von B auf → muss `UMFRAGE_NICHT_GEFUNDEN`/`MITARBEITER_NICHT_GEFUNDEN` liefern, nie Daten (Task 3, Test „Trennung“).
2. Registrierung mit **fehlender, falscher, abgelaufener, verbrauchter Einladung oder Einladung eines gesperrten Organisators** → Konto wird nicht angelegt (Task 4).
3. **Jahre mit 53 KW und KW 1 im Dezember des Vorjahres**; Woche über Monatsgrenze wird dem Monat ihres Donnerstags zugeordnet (Task 1, Kalendertests 2026/2027).
4. **Regeln nach Abgaben verschärft** → Abgabe bleibt gespeichert, Verwaltung zeigt `regelverstoss`, erneutes Speichern wird geprüft (Task 3).
5. **schema.sql erneut auf umgestellte Datenbank** → keine doppelte Umfrage, Codes unverändert (Task 5).

## Dateistruktur

| Datei | Verantwortung |
|---|---|
| `supabase/schema.sql` | komplette Datenbank Stand 2, inkl. Umstellung von Stand 1 |
| `tests/fixtures/schema-v1.sql` | eingefrorene Kopie von Stand 1 (für den Umstellungstest) |
| `tests/fixtures/feiertage-2026-2030.json` | Referenz-Feiertage (liegt bereits vor) |
| `tests/helfer.mjs` | gemeinsamer PGlite-Aufbau mit Supabase-Rollen und `auth`-Nachbildung |
| `tests/kalender.test.mjs` | Ostern, Landesfeiertage, Kalender pro Umfrage |
| `tests/datenbank.test.mjs` | Mitarbeiter-Funktionen und Regeln |
| `tests/admin.test.mjs` | Organisator-Funktionen, Trennung |
| `tests/einladung.test.mjs` | Einladung, Registrierungs-Trigger, Hauptadmin |
| `tests/umstellung.test.mjs` | Umstellung von Stand 1 |
| `docs/logik.js` | reine Logik Mitarbeiter-Seite (am Stück, gesperrte Bereiche) |
| `docs/app.js`, `docs/index.html` | Mitarbeiter-Seite |
| `docs/api.js` | REST/Auth-Aufrufe |
| `docs/sitzung.js` | Anmelde-Sitzung der Verwaltung |
| `docs/admin-hilfe.js` | DOM-Helfer, Fehlertexte, Auswahllisten der Verwaltung |
| `docs/admin.js`, `docs/admin.html` | Verwaltung: Login, Registrierung, Umfrageliste, Konto, Organisatoren |
| `docs/admin-umfrage.js` | Verwaltung: Detailansicht einer Umfrage |
| `docs/auswertung.js` | Tabellen/Excel-Blätter aus Umfragedaten |
| `docs/style.css` | Stile |
| `ANLEITUNG.md`, `README.md` | Doku |

---

### Task 1: Testhelfer, Tabellen Stand 2, Kalender und Feiertage

**Files:**
- Create: `tests/fixtures/schema-v1.sql` (Kopie des heutigen `supabase/schema.sql`)
- Create: `tests/helfer.mjs`
- Rewrite: `supabase/schema.sql`
- Create: `tests/kalender.test.mjs`
- Delete: `tests/datenbank.test.mjs`, `tests/admin.test.mjs` (testen Stand 1; werden in Task 2/3 neu geschrieben)

**Interfaces:**
- Produces (SQL): Tabellen `urlaub.app(id, link_basis)`, `urlaub.organisatoren(user_id, anzeigename, benutzername, ist_hauptadmin, gesperrt, eingeladen_von, angelegt_am)`, `urlaub.einladungen(code, erstellt_von, erstellt_am, gueltig_bis, eingeloest_von, eingeloest_am)`, `urlaub.umfragen(id, organisator_id, titel, jahr, bundesland, arbeitstage_pro_woche, urlaubstage, min_wochen, max_wochen, max_am_stueck, gesperrte_monate, sperr_hinweis, frist, angelegt_am)`, `urlaub.freie_tage(umfrage_id, datum, name)`, `urlaub.mitarbeiter(id, umfrage_id, name, code, angelegt_am)`, `urlaub.abgaben(mitarbeiter_id, wochen, geaendert_am)`.
- Produces (SQL): `urlaub.ostersonntag(int) → date`, `urlaub.landesfeiertage(int, text) → table(datum date, name text)`, `urlaub.kalender(bigint) → table(kw int, montag date, sonntag date, monat int, arbeitstage int, feiertag text, gesperrt boolean)`, `urlaub.kalender_json(bigint) → jsonb` (Array von `{kw, von:'DD.MM.', bis:'DD.MM.', monat, arbeitstage, feiertag, gesperrt}`).
- Produces (JS, `tests/helfer.mjs`): `SCHEMA`, `SCHEMA_V1`, `neueDatenbank({schema=true}) → PGlite`, `als(db, rolle, nutzerUuid|null, sql, params) → rows`, `browser(db, sql, params) → rows`, `organisator(db, benutzername, {hauptadmin=false, gesperrt=false}) → uuid`, `umfrageAnlegen(db, organisatorUuid, {titel, jahr=2027, bundesland='BY', frist="now() + interval '1 day'"}) → id`, `registriere(db, benutzername, einladungscode, anzeigename=benutzername) → uuid`.

- [ ] **Step 1: Stand 1 einfrieren**

```bash
cp supabase/schema.sql tests/fixtures/schema-v1.sql
git rm -q tests/datenbank.test.mjs tests/admin.test.mjs
```

- [ ] **Step 2: Testhelfer schreiben** – `tests/helfer.mjs`:

```js
// Gemeinsamer Aufbau für alle Datenbanktests: PGlite mit nachgebildeten
// Supabase-Rollen, Standardrechten, auth.uid() und auth.users.
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

export const SCHEMA = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
export const SCHEMA_V1 = readFileSync(new URL('./fixtures/schema-v1.sql', import.meta.url), 'utf8');

export async function neueDatenbank({ schema = true } = {}) {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role; create role supabase_auth_admin;
    grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
    create schema auth;
    grant usage on schema auth to anon, authenticated, supabase_auth_admin;
    create table auth.users (
      id uuid primary key default gen_random_uuid(),
      email text unique not null,
      raw_user_meta_data jsonb not null default '{}'
    );
    grant select, insert on auth.users to supabase_auth_admin;
    create function auth.uid() returns uuid language sql stable as $$
      select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
    $$;
  `);
  if (schema) {
    await db.exec(SCHEMA);
    await db.exec(SCHEMA); // erneutes Ausführen muss unschädlich sein
  }
  return db;
}

// Führt SQL als Rolle aus, wie PostgREST es mit einem JWT tut.
export async function als(db, rolle, nutzer, sql, params = []) {
  await db.exec(`set role ${rolle}`);
  await db.query("select set_config('request.jwt.claims', $1, false)",
    [nutzer ? JSON.stringify({ sub: nutzer, role: rolle }) : '']);
  try {
    return (await db.query(sql, params)).rows;
  } finally {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claims', '', false)");
  }
}

export const browser = (db, sql, params) => als(db, 'anon', null, sql, params);

export async function organisator(db, benutzername, { hauptadmin = false, gesperrt = false } = {}) {
  const r = await db.query(
    `insert into urlaub.organisatoren (user_id, anzeigename, benutzername, ist_hauptadmin, gesperrt)
     values (gen_random_uuid(), $1, $1, $2, $3) returning user_id`, [benutzername, hauptadmin, gesperrt]);
  return r.rows[0].user_id;
}

export async function umfrageAnlegen(db, organisatorId,
  { titel = 'Urlaubswünsche 2027', jahr = 2027, bundesland = 'BY', frist = "now() + interval '1 day'" } = {}) {
  const r = await db.query(
    `insert into urlaub.umfragen (organisator_id, titel, jahr, bundesland, frist)
     values ($1, $2, $3, $4, ${frist}) returning id`, [organisatorId, titel, jahr, bundesland]);
  return r.rows[0].id;
}

// Legt ein Konto so an, wie Supabase es bei /auth/v1/signup tut (Rolle supabase_auth_admin).
export async function registriere(db, benutzername, einladung, anzeigename = benutzername) {
  await db.exec('set role supabase_auth_admin');
  try {
    const r = await db.query(
      'insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id',
      [`${benutzername}@example.com`, JSON.stringify({ einladung, anzeigename })]);
    return r.rows[0].id;
  } finally {
    await db.exec('reset role');
  }
}
```

- [ ] **Step 3: Kalendertests schreiben** – `tests/kalender.test.mjs`:

```js
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { neueDatenbank, organisator, umfrageAnlegen } from './helfer.mjs';

const REFERENZ = JSON.parse(readFileSync(new URL('./fixtures/feiertage-2026-2030.json', import.meta.url), 'utf8')).jahre;
let db;
let chef;

before(async () => {
  db = await neueDatenbank();
  chef = await organisator(db, 'chef', { hauptadmin: true });
});

const kalender = async (id) => (await db.query(
  'select kw, montag::text as montag, monat, arbeitstage, feiertag, gesperrt from urlaub.kalender($1) order by kw', [id])).rows;

test('Ostersonntag', async () => {
  const soll = { 2024: '2024-03-31', 2025: '2025-04-20', 2026: '2026-04-05', 2027: '2027-03-28',
    2028: '2028-04-16', 2029: '2029-04-01', 2030: '2030-04-21' };
  for (const [jahr, datum] of Object.entries(soll)) {
    const r = await db.query('select urlaub.ostersonntag($1)::text as d', [Number(jahr)]);
    assert.equal(r.rows[0].d, datum, jahr);
  }
});

test('Landesfeiertage stimmen für alle Länder 2026–2030 mit der Referenzliste überein', async () => {
  for (const [jahr, laender] of Object.entries(REFERENZ)) {
    for (const [land, liste] of Object.entries(laender)) {
      const ist = (await db.query('select datum::text as d from urlaub.landesfeiertage($1, $2)', [Number(jahr), land]))
        .rows.map((r) => r.d);
      assert.deepEqual(ist, liste.map((x) => x[0]).sort(), `${jahr} ${land}`);
    }
  }
});

test('Kalender 2027 Bayern, 6-Tage-Woche: 52 KW, Feiertagswochen, Dezember gesperrt', async () => {
  const id = await umfrageAnlegen(db, chef);
  const k = await kalender(id);
  assert.equal(k.length, 52);
  assert.equal(k[0].montag, '2027-01-04');
  assert.equal(k[0].arbeitstage, 5);
  assert.equal(k[0].feiertag, 'Heilige Drei Könige');
  assert.deepEqual(k.filter((w) => w.arbeitstage === 5).map((w) => w.kw), [1, 12, 13, 17, 18, 20, 21, 44]);
  assert.deepEqual(k.filter((w) => w.gesperrt).map((w) => w.kw), [48, 49, 50, 51, 52]);
  assert.equal(k[46].monat, 11); // KW 47: 22.–28.11.
  assert.equal(k[47].monat, 12); // KW 48: 29.11.–05.12., Donnerstag 02.12.
});

test('Kalender 2026: 53 KW, KW 1 beginnt am 29.12.2025', async () => {
  const id = await umfrageAnlegen(db, chef, { jahr: 2026 });
  const k = await kalender(id);
  assert.equal(k.length, 53);
  assert.equal(k[0].montag, '2025-12-29');
  assert.equal(k[0].monat, 1);
  assert.equal(k[52].monat, 12);
});

test('5-Tage-Woche: Samstags-Feiertag zählt nicht, Werktags-Feiertag schon', async () => {
  const id = await umfrageAnlegen(db, chef);
  await db.query('update urlaub.umfragen set arbeitstage_pro_woche = 5 where id = $1', [id]);
  const k = await kalender(id);
  assert.equal(k[16].kw, 17);
  assert.equal(k[16].arbeitstage, 5); // Sa 01.05.
  assert.equal(k[17].arbeitstage, 4); // Do 06.05. Christi Himmelfahrt
});

test('Zusätzliche freie Tage und gesperrte Monate wirken pro Umfrage', async () => {
  const id = await umfrageAnlegen(db, chef);
  await db.query("insert into urlaub.freie_tage (umfrage_id, datum, name) values ($1, '2027-08-09', 'Betriebsruhe')", [id]);
  await db.query("update urlaub.umfragen set gesperrte_monate = '{7,8}' where id = $1", [id]);
  const k = await kalender(id);
  assert.equal(k[31].kw, 32);
  assert.equal(k[31].arbeitstage, 5);
  assert.equal(k[31].feiertag, 'Betriebsruhe');
  assert.ok(k.filter((w) => w.gesperrt).every((w) => w.monat === 7 || w.monat === 8));
  assert.equal(k[47].gesperrt, false);
});

test('kalender_json liefert Anzeigeformat', async () => {
  const id = await umfrageAnlegen(db, chef);
  const j = (await db.query('select urlaub.kalender_json($1) as j', [id])).rows[0].j;
  assert.deepEqual(j[0], { kw: 1, von: '04.01.', bis: '10.01.', monat: 1, arbeitstage: 5,
    feiertag: 'Heilige Drei Könige', gesperrt: false });
  assert.equal(j.length, 52);
});
```

- [ ] **Step 4: Test laufen lassen – muss fehlschlagen**

Run: `npm test`
Expected: FAIL (`urlaub.organisatoren` bzw. `urlaub.kalender` existiert nicht).

- [ ] **Step 5: `supabase/schema.sql` neu schreiben (Teil 1: Kopf, Tabellen, Kalender)**

Datei vollständig ersetzen durch:

```sql
-- Urlaubswünsche – Datenbank (Stand 2: mehrere Umfragen)
--
-- Einmal komplett im Supabase SQL-Editor ausführen – bei einer neuen Installation
-- ebenso wie zur Umstellung von Stand 1 (eine Umfrage): Mitarbeiter, Codes und
-- Abgaben werden dann in Umfrage Nr. 1 übernommen. Erneutes Ausführen ist unschädlich.
--
-- ACHTUNG bei späteren Änderungen: Ändern sich die Parameter einer Funktion,
-- legt "create or replace" eine ZWEITE Funktion an; die alte bleibt mitsamt
-- ihren Rechten aufrufbar. Dann vorher die alte Fassung ausdrücklich löschen:
--   drop function if exists public.<name>(<alte Parametertypen>);
--
-- Sicherheitsprinzip: Alle Tabellen liegen im Schema "urlaub"; darauf haben die
-- Rollen anon und authenticated keinen Zugriff. Der Browser ruft nur Funktionen
-- in "public" auf:
--   urlaub_*     ohne Anmeldung, geprüft über den Code aus dem Mitarbeiter-Link
--   einladung_*  ohne Anmeldung, geprüft über den Einladungscode
--   org_*        angemeldet, nur eigene Umfragen
--   haupt_*      angemeldet, nur Hauptadmin

create schema if not exists urlaub;
revoke all on schema urlaub from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------------

create table if not exists urlaub.app (
  id         boolean primary key default true check (id),
  link_basis text not null
);

create table if not exists urlaub.organisatoren (
  user_id        uuid primary key,
  anzeigename    text not null check (btrim(anzeigename) <> ''),
  benutzername   text not null unique,
  ist_hauptadmin boolean not null default false,
  gesperrt       boolean not null default false,
  eingeladen_von uuid references urlaub.organisatoren (user_id) on delete set null,
  angelegt_am    timestamptz not null default now()
);

-- erstellt_von = null: Start-Einladung (nur per SQL), macht zum Hauptadmin.
create table if not exists urlaub.einladungen (
  code           text primary key default replace(gen_random_uuid()::text, '-', ''),
  erstellt_von   uuid references urlaub.organisatoren (user_id) on delete cascade,
  erstellt_am    timestamptz not null default now(),
  gueltig_bis    timestamptz not null default now() + interval '7 days',
  eingeloest_von uuid,
  eingeloest_am  timestamptz
);

create table if not exists urlaub.umfragen (
  id                    bigint generated always as identity primary key,
  organisator_id        uuid not null references urlaub.organisatoren (user_id) on delete cascade,
  titel                 text not null check (btrim(titel) <> ''),
  jahr                  int  not null check (jahr between 2020 and 2100),
  bundesland            text not null check (bundesland in
                          ('BW','BY','BE','BB','HB','HH','HE','MV','NI','NW','RP','SL','SN','ST','SH','TH')),
  arbeitstage_pro_woche int  not null default 6 check (arbeitstage_pro_woche in (5, 6)),
  urlaubstage           int  not null default 36 check (urlaubstage between 1 and 366),
  min_wochen            int  not null default 1,
  max_wochen            int  not null default 6,
  max_am_stueck         int  not null default 3 check (max_am_stueck between 1 and 53),
  gesperrte_monate      int[] not null default '{12}'
                        check (array_position(gesperrte_monate, null) is null
                               and 1 <= all (gesperrte_monate) and 12 >= all (gesperrte_monate)),
  sperr_hinweis         text not null default 'Im Dezember ist kein Urlaub möglich.',
  frist                 timestamptz not null,
  angelegt_am           timestamptz not null default now(),
  check (min_wochen >= 1 and min_wochen <= max_wochen and max_wochen <= 53)
);

-- Örtliche Feiertage oder Betriebsruhe: kosten keinen Urlaubstag.
create table if not exists urlaub.freie_tage (
  umfrage_id bigint not null references urlaub.umfragen (id) on delete cascade,
  datum      date   not null,
  name       text   not null check (btrim(name) <> ''),
  primary key (umfrage_id, datum)
);

-- gen_random_uuid() liefert 122 Bit Zufall aus einem kryptografischen Generator.
create table if not exists urlaub.mitarbeiter (
  id          bigint generated always as identity primary key,
  umfrage_id  bigint references urlaub.umfragen (id) on delete cascade,
  name        text not null check (btrim(name) <> ''),
  code        text not null unique
              default replace(gen_random_uuid()::text, '-', '')
              check (code ~ '^[0-9a-f]{32}$'),
  angelegt_am timestamptz not null default now()
);

create table if not exists urlaub.abgaben (
  mitarbeiter_id bigint primary key references urlaub.mitarbeiter (id) on delete cascade,
  wochen         int[] not null,
  geaendert_am   timestamptz not null default now()
);

insert into urlaub.app (link_basis) values ('https://urlaub2027.github.io/urlaub/')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Kalender und Feiertage
-- ---------------------------------------------------------------------------

-- Ostersonntag nach dem Gaußschen Algorithmus (gregorianisch).
create or replace function urlaub.ostersonntag(p_jahr int)
returns date
language plpgsql immutable
set search_path = ''
as $$
declare
  a int; b int; c int; d int; e int; f int; g int; h int; i int; k int; l int; m int;
begin
  a := p_jahr % 19; b := p_jahr / 100; c := p_jahr % 100; d := b / 4; e := b % 4;
  f := (b + 8) / 25; g := (b - f + 1) / 3; h := (19 * a + b - d - g + 15) % 30;
  i := c / 4; k := c % 4; l := (32 + 2 * e + 2 * i - h - k) % 7; m := (a + 11 * h + 22 * l) / 451;
  return make_date(p_jahr, (h + l - 7 * m + 114) / 31, ((h + l - 7 * m + 114) % 31) + 1);
end;
$$;

-- Landesweit gültige gesetzliche Feiertage. Örtliche Feiertage (z. B. Augsburger
-- Friedensfest, Mariä Himmelfahrt in Teilen Bayerns) trägt der Organisator als
-- freie Tage ein. Geprüft gegen feiertage-api.de für 2026–2030.
create or replace function urlaub.landesfeiertage(p_jahr int, p_land text)
returns table (datum date, name text)
language sql immutable
set search_path = ''
as $$
  with o as (select urlaub.ostersonntag(p_jahr) as os),
  liste (datum, name, laender) as (
              select make_date(p_jahr, 1, 1), 'Neujahr', null::text[]
    union all select make_date(p_jahr, 1, 6), 'Heilige Drei Könige', array['BW','BY','ST']
    union all select make_date(p_jahr, 3, 8), 'Internationaler Frauentag',
              case when p_jahr >= 2023 then array['BE','MV']
                   when p_jahr >= 2019 then array['BE'] else '{}'::text[] end
    union all select os - 2, 'Karfreitag', null from o
    union all select os, 'Ostersonntag', array['BB'] from o
    union all select os + 1, 'Ostermontag', null from o
    union all select make_date(p_jahr, 5, 1), 'Tag der Arbeit', null
    union all select os + 39, 'Christi Himmelfahrt', null from o
    union all select os + 49, 'Pfingstsonntag', array['BB'] from o
    union all select os + 50, 'Pfingstmontag', null from o
    union all select os + 60, 'Fronleichnam', array['BW','BY','HE','NW','RP','SL'] from o
    union all select make_date(p_jahr, 8, 15), 'Mariä Himmelfahrt', array['SL']
    union all select make_date(p_jahr, 9, 20), 'Weltkindertag',
              case when p_jahr >= 2019 then array['TH'] else '{}'::text[] end
    union all select make_date(p_jahr, 10, 3), 'Tag der Deutschen Einheit', null
    union all select make_date(p_jahr, 10, 31), 'Reformationstag',
              case when p_jahr >= 2018 then array['BB','HB','HH','MV','NI','SH','SN','ST','TH']
                   else array['BB','MV','SN','ST','TH'] end
    union all select make_date(p_jahr, 11, 1), 'Allerheiligen', array['BW','BY','NW','RP','SL']
    -- Buß- und Bettag: Mittwoch vor dem 23. November
    union all select make_date(p_jahr, 11, 22) - ((extract(isodow from make_date(p_jahr, 11, 22))::int + 4) % 7),
              'Buß- und Bettag', array['SN']
    union all select make_date(p_jahr, 12, 25), '1. Weihnachtstag', null
    union all select make_date(p_jahr, 12, 26), '2. Weihnachtstag', null
    -- einmalige Feiertage
    union all select e.d, e.n, array['BE']
              from (values (date '2020-05-08', 'Tag der Befreiung'),
                           (date '2025-05-08', 'Tag der Befreiung'),
                           (date '2028-06-17', '75. Jahrestag des 17. Juni 1953')) e (d, n)
              where extract(year from e.d) = p_jahr
  )
  select datum, name from liste
  where laender is null or p_land = any (laender)
  order by datum
$$;

-- Kalenderwochen einer Umfrage nach ISO 8601. Eine Woche gehört zum Monat ihres
-- Donnerstags. Arbeitstage = Arbeitstage pro Woche minus freie Tage auf diesen Tagen.
create or replace function urlaub.kalender(p_umfrage_id bigint)
returns table (kw int, montag date, sonntag date, monat int, arbeitstage int, feiertag text, gesperrt boolean)
language sql stable
set search_path = ''
as $$
  with u as (
    select u.*,
           make_date(u.jahr, 1, 4) - (extract(isodow from make_date(u.jahr, 1, 4))::int - 1) as montag1,
           extract(week from make_date(u.jahr, 12, 28))::int as anzahl
    from urlaub.umfragen u where u.id = p_umfrage_id
  ),
  frei as (
    select l.datum, l.name from u, urlaub.landesfeiertage(u.jahr, u.bundesland) l
    union
    select f.datum, f.name from urlaub.freie_tage f where f.umfrage_id = p_umfrage_id
  ),
  w as (
    select u.arbeitstage_pro_woche, u.gesperrte_monate, g.kw, u.montag1 + (g.kw - 1) * 7 as montag
    from u, generate_series(1, u.anzahl) as g (kw)
  )
  select w.kw,
         w.montag,
         w.montag + 6,
         extract(month from w.montag + 3)::int,
         w.arbeitstage_pro_woche - count(distinct f.datum)::int,
         string_agg(distinct f.name, ', ' order by f.name),
         extract(month from w.montag + 3)::int = any (w.gesperrte_monate)
  from w
  left join frei f on f.datum between w.montag and w.montag + (w.arbeitstage_pro_woche - 1)
  group by w.kw, w.montag, w.arbeitstage_pro_woche, w.gesperrte_monate
  order by w.kw
$$;

create or replace function urlaub.kalender_json(p_umfrage_id bigint)
returns jsonb
language sql stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'kw',          k.kw,
           'von',         to_char(k.montag,  'DD.MM.'),
           'bis',         to_char(k.sonntag, 'DD.MM.'),
           'monat',       k.monat,
           'arbeitstage', k.arbeitstage,
           'feiertag',    k.feiertag,
           'gesperrt',    k.gesperrt) order by k.kw), '[]'::jsonb)
  from urlaub.kalender(p_umfrage_id) k
$$;

-- ---------------------------------------------------------------------------
-- (Task 5 fügt hier die Umstellung von Stand 1 ein)
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Nacharbeiten an Tabellen (neu und umgestellt)
-- ---------------------------------------------------------------------------

alter table urlaub.mitarbeiter alter column umfrage_id set not null;
create unique index if not exists mitarbeiter_name_je_umfrage on urlaub.mitarbeiter (umfrage_id, lower(name));

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'abgaben_wochen_gueltig') then
    alter table urlaub.abgaben add constraint abgaben_wochen_gueltig
      check (cardinality(wochen) >= 1 and array_position(wochen, null) is null
             and 1 <= all (wochen) and 53 >= all (wochen));
  end if;
end;
$$;

alter table urlaub.app           enable row level security;
alter table urlaub.organisatoren enable row level security;
alter table urlaub.einladungen   enable row level security;
alter table urlaub.umfragen      enable row level security;
alter table urlaub.freie_tage    enable row level security;
alter table urlaub.mitarbeiter   enable row level security;
alter table urlaub.abgaben       enable row level security;

-- ---------------------------------------------------------------------------
-- (Task 2–4 fügen hier Funktionen ein)
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Rechte zum Schluss
-- ---------------------------------------------------------------------------

revoke all on all tables    in schema urlaub from public, anon, authenticated;
revoke all on all functions in schema urlaub from public, anon, authenticated;
```

- [ ] **Step 6: Tests laufen lassen**

Run: `npm test`
Expected: PASS für `kalender.test.mjs`, `logik.test.mjs`, `excel.test.mjs`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Datenbank Stand 2: Tabellen, Kalender und Feiertage aller Bundesländer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Regeln und Mitarbeiter-Funktionen

**Files:**
- Modify: `supabase/schema.sql` (Funktionen an der Markierung „Task 2–4 fügen hier Funktionen ein“ einfügen)
- Create: `tests/datenbank.test.mjs`

**Interfaces:**
- Consumes: Task 1 Tabellen, `urlaub.kalender`, `urlaub.kalender_json`, Helfer `neueDatenbank`, `browser`, `organisator`, `umfrageAnlegen`, `als`.
- Produces (SQL): `urlaub.regelverstoss(p_umfrage_id bigint, p_wochen int[]) → text` (Fehlercode oder `null`), `urlaub.antwort(p_mitarbeiter_id bigint) → jsonb` mit Schlüsseln `name, titel, jahr, wochen, geaendert_am, frist, offen, min_wochen, max_wochen, max_am_stueck, urlaubstage, arbeitstage_pro_woche, sperr_hinweis, kalender`, `public.urlaub_laden(p_code text) → jsonb`, `public.urlaub_speichern(p_code text, p_wochen int[]) → jsonb` (beide für `anon`).

- [ ] **Step 1: Tests schreiben** – `tests/datenbank.test.mjs`:

```js
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { neueDatenbank, browser, als, organisator, umfrageAnlegen } from './helfer.mjs';

let db;
let umfrage;
let annaCode;
let benCode;

before(async () => {
  db = await neueDatenbank();
  const chef = await organisator(db, 'chef', { hauptadmin: true });
  umfrage = await umfrageAnlegen(db, chef);
  const r = await db.query(
    "insert into urlaub.mitarbeiter (umfrage_id, name) values ($1, 'Anna'), ($1, 'Ben') returning name, code", [umfrage]);
  annaCode = r.rows.find((x) => x.name === 'Anna').code;
  benCode = r.rows.find((x) => x.name === 'Ben').code;
});

const laden = async (code) => (await browser(db, 'select public.urlaub_laden($1) as r', [code]))[0].r;
const speichern = async (code, wochen) =>
  (await browser(db, 'select public.urlaub_speichern($1, $2::int[]) as r', [code, wochen]))[0].r;
const setze = (zuweisung) => db.query(`update urlaub.umfragen set ${zuweisung} where id = $1`, [umfrage]);

test('Laden liefert Titel, Regeln und Kalender', async () => {
  const r = await laden(annaCode);
  assert.equal(r.name, 'Anna');
  assert.equal(r.titel, 'Urlaubswünsche 2027');
  assert.equal(r.jahr, 2027);
  assert.deepEqual(r.wochen, []);
  assert.equal(r.kalender.length, 52);
  assert.deepEqual(r.kalender[0], { kw: 1, von: '04.01.', bis: '10.01.', monat: 1, arbeitstage: 5,
    feiertag: 'Heilige Drei Könige', gesperrt: false });
  assert.equal(r.kalender[47].gesperrt, true);
  assert.equal(r.min_wochen, 1);
  assert.equal(r.max_wochen, 6);
  assert.equal(r.max_am_stueck, 3);
  assert.equal(r.urlaubstage, 36);
  assert.equal(r.arbeitstage_pro_woche, 6);
  assert.equal(r.sperr_hinweis, 'Im Dezember ist kein Urlaub möglich.');
  assert.equal(r.offen, true);
});

test('Gültige Abgabe wird sortiert gespeichert', async () => {
  const r = await speichern(annaCode, [30, 12, 2]);
  assert.deepEqual(r.wochen, [2, 12, 30]);
  assert.ok(r.geaendert_am);
});

test('Ändern überschreibt, ein Eintrag pro Person', async () => {
  await speichern(annaCode, [1, 3, 5]);
  const r = await speichern(annaCode, [40]);
  assert.deepEqual(r.wochen, [40]);
  const n = await db.query(
    "select count(*)::int as n from urlaub.abgaben a join urlaub.mitarbeiter m on m.id = a.mitarbeiter_id where m.name = 'Anna'");
  assert.equal(n.rows[0].n, 1);
});

test('6 Wochen erlaubt, 7 abgelehnt', async () => {
  await speichern(benCode, [1, 3, 5, 7, 9, 11]);
  await assert.rejects(speichern(benCode, [1, 3, 5, 7, 9, 11, 13]), /ZU_VIELE_WOCHEN/);
  assert.deepEqual((await laden(benCode)).wochen, [1, 3, 5, 7, 9, 11]);
});

test('Gesperrte, ungültige, doppelte und leere Auswahl', async () => {
  await assert.rejects(speichern(benCode, [48]), /UNGUELTIGE_WOCHE/);
  await assert.rejects(speichern(benCode, [53]), /UNGUELTIGE_WOCHE/); // 2027 hat 52 KW
  await assert.rejects(speichern(benCode, [0]), /UNGUELTIGE_WOCHE/);
  await assert.rejects(speichern(benCode, [5, null]), /UNGUELTIGE_WOCHE/);
  await assert.rejects(speichern(benCode, []), /KEINE_WOCHE/);
  await assert.rejects(speichern(benCode, null), /KEINE_WOCHE/);
  await assert.rejects(speichern(benCode, [5, 5]), /DOPPELTE_WOCHE/);
});

test('Höchstens 3 Wochen am Stück', async () => {
  assert.deepEqual((await speichern(benCode, [10, 11, 12])).wochen, [10, 11, 12]);
  await assert.rejects(speichern(benCode, [10, 11, 12, 13]), /ZU_VIELE_AM_STUECK/);
  assert.deepEqual((await speichern(benCode, [16, 10, 11, 12, 14, 15])).wochen, [10, 11, 12, 14, 15, 16]);
});

test('Mindestanzahl Wochen', async () => {
  await setze('min_wochen = 2');
  try {
    await assert.rejects(speichern(benCode, [5]), /ZU_WENIGE_WOCHEN/);
    assert.deepEqual((await speichern(benCode, [5, 7])).wochen, [5, 7]);
  } finally {
    await setze('min_wochen = 1');
  }
});

test('Tagesgrenze', async () => {
  await setze('max_wochen = 7');
  try {
    // 7 Feiertagswochen à 5 Tage = 35 Tage, höchstens 2 am Stück
    assert.equal((await speichern(benCode, [1, 12, 13, 17, 18, 20, 21])).wochen.length, 7);
    await setze('urlaubstage = 34');
    await assert.rejects(speichern(benCode, [1, 12, 13, 17, 18, 20, 21]), /ZU_VIELE_TAGE/);
  } finally {
    await setze('max_wochen = 6, urlaubstage = 36');
  }
});

test('Falscher Code', async () => {
  await assert.rejects(laden('0'.repeat(32)), /LINK_UNGUELTIG/);
  await assert.rejects(laden(''), /LINK_UNGUELTIG/);
  await assert.rejects(laden(null), /LINK_UNGUELTIG/);
  await assert.rejects(speichern('0'.repeat(32), [5]), /LINK_UNGUELTIG/);
});

test('Nach der Frist: Speichern abgelehnt, Ansehen möglich', async () => {
  await speichern(annaCode, [20, 22]);
  await setze("frist = now() - interval '1 second'");
  try {
    await assert.rejects(speichern(annaCode, [23]), /FRIST_ABGELAUFEN/);
    const r = await laden(annaCode);
    assert.equal(r.offen, false);
    assert.deepEqual(r.wochen, [20, 22]);
  } finally {
    await setze("frist = now() + interval '1 day'");
  }
});

test('Gesperrte Monate aus der Umfrage gelten beim Speichern', async () => {
  await setze("gesperrte_monate = '{8}'");
  try {
    await assert.rejects(speichern(benCode, [32]), /UNGUELTIGE_WOCHE/);
    assert.deepEqual((await speichern(benCode, [48])).wochen, [48]);
  } finally {
    await setze("gesperrte_monate = '{12}'");
  }
});

test('Antwort enthält nur eigene Daten', async () => {
  const r = await laden(benCode);
  const text = JSON.stringify(r);
  assert.equal(r.name, 'Ben');
  assert.ok(!text.includes('Anna'));
  assert.ok(!text.includes(annaCode));
  assert.ok(!('code' in r));
});

test('Browser-Schlüssel hat keinen Zugriff auf Tabellen und interne Funktionen', async () => {
  for (const t of ['app', 'organisatoren', 'einladungen', 'umfragen', 'freie_tage', 'mitarbeiter', 'abgaben']) {
    await assert.rejects(browser(db, `select * from urlaub.${t}`), /permission denied/, t);
  }
  await assert.rejects(browser(db, "insert into urlaub.mitarbeiter (umfrage_id, name) values (1, 'Eve')"), /permission denied/);
  await assert.rejects(browser(db, 'select * from urlaub.kalender(1)'), /permission denied/);
  await assert.rejects(browser(db, "select urlaub.regelverstoss(1, '{1}')"), /permission denied/);
  await assert.rejects(browser(db, 'select urlaub.antwort(1)'), /permission denied/);
});

test('Angemeldete Rolle darf Mitarbeiter-Funktionen nicht nutzen', async () => {
  await assert.rejects(als(db, 'authenticated', null, 'select public.urlaub_laden($1)', [annaCode]), /permission denied/);
});
```

- [ ] **Step 2: Test laufen lassen – muss fehlschlagen**

Run: `npm test`
Expected: FAIL mit `function public.urlaub_laden(unknown) does not exist`.

- [ ] **Step 3: Funktionen einfügen** – in `supabase/schema.sql` die Zeilen

```sql
-- ---------------------------------------------------------------------------
-- (Task 2–4 fügen hier Funktionen ein)
-- ---------------------------------------------------------------------------
```

ersetzen durch:

```sql
-- ---------------------------------------------------------------------------
-- Regeln und Mitarbeiter-Funktionen
-- ---------------------------------------------------------------------------

-- Erster Regelverstoß einer Auswahl als Fehlercode, sonst null.
create or replace function urlaub.regelverstoss(p_umfrage_id bigint, p_wochen int[])
returns text
language plpgsql stable
set search_path = ''
as $$
declare
  v_u       urlaub.umfragen;
  v_erlaubt int[];
  v_wochen  int[];
  v_stueck  int;
  v_tage    int;
begin
  select * into strict v_u from urlaub.umfragen where id = p_umfrage_id;
  if p_wochen is null or cardinality(p_wochen) = 0 then
    return 'KEINE_WOCHE';
  end if;
  select array_agg(k.kw) into v_erlaubt from urlaub.kalender(p_umfrage_id) k where not k.gesperrt;
  if exists (select 1 from unnest(p_wochen) x where x is null or not (x = any (v_erlaubt))) then
    return 'UNGUELTIGE_WOCHE';
  end if;
  select array_agg(distinct x order by x) into v_wochen from unnest(p_wochen) x;
  if cardinality(v_wochen) <> cardinality(p_wochen) then
    return 'DOPPELTE_WOCHE';
  end if;
  if cardinality(v_wochen) < v_u.min_wochen then
    return 'ZU_WENIGE_WOCHEN';
  end if;
  if cardinality(v_wochen) > v_u.max_wochen then
    return 'ZU_VIELE_WOCHEN';
  end if;
  -- längste Folge aufeinanderfolgender KWs
  select max(n) into v_stueck
  from (select count(*) as n
        from (select x - row_number() over (order by x) as gruppe from unnest(v_wochen) x) s
        group by gruppe) t;
  if v_stueck > v_u.max_am_stueck then
    return 'ZU_VIELE_AM_STUECK';
  end if;
  select sum(k.arbeitstage) into v_tage from urlaub.kalender(p_umfrage_id) k where k.kw = any (v_wochen);
  if v_tage > v_u.urlaubstage then
    return 'ZU_VIELE_TAGE';
  end if;
  return null;
end;
$$;

-- Antwort an die Mitarbeiter-Seite: nur Daten dieser Person und ihrer Umfrage.
create or replace function urlaub.antwort(p_mitarbeiter_id bigint)
returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'name',                  m.name,
    'titel',                 u.titel,
    'jahr',                  u.jahr,
    'wochen',                coalesce(to_jsonb(a.wochen), '[]'::jsonb),
    'geaendert_am',          a.geaendert_am,
    'frist',                 u.frist,
    'offen',                 now() < u.frist,
    'min_wochen',            u.min_wochen,
    'max_wochen',            u.max_wochen,
    'max_am_stueck',         u.max_am_stueck,
    'urlaubstage',           u.urlaubstage,
    'arbeitstage_pro_woche', u.arbeitstage_pro_woche,
    'sperr_hinweis',         u.sperr_hinweis,
    'kalender',              urlaub.kalender_json(u.id))
  from urlaub.mitarbeiter m
  join urlaub.umfragen u on u.id = m.umfrage_id
  left join urlaub.abgaben a on a.mitarbeiter_id = m.id
  where m.id = p_mitarbeiter_id
$$;

create or replace function public.urlaub_laden(p_code text)
returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  select id into v_id from urlaub.mitarbeiter where code = p_code;
  if v_id is null then
    raise exception 'LINK_UNGUELTIG';
  end if;
  return urlaub.antwort(v_id);
end;
$$;

create or replace function public.urlaub_speichern(p_code text, p_wochen int[])
returns jsonb
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_m      urlaub.mitarbeiter;
  v_frist  timestamptz;
  v_fehler text;
  v_wochen int[];
begin
  select * into v_m from urlaub.mitarbeiter where code = p_code;
  if not found then
    raise exception 'LINK_UNGUELTIG';
  end if;
  select frist into v_frist from urlaub.umfragen where id = v_m.umfrage_id;
  if now() >= v_frist then
    raise exception 'FRIST_ABGELAUFEN';
  end if;
  v_fehler := urlaub.regelverstoss(v_m.umfrage_id, p_wochen);
  if v_fehler is not null then
    raise exception '%', v_fehler;
  end if;
  select array_agg(x order by x) into v_wochen from unnest(p_wochen) x;
  insert into urlaub.abgaben (mitarbeiter_id, wochen, geaendert_am)
  values (v_m.id, v_wochen, now())
  on conflict (mitarbeiter_id)
  do update set wochen = excluded.wochen, geaendert_am = excluded.geaendert_am;
  return urlaub.antwort(v_m.id);
end;
$$;

revoke all on function public.urlaub_laden(text)            from public, anon, authenticated;
revoke all on function public.urlaub_speichern(text, int[]) from public, anon, authenticated;
grant execute on function public.urlaub_laden(text)            to anon;
grant execute on function public.urlaub_speichern(text, int[]) to anon;

-- ---------------------------------------------------------------------------
-- (Task 3–4 fügen hier weitere Funktionen ein)
-- ---------------------------------------------------------------------------
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npm test`
Expected: PASS (alle Dateien).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Datenbank Stand 2: Regeln inkl. Wochen am Stück, Mitarbeiter-Funktionen

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Organisator-Funktionen und Trennung zwischen Organisatoren

**Files:**
- Modify: `supabase/schema.sql` (an der Markierung „Task 3–4 fügen hier weitere Funktionen ein“)
- Create: `tests/admin.test.mjs`

**Interfaces:**
- Consumes: Task 1/2 (`urlaub.kalender`, `urlaub.kalender_json`, `urlaub.regelverstoss`), Helfer `neueDatenbank`, `als`, `browser`, `organisator`.
- Produces (SQL, intern): `urlaub.ich() → urlaub.organisatoren` (wirft `KEIN_ZUGRIFF`), `urlaub.eigene_umfrage(bigint) → urlaub.umfragen` (wirft `UMFRAGE_NICHT_GEFUNDEN`), `urlaub.eigener_mitarbeiter(bigint) → urlaub.mitarbeiter` (wirft `MITARBEITER_NICHT_GEFUNDEN`).
- Produces (SQL, für `authenticated`):
  - `public.org_ich() → jsonb {anzeigename, benutzername, ist_hauptadmin}`
  - `public.org_umfragen() → jsonb [{id, titel, jahr, bundesland, frist, offen, mitarbeiter, abgegeben}]`
  - `public.org_umfrage_anlegen(p_titel text, p_jahr int, p_bundesland text) → bigint`
  - `public.org_umfrage_loeschen(p_umfrage_id bigint) → void`
  - `public.org_umfrage(p_umfrage_id bigint) → jsonb {einstellungen:{id, titel, jahr, bundesland, arbeitstage_pro_woche, urlaubstage, min_wochen, max_wochen, max_am_stueck, gesperrte_monate, sperr_hinweis, frist, frist_eingabe, offen, grunddaten_aenderbar}, freie_tage:[{datum, name}], mitarbeiter:[{id, name, link, wochen, urlaubstage, geaendert_am, regelverstoss}], kalender:[…wie kalender_json]}`
  - `public.org_umfrage_speichern(p_umfrage_id bigint, p_daten jsonb) → void` (Schlüssel optional: `titel, jahr, bundesland, arbeitstage_pro_woche, urlaubstage, min_wochen, max_wochen, max_am_stueck, gesperrte_monate, sperr_hinweis, frist` – `frist` als `YYYY-MM-DDTHH:MI` deutscher Zeit)
  - `public.org_freien_tag_hinzufuegen(p_umfrage_id bigint, p_datum date, p_name text) → void`
  - `public.org_freien_tag_entfernen(p_umfrage_id bigint, p_datum date) → void`
  - `public.org_mitarbeiter_anlegen(p_umfrage_id bigint, p_name text) → void`
  - `public.org_mitarbeiter_loeschen(p_mitarbeiter_id bigint) → void`
  - `public.org_link_erneuern(p_mitarbeiter_id bigint) → void`

- [ ] **Step 1: Tests schreiben** – `tests/admin.test.mjs`:

```js
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { neueDatenbank, als, browser, organisator } from './helfer.mjs';

let db;
let chef;
let eva;

before(async () => {
  db = await neueDatenbank();
  chef = await organisator(db, 'chef', { hauptadmin: true });
  eva = await organisator(db, 'eva');
});

const alsChef = async (sql, params) => (await als(db, 'authenticated', chef, sql, params))[0];
const alsEva = async (sql, params) => (await als(db, 'authenticated', eva, sql, params))[0];
const umfrageVon = async (wer, id) => (await als(db, 'authenticated', wer,
  'select public.org_umfrage($1) as r', [id]))[0].r;

async function neueUmfrage(wer, titel = 'Team A', jahr = 2027, land = 'BY') {
  return (await als(db, 'authenticated', wer, 'select public.org_umfrage_anlegen($1, $2, $3) as id',
    [titel, jahr, land]))[0].id;
}

test('org_ich liefert eigenes Profil', async () => {
  const r = (await alsChef('select public.org_ich() as r')).r;
  assert.deepEqual(r, { anzeigename: 'chef', benutzername: 'chef', ist_hauptadmin: true });
});

test('Umfrage anlegen mit Vorgaben', async () => {
  const id = await neueUmfrage(chef, '  Team A  ');
  const u = await umfrageVon(chef, id);
  const e = u.einstellungen;
  assert.equal(e.titel, 'Team A');
  assert.equal(e.jahr, 2027);
  assert.equal(e.bundesland, 'BY');
  assert.equal(e.arbeitstage_pro_woche, 6);
  assert.equal(e.urlaubstage, 36);
  assert.equal(e.min_wochen, 1);
  assert.equal(e.max_wochen, 6);
  assert.equal(e.max_am_stueck, 3);
  assert.deepEqual(e.gesperrte_monate, [12]);
  assert.equal(e.frist_eingabe, '2026-11-30T23:59');
  assert.equal(e.grunddaten_aenderbar, true);
  assert.equal(u.kalender.length, 52);
  assert.deepEqual(u.mitarbeiter, []);
  const liste = (await alsChef('select public.org_umfragen() as r')).r;
  assert.ok(liste.some((x) => x.id === Number(id) && x.mitarbeiter === 0 && x.abgegeben === 0));
});

test('Ungültige Angaben beim Anlegen', async () => {
  await assert.rejects(neueUmfrage(chef, '   '), /TITEL_LEER/);
  await assert.rejects(neueUmfrage(chef, 'X', 2027, 'XX'), /UNGUELTIGE_EINSTELLUNG/);
  await assert.rejects(neueUmfrage(chef, 'X', 1999), /UNGUELTIGE_EINSTELLUNG/);
  await assert.rejects(neueUmfrage(chef, 'X', null), /UNGUELTIGE_EINSTELLUNG/);
});

test('Mitarbeiter anlegen: Name je Umfrage eindeutig (Groß/klein egal)', async () => {
  const a = await neueUmfrage(chef, 'A');
  const b = await neueUmfrage(chef, 'B');
  await alsChef('select public.org_mitarbeiter_anlegen($1, $2)', [a, 'Anna']);
  await assert.rejects(alsChef('select public.org_mitarbeiter_anlegen($1, $2)', [a, ' anna ']), /NAME_DOPPELT/);
  await assert.rejects(alsChef('select public.org_mitarbeiter_anlegen($1, $2)', [a, '  ']), /NAME_LEER/);
  await alsChef('select public.org_mitarbeiter_anlegen($1, $2)', [b, 'Anna']);
  const u = await umfrageVon(chef, a);
  assert.equal(u.mitarbeiter.length, 1);
  assert.match(u.mitarbeiter[0].link, /^https:\/\/urlaub2027\.github\.io\/urlaub\/#[0-9a-f]{32}$/);
  assert.equal(u.mitarbeiter[0].regelverstoss, null);
});

test('Einstellungen speichern', async () => {
  const id = await neueUmfrage(chef);
  await alsChef('select public.org_umfrage_speichern($1, $2)', [id, {
    titel: 'Neu', max_am_stueck: 2, gesperrte_monate: [12, 7], sperr_hinweis: 'Sommer und Dezember gesperrt',
    frist: '2026-12-15T18:00', urlaubstage: 30, min_wochen: 2, max_wochen: 5,
  }]);
  const e = (await umfrageVon(chef, id)).einstellungen;
  assert.equal(e.titel, 'Neu');
  assert.equal(e.max_am_stueck, 2);
  assert.deepEqual(e.gesperrte_monate, [7, 12]);
  assert.equal(e.sperr_hinweis, 'Sommer und Dezember gesperrt');
  assert.equal(e.frist_eingabe, '2026-12-15T18:00');
  assert.equal(e.urlaubstage, 30);
  assert.equal(e.min_wochen, 2);
  assert.equal(e.max_wochen, 5);
  // Frist unverändert übergeben: Sekunden bleiben erhalten
  await db.query("update urlaub.umfragen set frist = '2026-11-30 23:59:59 Europe/Berlin' where id = $1", [id]);
  await alsChef('select public.org_umfrage_speichern($1, $2)', [id, { titel: 'Neu2', frist: '2026-11-30T23:59' }]);
  const s = (await db.query("select to_char(frist at time zone 'Europe/Berlin', 'HH24:MI:SS') as t from urlaub.umfragen where id = $1", [id])).rows[0].t;
  assert.equal(s, '23:59:59');
});

test('Ungültige Einstellungen werden abgelehnt', async () => {
  const id = await neueUmfrage(chef);
  const speichern = (daten) => alsChef('select public.org_umfrage_speichern($1, $2)', [id, daten]);
  await assert.rejects(speichern({ min_wochen: 4, max_wochen: 3 }), /UNGUELTIGE_EINSTELLUNG/);
  await assert.rejects(speichern({ gesperrte_monate: [13] }), /UNGUELTIGE_EINSTELLUNG/);
  await assert.rejects(speichern({ gesperrte_monate: 'Dezember' }), /UNGUELTIGE_EINSTELLUNG/);
  await assert.rejects(speichern({ urlaubstage: 'viel' }), /UNGUELTIGE_EINSTELLUNG/);
  await assert.rejects(speichern({ titel: '' }), /UNGUELTIGE_EINSTELLUNG/);
  await assert.rejects(speichern({ frist: '' }), /FRIST_LEER/);
  await assert.rejects(speichern({ frist: 'morgen' }), /UNGUELTIGE_EINSTELLUNG/);
});

test('Grunddaten nur ohne Abgaben änderbar; Regelverstoß wird markiert', async () => {
  const id = await neueUmfrage(chef);
  await alsChef('select public.org_umfrage_speichern($1, $2)', [id, { jahr: 2028, bundesland: 'NW', arbeitstage_pro_woche: 5 }]);
  let e = (await umfrageVon(chef, id)).einstellungen;
  assert.deepEqual([e.jahr, e.bundesland, e.arbeitstage_pro_woche], [2028, 'NW', 5]);
  await alsChef('select public.org_umfrage_speichern($1, $2)', [id, { jahr: 2027, bundesland: 'BY', arbeitstage_pro_woche: 6 }]);
  await alsChef('select public.org_mitarbeiter_anlegen($1, $2)', [id, 'Paul']);
  const code = (await db.query("select code from urlaub.mitarbeiter where umfrage_id = $1 and name = 'Paul'", [id])).rows[0].code;
  await browser(db, 'select public.urlaub_speichern($1, $2::int[])', [code, [10, 11, 12]]);
  e = (await umfrageVon(chef, id)).einstellungen;
  assert.equal(e.grunddaten_aenderbar, false);
  await assert.rejects(alsChef('select public.org_umfrage_speichern($1, $2)', [id, { jahr: 2028 }]), /GRUNDDATEN_GESPERRT/);
  await alsChef('select public.org_umfrage_speichern($1, $2)', [id, { jahr: 2027, bundesland: 'BY' }]); // unverändert: erlaubt
  await alsChef('select public.org_umfrage_speichern($1, $2)', [id, { max_am_stueck: 2 }]);
  const p = (await umfrageVon(chef, id)).mitarbeiter[0];
  assert.deepEqual(p.wochen, [10, 11, 12]);
  assert.equal(p.urlaubstage, 17);
  assert.equal(p.regelverstoss, 'ZU_VIELE_AM_STUECK');
});

test('Freie Tage hinzufügen und entfernen', async () => {
  const id = await neueUmfrage(chef);
  await alsChef('select public.org_freien_tag_hinzufuegen($1, $2, $3)', [id, '2027-08-08', 'Augsburger Friedensfest']);
  await alsChef('select public.org_freien_tag_hinzufuegen($1, $2, $3)', [id, '2027-08-09', 'Betriebsruhe']);
  let u = await umfrageVon(chef, id);
  assert.deepEqual(u.freie_tage, [{ datum: '2027-08-08', name: 'Augsburger Friedensfest' }, { datum: '2027-08-09', name: 'Betriebsruhe' }]);
  assert.equal(u.kalender[31].arbeitstage, 5);
  await alsChef('select public.org_freien_tag_entfernen($1, $2)', [id, '2027-08-09']);
  u = await umfrageVon(chef, id);
  assert.equal(u.freie_tage.length, 1);
  assert.equal(u.kalender[31].arbeitstage, 6);
  await assert.rejects(alsChef('select public.org_freien_tag_hinzufuegen($1, $2, $3)', [id, '2028-01-02', 'x']), /DATUM_FALSCHES_JAHR/);
  await assert.rejects(alsChef('select public.org_freien_tag_hinzufuegen($1, $2, $3)', [id, '2027-03-03', ' ']), /NAME_LEER/);
});

test('Link erneuern und Mitarbeiter löschen', async () => {
  const id = await neueUmfrage(chef);
  await alsChef('select public.org_mitarbeiter_anlegen($1, $2)', [id, 'Lisa']);
  const vorher = (await db.query('select id, code from urlaub.mitarbeiter where umfrage_id = $1', [id])).rows[0];
  await alsChef('select public.org_link_erneuern($1)', [vorher.id]);
  const nachher = (await db.query('select code from urlaub.mitarbeiter where id = $1', [vorher.id])).rows[0].code;
  assert.notEqual(nachher, vorher.code);
  await assert.rejects(browser(db, 'select public.urlaub_laden($1)', [vorher.code]), /LINK_UNGUELTIG/);
  await alsChef('select public.org_mitarbeiter_loeschen($1)', [vorher.id]);
  assert.deepEqual((await umfrageVon(chef, id)).mitarbeiter, []);
});

test('Trennung: Eva sieht und ändert nichts von Chef', async () => {
  const id = await neueUmfrage(chef, 'Geheim');
  await alsChef('select public.org_mitarbeiter_anlegen($1, $2)', [id, 'Max']);
  const m = (await db.query('select id from urlaub.mitarbeiter where umfrage_id = $1', [id])).rows[0].id;
  const verboten = [
    ['select public.org_umfrage($1)', [id], /UMFRAGE_NICHT_GEFUNDEN/],
    ['select public.org_umfrage_speichern($1, $2)', [id, { titel: 'gehackt' }], /UMFRAGE_NICHT_GEFUNDEN/],
    ['select public.org_umfrage_loeschen($1)', [id], /UMFRAGE_NICHT_GEFUNDEN/],
    ['select public.org_mitarbeiter_anlegen($1, $2)', [id, 'Eve'], /UMFRAGE_NICHT_GEFUNDEN/],
    ['select public.org_freien_tag_hinzufuegen($1, $2, $3)', [id, '2027-05-05', 'x'], /UMFRAGE_NICHT_GEFUNDEN/],
    ['select public.org_freien_tag_entfernen($1, $2)', [id, '2027-05-05'], /UMFRAGE_NICHT_GEFUNDEN/],
    ['select public.org_mitarbeiter_loeschen($1)', [m], /MITARBEITER_NICHT_GEFUNDEN/],
    ['select public.org_link_erneuern($1)', [m], /MITARBEITER_NICHT_GEFUNDEN/],
    ['select public.org_umfrage($1)', [999999], /UMFRAGE_NICHT_GEFUNDEN/],
  ];
  for (const [sql, params, fehler] of verboten) {
    await assert.rejects(alsEva(sql, params), fehler, sql);
  }
  const evasListe = (await alsEva('select public.org_umfragen() as r')).r;
  assert.ok(!evasListe.some((x) => x.id === Number(id)));
  const u = await umfrageVon(chef, id);
  assert.equal(u.einstellungen.titel, 'Geheim');
  assert.equal(u.mitarbeiter.length, 1);
});

test('Umfrage löschen entfernt Mitarbeiter und Abgaben', async () => {
  const id = await neueUmfrage(eva, 'Weg');
  await alsEva('select public.org_mitarbeiter_anlegen($1, $2)', [id, 'Tom']);
  const code = (await db.query('select code from urlaub.mitarbeiter where umfrage_id = $1', [id])).rows[0].code;
  await browser(db, 'select public.urlaub_speichern($1, $2::int[])', [code, [5]]);
  await alsEva('select public.org_umfrage_loeschen($1)', [id]);
  await assert.rejects(browser(db, 'select public.urlaub_laden($1)', [code]), /LINK_UNGUELTIG/);
  const n = (await db.query('select count(*)::int as n from urlaub.mitarbeiter where umfrage_id = $1', [id])).rows[0].n;
  assert.equal(n, 0);
});

test('Gesperrte, unbekannte und nicht angemeldete Nutzer', async () => {
  const gesperrt = await organisator(db, 'gesperrt', { gesperrt: true });
  await assert.rejects(als(db, 'authenticated', gesperrt, 'select public.org_umfragen()'), /KEIN_ZUGRIFF/);
  await assert.rejects(als(db, 'authenticated', '33333333-3333-3333-3333-333333333333', 'select public.org_ich()'), /KEIN_ZUGRIFF/);
  await assert.rejects(als(db, 'authenticated', null, 'select public.org_ich()'), /KEIN_ZUGRIFF/);
  for (const sql of ['select public.org_ich()', 'select public.org_umfragen()',
                     "select public.org_umfrage_anlegen('x', 2027, 'BY')", 'select public.org_umfrage(1)']) {
    await assert.rejects(browser(db, sql), /permission denied/, sql);
  }
});

test('Organisator kann Tabellen nicht direkt lesen', async () => {
  for (const t of ['umfragen', 'mitarbeiter', 'organisatoren', 'einladungen']) {
    await assert.rejects(als(db, 'authenticated', chef, `select * from urlaub.${t}`), /permission denied/, t);
  }
});
```

- [ ] **Step 2: Test laufen lassen – muss fehlschlagen**

Run: `npm test`
Expected: FAIL mit `function public.org_ich() does not exist`.

- [ ] **Step 3: Funktionen einfügen** – in `supabase/schema.sql` die Zeilen

```sql
-- ---------------------------------------------------------------------------
-- (Task 3–4 fügen hier weitere Funktionen ein)
-- ---------------------------------------------------------------------------
```

ersetzen durch:

```sql
-- ---------------------------------------------------------------------------
-- Organisatoren: Hilfsfunktionen (intern)
-- ---------------------------------------------------------------------------

create or replace function urlaub.ich()
returns urlaub.organisatoren
language plpgsql stable
set search_path = ''
as $$
declare
  v_o urlaub.organisatoren;
begin
  select * into v_o from urlaub.organisatoren where user_id = auth.uid() and not gesperrt;
  if not found then
    raise exception 'KEIN_ZUGRIFF';
  end if;
  return v_o;
end;
$$;

-- Fremde und nicht vorhandene Umfragen sind bewusst nicht unterscheidbar.
create or replace function urlaub.eigene_umfrage(p_umfrage_id bigint)
returns urlaub.umfragen
language plpgsql stable
set search_path = ''
as $$
declare
  v_uid uuid := (urlaub.ich()).user_id;
  v_u   urlaub.umfragen;
begin
  select * into v_u from urlaub.umfragen where id = p_umfrage_id and organisator_id = v_uid;
  if not found then
    raise exception 'UMFRAGE_NICHT_GEFUNDEN';
  end if;
  return v_u;
end;
$$;

create or replace function urlaub.eigener_mitarbeiter(p_mitarbeiter_id bigint)
returns urlaub.mitarbeiter
language plpgsql stable
set search_path = ''
as $$
declare
  v_uid uuid := (urlaub.ich()).user_id;
  v_m   urlaub.mitarbeiter;
begin
  select m.* into v_m
  from urlaub.mitarbeiter m join urlaub.umfragen u on u.id = m.umfrage_id
  where m.id = p_mitarbeiter_id and u.organisator_id = v_uid;
  if not found then
    raise exception 'MITARBEITER_NICHT_GEFUNDEN';
  end if;
  return v_m;
end;
$$;

-- ---------------------------------------------------------------------------
-- Organisatoren: Funktionen für die Verwaltung
-- ---------------------------------------------------------------------------

create or replace function public.org_ich()
returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  v_o urlaub.organisatoren := urlaub.ich();
begin
  return jsonb_build_object('anzeigename', v_o.anzeigename, 'benutzername', v_o.benutzername,
                            'ist_hauptadmin', v_o.ist_hauptadmin);
end;
$$;

create or replace function public.org_umfragen()
returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (urlaub.ich()).user_id;
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id',          u.id,
             'titel',       u.titel,
             'jahr',        u.jahr,
             'bundesland',  u.bundesland,
             'frist',       u.frist,
             'offen',       now() < u.frist,
             'mitarbeiter', (select count(*) from urlaub.mitarbeiter m where m.umfrage_id = u.id),
             'abgegeben',   (select count(*) from urlaub.mitarbeiter m
                               join urlaub.abgaben a on a.mitarbeiter_id = m.id where m.umfrage_id = u.id))
           order by u.jahr desc, u.titel)
    from urlaub.umfragen u where u.organisator_id = v_uid), '[]'::jsonb);
end;
$$;

-- Vorgabe-Frist: 30.11. des Vorjahres, 23:59:59 deutscher Zeit.
create or replace function public.org_umfrage_anlegen(p_titel text, p_jahr int, p_bundesland text)
returns bigint
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (urlaub.ich()).user_id;
  v_id  bigint;
begin
  if p_titel is null or btrim(p_titel) = '' then
    raise exception 'TITEL_LEER';
  end if;
  begin
    insert into urlaub.umfragen (organisator_id, titel, jahr, bundesland, frist)
    values (v_uid, btrim(p_titel), p_jahr, p_bundesland,
            make_timestamp(p_jahr - 1, 11, 30, 23, 59, 59) at time zone 'Europe/Berlin')
    returning id into v_id;
  exception when check_violation or not_null_violation or data_exception then
    raise exception 'UNGUELTIGE_EINSTELLUNG';
  end;
  return v_id;
end;
$$;

create or replace function public.org_umfrage_loeschen(p_umfrage_id bigint)
returns void
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_u urlaub.umfragen := urlaub.eigene_umfrage(p_umfrage_id);
begin
  delete from urlaub.umfragen where id = v_u.id;
end;
$$;

create or replace function public.org_umfrage(p_umfrage_id bigint)
returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  v_u     urlaub.umfragen := urlaub.eigene_umfrage(p_umfrage_id);
  v_basis text := (select link_basis from urlaub.app);
begin
  return jsonb_build_object(
    'einstellungen', jsonb_build_object(
      'id',                    v_u.id,
      'titel',                 v_u.titel,
      'jahr',                  v_u.jahr,
      'bundesland',            v_u.bundesland,
      'arbeitstage_pro_woche', v_u.arbeitstage_pro_woche,
      'urlaubstage',           v_u.urlaubstage,
      'min_wochen',            v_u.min_wochen,
      'max_wochen',            v_u.max_wochen,
      'max_am_stueck',         v_u.max_am_stueck,
      'gesperrte_monate',      to_jsonb(v_u.gesperrte_monate),
      'sperr_hinweis',         v_u.sperr_hinweis,
      'frist',                 v_u.frist,
      'frist_eingabe',         to_char(v_u.frist at time zone 'Europe/Berlin', 'YYYY-MM-DD"T"HH24:MI'),
      'offen',                 now() < v_u.frist,
      'grunddaten_aenderbar',  not exists (select 1 from urlaub.mitarbeiter m
                                            join urlaub.abgaben a on a.mitarbeiter_id = m.id
                                            where m.umfrage_id = v_u.id)),
    'freie_tage', coalesce((
      select jsonb_agg(jsonb_build_object('datum', f.datum, 'name', f.name) order by f.datum)
      from urlaub.freie_tage f where f.umfrage_id = v_u.id), '[]'::jsonb),
    'mitarbeiter', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',            m.id,
               'name',          m.name,
               'link',          v_basis || '#' || m.code,
               'wochen',        coalesce(to_jsonb(a.wochen), '[]'::jsonb),
               'urlaubstage',   (select coalesce(sum(k.arbeitstage), 0)::int
                                   from urlaub.kalender(v_u.id) k where k.kw = any (a.wochen)),
               'geaendert_am',  a.geaendert_am,
               'regelverstoss', case when a.wochen is null then null
                                     else urlaub.regelverstoss(v_u.id, a.wochen) end)
             order by m.name)
      from urlaub.mitarbeiter m
      left join urlaub.abgaben a on a.mitarbeiter_id = m.id
      where m.umfrage_id = v_u.id), '[]'::jsonb),
    'kalender', urlaub.kalender_json(v_u.id));
end;
$$;

-- Die Besitzprüfung (declare-Block) liegt bewusst außerhalb des inneren
-- exception-Blocks, damit UMFRAGE_NICHT_GEFUNDEN nicht umgewandelt wird.
create or replace function public.org_umfrage_speichern(p_umfrage_id bigint, p_daten jsonb)
returns void
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_u      urlaub.umfragen := urlaub.eigene_umfrage(p_umfrage_id);
  v_frist  text := btrim(p_daten ->> 'frist');
  v_monate int[];
begin
  if exists (select 1 from urlaub.mitarbeiter m join urlaub.abgaben a on a.mitarbeiter_id = m.id
             where m.umfrage_id = v_u.id)
     and (   (p_daten ? 'jahr'       and (p_daten ->> 'jahr') is distinct from v_u.jahr::text)
          or (p_daten ? 'bundesland' and (p_daten ->> 'bundesland') is distinct from v_u.bundesland)
          or (p_daten ? 'arbeitstage_pro_woche'
              and (p_daten ->> 'arbeitstage_pro_woche') is distinct from v_u.arbeitstage_pro_woche::text)) then
    raise exception 'GRUNDDATEN_GESPERRT';
  end if;
  if p_daten ? 'frist' and (v_frist is null or v_frist = '') then
    raise exception 'FRIST_LEER';
  end if;
  begin
    if p_daten ? 'gesperrte_monate' then
      select coalesce(array_agg(x::int order by x::int), '{}')
      into v_monate from jsonb_array_elements_text(p_daten -> 'gesperrte_monate') x;
    end if;
    update urlaub.umfragen set
      titel                 = coalesce(btrim(p_daten ->> 'titel'), titel),
      jahr                  = coalesce((p_daten ->> 'jahr')::int, jahr),
      bundesland            = coalesce(p_daten ->> 'bundesland', bundesland),
      arbeitstage_pro_woche = coalesce((p_daten ->> 'arbeitstage_pro_woche')::int, arbeitstage_pro_woche),
      urlaubstage           = coalesce((p_daten ->> 'urlaubstage')::int, urlaubstage),
      min_wochen            = coalesce((p_daten ->> 'min_wochen')::int, min_wochen),
      max_wochen            = coalesce((p_daten ->> 'max_wochen')::int, max_wochen),
      max_am_stueck         = coalesce((p_daten ->> 'max_am_stueck')::int, max_am_stueck),
      gesperrte_monate      = coalesce(v_monate, gesperrte_monate),
      sperr_hinweis         = coalesce(btrim(p_daten ->> 'sperr_hinweis'), sperr_hinweis),
      frist = case
                when v_frist is null
                  or to_char(frist at time zone 'Europe/Berlin', 'YYYY-MM-DD"T"HH24:MI') = v_frist
                then frist
                else v_frist::timestamp at time zone 'Europe/Berlin'
              end
    where id = v_u.id;
  exception when check_violation or not_null_violation or data_exception then
    raise exception 'UNGUELTIGE_EINSTELLUNG';
  end;
end;
$$;

create or replace function public.org_freien_tag_hinzufuegen(p_umfrage_id bigint, p_datum date, p_name text)
returns void
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_u urlaub.umfragen := urlaub.eigene_umfrage(p_umfrage_id);
begin
  if p_datum is null or extract(year from p_datum) <> v_u.jahr then
    raise exception 'DATUM_FALSCHES_JAHR';
  end if;
  if p_name is null or btrim(p_name) = '' then
    raise exception 'NAME_LEER';
  end if;
  insert into urlaub.freie_tage (umfrage_id, datum, name) values (v_u.id, p_datum, btrim(p_name))
  on conflict (umfrage_id, datum) do update set name = excluded.name;
end;
$$;

create or replace function public.org_freien_tag_entfernen(p_umfrage_id bigint, p_datum date)
returns void
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_u urlaub.umfragen := urlaub.eigene_umfrage(p_umfrage_id);
begin
  delete from urlaub.freie_tage where umfrage_id = v_u.id and datum = p_datum;
end;
$$;

create or replace function public.org_mitarbeiter_anlegen(p_umfrage_id bigint, p_name text)
returns void
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_u urlaub.umfragen := urlaub.eigene_umfrage(p_umfrage_id);
begin
  if p_name is null or btrim(p_name) = '' then
    raise exception 'NAME_LEER';
  end if;
  if exists (select 1 from urlaub.mitarbeiter
             where umfrage_id = v_u.id and lower(name) = lower(btrim(p_name))) then
    raise exception 'NAME_DOPPELT';
  end if;
  insert into urlaub.mitarbeiter (umfrage_id, name) values (v_u.id, btrim(p_name));
end;
$$;

create or replace function public.org_mitarbeiter_loeschen(p_mitarbeiter_id bigint)
returns void
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_m urlaub.mitarbeiter := urlaub.eigener_mitarbeiter(p_mitarbeiter_id);
begin
  delete from urlaub.mitarbeiter where id = v_m.id;  -- Abgabe wird mitgelöscht
end;
$$;

-- Neuer Code: der alte Link funktioniert sofort nicht mehr, die Abgabe bleibt.
create or replace function public.org_link_erneuern(p_mitarbeiter_id bigint)
returns void
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_m urlaub.mitarbeiter := urlaub.eigener_mitarbeiter(p_mitarbeiter_id);
begin
  update urlaub.mitarbeiter set code = replace(gen_random_uuid()::text, '-', '') where id = v_m.id;
end;
$$;

revoke all on function public.org_ich()                                        from public, anon, authenticated;
revoke all on function public.org_umfragen()                                   from public, anon, authenticated;
revoke all on function public.org_umfrage_anlegen(text, int, text)             from public, anon, authenticated;
revoke all on function public.org_umfrage_loeschen(bigint)                     from public, anon, authenticated;
revoke all on function public.org_umfrage(bigint)                              from public, anon, authenticated;
revoke all on function public.org_umfrage_speichern(bigint, jsonb)             from public, anon, authenticated;
revoke all on function public.org_freien_tag_hinzufuegen(bigint, date, text)   from public, anon, authenticated;
revoke all on function public.org_freien_tag_entfernen(bigint, date)           from public, anon, authenticated;
revoke all on function public.org_mitarbeiter_anlegen(bigint, text)            from public, anon, authenticated;
revoke all on function public.org_mitarbeiter_loeschen(bigint)                 from public, anon, authenticated;
revoke all on function public.org_link_erneuern(bigint)                        from public, anon, authenticated;
grant execute on function public.org_ich()                                      to authenticated;
grant execute on function public.org_umfragen()                                 to authenticated;
grant execute on function public.org_umfrage_anlegen(text, int, text)           to authenticated;
grant execute on function public.org_umfrage_loeschen(bigint)                   to authenticated;
grant execute on function public.org_umfrage(bigint)                            to authenticated;
grant execute on function public.org_umfrage_speichern(bigint, jsonb)           to authenticated;
grant execute on function public.org_freien_tag_hinzufuegen(bigint, date, text) to authenticated;
grant execute on function public.org_freien_tag_entfernen(bigint, date)         to authenticated;
grant execute on function public.org_mitarbeiter_anlegen(bigint, text)          to authenticated;
grant execute on function public.org_mitarbeiter_loeschen(bigint)               to authenticated;
grant execute on function public.org_link_erneuern(bigint)                      to authenticated;

-- ---------------------------------------------------------------------------
-- (Task 4 fügt hier Einladungen und Hauptadmin-Funktionen ein)
-- ---------------------------------------------------------------------------
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Datenbank Stand 2: Organisator-Funktionen mit Besitzprüfung

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Einladungen, Registrierung und Hauptadmin

**Files:**
- Modify: `supabase/schema.sql` (an der Markierung „Task 4 fügt hier …“)
- Create: `tests/einladung.test.mjs`

**Interfaces:**
- Consumes: Task 3 (`urlaub.ich()`), Helfer `registriere`, `als`, `browser`, `neueDatenbank`.
- Produces (SQL):
  - Trigger `urlaub_neuer_benutzer` auf `auth.users` (after insert) → `urlaub.neuer_benutzer()`; erwartet in `raw_user_meta_data` die Schlüssel `einladung` und `anzeigename`; Benutzername = Teil der E-Mail vor `@`.
  - `urlaub.einladung_gueltig(text) → urlaub.einladungen` (Zeile oder lauter `null`)
  - `urlaub.start_einladung() → text` (Link; nur per SQL-Editor, für eine Neuinstallation)
  - `urlaub.hauptadmin() → urlaub.organisatoren` (wirft `KEIN_ZUGRIFF`)
  - `public.einladung_pruefen(p_code text) → jsonb {gueltig boolean, eingeladen_von text|null}` (anon + authenticated)
  - `public.org_einladung_erstellen() → jsonb {code, link, gueltig_bis}` (authenticated)
  - `public.haupt_organisatoren() → jsonb [{user_id, anzeigename, benutzername, ist_hauptadmin, gesperrt, eingeladen_von, angelegt_am, anzahl_umfragen, ich}]`
  - `public.haupt_sperren(p_user_id uuid, p_gesperrt boolean) → void`

- [ ] **Step 1: Tests schreiben** – `tests/einladung.test.mjs`:

```js
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { neueDatenbank, als, browser, registriere } from './helfer.mjs';

let db;
let chef;

const codeAus = (link) => link.split('einladung=')[1];
const einladungVon = async (wer) => (await als(db, 'authenticated', wer,
  'select public.org_einladung_erstellen() as r'))[0].r;
const pruefen = async (code) => (await browser(db, 'select public.einladung_pruefen($1) as r', [code]))[0].r;
const anzahlKonten = async () => (await db.query('select count(*)::int as n from auth.users')).rows[0].n;

before(async () => {
  db = await neueDatenbank();
  const link = (await db.query('select urlaub.start_einladung() as l')).rows[0].l;
  assert.match(link, /^https:\/\/urlaub2027\.github\.io\/urlaub\/admin\.html#einladung=[0-9a-f]{32}$/);
  chef = await registriere(db, 'chef', codeAus(link), 'Chef');
});

test('Start-Einladung macht zum Hauptadmin', async () => {
  const o = (await db.query('select * from urlaub.organisatoren where user_id = $1', [chef])).rows[0];
  assert.equal(o.benutzername, 'chef');
  assert.equal(o.anzeigename, 'Chef');
  assert.equal(o.ist_hauptadmin, true);
  assert.equal(o.eingeladen_von, null);
});

test('Einladung erstellen, prüfen und einlösen', async () => {
  const e = await einladungVon(chef);
  assert.match(e.code, /^[0-9a-f]{32}$/);
  assert.equal(e.link, `https://urlaub2027.github.io/urlaub/admin.html#einladung=${e.code}`);
  assert.deepEqual(await pruefen(e.code), { gueltig: true, eingeladen_von: 'Chef' });
  const eva = await registriere(db, 'eva', e.code, '  Eva  ');
  const o = (await db.query('select * from urlaub.organisatoren where user_id = $1', [eva])).rows[0];
  assert.equal(o.anzeigename, 'Eva');
  assert.equal(o.ist_hauptadmin, false);
  assert.equal(o.eingeladen_von, chef);
  assert.deepEqual(await pruefen(e.code), { gueltig: false, eingeladen_von: null });
  const vorher = await anzahlKonten();
  await assert.rejects(registriere(db, 'eva2', e.code), /EINLADUNG_UNGUELTIG/);
  assert.equal(await anzahlKonten(), vorher);
  // Eingeladene dürfen selbst einladen
  const e2 = await einladungVon(eva);
  assert.deepEqual(await pruefen(e2.code), { gueltig: true, eingeladen_von: 'Eva' });
});

test('Registrierung ohne gültige Einladung wird abgelehnt', async () => {
  const vorher = await anzahlKonten();
  await assert.rejects(registriere(db, 'x1', undefined), /EINLADUNG_FEHLT/);
  await assert.rejects(registriere(db, 'x2', '0'.repeat(32)), /EINLADUNG_UNGUELTIG/);
  const abgelaufen = await einladungVon(chef);
  await db.query("update urlaub.einladungen set gueltig_bis = now() - interval '1 second' where code = $1", [abgelaufen.code]);
  await assert.rejects(registriere(db, 'x3', abgelaufen.code), /EINLADUNG_UNGUELTIG/);
  assert.equal((await pruefen(abgelaufen.code)).gueltig, false);
  const ohneName = await einladungVon(chef);
  await assert.rejects(registriere(db, 'x4', ohneName.code, '   '), /NAME_LEER/);
  assert.equal(await anzahlKonten(), vorher);
  assert.equal((await pruefen(ohneName.code)).gueltig, true); // nicht verbraucht
});

test('Einladung eines gesperrten Organisators ist ungültig', async () => {
  const e = await einladungVon(chef);
  const tim = await registriere(db, 'tim', e.code, 'Tim');
  const vonTim = await einladungVon(tim);
  await db.query('update urlaub.organisatoren set gesperrt = true where user_id = $1', [tim]);
  assert.equal((await pruefen(vonTim.code)).gueltig, false);
  await assert.rejects(registriere(db, 'tims-freund', vonTim.code), /EINLADUNG_UNGUELTIG/);
  await db.query('update urlaub.organisatoren set gesperrt = false where user_id = $1', [tim]);
});

test('Hauptadmin sieht Organisatoren und kann sperren', async () => {
  const e = await einladungVon(chef);
  const lena = await registriere(db, 'lena', e.code, 'Lena');
  await als(db, 'authenticated', lena, "select public.org_umfrage_anlegen('Lenas Team', 2027, 'HE')");
  const liste = (await als(db, 'authenticated', chef, 'select public.haupt_organisatoren() as r'))[0].r;
  const l = liste.find((o) => o.benutzername === 'lena');
  assert.equal(l.anzeigename, 'Lena');
  assert.equal(l.eingeladen_von, 'Chef');
  assert.equal(l.anzahl_umfragen, 1);
  assert.equal(l.gesperrt, false);
  assert.equal(l.ich, false);
  assert.equal(liste.find((o) => o.benutzername === 'chef').ich, true);
  assert.ok(!JSON.stringify(liste).includes('Lenas Team')); // keine Umfrage-Inhalte

  await als(db, 'authenticated', chef, 'select public.haupt_sperren($1, true)', [lena]);
  await assert.rejects(als(db, 'authenticated', lena, 'select public.org_ich()'), /KEIN_ZUGRIFF/);
  await als(db, 'authenticated', chef, 'select public.haupt_sperren($1, false)', [lena]);
  assert.equal((await als(db, 'authenticated', lena, 'select public.org_ich() as r'))[0].r.benutzername, 'lena');

  await assert.rejects(als(db, 'authenticated', chef, 'select public.haupt_sperren($1, true)', [chef]), /NICHT_SELBST/);
  await assert.rejects(als(db, 'authenticated', chef, 'select public.haupt_sperren($1, true)',
    ['44444444-4444-4444-4444-444444444444']), /NICHT_GEFUNDEN/);
  await assert.rejects(als(db, 'authenticated', lena, 'select public.haupt_organisatoren()'), /KEIN_ZUGRIFF/);
  await assert.rejects(als(db, 'authenticated', lena, 'select public.haupt_sperren($1, true)', [chef]), /KEIN_ZUGRIFF/);
});

test('Rechte: wer darf was aufrufen', async () => {
  assert.deepEqual(await pruefen(null), { gueltig: false, eingeladen_von: null });
  for (const sql of ['select public.org_einladung_erstellen()', 'select public.haupt_organisatoren()',
                     "select public.haupt_sperren('44444444-4444-4444-4444-444444444444', true)"]) {
    await assert.rejects(browser(db, sql), /permission denied/, sql);
  }
  await assert.rejects(browser(db, 'select urlaub.start_einladung()'), /permission denied/);
  await assert.rejects(als(db, 'authenticated', chef, 'select urlaub.start_einladung()'), /permission denied/);
});
```

- [ ] **Step 2: Test laufen lassen – muss fehlschlagen**

Run: `npm test`
Expected: FAIL mit `function urlaub.start_einladung() does not exist`.

- [ ] **Step 3: Funktionen einfügen** – in `supabase/schema.sql` die Zeilen

```sql
-- ---------------------------------------------------------------------------
-- (Task 4 fügt hier Einladungen und Hauptadmin-Funktionen ein)
-- ---------------------------------------------------------------------------
```

ersetzen durch:

```sql
-- ---------------------------------------------------------------------------
-- Einladungen und Registrierung
-- ---------------------------------------------------------------------------

-- Gültig: vorhanden, nicht eingelöst, nicht abgelaufen, Einladender nicht gesperrt.
create or replace function urlaub.einladung_gueltig(p_code text)
returns urlaub.einladungen
language sql stable
set search_path = ''
as $$
  select e.* from urlaub.einladungen e
  left join urlaub.organisatoren o on o.user_id = e.erstellt_von
  where e.code = p_code
    and e.eingeloest_von is null
    and e.gueltig_bis > now()
    and (e.erstellt_von is null or not o.gesperrt)
$$;

-- Läuft bei jedem neuen Konto (auch /auth/v1/signup). Ohne gültige Einladung
-- schlägt das Anlegen des Kontos fehl.
create or replace function urlaub.neuer_benutzer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := new.raw_user_meta_data ->> 'einladung';
  v_name text := btrim(coalesce(new.raw_user_meta_data ->> 'anzeigename', ''));
  v_e    urlaub.einladungen;
begin
  if v_code is null then
    raise exception 'EINLADUNG_FEHLT';
  end if;
  perform 1 from urlaub.einladungen where code = v_code for update;  -- gleichzeitiges Einlösen verhindern
  v_e := urlaub.einladung_gueltig(v_code);
  if v_e.code is null then
    raise exception 'EINLADUNG_UNGUELTIG';
  end if;
  if v_name = '' then
    raise exception 'NAME_LEER';
  end if;
  update urlaub.einladungen set eingeloest_von = new.id, eingeloest_am = now() where code = v_code;
  insert into urlaub.organisatoren (user_id, anzeigename, benutzername, ist_hauptadmin, eingeladen_von)
  values (new.id, v_name, split_part(new.email, '@', 1), v_e.erstellt_von is null, v_e.erstellt_von);
  return new;
end;
$$;

drop trigger if exists urlaub_neuer_benutzer on auth.users;
create trigger urlaub_neuer_benutzer
  after insert on auth.users
  for each row execute function urlaub.neuer_benutzer();

-- Nur für eine Neuinstallation im SQL-Editor: Link für das erste Konto (Hauptadmin).
create or replace function urlaub.start_einladung()
returns text
language sql volatile
set search_path = ''
as $$
  insert into urlaub.einladungen (erstellt_von) values (null)
  returning (select link_basis from urlaub.app) || 'admin.html#einladung=' || code
$$;

create or replace function public.einladung_pruefen(p_code text)
returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  v_e urlaub.einladungen := urlaub.einladung_gueltig(p_code);
begin
  if v_e.code is null then
    return jsonb_build_object('gueltig', false, 'eingeladen_von', null);
  end if;
  return jsonb_build_object('gueltig', true, 'eingeladen_von',
    coalesce((select anzeigename from urlaub.organisatoren where user_id = v_e.erstellt_von), 'Hauptadmin'));
end;
$$;

create or replace function public.org_einladung_erstellen()
returns jsonb
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_o urlaub.organisatoren := urlaub.ich();
  v_e urlaub.einladungen;
begin
  insert into urlaub.einladungen (erstellt_von) values (v_o.user_id) returning * into v_e;
  return jsonb_build_object(
    'code',        v_e.code,
    'link',        (select link_basis from urlaub.app) || 'admin.html#einladung=' || v_e.code,
    'gueltig_bis', v_e.gueltig_bis);
end;
$$;

-- ---------------------------------------------------------------------------
-- Hauptadmin
-- ---------------------------------------------------------------------------

create or replace function urlaub.hauptadmin()
returns urlaub.organisatoren
language plpgsql stable
set search_path = ''
as $$
declare
  v_o urlaub.organisatoren := urlaub.ich();
begin
  if not v_o.ist_hauptadmin then
    raise exception 'KEIN_ZUGRIFF';
  end if;
  return v_o;
end;
$$;

-- Bewusst ohne Inhalte fremder Umfragen: nur Name, Status, Anzahl.
create or replace function public.haupt_organisatoren()
returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  v_o urlaub.organisatoren := urlaub.hauptadmin();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'user_id',         o.user_id,
             'anzeigename',     o.anzeigename,
             'benutzername',    o.benutzername,
             'ist_hauptadmin',  o.ist_hauptadmin,
             'gesperrt',        o.gesperrt,
             'eingeladen_von',  v.anzeigename,
             'angelegt_am',     o.angelegt_am,
             'anzahl_umfragen', (select count(*) from urlaub.umfragen u where u.organisator_id = o.user_id),
             'ich',             o.user_id = v_o.user_id)
           order by o.anzeigename)
    from urlaub.organisatoren o
    left join urlaub.organisatoren v on v.user_id = o.eingeladen_von), '[]'::jsonb);
end;
$$;

create or replace function public.haupt_sperren(p_user_id uuid, p_gesperrt boolean)
returns void
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_o urlaub.organisatoren := urlaub.hauptadmin();
begin
  if p_user_id = v_o.user_id then
    raise exception 'NICHT_SELBST';
  end if;
  update urlaub.organisatoren set gesperrt = coalesce(p_gesperrt, gesperrt) where user_id = p_user_id;
  if not found then
    raise exception 'NICHT_GEFUNDEN';
  end if;
end;
$$;

revoke all on function public.einladung_pruefen(text)              from public, anon, authenticated;
revoke all on function public.org_einladung_erstellen()            from public, anon, authenticated;
revoke all on function public.haupt_organisatoren()                from public, anon, authenticated;
revoke all on function public.haupt_sperren(uuid, boolean)         from public, anon, authenticated;
grant execute on function public.einladung_pruefen(text)           to anon, authenticated;
grant execute on function public.org_einladung_erstellen()         to authenticated;
grant execute on function public.haupt_organisatoren()             to authenticated;
grant execute on function public.haupt_sperren(uuid, boolean)      to authenticated;
```

Hinweis: Wenn `urlaub.einladung_gueltig` keine Zeile findet, liefert der Aufruf in PL/pgSQL eine Zeile mit lauter `null` – deshalb die Prüfung `v_e.code is null`.

- [ ] **Step 4: Tests laufen lassen**

Run: `npm test`
Expected: PASS. „Einladung erstellen …“ prüft dabei auch, dass der Trigger unter der Rolle `supabase_auth_admin` (ohne Rechte auf `urlaub`) funktioniert.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Datenbank Stand 2: Einladungen, Registrierungs-Trigger, Hauptadmin

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Umstellung von Stand 1

**Files:**
- Modify: `supabase/schema.sql` (Kopf und Markierung „Task 5 fügt hier die Umstellung von Stand 1 ein“)
- Create: `tests/umstellung.test.mjs`

**Interfaces:**
- Consumes: `tests/fixtures/schema-v1.sql`, Helfer `neueDatenbank({schema:false})`, `SCHEMA`, `SCHEMA_V1`, `als`, `browser`; Funktionen aus Task 1–4.
- Produces: Umstellungsblock; danach existieren `urlaub.einstellungen`, `urlaub.feiertage`, `urlaub.admins`, die alten Views und die alten `admin_*`-Funktionen nicht mehr.

- [ ] **Step 1: Tests schreiben** – `tests/umstellung.test.mjs`:

```js
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { neueDatenbank, als, browser, SCHEMA, SCHEMA_V1 } from './helfer.mjs';

const AW = '11111111-1111-1111-1111-111111111111';
let db;
let annaCode;
let fristVorher;

before(async () => {
  db = await neueDatenbank({ schema: false });
  await db.exec(SCHEMA_V1);
  await db.query("insert into auth.users (id, email) values ($1, 'aw@example.com')", [AW]);
  await db.query("insert into urlaub.admins (user_id, notiz) values ($1, 'aw')", [AW]);
  await db.exec(`update urlaub.einstellungen set frist = '2026-11-30 23:59:59 Europe/Berlin',
                 dezember_hinweis = 'Inventur im Dezember.'`);
  const r = await db.query("insert into urlaub.mitarbeiter (name) values ('Anna'), ('Ben') returning name, code");
  annaCode = r.rows.find((x) => x.name === 'Anna').code;
  await db.query(`insert into urlaub.abgaben (mitarbeiter_id, wochen)
                  select id, '{12,30}' from urlaub.mitarbeiter where name = 'Anna'`);
  fristVorher = (await db.query("select to_char(frist at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') as f from urlaub.einstellungen")).rows[0].f;
  await db.exec(SCHEMA);
  await db.exec(SCHEMA); // zweites Mal: darf nichts verdoppeln
});

test('aw wird Hauptadmin', async () => {
  const o = (await db.query('select * from urlaub.organisatoren')).rows;
  assert.equal(o.length, 1);
  assert.equal(o[0].user_id, AW);
  assert.equal(o[0].benutzername, 'aw');
  assert.equal(o[0].anzeigename, 'aw');
  assert.equal(o[0].ist_hauptadmin, true);
});

test('Umfrage Nr. 1 übernimmt Einstellungen', async () => {
  const u = (await db.query(`select *, to_char(frist at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') as f
                             from urlaub.umfragen`)).rows;
  assert.equal(u.length, 1);
  assert.equal(u[0].titel, 'Urlaubswünsche 2027');
  assert.equal(u[0].jahr, 2027);
  assert.equal(u[0].bundesland, 'BY');
  assert.equal(u[0].organisator_id, AW);
  assert.equal(u[0].f, fristVorher);
  assert.equal(u[0].sperr_hinweis, 'Inventur im Dezember.');
  assert.equal(u[0].max_wochen, 6);
  assert.equal(u[0].max_am_stueck, 3);
  assert.equal(u[0].urlaubstage, 36);
  assert.deepEqual(u[0].gesperrte_monate, [12]);
  const frei = (await db.query('select datum::text as d, name from urlaub.freie_tage')).rows;
  assert.deepEqual(frei, [{ d: '2027-08-15', name: 'Mariä Himmelfahrt' }]);
  const link = (await db.query('select link_basis from urlaub.app')).rows[0].link_basis;
  assert.equal(link, 'https://urlaub2027.github.io/urlaub/');
});

test('Alte Links und Abgaben funktionieren weiter', async () => {
  const r = (await browser(db, 'select public.urlaub_laden($1) as r', [annaCode]))[0].r;
  assert.equal(r.name, 'Anna');
  assert.deepEqual(r.wochen, [12, 30]);
  assert.equal(r.titel, 'Urlaubswünsche 2027');
  assert.deepEqual(r.kalender.filter((k) => k.gesperrt).map((k) => k.kw), [48, 49, 50, 51, 52]);
  assert.deepEqual(r.kalender.filter((k) => k.arbeitstage === 5).map((k) => k.kw), [1, 12, 13, 17, 18, 20, 21, 44]);
});

test('aw kann die übernommene Umfrage verwalten', async () => {
  const liste = (await als(db, 'authenticated', AW, 'select public.org_umfragen() as r'))[0].r;
  assert.equal(liste.length, 1);
  assert.equal(liste[0].mitarbeiter, 2);
  assert.equal(liste[0].abgegeben, 1);
});

test('Alte Objekte sind entfernt', async () => {
  for (const name of ['urlaub.einstellungen', 'urlaub.feiertage', 'urlaub.admins', 'urlaub.links',
                      'urlaub.auswertung_personen', 'urlaub.auswertung_wochen']) {
    const r = (await db.query('select to_regclass($1)::text as r', [name])).rows[0].r;
    assert.equal(r, null, name);
  }
  const alt = (await db.query(`select count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname = 'public' and p.proname like 'admin\\_%') or (n.nspname = 'urlaub' and p.proname = 'pruefe_admin')`)).rows[0].n;
  assert.equal(alt, 0);
});

test('Umstellung ohne Admin bricht ab', async () => {
  const leer = await neueDatenbank({ schema: false });
  await leer.exec(SCHEMA_V1);
  await assert.rejects(leer.exec(SCHEMA), /UMSTELLUNG/);
});
```

- [ ] **Step 2: Test laufen lassen – muss fehlschlagen**

Run: `npm test`
Expected: FAIL (z. B. `cannot change name of view column` / `"kalender" is not a function` oder `column "umfrage_id" contains null values`).

- [ ] **Step 3a: Alte Views ganz oben entfernen** – in `supabase/schema.sql` direkt nach

```sql
revoke all on schema urlaub from public, anon, authenticated;
```

einfügen (Stand 1 hatte `urlaub.kalender` als *View*; sie muss weg, bevor die gleichnamige *Funktion* entsteht):

```sql

-- Stand 1 hatte urlaub.kalender als View; sie muss vor der gleichnamigen Funktion weg.
drop view if exists urlaub.links, urlaub.auswertung_personen, urlaub.auswertung_wochen, urlaub.kalender;
```

- [ ] **Step 3b: Umstellungsblock einfügen** – die Zeilen

```sql
-- ---------------------------------------------------------------------------
-- (Task 5 fügt hier die Umstellung von Stand 1 ein)
-- ---------------------------------------------------------------------------
```

ersetzen durch (Reihenfolge wichtig: nach den Kalenderfunktionen, vor „Nacharbeiten an Tabellen“):

```sql
-- ---------------------------------------------------------------------------
-- Umstellung von Stand 1 (eine Umfrage). Läuft nur, solange es die alte
-- Tabelle urlaub.einstellungen noch gibt.
-- ---------------------------------------------------------------------------

do $$
declare
  v_umfrage bigint;
begin
  if to_regclass('urlaub.einstellungen') is null then
    return;
  end if;

  alter table urlaub.mitarbeiter add column if not exists umfrage_id bigint
    references urlaub.umfragen (id) on delete cascade;

  insert into urlaub.app (link_basis)
  select link_basis from urlaub.einstellungen
  on conflict (id) do update set link_basis = excluded.link_basis;

  insert into urlaub.organisatoren (user_id, anzeigename, benutzername, ist_hauptadmin)
  select a.user_id, coalesce(nullif(btrim(a.notiz), ''), 'Admin'), split_part(u.email, '@', 1), true
  from urlaub.admins a join auth.users u on u.id = a.user_id
  on conflict (user_id) do nothing;

  if not exists (select 1 from urlaub.organisatoren) then
    raise exception 'UMSTELLUNG abgebrochen: kein Admin in urlaub.admins gefunden.';
  end if;

  insert into urlaub.umfragen (organisator_id, titel, jahr, bundesland, arbeitstage_pro_woche,
                               urlaubstage, max_wochen, max_am_stueck, gesperrte_monate,
                               sperr_hinweis, frist)
  select (select user_id from urlaub.organisatoren order by angelegt_am, user_id limit 1),
         'Urlaubswünsche 2027', 2027, 'BY', 6, e.urlaubstage, e.max_wochen, 3, '{12}',
         e.dezember_hinweis, e.frist
  from urlaub.einstellungen e
  returning id into v_umfrage;

  -- Feiertage aus Stand 1, die keine landesweiten Feiertage sind, bleiben als freie Tage erhalten.
  insert into urlaub.freie_tage (umfrage_id, datum, name)
  select v_umfrage, f.datum, f.name
  from urlaub.feiertage f
  where extract(year from f.datum) = 2027
    and not exists (select 1 from urlaub.landesfeiertage(2027, 'BY') l where l.datum = f.datum)
  on conflict do nothing;

  update urlaub.mitarbeiter set umfrage_id = v_umfrage where umfrage_id is null;

  drop function if exists public.admin_uebersicht();
  drop function if exists public.admin_mitarbeiter_anlegen(text);
  drop function if exists public.admin_mitarbeiter_loeschen(bigint);
  drop function if exists public.admin_link_erneuern(bigint);
  drop function if exists public.admin_einstellungen_speichern(text, text);
  drop function if exists urlaub.pruefe_admin();
  drop table urlaub.einstellungen, urlaub.feiertage, urlaub.admins;
  alter table urlaub.mitarbeiter drop constraint if exists mitarbeiter_name_key;
  alter table urlaub.abgaben drop constraint if exists abgaben_wochen_check;
end;
$$;
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npm test`
Expected: PASS (alle Dateien).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Datenbank Stand 2: automatische Umstellung von Stand 1

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Mitarbeiter-Seite (Titel, gesperrte Monate, Wochen am Stück)

**Files:**
- Modify: `docs/logik.js`, `docs/app.js`, `docs/index.html`
- Modify: `tests/logik.test.mjs`

**Interfaces:**
- Consumes: Antwort von `urlaub_laden`/`urlaub_speichern` (Task 2): `name, titel, jahr, wochen, geaendert_am, frist, offen, min_wochen, max_wochen, max_am_stueck, urlaubstage, arbeitstage_pro_woche, sperr_hinweis, kalender[{kw, von, bis, monat, arbeitstage, feiertag, gesperrt}]`.
- Produces (`docs/logik.js`): bestehende Exporte unverändert plus
  - `folgeLaenge(kw: number, auswahl: Set<number>) → number` (Länge der Folge, die mit `kw` entstünde)
  - `istGesperrt(kw, auswahl, limitErreicht, offen, maxAmStueck = Infinity) → boolean`
  - `nachMonat(kalender)` liefert nur noch nicht gesperrte Wochen
  - `gesperrteBereiche(kalender) → [{name: string, vonKw: number, bisKw: number}]`
  - `regelText(daten) → string`

- [ ] **Step 1: Tests ergänzen** – in `tests/logik.test.mjs` den Import ersetzen durch

```js
import {
  codeAusLink, fehlertext, zusammenfassung, istGesperrt, nachMonat, gleicheAuswahl, zeitpunkt,
  folgeLaenge, gesperrteBereiche, regelText,
} from '../docs/logik.js';
```

und am Dateiende anfügen:

```js
test('Folge am Stück', () => {
  const auswahl = new Set([10, 11, 13]);
  assert.equal(folgeLaenge(12, auswahl), 4);
  assert.equal(folgeLaenge(20, auswahl), 1);
  assert.equal(folgeLaenge(9, auswahl), 3);
});

test('Kästchen, das die Folge zu lang machen würde, ist gesperrt', () => {
  const auswahl = new Set([10, 11, 12]);
  assert.equal(istGesperrt(13, auswahl, false, true, 3), true);
  assert.equal(istGesperrt(9, auswahl, false, true, 3), true);
  assert.equal(istGesperrt(14, auswahl, false, true, 3), false);
  assert.equal(istGesperrt(11, auswahl, false, true, 3), false); // abwählen geht immer
});

test('Gesperrte Wochen erscheinen nicht in den Monaten, sondern als Bereiche', () => {
  const kal = [
    { kw: 47, monat: 11, arbeitstage: 6, gesperrt: false },
    { kw: 48, monat: 12, arbeitstage: 6, gesperrt: true },
    { kw: 49, monat: 12, arbeitstage: 6, gesperrt: true },
    { kw: 30, monat: 7, arbeitstage: 6, gesperrt: true },
  ];
  assert.deepEqual(nachMonat(kal).map((g) => g.name), ['November']);
  assert.deepEqual(gesperrteBereiche(kal), [
    { name: 'Juli', vonKw: 30, bisKw: 30 },
    { name: 'Dezember', vonKw: 48, bisKw: 49 },
  ]);
});

test('Regeltext', () => {
  assert.equal(regelText({ min_wochen: 1, max_wochen: 6, max_am_stueck: 3 }),
    'mindestens 1, höchstens 6 Wochen, davon höchstens 3 am Stück');
  assert.equal(regelText({ min_wochen: 2, max_wochen: 4, max_am_stueck: 4 }),
    'mindestens 2, höchstens 4 Wochen');
});

test('Neue Fehlertexte', () => {
  assert.match(fehlertext('ZU_VIELE_AM_STUECK'), /am Stück/);
  assert.match(fehlertext('ZU_WENIGE_WOCHEN'), /mehr Wochen/);
  assert.match(fehlertext('UNGUELTIGE_WOCHE'), /nicht wählbar/);
});
```

- [ ] **Step 2: Test laufen lassen – muss fehlschlagen**

Run: `npm test`
Expected: FAIL (`folgeLaenge` ist kein Export).

- [ ] **Step 3: `docs/logik.js` anpassen**

In `FEHLERTEXTE` den Eintrag `UNGUELTIGE_WOCHE` ersetzen und zwei Einträge ergänzen:

```js
  UNGUELTIGE_WOCHE: 'Mindestens eine gewählte Woche ist nicht wählbar.',
  ZU_WENIGE_WOCHEN: 'Bitte wähle mehr Wochen.',
  ZU_VIELE_AM_STUECK: 'So viele Wochen am Stück sind nicht erlaubt.',
```

Die Funktionen `istGesperrt` und `nachMonat` ersetzen und neue ergänzen:

```js
// Länge der Folge aufeinanderfolgender KWs, die entstünde, wenn kw dazukäme.
export function folgeLaenge(kw, auswahl) {
  let n = 1;
  for (let k = kw - 1; auswahl.has(k); k -= 1) n += 1;
  for (let k = kw + 1; auswahl.has(k); k += 1) n += 1;
  return n;
}

// Gesperrt, wenn die Frist vorbei ist, das Limit erreicht ist oder die Folge zu lang
// würde – außer das Kästchen ist schon angehakt (Abwählen bleibt immer möglich).
export function istGesperrt(kw, auswahl, limitErreicht, offen, maxAmStueck = Infinity) {
  if (!offen) return true;
  if (auswahl.has(kw)) return false;
  if (limitErreicht) return true;
  return folgeLaenge(kw, auswahl) > maxAmStueck;
}

export function nachMonat(kalender) {
  const gruppen = new Map();
  for (const k of kalender.filter((x) => !x.gesperrt)) {
    if (!gruppen.has(k.monat)) gruppen.set(k.monat, []);
    gruppen.get(k.monat).push(k);
  }
  return [...gruppen].map(([monat, wochen]) => ({ name: MONATE[monat - 1], wochen }));
}

export function gesperrteBereiche(kalender) {
  const monate = new Map();
  for (const k of kalender.filter((x) => x.gesperrt)) {
    const b = monate.get(k.monat);
    if (b) { b.vonKw = Math.min(b.vonKw, k.kw); b.bisKw = Math.max(b.bisKw, k.kw); }
    else monate.set(k.monat, { name: MONATE[k.monat - 1], vonKw: k.kw, bisKw: k.kw, monat: k.monat });
  }
  return [...monate.values()].sort((a, b) => a.vonKw - b.vonKw)
    .map(({ name, vonKw, bisKw }) => ({ name, vonKw, bisKw }));
}

export function regelText(d) {
  const basis = `mindestens ${d.min_wochen}, höchstens ${d.max_wochen} Wochen`;
  return d.max_am_stueck < d.max_wochen ? `${basis}, davon höchstens ${d.max_am_stueck} am Stück` : basis;
}
```

Achtung: KW 1 kann im Januar liegen, obwohl der Montag im Dezember des Vorjahres ist – die Gruppierung nutzt `monat` aus der Datenbank (Donnerstagsregel), nicht das Datum.

- [ ] **Step 4: `docs/index.html` anpassen**

`<h1>Urlaubswünsche 2027</h1>` ersetzen durch `<h1 id="titel">Urlaubswünsche</h1>`.

Den Absatz `<p class="erklaerung"> … </p>` (mit `<span id="max-wochen">`) ersetzen durch:

```html
      <p class="erklaerung">
        Wähle die Kalenderwochen, in denen du Urlaub möchtest: <span id="regeln"></span>.
        Die Wochen müssen nicht zusammenhängen. Es sind Wünsche, keine Genehmigungen.
      </p>
```

Die Dezember-Box ersetzen durch:

```html
      <section id="gesperrt-box" class="box box-gesperrt" hidden>
        <h2>Nicht wählbar</h2>
        <ul id="gesperrt-liste" class="liste"></ul>
        <p id="sperr-hinweis"></p>
      </section>
```

- [ ] **Step 5: `docs/app.js` anpassen**

Import ersetzen durch:

```js
import { rpc } from './api.js';
import {
  codeAusLink, fehlertext, zusammenfassung, istGesperrt, nachMonat, gleicheAuswahl, zeitpunkt,
  gesperrteBereiche, regelText,
} from './logik.js';
```

`wochenText` ersetzen durch:

```js
function wochenText(kw) {
  const k = daten.kalender.find((x) => x.kw === kw);
  const tage = k.arbeitstage === daten.arbeitstage_pro_woche ? '' : ` · ${k.arbeitstage} Urlaubstage (${k.feiertag})`;
  return `KW ${k.kw}: ${k.von}–${k.bis}${tage}`;
}
```

In `baueFormular` die Bedingung `if (k.arbeitstage !== 6) {` ersetzen durch `if (k.arbeitstage !== daten.arbeitstage_pro_woche) {` und die beiden letzten Zeilen der Funktion

```js
  $('max-wochen').textContent = String(daten.max_wochen);
  $('dezember-hinweis').textContent = daten.dezember_hinweis;
```

ersetzen durch:

```js
  $('regeln').textContent = regelText(daten);
  const bereiche = gesperrteBereiche(daten.kalender);
  $('gesperrt-box').hidden = bereiche.length === 0;
  $('gesperrt-liste').replaceChildren(...bereiche.map((b) => {
    const li = document.createElement('li');
    li.textContent = b.vonKw === b.bisKw ? `${b.name} (KW ${b.vonKw})` : `${b.name} (KW ${b.vonKw}–${b.bisKw})`;
    return li;
  }));
  $('sperr-hinweis').textContent = daten.sperr_hinweis;
```

In `aktualisiere` die Zeile mit `kaestchen.disabled = …` ersetzen durch:

```js
    kaestchen.disabled = istGesperrt(kw, auswahl, z.limitErreicht, daten.offen, daten.max_am_stueck);
    kaestchen.closest('label').title = kaestchen.disabled && daten.offen && !z.limitErreicht
      ? `Höchstens ${daten.max_am_stueck} Wochen am Stück` : '';
```

und `$('absenden').disabled = !daten.offen || z.anzahl === 0 || unveraendert;` ersetzen durch:

```js
  $('absenden').disabled = !daten.offen || z.anzahl < daten.min_wochen || unveraendert;
```

In `start()` nach `$('begruessung').textContent = …` einfügen:

```js
  $('titel').textContent = daten.titel;
  document.title = daten.titel;
```

- [ ] **Step 6: Tests laufen lassen**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Mitarbeiter-Seite: Titel und Regeln aus der Umfrage, Wochen am Stück, gesperrte Monate

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Verwaltung (Login, Registrierung, Umfragen, Konto, Organisatoren)

**Files:**
- Modify: `docs/api.js`, `docs/auswertung.js`, `docs/style.css`, `tests/excel.test.mjs`
- Create: `docs/sitzung.js`, `docs/admin-hilfe.js`, `docs/admin-umfrage.js`
- Rewrite: `docs/admin.html`, `docs/admin.js`

**Interfaces:**
- Consumes: alle `public.org_*`, `public.haupt_*`, `public.einladung_pruefen` (Task 3/4); `erzeugeXlsx` (`docs/xlsx.js`, unverändert); `zeitpunkt`, `MONATE` (`docs/logik.js`).
- Produces:
  - `docs/api.js`: `rpc(funktion, parameter, token)`, `anmelden(email, passwort)`, `erneuern(refresh)`, `abmeldenServer(token)`, **neu** `registrieren(email, passwort, daten)`, `passwortAendern(token, passwort)`. Fehler: `Error.message` = `message` (PostgREST) bzw. `error_code` (Auth) bzw. `HTTP_<status>`; `Error.status` = HTTP-Status.
  - `docs/sitzung.js`: `emailFuer(benutzername)`, `istAngemeldet()`, `login(benutzername, passwort)`, `logout()`, `token()`, `orgRpc(funktion, parameter)`.
  - `docs/auswertung.js`: `REGEL_TEXTE`, `personenZeilen(daten)` (+ `regelverstoss`), `wochenZeilen(daten)` (nur nicht gesperrte KWs), `excelBlaetter(daten)` (Personen mit Spalte „Hinweis“; Matrix nur nicht gesperrte KWs). `daten` = Antwort von `org_umfrage` (Felder `mitarbeiter`, `kalender`).
  - `docs/admin-umfrage.js`: `initUmfrage({aufruf, fehlerAnzeigen, zurueck})`, `zeigeUmfrage(id)`.

- [ ] **Step 1: Excel-Test an das neue Datenformat anpassen** – in `tests/excel.test.mjs`:

Im `kalender`-Testdatensatz jedem Eintrag `gesperrt: i >= 47` hinzufügen und die Länge auf 52 setzen:

```js
const kalender = Array.from({ length: 52 }, (_, i) => ({
  kw: i + 1, von: '01.01.', bis: '07.01.', monat: i >= 47 ? 12 : 1,
  arbeitstage: i === 0 ? 5 : 6, feiertag: i === 0 ? 'Heilige Drei Könige' : null, gesperrt: i >= 47,
}));
```

Im Datensatz `mitarbeiter` bei Anna `regelverstoss: 'ZU_VIELE_AM_STUECK'` und bei Ben `regelverstoss: null` ergänzen.

Die Erwartungen für das Blatt „Personen“ ersetzen durch:

```js
    assert.deepEqual(wb.Personen[0], ['Name', 'Abgegeben', 'Gewählte KWs', 'Anzahl Wochen', 'Urlaubstage', 'Letzte Änderung', 'Hinweis']);
    assert.deepEqual(wb.Personen[1], ['Anna Ä. <&>', 'ja', 'KW 1, KW 30', 2, 11, '01.10.2026, 16:00 Uhr', 'verstößt gegen aktuelle Regeln: zu viele Wochen am Stück']);
    assert.deepEqual(wb.Personen[2], ['Ben', 'nein', null, null, null, null, null]);
```

`assert.equal(wb.Wochen.length, 48);` bleibt (47 freie KWs + Kopf). `assert.equal(wb.Matrix[0].length, 48);` bleibt.

- [ ] **Step 2: Test laufen lassen – muss fehlschlagen**

Run: `npm test`
Expected: FAIL im Excel-Test (Spalte „Hinweis“ fehlt, Wochen 49 statt 48).

- [ ] **Step 3: `docs/auswertung.js` ersetzen** durch:

```js
// Baut aus der Antwort von org_umfrage die Tabellen für Anzeige und Excel-Export.
import { zeitpunkt } from './logik.js';

export const REGEL_TEXTE = {
  KEINE_WOCHE: 'keine Woche gewählt',
  UNGUELTIGE_WOCHE: 'gesperrte oder ungültige Woche',
  DOPPELTE_WOCHE: 'doppelte Woche',
  ZU_WENIGE_WOCHEN: 'zu wenige Wochen',
  ZU_VIELE_WOCHEN: 'zu viele Wochen',
  ZU_VIELE_AM_STUECK: 'zu viele Wochen am Stück',
  ZU_VIELE_TAGE: 'zu viele Urlaubstage',
};

export function regelHinweis(code) {
  return code ? `verstößt gegen aktuelle Regeln: ${REGEL_TEXTE[code] || code}` : '';
}

export function personenZeilen(daten) {
  return daten.mitarbeiter.map((m) => ({
    id: m.id,
    name: m.name,
    link: m.link,
    abgegeben: m.wochen.length > 0,
    wochen: m.wochen.map((kw) => `KW ${kw}`).join(', '),
    anzahl: m.wochen.length,
    urlaubstage: m.urlaubstage,
    stand: m.geaendert_am ? zeitpunkt(m.geaendert_am) : '',
    regelverstoss: m.regelverstoss || null,
  }));
}

export function wochenZeilen(daten) {
  return daten.kalender.filter((k) => !k.gesperrt).map((k) => {
    const namen = daten.mitarbeiter.filter((m) => m.wochen.includes(k.kw)).map((m) => m.name);
    return {
      kw: k.kw,
      zeitraum: `${k.von}–${k.bis}`,
      arbeitstage: k.arbeitstage,
      feiertag: k.feiertag || '',
      anzahl: namen.length,
      namen: namen.join(', '),
    };
  });
}

export function excelBlaetter(daten) {
  const personen = personenZeilen(daten);
  const wochen = wochenZeilen(daten);
  const offeneKw = daten.kalender.filter((k) => !k.gesperrt);
  return [
    {
      name: 'Personen',
      spalten: [
        { titel: 'Name', breite: 24 }, { titel: 'Abgegeben', breite: 11 },
        { titel: 'Gewählte KWs', breite: 40 }, { titel: 'Anzahl Wochen', breite: 15 },
        { titel: 'Urlaubstage', breite: 13 }, { titel: 'Letzte Änderung', breite: 22 },
        { titel: 'Hinweis', breite: 45 },
      ],
      zeilen: personen.map((p) => [p.name, p.abgegeben ? 'ja' : 'nein', p.wochen,
        p.abgegeben ? p.anzahl : null, p.abgegeben ? p.urlaubstage : null, p.stand,
        regelHinweis(p.regelverstoss)]),
    },
    {
      name: 'Wochen',
      spalten: [
        { titel: 'KW', breite: 6 }, { titel: 'Zeitraum', breite: 15 },
        { titel: 'Arbeitstage', breite: 12 }, { titel: 'Feiertag', breite: 22 },
        { titel: 'Anzahl', breite: 9 }, { titel: 'Namen', breite: 60 },
      ],
      zeilen: wochen.map((w) => [w.kw, w.zeitraum, w.arbeitstage, w.feiertag, w.anzahl, w.namen]),
    },
    {
      name: 'Matrix',
      fixiereSpalten: 1,
      spalten: [{ titel: 'Name', breite: 24 }, ...offeneKw.map((k) => ({ titel: `KW ${k.kw}`, breite: 7 }))],
      zeilen: [
        ...daten.mitarbeiter.map((m) => [m.name, ...offeneKw.map((k) => (m.wochen.includes(k.kw) ? 'x' : null))]),
        ['Anzahl', ...wochen.map((w) => w.anzahl)],
      ],
    },
  ];
}
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: `docs/api.js` ersetzen** durch:

```js
// Verbindung zu Supabase (REST und Auth). Fehler werden als Error geworfen:
// message = Fehlercode der Datenbank (z. B. "LINK_UNGUELTIG"), Auth-Fehlercode
// (z. B. "user_already_exists") oder "KEINE_VERBINDUNG"; status = HTTP-Status.
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

async function anfrage(pfad, body, token, methode = 'POST') {
  const headers = { 'Content-Type': 'application/json', apikey: SUPABASE_KEY };
  // Angemeldet: Sitzungs-Token. Sonst: alte "anon"-Schlüssel sind JWTs und gehen
  // zusätzlich als Bearer mit; neue "publishable"-Schlüssel nur als apikey.
  if (token) headers.Authorization = `Bearer ${token}`;
  else if (SUPABASE_KEY.startsWith('eyJ')) headers.Authorization = `Bearer ${SUPABASE_KEY}`;
  let antwort;
  try {
    antwort = await fetch(`${SUPABASE_URL}${pfad}`, {
      method: methode, headers, body: JSON.stringify(body),
      cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer',
    });
  } catch {
    throw new Error('KEINE_VERBINDUNG');
  }
  const inhalt = antwort.status === 204 ? null : await antwort.json().catch(() => null);
  if (!antwort.ok) {
    const fehler = new Error(inhalt?.message || inhalt?.error_code || inhalt?.msg || `HTTP_${antwort.status}`);
    fehler.status = antwort.status;
    throw fehler;
  }
  return inhalt;
}

export function rpc(funktion, parameter = {}, token = null) {
  return anfrage(`/rest/v1/rpc/${funktion}`, parameter, token);
}

export function anmelden(email, passwort) {
  return anfrage('/auth/v1/token?grant_type=password', { email, password: passwort });
}

export function erneuern(refreshToken) {
  return anfrage('/auth/v1/token?grant_type=refresh_token', { refresh_token: refreshToken });
}

export function abmeldenServer(token) {
  return anfrage('/auth/v1/logout', {}, token);
}

// daten landet in raw_user_meta_data und wird vom Datenbank-Trigger geprüft.
export function registrieren(email, passwort, daten) {
  return anfrage('/auth/v1/signup', { email, password: passwort, data: daten });
}

export function passwortAendern(token, passwort) {
  return anfrage('/auth/v1/user', { password: passwort }, token, 'PUT');
}
```

- [ ] **Step 6: `docs/sitzung.js` anlegen:**

```js
// Anmelde-Sitzung der Verwaltung. Liegt nur im sessionStorage dieses Tabs.
import { rpc, anmelden, erneuern, abmeldenServer } from './api.js';

const SCHLUESSEL = 'urlaub-admin-sitzung';
// Supabase verlangt eine E-Mail-Adresse. Getippt wird nur der Benutzername;
// die Domain ist reserviert (RFC 2606) und kann keine Post empfangen.
const LOGIN_DOMAIN = 'example.com';

let sitzung = lesen();

function lesen() {
  try { return JSON.parse(sessionStorage.getItem(SCHLUESSEL)); } catch { return null; }
}

function speichern(antwort) {
  sitzung = {
    token: antwort.access_token,
    refresh: antwort.refresh_token,
    ablauf: Date.now() + (antwort.expires_in || 3600) * 1000,
  };
  try { sessionStorage.setItem(SCHLUESSEL, JSON.stringify(sitzung)); } catch { /* nur im Speicher */ }
}

export function emailFuer(benutzername) {
  const name = benutzername.trim().toLowerCase();
  return name.includes('@') ? name : `${name}@${LOGIN_DOMAIN}`;
}

export function istAngemeldet() {
  return Boolean(sitzung);
}

export async function login(benutzername, passwort) {
  speichern(await anmelden(emailFuer(benutzername), passwort));
}

export function logout() {
  // Anmeldung auch bei Supabase beenden, damit das Erneuerungs-Token ungültig wird.
  if (sitzung?.token) abmeldenServer(sitzung.token).catch(() => {});
  sitzung = null;
  try { sessionStorage.removeItem(SCHLUESSEL); } catch { /* egal */ }
}

export async function token() {
  if (!sitzung) throw new Error('NICHT_ANGEMELDET');
  if (Date.now() > sitzung.ablauf - 60_000) {
    try {
      speichern(await erneuern(sitzung.refresh));
    } catch {
      throw new Error('NICHT_ANGEMELDET');
    }
  }
  return sitzung.token;
}

export async function orgRpc(funktion, parameter = {}) {
  return rpc(funktion, parameter, await token());
}
```

- [ ] **Step 7: `docs/admin-hilfe.js` anlegen:**

```js
// Gemeinsame Helfer der Verwaltung.
export const $ = (id) => document.getElementById(id);

export const BUNDESLAENDER = [
  ['BW', 'Baden-Württemberg'], ['BY', 'Bayern'], ['BE', 'Berlin'], ['BB', 'Brandenburg'],
  ['HB', 'Bremen'], ['HH', 'Hamburg'], ['HE', 'Hessen'], ['MV', 'Mecklenburg-Vorpommern'],
  ['NI', 'Niedersachsen'], ['NW', 'Nordrhein-Westfalen'], ['RP', 'Rheinland-Pfalz'], ['SL', 'Saarland'],
  ['SN', 'Sachsen'], ['ST', 'Sachsen-Anhalt'], ['SH', 'Schleswig-Holstein'], ['TH', 'Thüringen'],
];

export const landName = (kuerzel) => (BUNDESLAENDER.find(([k]) => k === kuerzel) || [kuerzel, kuerzel])[1];

const FEHLER = {
  KEIN_ZUGRIFF: 'Dieses Konto hat keinen Zugriff (mehr).',
  UMFRAGE_NICHT_GEFUNDEN: 'Diese Umfrage gibt es nicht (mehr).',
  MITARBEITER_NICHT_GEFUNDEN: 'Diesen Mitarbeiter gibt es nicht (mehr).',
  NAME_LEER: 'Bitte einen Namen eingeben.',
  NAME_DOPPELT: 'Diesen Namen gibt es in dieser Umfrage schon. Bitte unterscheide ihn, z. B. „Anna K.“ und „Anna M.“.',
  TITEL_LEER: 'Bitte einen Titel eingeben.',
  FRIST_LEER: 'Bitte eine Frist mit Datum und Uhrzeit eingeben.',
  GRUNDDATEN_GESPERRT: 'Jahr, Bundesland und Arbeitstage lassen sich nicht mehr ändern, weil schon Wünsche abgegeben wurden.',
  UNGUELTIGE_EINSTELLUNG: 'Mindestens eine Angabe ist ungültig. Bitte prüfe die Zahlen (z. B. „mindestens“ nicht größer als „höchstens“).',
  DATUM_FALSCHES_JAHR: 'Das Datum muss im Jahr der Umfrage liegen.',
  NICHT_SELBST: 'Du kannst dich nicht selbst sperren.',
  NICHT_GEFUNDEN: 'Nicht gefunden.',
  KEINE_VERBINDUNG: 'Keine Verbindung. Bitte prüfe dein Internet.',
};

export function fehlerText(code) {
  return FEHLER[code] || 'Das hat nicht geklappt. Bitte versuch es noch einmal.';
}

export function meldung(text) {
  const m = $('meldung');
  m.textContent = text || '';
  m.hidden = !text;
  if (text) m.scrollIntoView({ block: 'nearest' });
}

export function knopf(text, klasse, aktion) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = text;
  b.className = klasse;
  b.addEventListener('click', aktion);
  return b;
}

export function element(tag, klasse, text) {
  const e = document.createElement(tag);
  if (klasse) e.className = klasse;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function whatsappLink(text) {
  const a = element('a', 'knopf-link', 'WhatsApp');
  a.href = `https://wa.me/?text=${encodeURIComponent(text)}`;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  return a;
}

export async function kopieren(text, knopfElement) {
  try {
    await navigator.clipboard.writeText(text);
    const vorher = knopfElement.textContent;
    knopfElement.textContent = 'Kopiert ✓';
    setTimeout(() => { knopfElement.textContent = vorher; }, 2000);
  } catch {
    window.prompt('Zum Kopieren:', text);
  }
}

export function fuelleJahre(select, von, bis, gewaehlt) {
  select.replaceChildren(...Array.from({ length: bis - von + 1 }, (_, i) => {
    const o = element('option', null, String(von + i));
    o.value = String(von + i);
    o.selected = von + i === gewaehlt;
    return o;
  }));
}

export function fuelleLaender(select, gewaehlt) {
  select.replaceChildren(...BUNDESLAENDER.map(([kuerzel, name]) => {
    const o = element('option', null, name);
    o.value = kuerzel;
    o.selected = kuerzel === gewaehlt;
    return o;
  }));
}

export function datumDeutsch(iso) {
  const [j, m, t] = String(iso).slice(0, 10).split('-');
  return `${t}.${m}.${j}`;
}
```

- [ ] **Step 8: `docs/admin.html` ersetzen** durch:

```html
<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <meta name="referrer" content="no-referrer">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; script-src 'self'; style-src 'self'; connect-src https://*.supabase.co; img-src data:; base-uri 'none'; form-action 'none'">
  <title>Urlaubswünsche – Verwaltung</title>
  <link rel="icon" href="data:,">
  <link rel="stylesheet" href="style.css">
  <script type="module" src="admin.js"></script>
</head>
<body class="admin">
  <header class="kopf kopf-admin">
    <div>
      <h1>Urlaubswünsche</h1>
      <p id="wer" class="begruessung">Verwaltung</p>
    </div>
    <nav id="navigation" class="navigation" hidden>
      <button type="button" class="zweitrangig klein-knopf" data-ziel="liste">Meine Umfragen</button>
      <button type="button" class="zweitrangig klein-knopf" data-ziel="konto">Konto &amp; Einladen</button>
      <button type="button" class="zweitrangig klein-knopf" data-ziel="organisatoren" id="nav-organisatoren" hidden>Organisatoren</button>
      <button type="button" class="zweitrangig klein-knopf" id="abmelden">Abmelden</button>
    </nav>
  </header>

  <main>
    <p id="meldung" class="meldung" role="alert" hidden></p>

    <section id="ansicht-login" hidden>
      <form id="login-form" class="box formular-box" novalidate>
        <h2>Anmelden</h2>
        <label class="feld">Benutzername
          <input id="login-name" type="text" autocomplete="username" autocapitalize="none" required>
        </label>
        <label class="feld">Passwort
          <input id="login-passwort" type="password" autocomplete="current-password" required>
        </label>
        <button type="submit" id="login-knopf">Anmelden</button>
      </form>
    </section>

    <section id="ansicht-registrieren" hidden>
      <form id="reg-form" class="box formular-box" novalidate>
        <h2>Als Organisator registrieren</h2>
        <p id="reg-einladung" class="klein"></p>
        <label class="feld">Dein Name (wird anderen angezeigt)
          <input id="reg-anzeigename" type="text" autocomplete="name" required>
        </label>
        <label class="feld">Benutzername zum Anmelden (Kleinbuchstaben, Ziffern, Punkt, Bindestrich)
          <input id="reg-name" type="text" autocomplete="username" autocapitalize="none" required>
        </label>
        <label class="feld">Passwort (mindestens 10 Zeichen)
          <input id="reg-passwort" type="password" autocomplete="new-password" required>
        </label>
        <label class="feld">Passwort wiederholen
          <input id="reg-passwort2" type="password" autocomplete="new-password" required>
        </label>
        <button type="submit" id="reg-knopf">Registrieren</button>
      </form>
    </section>

    <section id="ansicht-liste" hidden>
      <form id="neu-umfrage-form" class="box formular-box" novalidate>
        <h2>Neue Umfrage</h2>
        <label class="feld">Titel
          <input id="neu-titel" type="text" autocomplete="off">
        </label>
        <label class="feld">Jahr
          <select id="neu-jahr"></select>
        </label>
        <label class="feld">Bundesland (für die Feiertage)
          <select id="neu-land"></select>
        </label>
        <button type="submit">Umfrage anlegen</button>
      </form>
      <h2>Meine Umfragen</h2>
      <ul id="umfragen" class="karten"></ul>
    </section>

    <section id="ansicht-umfrage" hidden>
      <button type="button" id="zurueck" class="zweitrangig klein-knopf">← Meine Umfragen</button>
      <div class="box kennzahlen">
        <h2 id="u-titel"></h2>
        <p id="kennzahl" class="kennzahl"></p>
        <p id="frist-anzeige" class="klein"></p>
        <button id="excel" type="button">Excel herunterladen</button>
      </div>

      <nav class="reiter" role="tablist">
        <button type="button" role="tab" data-reiter="personen" aria-selected="true">Mitarbeiter</button>
        <button type="button" role="tab" data-reiter="wochen" aria-selected="false">Wochen</button>
        <button type="button" role="tab" data-reiter="einstellungen" aria-selected="false">Einstellungen</button>
      </nav>

      <section id="reiter-personen">
        <form id="neu-form" class="box neu-form" novalidate>
          <label class="feld">Neuen Mitarbeiter anlegen
            <input id="neu-name" type="text" placeholder="Vor- und Nachname" autocomplete="off" required>
          </label>
          <button type="submit">Anlegen</button>
        </form>
        <p class="klein">Jeder Link ist persönlich. Über „WhatsApp“ öffnet sich WhatsApp mit einer fertigen Nachricht, du wählst dort nur noch den Empfänger.</p>
        <ul id="personen" class="karten"></ul>
      </section>

      <section id="reiter-wochen" hidden>
        <p class="klein">Anzahl der Wünsche pro Kalenderwoche. Wochen mit vielen Wünschen sind hervorgehoben.</p>
        <div class="tabelle-rahmen">
          <table class="tabelle">
            <thead><tr><th>KW</th><th>Zeitraum</th><th>Anzahl</th><th>Namen</th></tr></thead>
            <tbody id="wochen"></tbody>
          </table>
        </div>
      </section>

      <section id="reiter-einstellungen" hidden>
        <form id="einstellungen-form" class="box formular-box" novalidate>
          <label class="feld">Titel
            <input id="e-titel" type="text" required>
          </label>
          <p id="e-grunddaten-hinweis" class="klein" hidden>Jahr, Bundesland und Arbeitstage sind gesperrt, weil schon Wünsche abgegeben wurden.</p>
          <label class="feld">Jahr
            <select id="e-jahr"></select>
          </label>
          <label class="feld">Bundesland (für die Feiertage)
            <select id="e-land"></select>
          </label>
          <label class="feld">Arbeitstage pro Woche
            <select id="e-arbeitstage">
              <option value="6">6 (Montag–Samstag)</option>
              <option value="5">5 (Montag–Freitag)</option>
            </select>
          </label>
          <label class="feld">Urlaubstage pro Person
            <input id="e-urlaubstage" type="number" min="1" max="366" inputmode="numeric" required>
          </label>
          <label class="feld">Mindestens Wochen
            <input id="e-min" type="number" min="1" max="53" inputmode="numeric" required>
          </label>
          <label class="feld">Höchstens Wochen
            <input id="e-max" type="number" min="1" max="53" inputmode="numeric" required>
          </label>
          <label class="feld">Höchstens Wochen am Stück
            <input id="e-stueck" type="number" min="1" max="53" inputmode="numeric" required>
          </label>
          <fieldset class="feld monate-wahl">
            <legend>Gesperrte Monate</legend>
            <div id="e-monate" class="monate-raster"></div>
          </fieldset>
          <label class="feld">Hinweis zu den gesperrten Monaten
            <textarea id="e-hinweis" rows="2"></textarea>
          </label>
          <label class="feld">Frist (deutsche Zeit)
            <input id="e-frist" type="datetime-local" required>
          </label>
          <button type="submit">Einstellungen speichern</button>
        </form>

        <div class="box formular-box">
          <h2>Zusätzliche freie Tage</h2>
          <p class="klein">Örtliche Feiertage oder Betriebsruhe, z. B. das Augsburger Friedensfest. Sie kosten keinen Urlaubstag.</p>
          <ul id="freie-tage" class="karten"></ul>
          <form id="frei-form" class="neu-form" novalidate>
            <label class="feld">Datum
              <input id="frei-datum" type="date" required>
            </label>
            <label class="feld">Bezeichnung
              <input id="frei-name" type="text" required>
            </label>
            <button type="submit">Hinzufügen</button>
          </form>
        </div>

        <button type="button" id="umfrage-loeschen" class="gefahr">Umfrage löschen</button>
      </section>
    </section>

    <section id="ansicht-konto" hidden>
      <div class="box formular-box">
        <h2>Organisator einladen</h2>
        <p class="klein">Der Link ist 7 Tage gültig und nur einmal verwendbar. Die eingeladene Person kann danach eigene Umfragen anlegen und selbst weitere Personen einladen. Deine Umfragen sieht sie nicht.</p>
        <button type="button" id="einladen">Einladungslink erzeugen</button>
        <div id="einladung-ergebnis" hidden>
          <p id="einladung-link" class="link-anzeige"></p>
          <div id="einladung-aktionen" class="karte-aktionen"></div>
        </div>
      </div>
      <form id="passwort-form" class="box formular-box" novalidate>
        <h2>Passwort ändern</h2>
        <label class="feld">Neues Passwort (mindestens 10 Zeichen)
          <input id="pw-neu" type="password" autocomplete="new-password" required>
        </label>
        <label class="feld">Wiederholen
          <input id="pw-neu2" type="password" autocomplete="new-password" required>
        </label>
        <button type="submit">Passwort ändern</button>
      </form>
    </section>

    <section id="ansicht-organisatoren" hidden>
      <h2>Organisatoren</h2>
      <p class="klein">Gesperrte Organisatoren können sich nicht mehr anmelden. Ihre Umfragen und Mitarbeiter-Links bleiben bestehen.</p>
      <ul id="organisatoren" class="karten"></ul>
    </section>
  </main>
</body>
</html>
```

- [ ] **Step 9: `docs/admin.js` ersetzen** durch:

```js
// Verwaltung: Anmeldung, Registrierung über Einladung, Umfrageliste, Konto, Organisatoren.
import {
  $, meldung, fehlerText, knopf, element, whatsappLink, kopieren, fuelleJahre, fuelleLaender, landName,
} from './admin-hilfe.js';
import * as sitzung from './sitzung.js';
import { rpc, registrieren, passwortAendern } from './api.js';
import { zeitpunkt } from './logik.js';
import { initUmfrage, zeigeUmfrage } from './admin-umfrage.js';

const ANSICHTEN = ['login', 'registrieren', 'liste', 'umfrage', 'konto', 'organisatoren'];
const BENUTZERNAME = /^[a-z0-9][a-z0-9.-]{1,29}$/;
let ich = null;
let einladungsCode = null;

function zeigeAnsicht(name) {
  for (const a of ANSICHTEN) $(`ansicht-${a}`).hidden = a !== name;
  $('navigation').hidden = !ich;
  window.scrollTo(0, 0);
}

// Ruft eine org_/haupt_-Funktion auf. Abgelaufene Anmeldung oder fehlende Rechte → Login.
async function aufruf(funktion, parameter) {
  try {
    return await sitzung.orgRpc(funktion, parameter);
  } catch (fehler) {
    if (fehler.message === 'NICHT_ANGEMELDET' || fehler.status === 401 || fehler.message === 'KEIN_ZUGRIFF') {
      abmelden(fehler.message === 'KEIN_ZUGRIFF'
        ? fehlerText('KEIN_ZUGRIFF')
        : 'Deine Anmeldung ist abgelaufen. Bitte melde dich neu an.');
      fehler.behandelt = true;
    }
    throw fehler;
  }
}

function fehlerAnzeigen(fehler) {
  if (!fehler.behandelt) meldung(fehlerText(fehler.message));
}

// ---------------------------------------------------------------- Anmeldung

function abmelden(text = '') {
  sitzung.logout();
  ich = null;
  $('wer').textContent = 'Verwaltung';
  zeigeAnsicht('login');
  meldung(text);
  $('login-name').focus();
}

async function nachLogin() {
  try {
    ich = await aufruf('org_ich');
  } catch (fehler) {
    fehlerAnzeigen(fehler);
    return;
  }
  $('wer').textContent = `Angemeldet als ${ich.anzeigename}`;
  $('nav-organisatoren').hidden = !ich.ist_hauptadmin;
  await zeigeListe();
}

async function login(ereignis) {
  ereignis.preventDefault();
  meldung('');
  const name = $('login-name').value;
  const passwort = $('login-passwort').value;
  if (!name.trim() || !passwort) return meldung('Bitte Benutzername und Passwort eingeben.');
  $('login-knopf').disabled = true;
  try {
    await sitzung.login(name, passwort);
    $('login-passwort').value = '';
    await nachLogin();
  } catch (fehler) {
    meldung(fehler.status === 429 ? 'Zu viele Versuche. Bitte warte einige Minuten.'
      : fehler.message === 'KEINE_VERBINDUNG' ? fehlerText('KEINE_VERBINDUNG')
        : 'Benutzername oder Passwort ist falsch.');
  } finally {
    $('login-knopf').disabled = false;
  }
}

// ---------------------------------------------------------------- Registrierung

async function zeigeRegistrierung(code) {
  einladungsCode = code;
  zeigeAnsicht('registrieren');
  try {
    const r = await rpc('einladung_pruefen', { p_code: code });
    if (!r.gueltig) {
      $('reg-form').hidden = true;
      meldung('Dieser Einladungslink ist ungültig, abgelaufen oder wurde schon benutzt. Bitte frag nach einem neuen.');
      return;
    }
    $('reg-einladung').textContent = `Eingeladen von ${r.eingeladen_von}.`;
  } catch (fehler) {
    meldung(fehlerText(fehler.message));
  }
}

async function registrierenAbsenden(ereignis) {
  ereignis.preventDefault();
  meldung('');
  const anzeigename = $('reg-anzeigename').value.trim();
  const name = $('reg-name').value.trim().toLowerCase();
  const passwort = $('reg-passwort').value;
  if (!anzeigename) return meldung('Bitte deinen Namen eingeben.');
  if (!BENUTZERNAME.test(name)) {
    return meldung('Der Benutzername darf nur Kleinbuchstaben, Ziffern, Punkt und Bindestrich enthalten (2–30 Zeichen).');
  }
  if (passwort.length < 10) return meldung('Das Passwort muss mindestens 10 Zeichen lang sein.');
  if (passwort !== $('reg-passwort2').value) return meldung('Die beiden Passwörter stimmen nicht überein.');
  $('reg-knopf').disabled = true;
  try {
    await registrieren(sitzung.emailFuer(name), passwort, { einladung: einladungsCode, anzeigename });
    await sitzung.login(name, passwort);
    window.history.replaceState(null, '', window.location.pathname);
    einladungsCode = null;
    await nachLogin();
  } catch (fehler) {
    meldung(fehler.message === 'user_already_exists' || fehler.message === 'email_exists'
      ? 'Diesen Benutzernamen gibt es schon. Bitte wähle einen anderen.'
      : fehler.message === 'weak_password' ? 'Das Passwort ist zu schwach. Bitte wähle ein längeres.'
        : fehler.message === 'KEINE_VERBINDUNG' ? fehlerText('KEINE_VERBINDUNG')
          : 'Registrierung fehlgeschlagen. Die Einladung ist eventuell abgelaufen oder schon benutzt.');
  } finally {
    $('reg-knopf').disabled = false;
  }
}

// ---------------------------------------------------------------- Umfrageliste

async function zeigeListe() {
  meldung('');
  zeigeAnsicht('liste');
  let umfragen;
  try {
    umfragen = await aufruf('org_umfragen');
  } catch (fehler) {
    fehlerAnzeigen(fehler);
    return;
  }
  const liste = $('umfragen');
  liste.replaceChildren();
  if (!umfragen.length) liste.append(element('li', 'klein', 'Noch keine Umfrage. Lege oben die erste an.'));
  for (const u of umfragen) {
    const karte = element('li', 'karte');
    const frist = u.offen ? `Frist ${zeitpunkt(u.frist)}` : 'Frist abgelaufen';
    const aktionen = element('div', 'karte-aktionen');
    aktionen.append(knopf('Öffnen', 'klein-knopf', () => oeffneUmfrage(u.id)));
    karte.append(
      element('p', 'karte-name', u.titel),
      element('p', 'karte-status', `${u.jahr} · ${landName(u.bundesland)} · ${u.abgegeben} von ${u.mitarbeiter} haben abgegeben · ${frist}`),
      aktionen,
    );
    liste.append(karte);
  }
}

async function oeffneUmfrage(id) {
  meldung('');
  zeigeAnsicht('umfrage');
  await zeigeUmfrage(id);
}

async function umfrageAnlegen(ereignis) {
  ereignis.preventDefault();
  meldung('');
  const jahr = Number($('neu-jahr').value);
  try {
    const id = await aufruf('org_umfrage_anlegen', {
      p_titel: $('neu-titel').value.trim() || `Urlaubswünsche ${jahr}`,
      p_jahr: jahr,
      p_bundesland: $('neu-land').value,
    });
    $('neu-titel').value = '';
    await oeffneUmfrage(id);
  } catch (fehler) {
    fehlerAnzeigen(fehler);
  }
}

// ---------------------------------------------------------------- Konto

function zeigeKonto() {
  meldung('');
  $('einladung-ergebnis').hidden = true;
  zeigeAnsicht('konto');
}

async function einladen() {
  meldung('');
  try {
    const r = await aufruf('org_einladung_erstellen');
    $('einladung-link').textContent = `${r.link} (gültig bis ${zeitpunkt(r.gueltig_bis)})`;
    const kopierKnopf = knopf('Link kopieren', 'zweitrangig klein-knopf', () => kopieren(r.link, kopierKnopf));
    $('einladung-aktionen').replaceChildren(kopierKnopf, whatsappLink(
      `Hallo, hier ist deine Einladung als Organisator für die Urlaubsumfragen. Der Link ist 7 Tage gültig und nur einmal verwendbar:\n${r.link}`));
    $('einladung-ergebnis').hidden = false;
  } catch (fehler) {
    fehlerAnzeigen(fehler);
  }
}

async function passwortAendernAbsenden(ereignis) {
  ereignis.preventDefault();
  meldung('');
  const passwort = $('pw-neu').value;
  if (passwort.length < 10) return meldung('Das Passwort muss mindestens 10 Zeichen lang sein.');
  if (passwort !== $('pw-neu2').value) return meldung('Die beiden Passwörter stimmen nicht überein.');
  try {
    await passwortAendern(await sitzung.token(), passwort);
    $('pw-neu').value = '';
    $('pw-neu2').value = '';
    meldung('Passwort geändert.');
  } catch (fehler) {
    meldung(fehler.message === 'same_password' ? 'Das ist schon dein aktuelles Passwort.'
      : fehler.message === 'weak_password' ? 'Das Passwort ist zu schwach. Bitte wähle ein längeres.'
        : fehlerText(fehler.message));
  }
}

// ---------------------------------------------------------------- Organisatoren (Hauptadmin)

async function zeigeOrganisatoren() {
  meldung('');
  zeigeAnsicht('organisatoren');
  let liste;
  try {
    liste = await aufruf('haupt_organisatoren');
  } catch (fehler) {
    fehlerAnzeigen(fehler);
    return;
  }
  $('organisatoren').replaceChildren(...liste.map((o) => {
    const karte = element('li', 'karte');
    const rolle = o.ist_hauptadmin ? ' · Hauptadmin' : '';
    const status = [`${o.anzahl_umfragen} Umfrage(n)`, `eingeladen von ${o.eingeladen_von || '–'}`,
      `seit ${zeitpunkt(o.angelegt_am)}`].join(' · ');
    karte.append(
      element('p', 'karte-name', `${o.anzeigename} (${o.benutzername})${rolle}`),
      element('p', o.gesperrt ? 'karte-status offen' : 'karte-status', o.gesperrt ? `GESPERRT · ${status}` : status),
    );
    if (!o.ich) {
      const aktionen = element('div', 'karte-aktionen');
      aktionen.append(knopf(o.gesperrt ? 'Entsperren' : 'Sperren',
        o.gesperrt ? 'zweitrangig klein-knopf' : 'gefahr klein-knopf', async () => {
          if (!o.gesperrt && !window.confirm(`${o.anzeigename} sperren?\n\nDie Person kann sich dann nicht mehr anmelden. Ihre Umfragen und Mitarbeiter-Links bleiben bestehen.`)) return;
          try {
            await aufruf('haupt_sperren', { p_user_id: o.user_id, p_gesperrt: !o.gesperrt });
            await zeigeOrganisatoren();
          } catch (fehler) {
            fehlerAnzeigen(fehler);
          }
        }));
      karte.append(aktionen);
    }
    return karte;
  }));
}

// ---------------------------------------------------------------- Start

function start() {
  const jetzt = new Date().getFullYear();
  fuelleJahre($('neu-jahr'), jetzt, jetzt + 3, jetzt + 1);
  fuelleLaender($('neu-land'), 'BY');
  $('neu-jahr').addEventListener('change', () => {
    $('neu-titel').placeholder = `Urlaubswünsche ${$('neu-jahr').value}`;
  });
  $('neu-titel').placeholder = `Urlaubswünsche ${jetzt + 1}`;

  $('login-form').addEventListener('submit', login);
  $('reg-form').addEventListener('submit', registrierenAbsenden);
  $('neu-umfrage-form').addEventListener('submit', umfrageAnlegen);
  $('einladen').addEventListener('click', einladen);
  $('passwort-form').addEventListener('submit', passwortAendernAbsenden);
  $('abmelden').addEventListener('click', () => abmelden(''));
  for (const b of document.querySelectorAll('[data-ziel]')) {
    b.addEventListener('click', () => {
      if (b.dataset.ziel === 'liste') zeigeListe();
      if (b.dataset.ziel === 'konto') zeigeKonto();
      if (b.dataset.ziel === 'organisatoren') zeigeOrganisatoren();
    });
  }
  initUmfrage({ aufruf, fehlerAnzeigen, zurueck: zeigeListe });

  const einladung = window.location.hash.match(/einladung=([0-9a-f]{32})/);
  if (einladung) {
    sitzung.logout();
    zeigeRegistrierung(einladung[1]);
  } else if (sitzung.istAngemeldet()) {
    nachLogin();
  } else {
    abmelden('');
  }
}

start();
```

- [ ] **Step 10: `docs/admin-umfrage.js` anlegen:**

```js
// Verwaltung: Detailansicht einer Umfrage (Mitarbeiter, Wochen, Einstellungen, Excel).
import {
  $, meldung, knopf, element, whatsappLink, kopieren, fuelleJahre, fuelleLaender, datumDeutsch,
} from './admin-hilfe.js';
import { zeitpunkt, MONATE } from './logik.js';
import { personenZeilen, wochenZeilen, excelBlaetter, regelHinweis } from './auswertung.js';
import { erzeugeXlsx } from './xlsx.js';

let ctx = null;      // { aufruf, fehlerAnzeigen, zurueck }
let daten = null;    // Antwort von org_umfrage
let umfrageId = null;

export function initUmfrage(kontext) {
  ctx = kontext;
  $('zurueck').addEventListener('click', () => ctx.zurueck());
  $('neu-form').addEventListener('submit', mitarbeiterAnlegen);
  $('einstellungen-form').addEventListener('submit', einstellungenSpeichern);
  $('frei-form').addEventListener('submit', freienTagHinzufuegen);
  $('excel').addEventListener('click', excelHerunterladen);
  $('umfrage-loeschen').addEventListener('click', umfrageLoeschen);
  for (const b of document.querySelectorAll('[data-reiter]')) {
    b.addEventListener('click', () => zeigeReiter(b.dataset.reiter));
  }
  $('e-monate').replaceChildren(...MONATE.map((name, i) => {
    const label = element('label', 'monat-wahl');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.value = String(i + 1);
    label.append(box, document.createTextNode(` ${name}`));
    return label;
  }));
}

export async function zeigeUmfrage(id) {
  umfrageId = id;
  daten = null;
  zeigeReiter('personen');
  await laden();
}

async function laden() {
  try {
    daten = await ctx.aufruf('org_umfrage', { p_umfrage_id: umfrageId });
  } catch (fehler) {
    ctx.fehlerAnzeigen(fehler);
    if (fehler.message === 'UMFRAGE_NICHT_GEFUNDEN') ctx.zurueck();
    return;
  }
  zeichne();
}

async function aktion(funktion, parameter, danach = null) {
  meldung('');
  try {
    await ctx.aufruf(funktion, parameter);
    await laden();
    if (danach) meldung(danach);
    return true;
  } catch (fehler) {
    ctx.fehlerAnzeigen(fehler);
    return false;
  }
}

function zeigeReiter(name) {
  for (const b of document.querySelectorAll('[data-reiter]')) {
    b.setAttribute('aria-selected', String(b.dataset.reiter === name));
    $(`reiter-${b.dataset.reiter}`).hidden = b.dataset.reiter !== name;
  }
  if (name === 'einstellungen' && daten) einstellungenFuellen();
  meldung('');
}

// ---------------------------------------------------------------- Anzeige

function zeichne() {
  const e = daten.einstellungen;
  const personen = personenZeilen(daten);
  $('u-titel').textContent = `${e.titel} (${e.jahr})`;
  $('kennzahl').textContent = `${personen.filter((p) => p.abgegeben).length} von ${personen.length} haben abgegeben`;
  $('frist-anzeige').textContent = e.offen
    ? `Abgabe möglich bis ${zeitpunkt(e.frist)}`
    : `Frist abgelaufen am ${zeitpunkt(e.frist)} – nur noch Ansehen möglich`;
  zeichnePersonen(personen);
  zeichneWochen();
  if (!$('reiter-einstellungen').hidden) einstellungenFuellen();
}

function zeichnePersonen(personen) {
  const liste = $('personen');
  liste.replaceChildren();
  if (!personen.length) liste.append(element('li', 'klein', 'Noch keine Mitarbeiter angelegt.'));
  for (const p of personen) {
    const karte = element('li', 'karte');
    karte.append(element('p', 'karte-name', p.name));
    karte.append(element('p', p.abgegeben ? 'karte-status ok' : 'karte-status offen', p.abgegeben
      ? `${p.wochen} · ${p.urlaubstage} Urlaubstage · Stand ${p.stand}`
      : 'Noch nicht abgegeben'));
    if (p.regelverstoss) karte.append(element('p', 'karte-warnung', `⚠ ${regelHinweis(p.regelverstoss)}`));
    const aktionen = element('div', 'karte-aktionen');
    const kopierKnopf = knopf('Link kopieren', 'zweitrangig klein-knopf', () => kopieren(p.link, kopierKnopf));
    aktionen.append(
      kopierKnopf,
      whatsappLink(`Hallo ${p.name}, hier ist dein persönlicher Link für „${daten.einstellungen.titel}“. `
        + `Bitte nicht weitergeben – über diesen Link kann man deine Wünsche ändern:\n${p.link}`),
      knopf('Neuer Link', 'zweitrangig klein-knopf', () => {
        if (!window.confirm(`Neuen Link für ${p.name} erzeugen?\n\nDer bisherige Link funktioniert dann nicht mehr. `
          + 'Die bisherige Abgabe bleibt erhalten. Den neuen Link musst du erneut verschicken.')) return;
        aktion('org_link_erneuern', { p_mitarbeiter_id: p.id });
      }),
      knopf('Löschen', 'gefahr klein-knopf', () => {
        if (!window.confirm(`${p.name} wirklich löschen?\n\nDie Abgabe wird ebenfalls gelöscht und der Link funktioniert nicht mehr.`)) return;
        aktion('org_mitarbeiter_loeschen', { p_mitarbeiter_id: p.id });
      }),
    );
    karte.append(aktionen);
    liste.append(karte);
  }
}

function zeichneWochen() {
  const zeilen = wochenZeilen(daten);
  const max = Math.max(1, ...zeilen.map((w) => w.anzahl));
  $('wochen').replaceChildren(...zeilen.map((w) => {
    const tr = document.createElement('tr');
    if (w.anzahl > 0 && w.anzahl >= Math.max(2, max * 0.75)) tr.className = 'viel';
    for (const wert of [`KW ${w.kw}`, w.zeitraum + (w.feiertag ? ` (${w.feiertag})` : ''), w.anzahl, w.namen]) {
      tr.append(element('td', null, String(wert)));
    }
    return tr;
  }));
}

function einstellungenFuellen() {
  const e = daten.einstellungen;
  const jetzt = new Date().getFullYear();
  $('e-titel').value = e.titel;
  fuelleJahre($('e-jahr'), Math.min(e.jahr, jetzt), Math.max(e.jahr, jetzt + 3), e.jahr);
  fuelleLaender($('e-land'), e.bundesland);
  $('e-arbeitstage').value = String(e.arbeitstage_pro_woche);
  for (const id of ['e-jahr', 'e-land', 'e-arbeitstage']) $(id).disabled = !e.grunddaten_aenderbar;
  $('e-grunddaten-hinweis').hidden = e.grunddaten_aenderbar;
  $('e-urlaubstage').value = String(e.urlaubstage);
  $('e-min').value = String(e.min_wochen);
  $('e-max').value = String(e.max_wochen);
  $('e-stueck').value = String(e.max_am_stueck);
  for (const box of $('e-monate').querySelectorAll('input')) box.checked = e.gesperrte_monate.includes(Number(box.value));
  $('e-hinweis').value = e.sperr_hinweis;
  $('e-frist').value = e.frist_eingabe;
  $('freie-tage').replaceChildren(...daten.freie_tage.map((f) => {
    const li = element('li', 'karte');
    li.append(element('p', 'karte-name', `${datumDeutsch(f.datum)} – ${f.name}`));
    const aktionen = element('div', 'karte-aktionen');
    aktionen.append(knopf('Entfernen', 'gefahr klein-knopf',
      () => aktion('org_freien_tag_entfernen', { p_umfrage_id: umfrageId, p_datum: f.datum })));
    li.append(aktionen);
    return li;
  }));
  $('frei-datum').min = `${e.jahr}-01-01`;
  $('frei-datum').max = `${e.jahr}-12-31`;
}

// ---------------------------------------------------------------- Aktionen

async function mitarbeiterAnlegen(ereignis) {
  ereignis.preventDefault();
  const feld = $('neu-name');
  if (await aktion('org_mitarbeiter_anlegen', { p_umfrage_id: umfrageId, p_name: feld.value })) feld.value = '';
  feld.focus();
}

async function einstellungenSpeichern(ereignis) {
  ereignis.preventDefault();
  const e = daten.einstellungen;
  const p = {
    titel: $('e-titel').value,
    urlaubstage: Number($('e-urlaubstage').value),
    min_wochen: Number($('e-min').value),
    max_wochen: Number($('e-max').value),
    max_am_stueck: Number($('e-stueck').value),
    gesperrte_monate: [...$('e-monate').querySelectorAll('input:checked')].map((b) => Number(b.value)),
    sperr_hinweis: $('e-hinweis').value,
    frist: $('e-frist').value,
  };
  if (e.grunddaten_aenderbar) {
    Object.assign(p, {
      jahr: Number($('e-jahr').value),
      bundesland: $('e-land').value,
      arbeitstage_pro_woche: Number($('e-arbeitstage').value),
    });
  }
  await aktion('org_umfrage_speichern', { p_umfrage_id: umfrageId, p_daten: p }, 'Einstellungen gespeichert.');
}

async function freienTagHinzufuegen(ereignis) {
  ereignis.preventDefault();
  const ok = await aktion('org_freien_tag_hinzufuegen', {
    p_umfrage_id: umfrageId, p_datum: $('frei-datum').value || null, p_name: $('frei-name').value,
  });
  if (ok) {
    $('frei-datum').value = '';
    $('frei-name').value = '';
  }
}

async function umfrageLoeschen() {
  const titel = daten?.einstellungen.titel || '';
  if (!window.confirm(`„${titel}“ mit allen Mitarbeitern und Abgaben endgültig löschen?\n\nAlle Links dieser Umfrage funktionieren danach nicht mehr.`)) return;
  meldung('');
  try {
    await ctx.aufruf('org_umfrage_loeschen', { p_umfrage_id: umfrageId });
    ctx.zurueck();
  } catch (fehler) {
    ctx.fehlerAnzeigen(fehler);
  }
}

function excelHerunterladen() {
  if (!daten) return;
  const blob = new Blob([erzeugeXlsx(excelBlaetter(daten))],
    { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const heute = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date());
  const name = daten.einstellungen.titel.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'Umfrage';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${name}_Stand-${heute}.xlsx`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}
```

- [ ] **Step 11: Stile ergänzen** – in `docs/style.css`:

Die Regel `.feld input, .feld textarea {` ersetzen durch `.feld input, .feld textarea, .feld select {` und die Fokus-Regel `.feld input:focus, .feld textarea:focus {` durch `.feld input:focus, .feld textarea:focus, .feld select:focus {`. Ans Dateiende anfügen:

```css
.navigation { display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; }
.navigation [hidden] { display: none; }
.karte-warnung { margin: 0 0 10px; font-size: 0.92rem; color: var(--fehler-rand); font-weight: 600; }
.monate-wahl { border: 0; padding: 0; margin: 0; }
.monate-wahl legend { font-weight: 600; padding: 0 0 6px; }
.monate-raster { display: grid; grid-template-columns: repeat(auto-fill, minmax(8.5rem, 1fr)); gap: 6px 12px; }
.monat-wahl { display: flex; align-items: center; gap: 6px; font-weight: 400; min-height: 32px; }
.monat-wahl input { width: 20px; height: 20px; accent-color: var(--akzent); }
.link-anzeige { word-break: break-all; font-size: 0.92rem; }
#zurueck { margin-top: 12px; }
#umfrage-loeschen { width: auto; padding: 0 18px; margin: 8px 0 32px; }
.feld select:disabled { opacity: 0.6; }
@media (max-width: 30rem) { .kopf-admin { flex-direction: column; } .navigation { justify-content: flex-start; } }
```

- [ ] **Step 12: Tests laufen lassen**

Run: `npm test`
Expected: PASS.

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "Verwaltung: mehrere Umfragen, Registrierung per Einladung, Konto, Organisatoren

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Hinweis: Die Browser-Prüfung dieser Oberfläche (Durchklicken mit lokalem Supabase-Ersatz) übernimmt der Controller nach Task 8; der Implementierer muss sie nicht ausführen.

---

### Task 8: Anleitung und README

**Files:**
- Rewrite: `ANLEITUNG.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: Verhalten aus Task 1–7.

- [ ] **Step 1: `ANLEITUNG.md` ersetzen** durch:

````markdown
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

1. Supabase → **SQL Editor** → „New query“ → kompletten Inhalt von `supabase/schema.sql`
   einfügen → **Run**. Erwartet: „Success. No rows returned“.
   Die bisherige Umfrage wird dabei zu „Urlaubswünsche 2027“; alle Mitarbeiter-Links
   bleiben gültig; das Konto `aw` wird Hauptadmin.
2. Supabase → **Authentication** → **Sign In / Providers**:
   - **Allow new users to sign up: an** (nötig für Einladungen – die Datenbank lehnt
     jede Registrierung ohne gültige Einladung ab)
   - **Confirm email: aus** (es werden keine E-Mails verschickt)
   - **Allow anonymous sign-ins: aus**
   - **Save changes**
3. Neue Konten entstehen **nur noch über Einladungslinks**. „Add user“ im Supabase-
   Dashboard funktioniert dafür nicht mehr.

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
````

- [ ] **Step 2: `README.md` anpassen** – den ersten Absatz ersetzen durch:

```markdown
Kleine Web-App, in der Mitarbeiter über einen persönlichen Link ihre Urlaubswochen
wünschen. Organisatoren legen eigene Umfragen an (Jahr, Bundesland, Urlaubstage,
Wochen- und „am Stück“-Grenzen, gesperrte Monate) und laden weitere Organisatoren
per Einladungslink ein. Einrichtung und Bedienung: [ANLEITUNG.md](ANLEITUNG.md).
```

In der Tabelle die Zeile zu `docs/` ersetzen durch:

```markdown
| `docs/` | Statische Seite (GitHub Pages): `index.html` für Mitarbeiter, `admin.html` für die Verwaltung (Organisatoren) |
```

und den Absatz „Sicherheitsprinzip“ ersetzen durch:

```markdown
Sicherheitsprinzip: Tabellen liegen im Schema `urlaub`, auf das die Rollen `anon`
und `authenticated` keinen Zugriff haben. Der Browser ruft nur `SECURITY DEFINER`-
Funktionen in `public` auf: `urlaub_*` (Mitarbeiter-Code), `einladung_pruefen`,
`org_*` (nur eigene Umfragen), `haupt_*` (nur Hauptadmin). Registrierungen ohne
gültige Einladung lehnt ein Trigger auf `auth.users` ab.
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "Anleitung und README für mehrere Umfragen

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Nach den Tasks (Controller, nicht Teil eines Implementierer-Tasks)

1. Gesamt-Review des Branches (Sicherheit zuerst).
2. Browser-Durchlauf mit lokalem Supabase-Ersatz (PGlite + Auth-Nachbildung): Mitarbeiter-Seite inkl. „am Stück“-Sperre; Verwaltung: Login, Umfrage anlegen, Einstellungen, freie Tage, Mitarbeiter, Excel, Einladung, Registrierung, Organisatoren, Sperren; Handy- und PC-Breite.
3. Mit dem User: `schema.sql` im Supabase SQL Editor ausführen, Auth-Einstellungen umstellen.
4. Live-Tests mit dem Browser-Schlüssel: kein Tabellenzugriff, Registrierung ohne Einladung abgelehnt, Testumfrage komplett durchspielen und wieder löschen.
5. Push und Prüfung der Seite auf GitHub Pages.
