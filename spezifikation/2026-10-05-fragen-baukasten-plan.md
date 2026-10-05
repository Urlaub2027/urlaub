# Fragen-Baukasten – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Organisatoren bauen Umfragen aus Fragen (10 Typen) mit Antwortmöglichkeiten, Prüfregeln und Sichtbarkeits-Bedingungen, alles einzeln schaltbar; die Wochenauswahl wird der Fragetyp „Urlaubswochen“.

**Architecture:** Neue Tabellen `urlaub.fragen`, `optionen`, `regeln`, `bedingungen`, `antworten`, `antwort_optionen` im gesperrten Schema `urlaub`. Die Datenbank wertet Sichtbarkeit und Regeln selbst aus (`urlaub.pruefe_antworten`); der Browser wertet nur die Sichtbarkeit zusätzlich aus (`docs/formular-logik.js`), abgesichert durch gemeinsame Testfälle (`tests/fixtures/sichtbarkeit-faelle.json`). `supabase/schema.sql` bleibt eine Datei für Neuinstallation und Umstellung von Stand 2.

**Tech Stack:** PostgreSQL (Supabase PG 15/17), PL/pgSQL, ES-Module ohne Bibliotheken, Node 24 `node:test` + PGlite, Python/openpyxl für den Excel-Test.

**Spec:** `spezifikation/2026-10-05-fragen-baukasten-design.md`

**Hinweis zur Planform:** Datenbankteile (Task 1–2) enthalten den vollständigen Code. Für die Editor-Funktionen (Task 3) und die Oberflächen (Task 5–6) legt der Plan Verhalten, Schnittstellen, DOM-IDs und **vollständige Tests** fest; den Code schreibt der Implementierer. Die Tests sind dort die verbindliche Spezifikation.

## Global Constraints

- Jede Funktion: `set search_path = ''`, alle Namen voll qualifiziert (`urlaub.…`, `public.…`, `auth.uid()`).
- `security definer` nur für Funktionen in `public` und für den Trigger `urlaub.neuer_benutzer`.
- Jede Funktion in `public`: `revoke all … from public, anon, authenticated`, danach nur die nötigen `grant execute`. Am Dateiende `revoke all on all tables/functions in schema urlaub …` und `commit;`.
- `schema.sql` beginnt mit `begin;`, endet mit `commit;` und läuft mehrfach hintereinander fehlerfrei (neu und umgestellt).
- Ändern sich Parameter einer bestehenden `public`-Funktion, wird die alte Fassung ausdrücklich mit `drop function if exists` entfernt.
- Organisator-Funktionen prüfen Besitz über `urlaub.ich()` / `urlaub.eigene_umfrage()` bzw. die neuen `urlaub.eigene_frage()`, `urlaub.eigene_option()`, `urlaub.eigene_bedingung()`; fremde und nicht vorhandene Objekte sind nicht unterscheidbar.
- Fehler an den Browser nur als `raise exception '<CODE>'`. Zulässige Codes (bisherige plus neue): `LINK_UNGUELTIG, FRIST_ABGELAUFEN, KEINE_WOCHE, UNGUELTIGE_WOCHE, DOPPELTE_WOCHE, ZU_WENIGE_WOCHEN, ZU_VIELE_WOCHEN, ZU_VIELE_AM_STUECK, ZU_VIELE_TAGE, KEIN_ZUGRIFF, UMFRAGE_NICHT_GEFUNDEN, MITARBEITER_NICHT_GEFUNDEN, NAME_LEER, NAME_DOPPELT, TITEL_LEER, FRIST_LEER, GRUNDDATEN_GESPERRT, UNGUELTIGE_EINSTELLUNG, DATUM_FALSCHES_JAHR, NICHT_SELBST, NICHT_GEFUNDEN, EINLADUNG_FEHLT, EINLADUNG_UNGUELTIG, HAUPTADMIN_NICHT_SPERRBAR, ANTWORTEN_UNGUELTIG, PFLICHT, UNGUELTIGE_ANTWORT, ZU_WENIGE_ANTWORTEN, ZU_VIELE_ANTWORTEN, ZAHL_ZU_KLEIN, ZAHL_ZU_GROSS, TEXT_ZU_LANG, DATUM_ZU_FRUEH, DATUM_ZU_SPAET, FRAGE_NICHT_GEFUNDEN, OPTION_NICHT_GEFUNDEN, BEDINGUNG_NICHT_GEFUNDEN, URLAUBSWOCHEN_DOPPELT, TYP_GESPERRT, HAT_ANTWORTEN, BEDINGUNG_VERWEIST, REIHENFOLGE_BEDINGUNG, REGEL_UNPASSEND, BEDINGUNG_UNGUELTIG, FRAGETEXT_LEER`.
- `ANTWORTEN_UNGUELTIG` trägt die Fehler pro Frage als JSON-Objekt `{"<frage_id>": "<CODE>"}` im `detail` der Exception (PostgREST liefert es als `details`).
- Browser-Code: keine externen Ressourcen, kein `innerHTML`, alle Texte über `textContent`; CSP in den HTML-Dateien unverändert.
- Oberfläche Deutsch, Handy zuerst.
- Mitarbeiter-Links (`#<32 hex>`) bleiben gültig; `public.urlaub_laden(text)` behält Namen und Parameter.
- Commit-Nachrichten Deutsch, enden mit `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `npm test` muss am Ende jedes Tasks grün sein, außer wo ein Task ausdrücklich eine alte Testdatei als „bis Task N rot“ benennt.

## Review Focus

1. **Bedingung zeigt auf eine ausgeschaltete oder unsichtbare Frage** → Zielfrage unsichtbar, ihre Antwort wird verworfen, Pflicht greift nicht (Task 2 Test „Kette über ausgeschaltete Quelle“).
2. **Organisator löscht eine Frage/Antwortmöglichkeit, die beantwortet oder in einer Bedingung verwendet ist** → `HAT_ANTWORTEN` bzw. `BEDINGUNG_VERWEIST`, nichts gelöscht (Task 3).
3. **Verschieben einer Frage vor ihre Quellfrage** → `REIHENFOLGE_BEDINGUNG`, Reihenfolge unverändert (Task 3).
4. **Manipulierte Absendung** (fremde Frage-ID, ausgeschaltete Antwortmöglichkeit, falscher JSON-Typ, Antwort auf Hinweistext) → abgelehnt bzw. verworfen, nie gespeichert (Task 2).
5. **Umfrage löschen mit Antworten** → alles weg, kein Fremdschlüsselfehler (Task 3 Test „Umfrage löschen mit Antworten“).

## Dateistruktur

| Datei | Verantwortung |
|---|---|
| `supabase/schema.sql` | Datenbank Stand 3 inkl. Umstellung von Stand 2 |
| `tests/fixtures/schema-v2.sql` | eingefrorener Stand 2 (live) |
| `tests/fixtures/sichtbarkeit-faelle.json` | gemeinsame Sichtbarkeits-Testfälle (SQL und Browser) |
| `tests/helfer.mjs` | PGlite-Aufbau, Rollen, Hilfen zum Anlegen |
| `tests/umfrage-bauer.mjs` | baut Umfragen aus der Fixture-Beschreibung in PGlite |
| `tests/kalender.test.mjs` | Kalender/Feiertage |
| `tests/umstellung.test.mjs` | Umstellung Stand 2 → 3 |
| `tests/datenbank.test.mjs` | Prüfung und Absenden aller Fragetypen |
| `tests/sichtbarkeit.test.mjs` | Fixture gegen SQL und gegen `docs/formular-logik.js` |
| `tests/admin.test.mjs` | Organisator-Funktionen Umfrage/Mitarbeiter/Trennung |
| `tests/editor.test.mjs` | Editor-Funktionen Fragen/Optionen/Regeln/Bedingungen/Kopieren |
| `tests/einladung.test.mjs` | unverändert |
| `tests/logik.test.mjs`, `tests/auswertung.test.mjs`, `tests/excel.test.mjs` | Browser-Logik |
| `docs/formular-logik.js` | Sichtbarkeit, Leere-Prüfung, Fehlertexte (rein, testbar) |
| `docs/formular.js` | baut das Formular ins DOM (Mitarbeiter-Seite und Vorschau) |
| `docs/app.js`, `docs/index.html` | Mitarbeiter-Seite |
| `docs/admin-fragen.js` | Reiter „Fragen“ (Editor, Vorschau) |
| `docs/admin-umfrage.js`, `docs/admin.html` | Umfrage-Ansicht mit Reitern |
| `docs/auswertung.js` | Zusammenfassungen und Excel-Blätter (rein, testbar) |
| `ANLEITUNG.md`, `README.md` | Doku |

---

### Task 1: Datenmodell Stand 3, Kalender, Umstellung von Stand 2

**Files:**
- Create: `tests/fixtures/schema-v2.sql` (Kopie des heutigen `supabase/schema.sql`)
- Modify: `supabase/schema.sql`
- Modify: `tests/helfer.mjs`, `tests/kalender.test.mjs`
- Rewrite: `tests/umstellung.test.mjs`, `tests/admin.test.mjs`
- Remove: `tests/fixtures/schema-v1.sql` (per `git rm`; wird das verweigert, im Report vermerken und Datei stehen lassen)
- `tests/datenbank.test.mjs` testet die alten Mitarbeiter-Funktionen und ist **bis Task 2 rot**; Task 2 ersetzt sie durch `tests/antworten.test.mjs` und entfernt die alte Datei.

**Interfaces:**
- Produces (Tabellen): `urlaub.umfragen(id, organisator_id, titel, frist, angelegt_am)`; `urlaub.fragen(id, umfrage_id, position, typ, text, hilfetext, aktiv, verknuepfung, jahr, bundesland, arbeitstage_pro_woche, sperr_hinweis, skala_von, skala_bis, skala_links, skala_rechts)`; `urlaub.optionen(id, frage_id, position, text, aktiv)`; `urlaub.regeln(id, frage_id, art, wert jsonb, aktiv)`; `urlaub.bedingungen(id, frage_id, quelle_id, operator, werte jsonb, aktiv)`; `urlaub.abgaben(mitarbeiter_id, geaendert_am)`; `urlaub.antworten(mitarbeiter_id, frage_id, wert jsonb)`; `urlaub.antwort_optionen(mitarbeiter_id, frage_id, option_id)`.
- Produces (SQL): `urlaub.standard_urlaubsfrage(p_umfrage_id bigint, p_jahr int, p_bundesland text) → bigint` (Frage-ID); `urlaub.urlaubsfrage(p_umfrage_id bigint) → urlaub.fragen` (Zeile oder lauter null); `urlaub.kalender(bigint)` und `urlaub.kalender_json(bigint)` mit unveränderter Signatur, jetzt aus der Urlaubswochen-Frage.
- Produces (JS, `tests/helfer.mjs`): bisherige Exporte; `umfrageAnlegen(db, org, {titel, jahr, bundesland, frist})` legt zusätzlich die Standard-Urlaubsfrage an und gibt die Umfrage-ID zurück; neu `urlaubsfrageId(db, umfrageId) → id`; `SCHEMA_V2` statt `SCHEMA_V1`.
- Produces (`public`, angepasst, gleiche Signatur): `org_umfrage_anlegen(text,int,text)` (legt Standard-Urlaubsfrage an), `org_umfrage_speichern(bigint, jsonb)` (nur noch `titel`, `frist`), `org_umfragen()` (jahr/bundesland aus der Urlaubsfrage), `org_freien_tag_hinzufuegen` (Jahr aus der Urlaubsfrage), `org_umfrage(bigint)` vorläufig `{einstellungen:{id,titel,frist,frist_eingabe,offen}, freie_tage, mitarbeiter:[{id,name,link,geaendert_am}]}` (Task 3 erweitert).
- Removes: `public.urlaub_laden(text)` vorläufig (Task 2 legt sie neu an), `public.urlaub_speichern(text,int[])`, `urlaub.regelverstoss(bigint,int[])`, `urlaub.antwort(bigint)`, die Umstellung von Stand 1 und die `drop view`-Zeile für Stand 1.

- [ ] **Step 1: Stand 2 einfrieren, Stand-1-Fixture entfernen**

```bash
cp supabase/schema.sql tests/fixtures/schema-v2.sql
git rm -q tests/fixtures/schema-v1.sql
```

- [ ] **Step 2: `tests/helfer.mjs` anpassen**

`SCHEMA_V1` ersetzen durch:

```js
export const SCHEMA_V2 = readFileSync(new URL('./fixtures/schema-v2.sql', import.meta.url), 'utf8');
```

`umfrageAnlegen` ersetzen durch und `urlaubsfrageId` ergänzen:

```js
export async function umfrageAnlegen(db, organisatorId,
  { titel = 'Urlaubswünsche 2027', jahr = 2027, bundesland = 'BY', frist = "now() + interval '1 day'" } = {}) {
  const r = await db.query(
    `insert into urlaub.umfragen (organisator_id, titel, frist) values ($1, $2, ${frist}) returning id`,
    [organisatorId, titel]);
  const id = r.rows[0].id;
  await db.query('select urlaub.standard_urlaubsfrage($1, $2, $3)', [id, jahr, bundesland]);
  return id;
}

export async function urlaubsfrageId(db, umfrageId) {
  const r = await db.query("select id from urlaub.fragen where umfrage_id = $1 and typ = 'urlaubswochen'", [umfrageId]);
  return r.rows[0].id;
}
```

- [ ] **Step 3: `tests/kalender.test.mjs` anpassen**

Import um `urlaubsfrageId` erweitern. Im Test „5-Tage-Woche …“ die Zeile mit `update urlaub.umfragen set arbeitstage_pro_woche = 5` ersetzen durch:

```js
  await db.query('update urlaub.fragen set arbeitstage_pro_woche = 5 where id = $1', [await urlaubsfrageId(db, id)]);
```

Im Test „Zusätzliche freie Tage und gesperrte Monate …“ die Zeile mit `update urlaub.umfragen set gesperrte_monate = '{7,8}'` ersetzen durch:

```js
  await db.query("update urlaub.regeln set wert = '[7,8]' where art = 'gesperrte_monate' and frage_id = $1",
    [await urlaubsfrageId(db, id)]);
```

Am Dateiende anfügen:

```js
test('Ausgeschaltete Regel „gesperrte Monate“ sperrt nichts', async () => {
  const id = await umfrageAnlegen(db, chef);
  await db.query("update urlaub.regeln set aktiv = false where art = 'gesperrte_monate' and frage_id = $1",
    [await urlaubsfrageId(db, id)]);
  const k = await kalender(id);
  assert.equal(k.filter((w) => w.gesperrt).length, 0);
});

test('Umfrage ohne Urlaubswochen-Frage hat keinen Kalender', async () => {
  const r = await db.query("insert into urlaub.umfragen (organisator_id, titel, frist) values ($1, 'Ohne', now()) returning id", [chef]);
  assert.equal((await kalender(r.rows[0].id)).length, 0);
  const j = (await db.query('select urlaub.kalender_json($1) as j', [r.rows[0].id])).rows[0].j;
  assert.deepEqual(j, []);
});
```

- [ ] **Step 4: `tests/umstellung.test.mjs` vollständig ersetzen**

```js
// Umstellung Stand 2 (eine Wochenauswahl pro Umfrage) → Stand 3 (Fragen-Baukasten).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { neueDatenbank, als, SCHEMA, SCHEMA_V2 } from './helfer.mjs';

const AW = '11111111-1111-1111-1111-111111111111';
let db;
let umfrage;
let annaId;
let frist;

before(async () => {
  db = await neueDatenbank({ schema: false });
  await db.exec(SCHEMA_V2);
  await db.query(`insert into urlaub.organisatoren (user_id, anzeigename, benutzername, ist_hauptadmin)
                  values ($1, 'aw', 'aw', true)`, [AW]);
  umfrage = (await db.query(`insert into urlaub.umfragen
      (organisator_id, titel, jahr, bundesland, arbeitstage_pro_woche, urlaubstage, min_wochen, max_wochen,
       max_am_stueck, gesperrte_monate, sperr_hinweis, frist)
    values ($1, 'Urlaubswünsche 2027', 2027, 'HE', 5, 30, 2, 5, 2, '{7,12}', 'Sommer und Dezember zu.',
            '2026-11-30 23:59:59 Europe/Berlin') returning id`, [AW])).rows[0].id;
  await db.query("insert into urlaub.freie_tage (umfrage_id, datum, name) values ($1, '2027-08-09', 'Betriebsruhe')", [umfrage]);
  const m = await db.query("insert into urlaub.mitarbeiter (umfrage_id, name) values ($1, 'Anna'), ($1, 'Ben') returning id, name", [umfrage]);
  annaId = m.rows.find((x) => x.name === 'Anna').id;
  await db.query("insert into urlaub.abgaben (mitarbeiter_id, wochen, geaendert_am) values ($1, '{12,30}', '2026-10-01 10:00:00+00')", [annaId]);
  frist = (await db.query("select to_char(frist at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') as f from urlaub.umfragen")).rows[0].f;
  await db.exec(SCHEMA);
  await db.exec(SCHEMA); // zweites Mal: darf nichts verdoppeln
});

test('Umfrage behält Titel, Frist und freie Tage; alte Spalten sind weg', async () => {
  const u = (await db.query("select titel, to_char(frist at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') as f from urlaub.umfragen")).rows;
  assert.deepEqual(u, [{ titel: 'Urlaubswünsche 2027', f: frist }]);
  const spalten = (await db.query(`select column_name from information_schema.columns
    where table_schema = 'urlaub' and table_name = 'umfragen' order by column_name`)).rows.map((r) => r.column_name);
  assert.deepEqual(spalten, ['angelegt_am', 'frist', 'id', 'organisator_id', 'titel']);
  const abg = (await db.query(`select column_name from information_schema.columns
    where table_schema = 'urlaub' and table_name = 'abgaben' order by column_name`)).rows.map((r) => r.column_name);
  assert.deepEqual(abg, ['geaendert_am', 'mitarbeiter_id']);
  assert.equal((await db.query('select count(*)::int as n from urlaub.freie_tage')).rows[0].n, 1);
});

test('Genau eine Urlaubswochen-Frage mit den bisherigen Einstellungen', async () => {
  const f = (await db.query('select * from urlaub.fragen')).rows;
  assert.equal(f.length, 1);
  assert.equal(f[0].typ, 'urlaubswochen');
  assert.equal(f[0].position, 1);
  assert.equal(f[0].aktiv, true);
  assert.deepEqual([f[0].jahr, f[0].bundesland, f[0].arbeitstage_pro_woche, f[0].sperr_hinweis],
    [2027, 'HE', 5, 'Sommer und Dezember zu.']);
  const regeln = Object.fromEntries((await db.query('select art, wert, aktiv from urlaub.regeln order by art')).rows
    .map((r) => [r.art, [r.wert, r.aktiv]]));
  assert.deepEqual(regeln, {
    gesperrte_monate: [[7, 12], true],
    max_am_stueck: [2, true],
    max_urlaubstage: [30, true],
    max_wochen: [5, true],
    min_wochen: [2, true],
    pflicht: [null, true],
  });
});

test('Abgabe wird Antwort der Urlaubswochen-Frage, Zeitstempel bleibt', async () => {
  const a = (await db.query('select mitarbeiter_id, wert from urlaub.antworten')).rows;
  assert.equal(a.length, 1);
  assert.equal(Number(a[0].mitarbeiter_id), Number(annaId));
  assert.deepEqual(a[0].wert, [12, 30]);
  const z = (await db.query("select to_char(geaendert_am at time zone 'UTC', 'YYYY-MM-DD HH24:MI') as z from urlaub.abgaben")).rows;
  assert.deepEqual(z, [{ z: '2026-10-01 10:00' }]);
});

test('Kalender kommt aus der Frage', async () => {
  const k = (await db.query('select kw, arbeitstage, gesperrt, monat from urlaub.kalender($1) order by kw', [umfrage])).rows;
  assert.equal(k.length, 52);
  assert.ok(k.filter((w) => w.gesperrt).every((w) => w.monat === 7 || w.monat === 12));
  assert.ok(k.some((w) => w.gesperrt && w.monat === 7));
  assert.equal(k[0].arbeitstage, 5); // 5-Tage-Woche, KW 1 2027 in Hessen ohne Feiertag (Mo–Fr)
});

test('Organisator sieht die Umfrage wie vorher', async () => {
  const liste = (await als(db, 'authenticated', AW, 'select public.org_umfragen() as r'))[0].r;
  assert.equal(liste.length, 1);
  assert.equal(liste[0].jahr, 2027);
  assert.equal(liste[0].bundesland, 'HE');
  assert.equal(liste[0].mitarbeiter, 2);
  assert.equal(liste[0].abgegeben, 1);
});

test('Alte Funktionen sind entfernt', async () => {
  const alt = (await db.query(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname = 'public' and p.proname = 'urlaub_speichern')
       or (n.nspname = 'urlaub' and p.proname in ('regelverstoss', 'antwort'))`)).rows;
  assert.deepEqual(alt, []);
});
```

Hinweis: Den Erwartungswert `k[0].arbeitstage === 5` prüfen: KW 1 2027 ist 04.–10.01.; in Hessen ist der 06.01. kein Feiertag, also 5 Arbeitstage (Mo–Fr). Weicht das Ergebnis ab, die SQL-Logik prüfen, nicht die Erwartung anpassen.

- [ ] **Step 5: `tests/admin.test.mjs` vollständig ersetzen**

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
const umfrageVon = async (wer, id) => (await als(db, 'authenticated', wer, 'select public.org_umfrage($1) as r', [id]))[0].r;
async function neueUmfrage(wer, titel = 'Team A', jahr = 2027, land = 'BY') {
  return (await als(db, 'authenticated', wer, 'select public.org_umfrage_anlegen($1, $2, $3) as id', [titel, jahr, land]))[0].id;
}

test('org_ich liefert eigenes Profil', async () => {
  assert.deepEqual((await alsChef('select public.org_ich() as r')).r,
    { anzeigename: 'chef', benutzername: 'chef', ist_hauptadmin: true });
});

test('Umfrage anlegen: Standard-Frage „Urlaubswochen“ mit eingeschalteten Regeln', async () => {
  const id = await neueUmfrage(chef, '  Team A  ');
  const e = (await umfrageVon(chef, id)).einstellungen;
  assert.equal(e.titel, 'Team A');
  assert.equal(e.frist_eingabe, '2026-11-30T23:59');
  const f = (await db.query('select * from urlaub.fragen where umfrage_id = $1', [id])).rows;
  assert.equal(f.length, 1);
  assert.deepEqual([f[0].typ, f[0].jahr, f[0].bundesland, f[0].arbeitstage_pro_woche, f[0].aktiv],
    ['urlaubswochen', 2027, 'BY', 6, true]);
  const regeln = Object.fromEntries((await db.query('select art, wert, aktiv from urlaub.regeln where frage_id = $1', [f[0].id]))
    .rows.map((r) => [r.art, [r.wert, r.aktiv]]));
  assert.deepEqual(regeln, {
    pflicht: [null, true], min_wochen: [1, true], max_wochen: [6, true], max_am_stueck: [3, true],
    max_urlaubstage: [36, true], gesperrte_monate: [[12], true],
  });
  const liste = (await alsChef('select public.org_umfragen() as r')).r;
  const eintrag = liste.find((x) => x.id === Number(id));
  assert.deepEqual([eintrag.jahr, eintrag.bundesland, eintrag.mitarbeiter, eintrag.abgegeben], [2027, 'BY', 0, 0]);
});

test('Ungültige Angaben beim Anlegen', async () => {
  await assert.rejects(neueUmfrage(chef, '   '), /TITEL_LEER/);
  await assert.rejects(neueUmfrage(chef, 'X', 2027, 'XX'), /UNGUELTIGE_EINSTELLUNG/);
  await assert.rejects(neueUmfrage(chef, 'X', 1999), /UNGUELTIGE_EINSTELLUNG/);
  await assert.rejects(neueUmfrage(chef, 'X', null), /UNGUELTIGE_EINSTELLUNG/);
});

test('Einstellungen der Umfrage: nur Titel und Frist', async () => {
  const id = await neueUmfrage(chef);
  const speichern = (d) => alsChef('select public.org_umfrage_speichern($1, $2)', [id, d]);
  await speichern({ titel: 'Neu', frist: '2026-12-15T18:00' });
  let e = (await umfrageVon(chef, id)).einstellungen;
  assert.deepEqual([e.titel, e.frist_eingabe], ['Neu', '2026-12-15T18:00']);
  await db.query("update urlaub.umfragen set frist = '2026-11-30 23:59:59 Europe/Berlin' where id = $1", [id]);
  await speichern({ titel: 'Neu2', frist: '2026-11-30T23:59' });
  const s = (await db.query("select to_char(frist at time zone 'Europe/Berlin', 'HH24:MI:SS') as t from urlaub.umfragen where id = $1", [id])).rows[0].t;
  assert.equal(s, '23:59:59');
  await assert.rejects(speichern({ titel: '' }), /UNGUELTIGE_EINSTELLUNG/);
  await assert.rejects(speichern({ frist: '' }), /FRIST_LEER/);
  await assert.rejects(speichern({ frist: 'morgen' }), /UNGUELTIGE_EINSTELLUNG/);
  await assert.rejects(speichern({ frist: 'infinity' }), /UNGUELTIGE_EINSTELLUNG/);
  e = (await umfrageVon(chef, id)).einstellungen;
  assert.equal(e.titel, 'Neu2');
});

test('Mitarbeiter anlegen: Name je Umfrage eindeutig', async () => {
  const a = await neueUmfrage(chef, 'A');
  const b = await neueUmfrage(chef, 'B');
  await alsChef('select public.org_mitarbeiter_anlegen($1, $2)', [a, 'Anna']);
  await assert.rejects(alsChef('select public.org_mitarbeiter_anlegen($1, $2)', [a, ' anna ']), /NAME_DOPPELT/);
  await assert.rejects(alsChef('select public.org_mitarbeiter_anlegen($1, $2)', [a, '  ']), /NAME_LEER/);
  await alsChef('select public.org_mitarbeiter_anlegen($1, $2)', [b, 'Anna']);
  const u = await umfrageVon(chef, a);
  assert.equal(u.mitarbeiter.length, 1);
  assert.match(u.mitarbeiter[0].link, /^https:\/\/urlaub2027\.github\.io\/urlaub\/#[0-9a-f]{32}$/);
});

test('Freie Tage: Jahr kommt aus der Urlaubswochen-Frage', async () => {
  const id = await neueUmfrage(chef);
  await alsChef('select public.org_freien_tag_hinzufuegen($1, $2, $3)', [id, '2027-08-09', 'Betriebsruhe']);
  assert.deepEqual((await umfrageVon(chef, id)).freie_tage, [{ datum: '2027-08-09', name: 'Betriebsruhe' }]);
  await assert.rejects(alsChef('select public.org_freien_tag_hinzufuegen($1, $2, $3)', [id, '2028-01-02', 'x']), /DATUM_FALSCHES_JAHR/);
  await alsChef('select public.org_freien_tag_entfernen($1, $2)', [id, '2027-08-09']);
  assert.deepEqual((await umfrageVon(chef, id)).freie_tage, []);
});

test('Link erneuern und Mitarbeiter löschen', async () => {
  const id = await neueUmfrage(chef);
  await alsChef('select public.org_mitarbeiter_anlegen($1, $2)', [id, 'Lisa']);
  const vorher = (await db.query('select id, code from urlaub.mitarbeiter where umfrage_id = $1', [id])).rows[0];
  await alsChef('select public.org_link_erneuern($1)', [vorher.id]);
  const nachher = (await db.query('select code from urlaub.mitarbeiter where id = $1', [vorher.id])).rows[0].code;
  assert.notEqual(nachher, vorher.code);
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
    ['select public.org_mitarbeiter_loeschen($1)', [m], /MITARBEITER_NICHT_GEFUNDEN/],
    ['select public.org_link_erneuern($1)', [m], /MITARBEITER_NICHT_GEFUNDEN/],
  ];
  for (const [sql, params, fehler] of verboten) await assert.rejects(alsEva(sql, params), fehler, sql);
  assert.ok(!(await alsEva('select public.org_umfragen() as r')).r.some((x) => x.id === Number(id)));
});

test('Gesperrte, unbekannte und nicht angemeldete Nutzer', async () => {
  const gesperrt = await organisator(db, 'gesperrt', { gesperrt: true });
  await assert.rejects(als(db, 'authenticated', gesperrt, 'select public.org_umfragen()'), /KEIN_ZUGRIFF/);
  await assert.rejects(als(db, 'authenticated', null, 'select public.org_ich()'), /KEIN_ZUGRIFF/);
  for (const sql of ['select public.org_ich()', 'select public.org_umfragen()', "select public.org_umfrage_anlegen('x', 2027, 'BY')"]) {
    await assert.rejects(browser(db, sql), /permission denied/, sql);
  }
});

test('Organisator kann Tabellen nicht direkt lesen', async () => {
  for (const t of ['umfragen', 'fragen', 'optionen', 'regeln', 'bedingungen', 'antworten', 'antwort_optionen', 'mitarbeiter']) {
    await assert.rejects(als(db, 'authenticated', chef, `select * from urlaub.${t}`), /permission denied/, t);
  }
});
```

- [ ] **Step 6: Tests laufen lassen – müssen fehlschlagen**

Run: `npm test`
Expected: FAIL in `kalender`, `umstellung`, `admin` (z. B. `relation "urlaub.fragen" does not exist`, `function urlaub.standard_urlaubsfrage … does not exist`).

- [ ] **Step 7: `supabase/schema.sql` umbauen**

7a. Kopfkommentar: Zeile „(Stand 2: mehrere Umfragen)“ → „(Stand 3: Fragen-Baukasten)“; den Absatz über die Umstellung ersetzen durch „… ebenso wie zur Umstellung von Stand 2: jede Umfrage erhält eine Frage „Urlaubswochen“ mit ihren bisherigen Einstellungen; Mitarbeiter, Codes und Abgaben bleiben erhalten.“ Die Zeilen `-- Stand 1 hatte urlaub.kalender als View …` und das zugehörige `drop view if exists …` entfernen.

7b. Tabelle `urlaub.umfragen` (Neuinstallation) ersetzen durch:

```sql
create table if not exists urlaub.umfragen (
  id             bigint generated always as identity primary key,
  organisator_id uuid not null references urlaub.organisatoren (user_id) on delete cascade,
  titel          text not null check (btrim(titel) <> ''),
  frist          timestamptz not null,
  angelegt_am    timestamptz not null default now()
);
```

7c. Nach `urlaub.freie_tage` die Fragentabellen einfügen:

```sql
create table if not exists urlaub.fragen (
  id                    bigint generated always as identity primary key,
  umfrage_id            bigint not null references urlaub.umfragen (id) on delete cascade,
  position              int not null,
  typ                   text not null check (typ in ('urlaubswochen', 'einfach', 'mehrfach', 'janein', 'skala',
                                                     'text_kurz', 'text_lang', 'zahl', 'datum', 'hinweis')),
  text                  text not null check (btrim(text) <> ''),
  hilfetext             text not null default '',
  aktiv                 boolean not null default true,
  verknuepfung          text not null default 'und' check (verknuepfung in ('und', 'oder')),
  -- nur Urlaubswochen
  jahr                  int check (jahr between 2020 and 2100),
  bundesland            text check (bundesland in
                          ('BW','BY','BE','BB','HB','HH','HE','MV','NI','NW','RP','SL','SN','ST','SH','TH')),
  arbeitstage_pro_woche int check (arbeitstage_pro_woche in (5, 6)),
  sperr_hinweis         text,
  -- nur Skala
  skala_von             int,
  skala_bis             int,
  skala_links           text,
  skala_rechts          text,
  check (typ <> 'urlaubswochen'
         or (jahr is not null and bundesland is not null and arbeitstage_pro_woche is not null and sperr_hinweis is not null)),
  check (typ <> 'skala'
         or (skala_von is not null and skala_bis is not null and skala_von < skala_bis and skala_bis - skala_von <= 10))
);
create unique index if not exists fragen_eine_urlaubswochen on urlaub.fragen (umfrage_id) where typ = 'urlaubswochen';
create index if not exists fragen_umfrage on urlaub.fragen (umfrage_id, position);

create table if not exists urlaub.optionen (
  id       bigint generated always as identity primary key,
  frage_id bigint not null references urlaub.fragen (id) on delete cascade,
  position int not null,
  text     text not null check (btrim(text) <> ''),
  aktiv    boolean not null default true
);
create index if not exists optionen_frage on urlaub.optionen (frage_id, position);

-- Höchstens eine Regel je Art und Frage. wert: null (pflicht), Zahl, Datum-Text oder Monatsliste.
create table if not exists urlaub.regeln (
  id       bigint generated always as identity primary key,
  frage_id bigint not null references urlaub.fragen (id) on delete cascade,
  art      text not null check (art in ('pflicht', 'min_anzahl', 'max_anzahl', 'max_zeichen', 'min_zahl', 'max_zahl',
                                        'fruehestens', 'spaetestens', 'min_wochen', 'max_wochen', 'max_am_stueck',
                                        'max_urlaubstage', 'gesperrte_monate')),
  wert     jsonb not null default 'null',
  aktiv    boolean not null default true,
  unique (frage_id, art)
);

-- Sichtbarkeits-Bedingung: frage_id = Zielfrage, quelle_id = frühere Frage.
-- quelle_id ohne "on delete": eine verwendete Quellfrage ist nicht löschbar.
create table if not exists urlaub.bedingungen (
  id        bigint generated always as identity primary key,
  frage_id  bigint not null references urlaub.fragen (id) on delete cascade,
  quelle_id bigint not null references urlaub.fragen (id),
  operator  text not null check (operator in ('ist_eine_von', 'ist_keine_von', 'enthaelt_eine_von',
                                              'enthaelt_keine_von', 'ist', 'gleich', 'groesser', 'kleiner')),
  werte     jsonb not null,
  aktiv     boolean not null default true
);
create index if not exists bedingungen_frage on urlaub.bedingungen (frage_id);
create index if not exists bedingungen_quelle on urlaub.bedingungen (quelle_id);
```

7d. Tabelle `urlaub.abgaben` (Neuinstallation) ersetzen durch die Abgabe ohne Wochen und danach die Antworttabellen anlegen:

```sql
create table if not exists urlaub.abgaben (
  mitarbeiter_id bigint primary key references urlaub.mitarbeiter (id) on delete cascade,
  geaendert_am   timestamptz not null default now()
);

-- frage_id ohne "on delete": eine beantwortete Frage ist nicht löschbar.
create table if not exists urlaub.antworten (
  mitarbeiter_id bigint not null references urlaub.mitarbeiter (id) on delete cascade,
  frage_id       bigint not null references urlaub.fragen (id),
  wert           jsonb not null,
  primary key (mitarbeiter_id, frage_id)
);
create index if not exists antworten_frage on urlaub.antworten (frage_id);

-- option_id ohne "on delete": eine gewählte Antwortmöglichkeit ist nicht löschbar.
create table if not exists urlaub.antwort_optionen (
  mitarbeiter_id bigint not null,
  frage_id       bigint not null,
  option_id      bigint not null references urlaub.optionen (id),
  primary key (mitarbeiter_id, option_id),
  foreign key (mitarbeiter_id, frage_id) references urlaub.antworten (mitarbeiter_id, frage_id) on delete cascade
);
create index if not exists antwort_optionen_option on urlaub.antwort_optionen (option_id);
```

Achtung bei der Reihenfolge: `urlaub.antworten` referenziert `urlaub.mitarbeiter` – die Antworttabellen also **nach** `urlaub.mitarbeiter` anlegen.

7e. `urlaub.kalender` ersetzen (gleiche Signatur und Ergebnisspalten):

```sql
-- Die Urlaubswochen-Frage einer Umfrage (höchstens eine), sonst eine Zeile mit lauter null.
create or replace function urlaub.urlaubsfrage(p_umfrage_id bigint)
returns urlaub.fragen
language sql stable
set search_path = ''
as $$
  select f.* from urlaub.fragen f where f.umfrage_id = p_umfrage_id and f.typ = 'urlaubswochen'
$$;

-- Kalenderwochen der Urlaubswochen-Frage nach ISO 8601. Eine Woche gehört zum Monat ihres
-- Donnerstags. Gesperrt ist ein Monat nur, wenn die Regel "gesperrte_monate" eingeschaltet ist.
create or replace function urlaub.kalender(p_umfrage_id bigint)
returns table (kw int, montag date, sonntag date, monat int, arbeitstage int, feiertag text, gesperrt boolean)
language sql stable
set search_path = ''
as $$
  with f as (
    select f.* from urlaub.fragen f where f.umfrage_id = p_umfrage_id and f.typ = 'urlaubswochen'
  ),
  u as (
    select f.jahr, f.bundesland, f.arbeitstage_pro_woche,
           coalesce((select array(select jsonb_array_elements_text(r.wert)::int)
                     from urlaub.regeln r
                     where r.frage_id = f.id and r.art = 'gesperrte_monate' and r.aktiv
                       and jsonb_typeof(r.wert) = 'array'), '{}'::int[]) as gesperrte_monate,
           make_date(f.jahr, 1, 4) - (extract(isodow from make_date(f.jahr, 1, 4))::int - 1) as montag1,
           extract(week from make_date(f.jahr, 12, 28))::int as anzahl
    from f
  ),
  frei as (
    select l.datum, l.name from u, generate_series(u.jahr - 1, u.jahr + 1) j (jahr),
         urlaub.landesfeiertage(j.jahr, u.bundesland) l
    union
    select fr.datum, fr.name from urlaub.freie_tage fr where fr.umfrage_id = p_umfrage_id
  ),
  w as (
    select u.arbeitstage_pro_woche, u.gesperrte_monate, g.kw, u.montag1 + (g.kw - 1) * 7 as montag
    from u, generate_series(1, u.anzahl) as g (kw)
  )
  select w.kw,
         w.montag,
         w.montag + 6,
         extract(month from w.montag + 3)::int,
         w.arbeitstage_pro_woche - count(distinct fr.datum)::int,
         string_agg(distinct fr.name, ', ' order by fr.name),
         extract(month from w.montag + 3)::int = any (w.gesperrte_monate)
  from w
  left join frei fr on fr.datum between w.montag and w.montag + (w.arbeitstage_pro_woche - 1)
  group by w.kw, w.montag, w.arbeitstage_pro_woche, w.gesperrte_monate
  order by w.kw
$$;
```

`urlaub.kalender_json` bleibt unverändert.

Direkt danach einfügen:

```sql
-- Standard-Frage "Urlaubswochen" mit den bisherigen Vorgaben als eingeschaltete Regeln.
create or replace function urlaub.standard_urlaubsfrage(p_umfrage_id bigint, p_jahr int, p_bundesland text)
returns bigint
language plpgsql volatile
set search_path = ''
as $$
declare
  v_id bigint;
begin
  insert into urlaub.fragen (umfrage_id, position, typ, text, jahr, bundesland, arbeitstage_pro_woche, sperr_hinweis)
  values (p_umfrage_id,
          coalesce((select max(position) from urlaub.fragen where umfrage_id = p_umfrage_id), 0) + 1,
          'urlaubswochen', 'In welchen Wochen möchtest du Urlaub nehmen?',
          p_jahr, p_bundesland, 6, 'Im Dezember ist kein Urlaub möglich.')
  returning id into v_id;
  insert into urlaub.regeln (frage_id, art, wert) values
    (v_id, 'pflicht', 'null'), (v_id, 'min_wochen', '1'), (v_id, 'max_wochen', '6'),
    (v_id, 'max_am_stueck', '3'), (v_id, 'max_urlaubstage', '36'), (v_id, 'gesperrte_monate', '[12]');
  return v_id;
end;
$$;
```

7f. Den kompletten Block „Umstellung von Stand 1“ (`do $$ … to_regclass('urlaub.einstellungen') … end; $$;`) ersetzen durch:

```sql
-- ---------------------------------------------------------------------------
-- Umstellung von Stand 2 (Wochen-Einstellungen in urlaub.umfragen). Läuft nur,
-- solange urlaub.umfragen noch die Spalte "jahr" hat.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'urlaub' and table_name = 'umfragen' and column_name = 'jahr') then
    return;
  end if;

  insert into urlaub.fragen (umfrage_id, position, typ, text, jahr, bundesland, arbeitstage_pro_woche, sperr_hinweis)
  select u.id, 1, 'urlaubswochen', 'In welchen Wochen möchtest du Urlaub nehmen?',
         u.jahr, u.bundesland, u.arbeitstage_pro_woche, u.sperr_hinweis
  from urlaub.umfragen u
  where not exists (select 1 from urlaub.fragen f where f.umfrage_id = u.id and f.typ = 'urlaubswochen');

  insert into urlaub.regeln (frage_id, art, wert, aktiv)
  select f.id, x.art, x.wert, true
  from urlaub.fragen f
  join urlaub.umfragen u on u.id = f.umfrage_id
  cross join lateral (values
    ('pflicht',          'null'::jsonb),
    ('min_wochen',       to_jsonb(u.min_wochen)),
    ('max_wochen',       to_jsonb(u.max_wochen)),
    ('max_am_stueck',    to_jsonb(u.max_am_stueck)),
    ('max_urlaubstage',  to_jsonb(u.urlaubstage)),
    ('gesperrte_monate', to_jsonb(u.gesperrte_monate))) as x (art, wert)
  where f.typ = 'urlaubswochen'
  on conflict (frage_id, art) do nothing;

  insert into urlaub.antworten (mitarbeiter_id, frage_id, wert)
  select a.mitarbeiter_id, f.id, to_jsonb(a.wochen)
  from urlaub.abgaben a
  join urlaub.mitarbeiter m on m.id = a.mitarbeiter_id
  join urlaub.fragen f on f.umfrage_id = m.umfrage_id and f.typ = 'urlaubswochen'
  on conflict do nothing;

  alter table urlaub.abgaben drop constraint if exists abgaben_wochen_gueltig;
  alter table urlaub.abgaben drop column if exists wochen;
  alter table urlaub.umfragen
    drop column jahr, drop column bundesland, drop column arbeitstage_pro_woche, drop column urlaubstage,
    drop column min_wochen, drop column max_wochen, drop column max_am_stueck, drop column gesperrte_monate,
    drop column sperr_hinweis;

  drop function if exists public.urlaub_speichern(text, int[]);
  drop function if exists urlaub.regelverstoss(bigint, int[]);
  drop function if exists urlaub.antwort(bigint);
end;
$$;
```

7g. „Nacharbeiten an Tabellen“: den `do $$ … abgaben_wochen_gueltig … $$;`-Block entfernen; die RLS-Liste um die neuen Tabellen ergänzen:

```sql
alter table urlaub.fragen           enable row level security;
alter table urlaub.optionen         enable row level security;
alter table urlaub.regeln           enable row level security;
alter table urlaub.bedingungen      enable row level security;
alter table urlaub.antworten        enable row level security;
alter table urlaub.antwort_optionen enable row level security;
```

7h. Den Block „Regeln und Mitarbeiter-Funktionen“ (von `-- Erster Regelverstoß …` bis einschließlich der `grant execute … urlaub_speichern …`-Zeilen) ersetzen durch:

```sql
-- ---------------------------------------------------------------------------
-- Mitarbeiter-Funktionen: siehe Task 2 (Prüfung und Absenden).
-- ---------------------------------------------------------------------------

-- Stand 2 → 3: alte Wochen-Funktionen entfernen (auch bei Neuinstallation harmlos).
drop function if exists public.urlaub_speichern(text, int[]);
drop function if exists public.urlaub_laden(text);
drop function if exists urlaub.regelverstoss(bigint, int[]);
drop function if exists urlaub.antwort(bigint);
```

7i. `public.org_umfragen`: die Zeilen `'jahr', u.jahr,` und `'bundesland', u.bundesland,` ersetzen durch

```sql
             'jahr',        (select f.jahr from urlaub.fragen f where f.umfrage_id = u.id and f.typ = 'urlaubswochen'),
             'bundesland',  (select f.bundesland from urlaub.fragen f where f.umfrage_id = u.id and f.typ = 'urlaubswochen'),
```

7j. `public.org_umfrage_anlegen` – den inneren Block ersetzen durch:

```sql
  begin
    insert into urlaub.umfragen (organisator_id, titel, frist)
    values (v_uid, btrim(p_titel), make_timestamp(p_jahr - 1, 11, 30, 23, 59, 59) at time zone 'Europe/Berlin')
    returning id into v_id;
    perform urlaub.standard_urlaubsfrage(v_id, p_jahr, p_bundesland);
  exception when check_violation or not_null_violation or data_exception then
    raise exception 'UNGUELTIGE_EINSTELLUNG';
  end;
```

7k. `public.org_umfrage` vorläufig vollständig ersetzen durch:

```sql
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
      'id',            v_u.id,
      'titel',         v_u.titel,
      'frist',         v_u.frist,
      'frist_eingabe', to_char(v_u.frist at time zone 'Europe/Berlin', 'YYYY-MM-DD"T"HH24:MI'),
      'offen',         now() < v_u.frist),
    'freie_tage', coalesce((
      select jsonb_agg(jsonb_build_object('datum', f.datum, 'name', f.name) order by f.datum)
      from urlaub.freie_tage f where f.umfrage_id = v_u.id), '[]'::jsonb),
    'mitarbeiter', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',           m.id,
               'name',         m.name,
               'link',         v_basis || '#' || m.code,
               'geaendert_am', a.geaendert_am) order by m.name)
      from urlaub.mitarbeiter m
      left join urlaub.abgaben a on a.mitarbeiter_id = m.id
      where m.umfrage_id = v_u.id), '[]'::jsonb));
end;
$$;
```

7l. `public.org_umfrage_speichern` vollständig ersetzen durch (nur Titel und Frist; die Jahres-Logik wandert in Task 3 zur Frage):

```sql
-- Die Besitzprüfung (declare-Block) liegt bewusst außerhalb des inneren
-- exception-Blocks, damit UMFRAGE_NICHT_GEFUNDEN nicht umgewandelt wird.
create or replace function public.org_umfrage_speichern(p_umfrage_id bigint, p_daten jsonb)
returns void
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_u     urlaub.umfragen := urlaub.eigene_umfrage(p_umfrage_id);
  v_frist text := btrim(p_daten ->> 'frist');
begin
  if p_daten ? 'frist' and (v_frist is null or v_frist = '') then
    raise exception 'FRIST_LEER';
  end if;
  if lower(coalesce(v_frist, '')) in ('infinity', '-infinity', '+infinity') then
    raise exception 'UNGUELTIGE_EINSTELLUNG';
  end if;
  begin
    update urlaub.umfragen set
      titel = coalesce(btrim(p_daten ->> 'titel'), titel),
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
```

7m. `public.org_freien_tag_hinzufuegen`: die Jahresprüfung ersetzen durch

```sql
  if p_datum is null
     or ((urlaub.urlaubsfrage(v_u.id)).jahr is not null
         and extract(year from p_datum) <> (urlaub.urlaubsfrage(v_u.id)).jahr) then
    raise exception 'DATUM_FALSCHES_JAHR';
  end if;
```

- [ ] **Step 8: Tests laufen lassen**

Run: `node --test tests/kalender.test.mjs tests/umstellung.test.mjs tests/admin.test.mjs tests/einladung.test.mjs tests/logik.test.mjs tests/excel.test.mjs`
Expected: PASS. (`tests/datenbank.test.mjs` ist bis Task 2 rot.)

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "Datenbank Stand 3: Fragen-Tabellen, Kalender aus der Urlaubswochen-Frage, Umstellung von Stand 2

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Antworten prüfen und absenden (Datenbank)

**Files:**
- Create: `tests/umfrage-bauer.mjs`, `tests/fixtures/sichtbarkeit-faelle.json`, `tests/sichtbarkeit.test.mjs`
- Rewrite: `tests/datenbank.test.mjs` (ersetzt die alten Wochen-Tests vollständig)
- Modify: `supabase/schema.sql` (nach dem Block „Mitarbeiter-Funktionen: siehe Task 2“ aus Task 1)

**Interfaces:**
- Consumes: Tabellen aus Task 1, `urlaub.kalender`, `urlaub.kalender_json`, `urlaub.standard_urlaubsfrage`, Helfer `neueDatenbank`, `als`, `browser`, `organisator`.
- Produces (SQL, intern):
  - `urlaub.ist_leer(jsonb) → boolean`
  - `urlaub.bedingung_erfuellt(urlaub.bedingungen, jsonb gueltige_antworten, bigint[] sichtbar) → boolean`
  - `urlaub.wochen_verstoss(urlaub.fragen, jsonb) → text|null`
  - `urlaub.antwort_verstoss(urlaub.fragen, jsonb) → text|null`
  - `urlaub.antwort_normalisiert(urlaub.fragen, jsonb) → jsonb`
  - `urlaub.pruefe_antworten(p_umfrage_id bigint, p_antworten jsonb) → jsonb {sichtbar: [frage_id…], antworten: {"<id>": wert}, fehler: {"<id>": code}}`
  - `urlaub.frage_json(urlaub.fragen, p_alles boolean) → jsonb` – `p_alles=false`: Mitarbeiter-Sicht (nur eingeschaltete Optionen/Regeln/Bedingungen, Regeln als `{art: wert}`); `p_alles=true`: Verwaltungs-Sicht (alles inkl. `aktiv`, Regeln als `{art: {wert, aktiv}}`, `hat_antworten` an Frage und Optionen)
  - `urlaub.formular(p_mitarbeiter_id bigint) → jsonb {name, titel, frist, offen, geaendert_am, fragen:[frage_json(…, false)], antworten:{"<id>": wert}}`
- Produces (`public`, für `anon`): `urlaub_laden(p_code text) → jsonb` (= `urlaub.formular`), `umfrage_absenden(p_code text, p_antworten jsonb) → jsonb` (= `urlaub.formular` nach dem Speichern; bei Fehlern `ANTWORTEN_UNGUELTIG` mit `detail` = Fehlerobjekt).
- Produces (JS, `tests/umfrage-bauer.mjs`): `baueUmfrage(db, organisatorId, beschreibung, {frist}) → {umfrageId, ids:{key:id}, optionen:{key:{optKey:id}}, typen:{key:typ}}`, `mitIds(bau, {key: wert}) → {"<id>": wert}`, `schluessel(bau, ids[]) → key[]`, `fehlerVon(promise) → {message, fehler: {key: code}|null}` (benötigt `bau`, siehe Code).

**Antwortformat** (Wert je Frage im JSON-Objekt `p_antworten`, Schlüssel = Frage-ID als Text):

| Typ | Wert |
|---|---|
| urlaubswochen | Liste von KW-Nummern |
| einfach | Options-ID (Zahl) |
| mehrfach | Liste von Options-IDs |
| janein | `true`/`false` |
| skala, zahl | Zahl |
| text_kurz, text_lang | Text (wird getrimmt; harte Grenze 200 bzw. 5000 Zeichen) |
| datum | `"YYYY-MM-DD"` |
| hinweis | – (wird ignoriert) |

Leer (= nicht beantwortet): fehlt, `null`, `[]`, `""`/nur Leerzeichen.

- [ ] **Step 1: Umfrage-Bauer schreiben** – `tests/umfrage-bauer.mjs`:

```js
// Baut Umfragen aus einer kompakten Beschreibung direkt in PGlite (als Superuser).
// Beschreibung: { titel?, fragen: [{ key, typ, text?, aktiv?, verknuepfung?, optionen?: [key | {key, aktiv}],
//   regeln?: {art: wert | {wert, aktiv}}, bedingungen?: [{quelle, operator, werte, aktiv?}], skala?: {von, bis},
//   jahr?, bundesland? }] }
export async function baueUmfrage(db, organisatorId, beschreibung, { frist = "now() + interval '1 day'" } = {}) {
  const r = await db.query(
    `insert into urlaub.umfragen (organisator_id, titel, frist) values ($1, $2, ${frist}) returning id`,
    [organisatorId, beschreibung.titel || 'Testumfrage']);
  const umfrageId = r.rows[0].id;
  const ids = {};
  const optionen = {};
  const typen = {};
  let position = 0;
  for (const f of beschreibung.fragen) {
    position += 1;
    let frageId;
    if (f.typ === 'urlaubswochen') {
      frageId = (await db.query('select urlaub.standard_urlaubsfrage($1, $2, $3) as id',
        [umfrageId, f.jahr || 2027, f.bundesland || 'BY'])).rows[0].id;
      await db.query('update urlaub.fragen set position = $2, aktiv = $3 where id = $1', [frageId, position, f.aktiv !== false]);
    } else {
      frageId = (await db.query(
        `insert into urlaub.fragen (umfrage_id, position, typ, text, aktiv, verknuepfung, skala_von, skala_bis)
         values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
        [umfrageId, position, f.typ, f.text || f.key, f.aktiv !== false, f.verknuepfung || 'und',
          f.typ === 'skala' ? (f.skala?.von ?? 1) : null, f.typ === 'skala' ? (f.skala?.bis ?? 5) : null])).rows[0].id;
    }
    ids[f.key] = frageId;
    typen[f.key] = f.typ;
    optionen[f.key] = {};
    let p = 0;
    for (const o of f.optionen || []) {
      p += 1;
      const [key, aktiv] = typeof o === 'string' ? [o, true] : [o.key, o.aktiv !== false];
      optionen[f.key][key] = (await db.query(
        'insert into urlaub.optionen (frage_id, position, text, aktiv) values ($1, $2, $3, $4) returning id',
        [frageId, p, key, aktiv])).rows[0].id;
    }
    for (const [art, angabe] of Object.entries(f.regeln || {})) {
      const { wert, aktiv } = angabe !== null && typeof angabe === 'object' && !Array.isArray(angabe) && 'wert' in angabe
        ? { wert: angabe.wert, aktiv: angabe.aktiv !== false } : { wert: angabe, aktiv: true };
      await db.query(
        `insert into urlaub.regeln (frage_id, art, wert, aktiv) values ($1, $2, $3, $4)
         on conflict (frage_id, art) do update set wert = excluded.wert, aktiv = excluded.aktiv`,
        [frageId, art, JSON.stringify(wert ?? null), aktiv]);
    }
    for (const b of f.bedingungen || []) {
      const werte = ['einfach', 'mehrfach'].includes(typen[b.quelle]) ? b.werte.map((k) => optionen[b.quelle][k]) : b.werte;
      await db.query(
        'insert into urlaub.bedingungen (frage_id, quelle_id, operator, werte, aktiv) values ($1, $2, $3, $4, $5)',
        [frageId, ids[b.quelle], b.operator, JSON.stringify(werte), b.aktiv !== false]);
    }
  }
  return { umfrageId, ids, optionen, typen };
}

// {key: wert} mit Options-Schlüsseln → {"<frage_id>": wert} mit Options-IDs.
export function mitIds(bau, antworten) {
  const aus = {};
  for (const [key, wert] of Object.entries(antworten)) {
    let w = wert;
    if (bau.typen[key] === 'einfach' && typeof wert === 'string') w = bau.optionen[key][wert];
    if (bau.typen[key] === 'mehrfach' && Array.isArray(wert)) {
      w = wert.map((k) => (typeof k === 'string' ? bau.optionen[key][k] : k));
    }
    aus[String(bau.ids[key])] = w;
  }
  return aus;
}

// Frage-IDs → Schlüssel (Reihenfolge bleibt).
export function schluessel(bau, ids) {
  const rueck = Object.fromEntries(Object.entries(bau.ids).map(([k, v]) => [String(v), k]));
  return ids.map((id) => rueck[String(id)]);
}

// Wartet auf einen Fehler und liefert Meldung und Fehler pro Frage (Schlüssel statt IDs).
export async function fehlerVon(bau, versprechen) {
  try {
    await versprechen;
  } catch (e) {
    const roh = e.detail ? JSON.parse(e.detail) : null;
    const fehler = roh && Object.fromEntries(Object.entries(roh).map(([id, code]) => [schluessel(bau, [id])[0], code]));
    return { message: e.message, fehler };
  }
  throw new Error('Es wurde ein Fehler erwartet');
}
```

- [ ] **Step 2: Sichtbarkeits-Testfälle anlegen** – `tests/fixtures/sichtbarkeit-faelle.json`:

```json
{
  "fragen": [
    { "key": "kinder", "typ": "janein" },
    { "key": "ferien", "typ": "janein", "bedingungen": [{ "quelle": "kinder", "operator": "ist", "werte": true }] },
    { "key": "schicht", "typ": "einfach", "optionen": ["frueh", "spaet", "nacht"] },
    { "key": "tage", "typ": "mehrfach", "optionen": ["mo", "di", "mi"] },
    { "key": "anzahl", "typ": "zahl" },
    { "key": "note", "typ": "skala" },
    { "key": "und_frage", "typ": "text_kurz", "verknuepfung": "und", "bedingungen": [
      { "quelle": "schicht", "operator": "ist_eine_von", "werte": ["frueh", "spaet"] },
      { "quelle": "anzahl", "operator": "groesser", "werte": 3 }] },
    { "key": "oder_frage", "typ": "text_kurz", "verknuepfung": "oder", "bedingungen": [
      { "quelle": "tage", "operator": "enthaelt_eine_von", "werte": ["mo"] },
      { "quelle": "note", "operator": "kleiner", "werte": 2 }] },
    { "key": "keine_nacht", "typ": "text_kurz", "bedingungen": [
      { "quelle": "schicht", "operator": "ist_keine_von", "werte": ["nacht"] }] },
    { "key": "ohne_mi", "typ": "text_kurz", "bedingungen": [
      { "quelle": "tage", "operator": "enthaelt_keine_von", "werte": ["mi"] }] },
    { "key": "genau5", "typ": "text_kurz", "bedingungen": [
      { "quelle": "anzahl", "operator": "gleich", "werte": 5 }] },
    { "key": "aus", "typ": "janein", "aktiv": false },
    { "key": "haengt_an_aus", "typ": "text_kurz", "bedingungen": [
      { "quelle": "aus", "operator": "ist", "werte": true }] },
    { "key": "kette", "typ": "text_kurz", "bedingungen": [
      { "quelle": "ferien", "operator": "ist", "werte": true }] },
    { "key": "bedingung_aus", "typ": "text_kurz", "bedingungen": [
      { "quelle": "kinder", "operator": "ist", "werte": true, "aktiv": false }] },
    { "key": "hinweis", "typ": "hinweis" }
  ],
  "faelle": [
    { "name": "nichts beantwortet", "antworten": {},
      "sichtbar": ["kinder", "schicht", "tage", "anzahl", "note", "bedingung_aus", "hinweis"] },
    { "name": "Kinder ja", "antworten": { "kinder": true },
      "sichtbar": ["kinder", "ferien", "schicht", "tage", "anzahl", "note", "bedingung_aus", "hinweis"] },
    { "name": "Kette über zwei Stufen", "antworten": { "kinder": true, "ferien": true },
      "sichtbar": ["kinder", "ferien", "schicht", "tage", "anzahl", "note", "kette", "bedingung_aus", "hinweis"] },
    { "name": "Kette über unsichtbare Zwischenfrage", "antworten": { "kinder": false, "ferien": true },
      "sichtbar": ["kinder", "schicht", "tage", "anzahl", "note", "bedingung_aus", "hinweis"] },
    { "name": "und erfüllt", "antworten": { "schicht": "frueh", "anzahl": 4 },
      "sichtbar": ["kinder", "schicht", "tage", "anzahl", "note", "und_frage", "keine_nacht", "bedingung_aus", "hinweis"] },
    { "name": "und nur halb erfüllt", "antworten": { "schicht": "frueh", "anzahl": 3 },
      "sichtbar": ["kinder", "schicht", "tage", "anzahl", "note", "keine_nacht", "bedingung_aus", "hinweis"] },
    { "name": "oder über Mehrfachauswahl", "antworten": { "tage": ["mo", "mi"] },
      "sichtbar": ["kinder", "schicht", "tage", "anzahl", "note", "oder_frage", "bedingung_aus", "hinweis"] },
    { "name": "oder über Skala", "antworten": { "note": 1 },
      "sichtbar": ["kinder", "schicht", "tage", "anzahl", "note", "oder_frage", "bedingung_aus", "hinweis"] },
    { "name": "oder nicht erfüllt, enthält keine", "antworten": { "tage": ["di"], "note": 3 },
      "sichtbar": ["kinder", "schicht", "tage", "anzahl", "note", "ohne_mi", "bedingung_aus", "hinweis"] },
    { "name": "ist keine von / gleich", "antworten": { "schicht": "nacht", "anzahl": 5 },
      "sichtbar": ["kinder", "schicht", "tage", "anzahl", "note", "genau5", "bedingung_aus", "hinweis"] },
    { "name": "leere Mehrfachauswahl zählt als unbeantwortet", "antworten": { "tage": [] },
      "sichtbar": ["kinder", "schicht", "tage", "anzahl", "note", "bedingung_aus", "hinweis"] }
  ]
}
```

- [ ] **Step 3: Sichtbarkeitstest (Datenbank-Seite)** – `tests/sichtbarkeit.test.mjs`:

```js
// Gemeinsame Testfälle für die Sichtbarkeit: hier gegen die Datenbank.
// Task 4 ergänzt dieselben Fälle gegen docs/formular-logik.js.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { neueDatenbank, browser, organisator } from './helfer.mjs';
import { baueUmfrage, mitIds, schluessel } from './umfrage-bauer.mjs';

const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/sichtbarkeit-faelle.json', import.meta.url), 'utf8'));
let db;
let bau;
let code;

before(async () => {
  db = await neueDatenbank();
  const chef = await organisator(db, 'chef');
  bau = await baueUmfrage(db, chef, { fragen: FIXTURE.fragen });
  code = (await db.query("insert into urlaub.mitarbeiter (umfrage_id, name) values ($1, 'Test') returning code", [bau.umfrageId])).rows[0].code;
});

for (const fall of FIXTURE.faelle) {
  test(`Datenbank: ${fall.name}`, async () => {
    const r = (await db.query('select urlaub.pruefe_antworten($1, $2) as r', [bau.umfrageId, JSON.stringify(mitIds(bau, fall.antworten))])).rows[0].r;
    assert.deepEqual(schluessel(bau, r.sichtbar), fall.sichtbar);
    assert.deepEqual(r.fehler, {});
  });
}

test('Mitarbeiter-Sicht enthält ausgeschaltete Fragen und Bedingungen nicht', async () => {
  const r = (await browser(db, 'select public.urlaub_laden($1) as r', [code]))[0].r;
  const keys = schluessel(bau, r.fragen.map((f) => f.id));
  assert.ok(!keys.includes('aus'));
  const bedingungAus = r.fragen.find((f) => f.id === Number(bau.ids.bedingung_aus));
  assert.deepEqual(bedingungAus.bedingungen, []);
});
```

- [ ] **Step 4: Antworttests** – `tests/datenbank.test.mjs` vollständig ersetzen:

```js
// Mitarbeiter-Seite: Laden, Prüfen und Absenden aller Fragetypen.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { neueDatenbank, als, browser, organisator } from './helfer.mjs';
import { baueUmfrage, mitIds, schluessel, fehlerVon } from './umfrage-bauer.mjs';

const ALLE = { fragen: [
  { key: 'urlaub', typ: 'urlaubswochen' },
  { key: 'schicht', typ: 'einfach', optionen: ['frueh', 'spaet', { key: 'nacht', aktiv: false }], regeln: { pflicht: null } },
  { key: 'tage', typ: 'mehrfach', optionen: ['mo', 'di', 'mi', 'do'], regeln: { min_anzahl: 2, max_anzahl: 3 } },
  { key: 'kinder', typ: 'janein' },
  { key: 'ferien', typ: 'janein', regeln: { pflicht: null }, bedingungen: [{ quelle: 'kinder', operator: 'ist', werte: true }] },
  { key: 'note', typ: 'skala', skala: { von: 1, bis: 5 } },
  { key: 'kurz', typ: 'text_kurz', regeln: { max_zeichen: 10 } },
  { key: 'lang', typ: 'text_lang' },
  { key: 'rest', typ: 'zahl', regeln: { min_zahl: 0, max_zahl: { wert: 40, aktiv: false } } },
  { key: 'zurueck', typ: 'datum', regeln: { fruehestens: '2027-01-01', spaetestens: '2027-12-31' } },
  { key: 'info', typ: 'hinweis' },
  { key: 'alt', typ: 'text_kurz', aktiv: false },
] };

const GUELTIG = {
  urlaub: [30, 12], schicht: 'spaet', tage: ['mi', 'mo'], kinder: true, ferien: false, note: 4,
  kurz: '  hallo  ', lang: 'Langer Text', rest: 3.5, zurueck: '2027-03-01', info: 'ignoriert', alt: 'weg',
};

let db;
let bau;
let code;
let code2;

before(async () => {
  db = await neueDatenbank();
  const chef = await organisator(db, 'chef');
  bau = await baueUmfrage(db, chef, ALLE);
  const m = await db.query("insert into urlaub.mitarbeiter (umfrage_id, name) values ($1, 'Anna'), ($1, 'Ben') returning name, code", [bau.umfrageId]);
  code = m.rows.find((x) => x.name === 'Anna').code;
  code2 = m.rows.find((x) => x.name === 'Ben').code;
});

const laden = async (c) => (await browser(db, 'select public.urlaub_laden($1) as r', [c]))[0].r;
const absenden = async (c, antworten) =>
  (await browser(db, 'select public.umfrage_absenden($1, $2) as r', [c, JSON.stringify(antworten)]))[0].r;
const absendenKeys = (c, antworten) => absenden(c, mitIds(bau, antworten));
const gespeichert = async (c) => {
  const r = await laden(c);
  return Object.fromEntries(Object.entries(r.antworten).map(([id, w]) => [schluessel(bau, [id])[0], w]));
};
const ohne = (obj, ...keys) => Object.fromEntries(Object.entries(obj).filter(([k]) => !keys.includes(k)));

test('Laden: Kopf, nur eingeschaltete Fragen/Optionen/Regeln, Kalender', async () => {
  const r = await laden(code);
  assert.equal(r.name, 'Anna');
  assert.equal(r.titel, 'Testumfrage');
  assert.equal(r.offen, true);
  assert.deepEqual(r.antworten, {});
  assert.deepEqual(schluessel(bau, r.fragen.map((f) => f.id)),
    ['urlaub', 'schicht', 'tage', 'kinder', 'ferien', 'note', 'kurz', 'lang', 'rest', 'zurueck', 'info']);
  const schicht = r.fragen[1];
  assert.deepEqual(schicht.optionen.map((o) => o.text), ['frueh', 'spaet']);
  assert.deepEqual(schicht.regeln, { pflicht: null });
  const rest = r.fragen[8];
  assert.deepEqual(rest.regeln, { min_zahl: 0 });
  const urlaub = r.fragen[0];
  assert.equal(urlaub.urlaubswochen.jahr, 2027);
  assert.equal(urlaub.urlaubswochen.kalender.length, 52);
  assert.deepEqual(urlaub.regeln, { pflicht: null, min_wochen: 1, max_wochen: 6, max_am_stueck: 3, max_urlaubstage: 36, gesperrte_monate: [12] });
  assert.deepEqual(r.fragen[5].skala, { von: 1, bis: 5, links: null, rechts: null });
  assert.equal(r.fragen[4].bedingungen.length, 1);
  assert.equal(r.fragen[4].bedingungen[0].quelle_id, Number(bau.ids.kinder));
  assert.ok(!('aktiv' in schicht));
});

test('Gültige Abgabe: normalisiert gespeichert, Hinweis und ausgeschaltete Frage verworfen', async () => {
  const r = await absendenKeys(code, GUELTIG);
  assert.ok(r.geaendert_am);
  assert.deepEqual(await gespeichert(code), {
    urlaub: [12, 30], schicht: Number(bau.optionen.schicht.spaet),
    tage: [Number(bau.optionen.tage.mo), Number(bau.optionen.tage.mi)],
    kinder: true, ferien: false, note: 4, kurz: 'hallo', lang: 'Langer Text', rest: 3.5, zurueck: '2027-03-01',
  });
  const opt = (await db.query(`select o.text from urlaub.antwort_optionen ao join urlaub.optionen o on o.id = ao.option_id
    join urlaub.mitarbeiter m on m.id = ao.mitarbeiter_id where m.code = $1 order by o.text`, [code])).rows.map((x) => x.text);
  assert.deepEqual(opt, ['mi', 'mo', 'spaet']);
});

test('Erneutes Absenden ersetzt alles; weggelassene Antworten verschwinden', async () => {
  await absendenKeys(code, GUELTIG);
  await absendenKeys(code, { urlaub: [5], schicht: 'frueh' });
  assert.deepEqual(await gespeichert(code), { urlaub: [5], schicht: Number(bau.optionen.schicht.frueh) });
  const n = (await db.query(`select count(*)::int as n from urlaub.antwort_optionen ao join urlaub.mitarbeiter m on m.id = ao.mitarbeiter_id where m.code = $1`, [code])).rows[0].n;
  assert.equal(n, 1);
});

test('Pflicht: fehlende Pflichtantworten werden alle gemeldet, nichts gespeichert', async () => {
  await absendenKeys(code2, { urlaub: [5], schicht: 'frueh' });
  const vorher = await gespeichert(code2);
  const f = await fehlerVon(bau, absendenKeys(code2, { kinder: true }));
  assert.equal(f.message, 'ANTWORTEN_UNGUELTIG');
  assert.deepEqual(f.fehler, { urlaub: 'PFLICHT', schicht: 'PFLICHT', ferien: 'PFLICHT' });
  assert.deepEqual(await gespeichert(code2), vorher);
});

test('Pflicht gilt nicht für unsichtbare Fragen; Antwort auf unsichtbare Frage wird verworfen', async () => {
  await absendenKeys(code2, { urlaub: [5], schicht: 'frueh', kinder: false, ferien: true });
  const g = await gespeichert(code2);
  assert.equal(g.kinder, false);
  assert.ok(!('ferien' in g));
});

test('Ungültige Formen werden abgelehnt', async () => {
  const basis = { urlaub: [5], schicht: 'frueh' };
  const faelle = [
    [{ schicht: Number(bau.optionen.schicht.nacht) }, 'schicht', 'UNGUELTIGE_ANTWORT'],        // ausgeschaltete Option
    [{ schicht: Number(bau.optionen.tage.mo) }, 'schicht', 'UNGUELTIGE_ANTWORT'],             // Option einer anderen Frage
    [{ schicht: 'frueh-als-text' }, 'schicht', 'UNGUELTIGE_ANTWORT'],
    [{ tage: [Number(bau.optionen.tage.mo), Number(bau.optionen.tage.mo)] }, 'tage', 'UNGUELTIGE_ANTWORT'],
    [{ tage: 'mo' }, 'tage', 'UNGUELTIGE_ANTWORT'],
    [{ kinder: 'ja' }, 'kinder', 'UNGUELTIGE_ANTWORT'],
    [{ note: 6 }, 'note', 'UNGUELTIGE_ANTWORT'],
    [{ note: 2.5 }, 'note', 'UNGUELTIGE_ANTWORT'],
    [{ rest: '3' }, 'rest', 'UNGUELTIGE_ANTWORT'],
    [{ lang: 42 }, 'lang', 'UNGUELTIGE_ANTWORT'],
    [{ zurueck: '01.03.2027' }, 'zurueck', 'UNGUELTIGE_ANTWORT'],
    [{ zurueck: '2027-02-30' }, 'zurueck', 'UNGUELTIGE_ANTWORT'],
    [{ urlaub: [5, 5] }, 'urlaub', 'DOPPELTE_WOCHE'],
    [{ urlaub: [48] }, 'urlaub', 'UNGUELTIGE_WOCHE'],
    [{ urlaub: [5.5] }, 'urlaub', 'UNGUELTIGE_WOCHE'],
    [{ urlaub: ['5'] }, 'urlaub', 'UNGUELTIGE_WOCHE'],
  ];
  for (const [zusatz, key, codeErwartet] of faelle) {
    const antworten = mitIds(bau, { ...basis, ...ohne(zusatz, 'schicht', 'tage') });
    for (const k of ['schicht', 'tage']) if (k in zusatz) antworten[String(bau.ids[k])] = zusatz[k];
    const f = await fehlerVon(bau, absenden(code2, antworten));
    assert.equal(f.fehler?.[key], codeErwartet, JSON.stringify(zusatz));
  }
});

test('Prüfregeln je Typ; ausgeschaltete Regel greift nicht', async () => {
  const basis = { urlaub: [5], schicht: 'frueh' };
  const pruefe = async (zusatz, key, erwartet) => {
    const f = await fehlerVon(bau, absendenKeys(code2, { ...basis, ...zusatz }));
    assert.equal(f.fehler?.[key], erwartet, JSON.stringify(zusatz));
  };
  await pruefe({ tage: ['mo'] }, 'tage', 'ZU_WENIGE_ANTWORTEN');
  await pruefe({ tage: ['mo', 'di', 'mi', 'do'] }, 'tage', 'ZU_VIELE_ANTWORTEN');
  await pruefe({ rest: -1 }, 'rest', 'ZAHL_ZU_KLEIN');
  await pruefe({ kurz: 'elf Zeichen' }, 'kurz', 'TEXT_ZU_LANG');
  await pruefe({ lang: 'x'.repeat(5001) }, 'lang', 'TEXT_ZU_LANG');
  await pruefe({ zurueck: '2026-12-31' }, 'zurueck', 'DATUM_ZU_FRUEH');
  await pruefe({ zurueck: '2028-01-01' }, 'zurueck', 'DATUM_ZU_SPAET');
  await pruefe({ urlaub: [1, 2, 3, 4, 5, 6, 7] }, 'urlaub', 'ZU_VIELE_WOCHEN');
  await pruefe({ urlaub: [10, 11, 12, 13] }, 'urlaub', 'ZU_VIELE_AM_STUECK');
  // ausgeschaltete Regel max_zahl (40) greift nicht
  await absendenKeys(code2, { ...basis, rest: 99 });
  assert.equal((await gespeichert(code2)).rest, 99);
  // Wochenregeln einzeln schaltbar
  const fid = bau.ids.urlaub;
  await db.query("update urlaub.regeln set aktiv = false where frage_id = $1 and art = 'max_am_stueck'", [fid]);
  try {
    await absendenKeys(code2, { ...basis, urlaub: [10, 11, 12, 13] });
    assert.deepEqual((await gespeichert(code2)).urlaub, [10, 11, 12, 13]);
  } finally {
    await db.query("update urlaub.regeln set aktiv = true where frage_id = $1 and art = 'max_am_stueck'", [fid]);
  }
  await db.query("update urlaub.regeln set wert = '2', aktiv = true where frage_id = $1 and art = 'min_wochen'", [fid]);
  try {
    await pruefe({ urlaub: [5] }, 'urlaub', 'ZU_WENIGE_WOCHEN');
  } finally {
    await db.query("update urlaub.regeln set wert = '1' where frage_id = $1 and art = 'min_wochen'", [fid]);
  }
  await db.query("update urlaub.regeln set wert = '10' where frage_id = $1 and art = 'max_urlaubstage'", [fid]);
  try {
    await pruefe({ urlaub: [5, 7] }, 'urlaub', 'ZU_VIELE_TAGE');
  } finally {
    await db.query("update urlaub.regeln set wert = '36' where frage_id = $1 and art = 'max_urlaubstage'", [fid]);
  }
});

test('Unbekannte Frage-IDs und Nicht-Objekte', async () => {
  const antworten = mitIds(bau, { urlaub: [5], schicht: 'frueh' });
  antworten['999999'] = 'egal';
  await absenden(code2, antworten);
  assert.deepEqual(Object.keys(await gespeichert(code2)).sort(), ['schicht', 'urlaub']);
  const f = await fehlerVon(bau, browser(db, 'select public.umfrage_absenden($1, $2)', [code2, JSON.stringify([1, 2])]));
  assert.equal(f.message, 'ANTWORTEN_UNGUELTIG');
  assert.equal(f.fehler.urlaub, 'PFLICHT');
});

test('Falscher Code und abgelaufene Frist', async () => {
  await assert.rejects(laden('0'.repeat(32)), /LINK_UNGUELTIG/);
  await assert.rejects(absenden('0'.repeat(32), {}), /LINK_UNGUELTIG/);
  await db.query("update urlaub.umfragen set frist = now() - interval '1 second' where id = $1", [bau.umfrageId]);
  try {
    await assert.rejects(absendenKeys(code2, { urlaub: [5], schicht: 'frueh' }), /FRIST_ABGELAUFEN/);
    assert.equal((await laden(code2)).offen, false);
  } finally {
    await db.query("update urlaub.umfragen set frist = now() + interval '1 day' where id = $1", [bau.umfrageId]);
  }
});

test('Antworten anderer Mitarbeiter sind nicht sichtbar', async () => {
  await absendenKeys(code, { ...GUELTIG, kurz: 'geheim' });
  const r = await laden(code2);
  assert.ok(!JSON.stringify(r).includes('geheim'));
  assert.ok(!JSON.stringify(r).includes('Anna'));
});

test('Rechte: Browser-Schlüssel nur Laden/Absenden, kein Tabellenzugriff', async () => {
  for (const t of ['fragen', 'optionen', 'regeln', 'bedingungen', 'antworten', 'antwort_optionen', 'abgaben']) {
    await assert.rejects(browser(db, `select * from urlaub.${t}`), /permission denied/, t);
  }
  for (const fn of ["urlaub.pruefe_antworten(1, '{}')", 'urlaub.formular(1)', "urlaub.ist_leer('1')"]) {
    await assert.rejects(browser(db, `select ${fn}`), /permission denied/, fn);
  }
  await assert.rejects(als(db, 'authenticated', null, 'select public.urlaub_laden($1)', [code]), /permission denied/);
  await assert.rejects(als(db, 'authenticated', null, 'select public.umfrage_absenden($1, $2)', [code, '{}']), /permission denied/);
});
```

- [ ] **Step 5: Tests laufen lassen – müssen fehlschlagen**

Run: `node --test tests/datenbank.test.mjs tests/sichtbarkeit.test.mjs`
Expected: FAIL (`function public.urlaub_laden(unknown) does not exist` bzw. `urlaub.pruefe_antworten … does not exist`).

- [ ] **Step 6: Funktionen einfügen** – in `supabase/schema.sql` direkt **nach** den `drop function`-Zeilen des Blocks „Mitarbeiter-Funktionen: siehe Task 2“ (Task 1, Schritt 7h) einfügen; die Kommentarzeile „siehe Task 2“ ersetzen durch „Mitarbeiter-Funktionen: Antworten prüfen und absenden“:

```sql
-- Leer = nicht beantwortet: fehlt, JSON-null, leere Liste, leerer Text.
create or replace function urlaub.ist_leer(p_wert jsonb)
returns boolean
language sql immutable
set search_path = ''
as $$
  select p_wert is null
      or jsonb_typeof(p_wert) = 'null'
      or (jsonb_typeof(p_wert) = 'array' and jsonb_array_length(p_wert) = 0)
      or (jsonb_typeof(p_wert) = 'string' and btrim(p_wert #>> '{}') = '')
$$;

-- Bedingung erfüllt? Es zählen nur bereits geprüfte Antworten (p_gueltig) von Fragen,
-- die selbst sichtbar sind (p_sichtbar). Unbeantwortet oder unsichtbar = nicht erfüllt.
create or replace function urlaub.bedingung_erfuellt(p_b urlaub.bedingungen, p_gueltig jsonb, p_sichtbar bigint[])
returns boolean
language plpgsql immutable
set search_path = ''
as $$
declare
  v jsonb := p_gueltig -> p_b.quelle_id::text;
begin
  if not (p_b.quelle_id = any (p_sichtbar)) or urlaub.ist_leer(v) then
    return false;
  end if;
  if p_b.operator in ('enthaelt_eine_von', 'enthaelt_keine_von') and jsonb_typeof(v) <> 'array' then
    return false;
  end if;
  if p_b.operator in ('gleich', 'groesser', 'kleiner')
     and (jsonb_typeof(v) <> 'number' or jsonb_typeof(p_b.werte) <> 'number') then
    return false;
  end if;
  return case p_b.operator
    when 'ist_eine_von'       then jsonb_typeof(p_b.werte) = 'array' and p_b.werte @> jsonb_build_array(v)
    when 'ist_keine_von'      then jsonb_typeof(p_b.werte) = 'array' and not (p_b.werte @> jsonb_build_array(v))
    when 'enthaelt_eine_von'  then exists (select 1 from jsonb_array_elements(v) e where p_b.werte @> jsonb_build_array(e))
    when 'enthaelt_keine_von' then not exists (select 1 from jsonb_array_elements(v) e where p_b.werte @> jsonb_build_array(e))
    when 'ist'                then v = p_b.werte
    when 'gleich'             then (v #>> '{}')::numeric = (p_b.werte #>> '{}')::numeric
    when 'groesser'           then (v #>> '{}')::numeric > (p_b.werte #>> '{}')::numeric
    when 'kleiner'            then (v #>> '{}')::numeric < (p_b.werte #>> '{}')::numeric
    else false
  end;
end;
$$;

-- Wochenregeln der Urlaubswochen-Frage; nur eingeschaltete Regeln zählen.
create or replace function urlaub.wochen_verstoss(p_frage urlaub.fragen, p_wochen jsonb)
returns text
language plpgsql stable
set search_path = ''
as $$
declare
  v_regel   jsonb := (select coalesce(jsonb_object_agg(r.art, r.wert), '{}'::jsonb)
                      from urlaub.regeln r where r.frage_id = p_frage.id and r.aktiv);
  v_liste   int[];
  v_erlaubt int[];
  v_stueck  int;
  v_tage    int;
begin
  if jsonb_typeof(p_wochen) <> 'array'
     or exists (select 1 from jsonb_array_elements(p_wochen) e
                where jsonb_typeof(e) <> 'number'
                   or abs((e #>> '{}')::numeric) > 100
                   or (e #>> '{}')::numeric <> trunc((e #>> '{}')::numeric)) then
    return 'UNGUELTIGE_WOCHE';
  end if;
  select array_agg((e #>> '{}')::int) into v_liste from jsonb_array_elements(p_wochen) e;
  select coalesce(array_agg(k.kw), '{}') into v_erlaubt from urlaub.kalender(p_frage.umfrage_id) k where not k.gesperrt;
  if exists (select 1 from unnest(v_liste) x where not (x = any (v_erlaubt))) then
    return 'UNGUELTIGE_WOCHE';
  end if;
  if (select count(distinct x) from unnest(v_liste) x) <> cardinality(v_liste) then
    return 'DOPPELTE_WOCHE';
  end if;
  if v_regel ? 'min_wochen' and cardinality(v_liste) < (v_regel ->> 'min_wochen')::int then
    return 'ZU_WENIGE_WOCHEN';
  end if;
  if v_regel ? 'max_wochen' and cardinality(v_liste) > (v_regel ->> 'max_wochen')::int then
    return 'ZU_VIELE_WOCHEN';
  end if;
  if v_regel ? 'max_am_stueck' then
    select max(n) into v_stueck
    from (select count(*) as n
          from (select x - row_number() over (order by x) as gruppe from unnest(v_liste) x) s
          group by gruppe) t;
    if v_stueck > (v_regel ->> 'max_am_stueck')::int then
      return 'ZU_VIELE_AM_STUECK';
    end if;
  end if;
  if v_regel ? 'max_urlaubstage' then
    select coalesce(sum(k.arbeitstage), 0) into v_tage from urlaub.kalender(p_frage.umfrage_id) k where k.kw = any (v_liste);
    if v_tage > (v_regel ->> 'max_urlaubstage')::int then
      return 'ZU_VIELE_TAGE';
    end if;
  end if;
  return null;
end;
$$;

-- Erster Verstoß einer (nicht leeren) Antwort gegen Typ und eingeschaltete Regeln, sonst null.
create or replace function urlaub.antwort_verstoss(p_frage urlaub.fragen, p_wert jsonb)
returns text
language plpgsql stable
set search_path = ''
as $$
declare
  v_regel jsonb := (select coalesce(jsonb_object_agg(r.art, r.wert), '{}'::jsonb)
                    from urlaub.regeln r where r.frage_id = p_frage.id and r.aktiv);
  v_typ   text := jsonb_typeof(p_wert);
  v_zahl  numeric;
  v_text  text;
  v_datum date;
begin
  case p_frage.typ
  when 'urlaubswochen' then
    return urlaub.wochen_verstoss(p_frage, p_wert);
  when 'einfach' then
    if v_typ <> 'number' or not exists (select 1 from urlaub.optionen o
         where o.frage_id = p_frage.id and o.aktiv and o.id::numeric = (p_wert #>> '{}')::numeric) then
      return 'UNGUELTIGE_ANTWORT';
    end if;
  when 'mehrfach' then
    if v_typ <> 'array'
       or exists (select 1 from jsonb_array_elements(p_wert) e
                  where jsonb_typeof(e) <> 'number'
                     or not exists (select 1 from urlaub.optionen o
                                    where o.frage_id = p_frage.id and o.aktiv and o.id::numeric = (e #>> '{}')::numeric))
       or (select count(distinct (e #>> '{}')::numeric) from jsonb_array_elements(p_wert) e) <> jsonb_array_length(p_wert) then
      return 'UNGUELTIGE_ANTWORT';
    end if;
    if v_regel ? 'min_anzahl' and jsonb_array_length(p_wert) < (v_regel ->> 'min_anzahl')::int then
      return 'ZU_WENIGE_ANTWORTEN';
    end if;
    if v_regel ? 'max_anzahl' and jsonb_array_length(p_wert) > (v_regel ->> 'max_anzahl')::int then
      return 'ZU_VIELE_ANTWORTEN';
    end if;
  when 'janein' then
    if v_typ <> 'boolean' then
      return 'UNGUELTIGE_ANTWORT';
    end if;
  when 'skala' then
    if v_typ <> 'number' then
      return 'UNGUELTIGE_ANTWORT';
    end if;
    v_zahl := (p_wert #>> '{}')::numeric;
    if v_zahl <> trunc(v_zahl) or v_zahl < p_frage.skala_von or v_zahl > p_frage.skala_bis then
      return 'UNGUELTIGE_ANTWORT';
    end if;
  when 'zahl' then
    if v_typ <> 'number' then
      return 'UNGUELTIGE_ANTWORT';
    end if;
    v_zahl := (p_wert #>> '{}')::numeric;
    if abs(v_zahl) >= 1e12 then
      return 'UNGUELTIGE_ANTWORT';
    end if;
    if v_regel ? 'min_zahl' and v_zahl < (v_regel ->> 'min_zahl')::numeric then
      return 'ZAHL_ZU_KLEIN';
    end if;
    if v_regel ? 'max_zahl' and v_zahl > (v_regel ->> 'max_zahl')::numeric then
      return 'ZAHL_ZU_GROSS';
    end if;
  when 'text_kurz', 'text_lang' then
    if v_typ <> 'string' then
      return 'UNGUELTIGE_ANTWORT';
    end if;
    v_text := btrim(p_wert #>> '{}');
    if char_length(v_text) > case p_frage.typ when 'text_kurz' then 200 else 5000 end
       or (v_regel ? 'max_zeichen' and char_length(v_text) > (v_regel ->> 'max_zeichen')::int) then
      return 'TEXT_ZU_LANG';
    end if;
  when 'datum' then
    if v_typ <> 'string' or (p_wert #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$' then
      return 'UNGUELTIGE_ANTWORT';
    end if;
    begin
      v_datum := (p_wert #>> '{}')::date;
    exception when data_exception then
      return 'UNGUELTIGE_ANTWORT';
    end;
    if v_regel ? 'fruehestens' and v_datum < (v_regel ->> 'fruehestens')::date then
      return 'DATUM_ZU_FRUEH';
    end if;
    if v_regel ? 'spaetestens' and v_datum > (v_regel ->> 'spaetestens')::date then
      return 'DATUM_ZU_SPAET';
    end if;
  else
    return null;
  end case;
  return null;
end;
$$;

-- Gespeicherte Form: Listen sortiert, Options-IDs ganzzahlig, Texte getrimmt.
create or replace function urlaub.antwort_normalisiert(p_frage urlaub.fragen, p_wert jsonb)
returns jsonb
language sql immutable
set search_path = ''
as $$
  select case
    when p_frage.typ in ('urlaubswochen', 'mehrfach') then
      (select jsonb_agg(to_jsonb(((e #>> '{}')::numeric)::bigint) order by (e #>> '{}')::numeric)
       from jsonb_array_elements(p_wert) e)
    when p_frage.typ = 'einfach' then to_jsonb(((p_wert #>> '{}')::numeric)::bigint)
    when p_frage.typ in ('text_kurz', 'text_lang') then to_jsonb(btrim(p_wert #>> '{}'))
    else p_wert
  end
$$;

-- Prüft alle Antworten einer Abgabe in Fragenreihenfolge. Nur eingeschaltete Fragen;
-- Sichtbarkeit aus den bereits geprüften Antworten früherer Fragen.
create or replace function urlaub.pruefe_antworten(p_umfrage_id bigint, p_antworten jsonb)
returns jsonb
language plpgsql stable
set search_path = ''
as $$
declare
  v_f        urlaub.fragen;
  v_eingabe  jsonb := case when jsonb_typeof(p_antworten) = 'object' then p_antworten else '{}'::jsonb end;
  v_wert     jsonb;
  v_code     text;
  v_gueltig  jsonb := '{}';
  v_fehler   jsonb := '{}';
  v_sichtbar bigint[] := '{}';
  v_anzahl   int;
  v_erfuellt boolean;
begin
  for v_f in select * from urlaub.fragen where umfrage_id = p_umfrage_id and aktiv order by position, id loop
    select count(*),
           case v_f.verknuepfung
             when 'oder' then bool_or(urlaub.bedingung_erfuellt(b, v_gueltig, v_sichtbar))
             else bool_and(urlaub.bedingung_erfuellt(b, v_gueltig, v_sichtbar))
           end
      into v_anzahl, v_erfuellt
      from urlaub.bedingungen b where b.frage_id = v_f.id and b.aktiv;
    if v_anzahl > 0 and not v_erfuellt then
      continue;
    end if;
    v_sichtbar := v_sichtbar || v_f.id;
    if v_f.typ = 'hinweis' then
      continue;
    end if;
    v_wert := v_eingabe -> v_f.id::text;
    if urlaub.ist_leer(v_wert) then
      if exists (select 1 from urlaub.regeln r where r.frage_id = v_f.id and r.art = 'pflicht' and r.aktiv) then
        v_fehler := v_fehler || jsonb_build_object(v_f.id::text, 'PFLICHT');
      end if;
      continue;
    end if;
    v_code := urlaub.antwort_verstoss(v_f, v_wert);
    if v_code is null then
      v_gueltig := v_gueltig || jsonb_build_object(v_f.id::text, urlaub.antwort_normalisiert(v_f, v_wert));
    else
      v_fehler := v_fehler || jsonb_build_object(v_f.id::text, v_code);
    end if;
  end loop;
  return jsonb_build_object('sichtbar', to_jsonb(v_sichtbar), 'antworten', v_gueltig, 'fehler', v_fehler);
end;
$$;

-- Eine Frage als JSON. p_alles=false: Mitarbeiter-Sicht (nur Eingeschaltetes);
-- p_alles=true: Verwaltungs-Sicht (alles mit Schaltern und Hinweis auf vorhandene Antworten).
create or replace function urlaub.frage_json(p_f urlaub.fragen, p_alles boolean)
returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id',           p_f.id,
    'typ',          p_f.typ,
    'text',         p_f.text,
    'hilfetext',    p_f.hilfetext,
    'position',     p_f.position,
    'verknuepfung', p_f.verknuepfung,
    'optionen', coalesce((
      select jsonb_agg(case when p_alles
                         then jsonb_build_object('id', o.id, 'text', o.text, 'aktiv', o.aktiv, 'position', o.position,
                                'hat_antworten', exists (select 1 from urlaub.antwort_optionen ao where ao.option_id = o.id))
                         else jsonb_build_object('id', o.id, 'text', o.text) end
                       order by o.position, o.id)
      from urlaub.optionen o where o.frage_id = p_f.id and (p_alles or o.aktiv)), '[]'::jsonb),
    'regeln', case when p_alles
      then coalesce((select jsonb_object_agg(r.art, jsonb_build_object('wert', r.wert, 'aktiv', r.aktiv))
                     from urlaub.regeln r where r.frage_id = p_f.id), '{}'::jsonb)
      else coalesce((select jsonb_object_agg(r.art, r.wert)
                     from urlaub.regeln r where r.frage_id = p_f.id and r.aktiv), '{}'::jsonb) end,
    'bedingungen', coalesce((
      select jsonb_agg(case when p_alles
                         then jsonb_build_object('id', b.id, 'quelle_id', b.quelle_id, 'operator', b.operator,
                                                 'werte', b.werte, 'aktiv', b.aktiv)
                         else jsonb_build_object('quelle_id', b.quelle_id, 'operator', b.operator, 'werte', b.werte) end
                       order by b.id)
      from urlaub.bedingungen b where b.frage_id = p_f.id and (p_alles or b.aktiv)), '[]'::jsonb),
    'skala', case when p_f.typ = 'skala'
      then jsonb_build_object('von', p_f.skala_von, 'bis', p_f.skala_bis, 'links', p_f.skala_links, 'rechts', p_f.skala_rechts) end,
    'urlaubswochen', case when p_f.typ = 'urlaubswochen'
      then jsonb_build_object('jahr', p_f.jahr, 'bundesland', p_f.bundesland,
                              'arbeitstage_pro_woche', p_f.arbeitstage_pro_woche, 'sperr_hinweis', p_f.sperr_hinweis,
                              'kalender', urlaub.kalender_json(p_f.umfrage_id)) end)
  || case when p_alles
       then jsonb_build_object('aktiv', p_f.aktiv,
                               'hat_antworten', exists (select 1 from urlaub.antworten an where an.frage_id = p_f.id))
       else '{}'::jsonb end
$$;

-- Daten für die Mitarbeiter-Seite: nur diese Person, nur eingeschaltete Fragen.
create or replace function urlaub.formular(p_mitarbeiter_id bigint)
returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'name',         m.name,
    'titel',        u.titel,
    'frist',        u.frist,
    'offen',        now() < u.frist,
    'geaendert_am', a.geaendert_am,
    'fragen', coalesce((select jsonb_agg(urlaub.frage_json(f, false) order by f.position, f.id)
                        from urlaub.fragen f where f.umfrage_id = u.id and f.aktiv), '[]'::jsonb),
    'antworten', coalesce((select jsonb_object_agg(an.frage_id::text, an.wert)
                           from urlaub.antworten an
                           join urlaub.fragen f on f.id = an.frage_id and f.aktiv
                           where an.mitarbeiter_id = m.id), '{}'::jsonb))
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
  return urlaub.formular(v_id);
end;
$$;

-- Prüft alle Antworten; bei Fehlern wird nichts gespeichert (detail = Fehler je Frage).
-- Sonst ersetzt die Abgabe alle bisherigen Antworten dieser Person.
create or replace function public.umfrage_absenden(p_code text, p_antworten jsonb)
returns jsonb
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_m     urlaub.mitarbeiter;
  v_frist timestamptz;
  v_r     jsonb;
  v_id    text;
  v_wert  jsonb;
  v_typ   text;
begin
  select * into v_m from urlaub.mitarbeiter where code = p_code;
  if not found then
    raise exception 'LINK_UNGUELTIG';
  end if;
  select frist into v_frist from urlaub.umfragen where id = v_m.umfrage_id;
  if now() >= v_frist then
    raise exception 'FRIST_ABGELAUFEN';
  end if;
  v_r := urlaub.pruefe_antworten(v_m.umfrage_id, p_antworten);
  if v_r -> 'fehler' <> '{}'::jsonb then
    raise exception 'ANTWORTEN_UNGUELTIG' using detail = (v_r -> 'fehler')::text;
  end if;
  delete from urlaub.antworten where mitarbeiter_id = v_m.id;
  for v_id, v_wert in select key, value from jsonb_each(v_r -> 'antworten') loop
    insert into urlaub.antworten (mitarbeiter_id, frage_id, wert) values (v_m.id, v_id::bigint, v_wert);
    select typ into v_typ from urlaub.fragen where id = v_id::bigint;
    if v_typ = 'einfach' then
      insert into urlaub.antwort_optionen (mitarbeiter_id, frage_id, option_id)
      values (v_m.id, v_id::bigint, (v_wert #>> '{}')::bigint);
    elsif v_typ = 'mehrfach' then
      insert into urlaub.antwort_optionen (mitarbeiter_id, frage_id, option_id)
      select v_m.id, v_id::bigint, (e #>> '{}')::bigint from jsonb_array_elements(v_wert) e;
    end if;
  end loop;
  insert into urlaub.abgaben (mitarbeiter_id, geaendert_am) values (v_m.id, now())
  on conflict (mitarbeiter_id) do update set geaendert_am = excluded.geaendert_am;
  return urlaub.formular(v_m.id);
end;
$$;

revoke all on function public.urlaub_laden(text)             from public, anon, authenticated;
revoke all on function public.umfrage_absenden(text, jsonb)  from public, anon, authenticated;
grant execute on function public.urlaub_laden(text)            to anon;
grant execute on function public.umfrage_absenden(text, jsonb) to anon;
```

Hinweis: In Task 1 steht im selben Block `drop function if exists public.urlaub_laden(text);` – diese Zeile **entfernen**, sonst wird die neue Funktion bei jedem erneuten Lauf erst gelöscht und dann neu angelegt (funktioniert, verliert aber unnötig die Rechte zwischendurch). `drop function if exists public.urlaub_speichern(text, int[]);` bleibt.

- [ ] **Step 7: Tests laufen lassen**

Run: `npm test`
Expected: PASS (alle Dateien).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Datenbank Stand 3: Antworten prüfen (Typen, Regeln, Sichtbarkeit) und absenden

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Editor-Funktionen, Kopieren, Verwaltungs-Sicht der Umfrage

**Files:**
- Modify: `supabase/schema.sql` (neuer Block „Fragen-Editor“ nach den Organisator-Funktionen, vor „Einladungen und Registrierung“; `public.org_umfrage` erweitern)
- Create: `tests/editor.test.mjs`

**Interfaces:**
- Consumes: Task 1 (Tabellen, `urlaub.standard_urlaubsfrage`, `urlaub.urlaubsfrage`), Task 2 (`urlaub.frage_json`, `urlaub.pruefe_antworten`), bestehend `urlaub.ich()`, `urlaub.eigene_umfrage()`.
- Produces (SQL, intern):
  - `urlaub.eigene_frage(bigint) → urlaub.fragen` (wirft `FRAGE_NICHT_GEFUNDEN`)
  - `urlaub.eigene_option(bigint) → urlaub.optionen` (wirft `OPTION_NICHT_GEFUNDEN`)
  - `urlaub.eigene_bedingung(bigint) → urlaub.bedingungen` (wirft `BEDINGUNG_NICHT_GEFUNDEN`)
  - `urlaub.erlaubte_regeln(p_typ text) → text[]`
  - `urlaub.positionen_neu(p_umfrage_id bigint)` (nummeriert Fragen 1…n nach `position, id`)
- Produces (`public`, für `authenticated`, alle mit Besitzprüfung):

| Funktion | Rückgabe | Verhalten |
|---|---|---|
| `org_frage_anlegen(p_umfrage_id bigint, p_typ text)` | bigint | hängt an; Vorgaben je Typ (siehe unten); 2. Urlaubswochen → `URLAUBSWOCHEN_DOPPELT`; unbekannter Typ → `UNGUELTIGE_EINSTELLUNG` |
| `org_frage_speichern(p_frage_id bigint, p_daten jsonb)` | void | Schlüssel optional: `text, hilfetext, verknuepfung, typ, skala_von, skala_bis, skala_links, skala_rechts, jahr, bundesland, arbeitstage_pro_woche, sperr_hinweis` |
| `org_frage_schalten(p_frage_id bigint, p_aktiv boolean)` | void | |
| `org_frage_verschieben(p_frage_id bigint, p_richtung int)` | void | −1 hoch, +1 runter; am Rand nichts; Bedingungsreihenfolge verletzt → `REIHENFOLGE_BEDINGUNG` |
| `org_frage_loeschen(p_frage_id bigint)` | void | Antworten vorhanden → `HAT_ANTWORTEN`; Quelle einer Bedingung → `BEDINGUNG_VERWEIST`; danach Positionen neu |
| `org_option_anlegen(p_frage_id bigint, p_text text)` | bigint | nur bei einfach/mehrfach, sonst `UNGUELTIGE_EINSTELLUNG`; leerer Text → `FRAGETEXT_LEER` |
| `org_option_speichern(p_option_id bigint, p_text text)` | void | leerer Text → `FRAGETEXT_LEER` |
| `org_option_schalten(p_option_id bigint, p_aktiv boolean)` | void | |
| `org_option_verschieben(p_option_id bigint, p_richtung int)` | void | am Rand nichts |
| `org_option_loeschen(p_option_id bigint)` | void | gewählt → `HAT_ANTWORTEN`; in Bedingungswerten → `BEDINGUNG_VERWEIST` |
| `org_regel_setzen(p_frage_id bigint, p_art text, p_wert jsonb, p_aktiv boolean)` | void | Art nicht erlaubt → `REGEL_UNPASSEND`; Wert ungültig → `UNGUELTIGE_EINSTELLUNG`; legt an oder ändert |
| `org_bedingung_anlegen(p_frage_id bigint, p_quelle_id bigint, p_operator text, p_werte jsonb)` | bigint | ungültig → `BEDINGUNG_UNGUELTIG` |
| `org_bedingung_speichern(p_bedingung_id bigint, p_operator text, p_werte jsonb)` | void | ungültig → `BEDINGUNG_UNGUELTIG` |
| `org_bedingung_schalten(p_bedingung_id bigint, p_aktiv boolean)` | void | |
| `org_bedingung_loeschen(p_bedingung_id bigint)` | void | |
| `org_umfrage_kopieren(p_umfrage_id bigint)` | bigint | „Kopie von <Titel>“, gleiche Frist, alle Fragen/Optionen/Regeln/Bedingungen (IDs umgeschlüsselt, Schalter gleich), freie Tage; ohne Mitarbeiter/Antworten |

- `public.org_umfrage(bigint)` endgültig: `{einstellungen:{id,titel,frist,frist_eingabe,offen}, freie_tage, fragen:[frage_json(f, true)…], mitarbeiter:[{id,name,link,geaendert_am,antworten:{"<id>":wert},verstoesse:{"<id>":code}}], kalender: kalender_json(umfrage)}`. `verstoesse` = `pruefe_antworten(umfrage, gespeicherte Antworten)->'fehler'` für Mitarbeiter mit Abgabe, sonst `{}`.

**Vorgaben beim Anlegen:** Text „Neue Frage“ (Hinweistext: „Hinweis“); einfach/mehrfach: Optionen „Antwort 1“, „Antwort 2“; skala: 1–5; urlaubswochen: `urlaub.standard_urlaubsfrage(umfrage, Jahr der Frist + 1, 'BY')`; keine Regeln außer bei urlaubswochen.

**Erlaubte Regeln:** urlaubswochen: `pflicht, min_wochen, max_wochen, max_am_stueck, max_urlaubstage, gesperrte_monate`; einfach, janein, skala: `pflicht`; mehrfach: `pflicht, min_anzahl, max_anzahl`; text_kurz, text_lang: `pflicht, max_zeichen`; zahl: `pflicht, min_zahl, max_zahl`; datum: `pflicht, fruehestens, spaetestens`; hinweis: keine.

**Regelwerte:** `pflicht` → immer `null` gespeichert; `min_anzahl, max_anzahl, min_wochen, max_wochen, max_am_stueck, max_urlaubstage` → ganze Zahl ≥ 0; `max_zeichen` → ganze Zahl ≥ 1; `min_zahl, max_zahl` → Zahl; `fruehestens, spaetestens` → gültiges Datum `YYYY-MM-DD`; `gesperrte_monate` → Liste ganzer Zahlen 1–12, gespeichert sortiert und ohne Doppelte.

**Bedingungen gültig, wenn:** Quelle ≠ Ziel, gleiche Umfrage, Quelle steht vor dem Ziel (kleinere Position), und Operator/Werte passen zum Quelltyp: einfach → `ist_eine_von|ist_keine_von` mit nicht leerer Liste von Options-IDs der Quellfrage; mehrfach → `enthaelt_eine_von|enthaelt_keine_von` ebenso; janein → `ist` mit `true|false`; skala, zahl → `gleich|groesser|kleiner` mit einer Zahl. Andere Quelltypen sind nicht erlaubt.

**Frage speichern – Regeln:** leerer Text → `FRAGETEXT_LEER`; Typwechsel nur ohne Antworten (`TYP_GESPERRT`), nicht von/zu `urlaubswochen` (`UNGUELTIGE_EINSTELLUNG`), nicht wenn die Frage Quelle einer Bedingung ist (`BEDINGUNG_VERWEIST`); beim Typwechsel werden nicht mehr erlaubte Regeln gelöscht, Optionen gelöscht wenn der neue Typ keine Auswahl ist, zwei Standard-Optionen angelegt wenn der neue Typ eine Auswahl ist und keine Optionen existieren, Skala-Vorgaben 1–5 gesetzt beim Wechsel zu skala. `jahr`, `bundesland`, `arbeitstage_pro_woche`, `skala_von`, `skala_bis` nur ohne Antworten änderbar (`GRUNDDATEN_GESPERRT`, unveränderte Werte sind erlaubt). Ändert sich `jahr` und steht die Frist der Umfrage noch auf dem Standard des alten Jahres (30.11. des Vorjahres 23:59:59 Berlin), zieht sie auf den Standard des neuen Jahres mit. Constraint-/Datenfehler → `UNGUELTIGE_EINSTELLUNG` (Besitzprüfung außerhalb des inneren `exception`-Blocks).

- [ ] **Step 1: Tests schreiben** – `tests/editor.test.mjs`:

```js
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { neueDatenbank, als, browser, organisator } from './helfer.mjs';

let db;
let chef;
let eva;

before(async () => {
  db = await neueDatenbank();
  chef = await organisator(db, 'chef');
  eva = await organisator(db, 'eva');
});

const c = async (sql, params) => (await als(db, 'authenticated', chef, sql, params))[0];
const umfrage = async (id) => (await c('select public.org_umfrage($1) as r', [id])).r;
const neueUmfrage = async (titel = 'Test') => (await c("select public.org_umfrage_anlegen($1, 2027, 'BY') as id", [titel])).id;
const frage = async (u, typ) => (await c('select public.org_frage_anlegen($1, $2) as id', [u, typ])).id;
const speichern = (f, d) => c('select public.org_frage_speichern($1, $2)', [f, d]);
const regel = (f, art, wert, aktiv = true) => c('select public.org_regel_setzen($1, $2, $3, $4)', [f, art, JSON.stringify(wert), aktiv]);
const bedingung = async (f, q, op, werte) =>
  (await c('select public.org_bedingung_anlegen($1, $2, $3, $4) as id', [f, q, op, JSON.stringify(werte)])).id;
const fragenVon = async (u) => (await umfrage(u)).fragen;
const findeFrage = async (u, id) => (await fragenVon(u)).find((f) => f.id === Number(id));
async function mitarbeiterMitCode(u, name) {
  await c('select public.org_mitarbeiter_anlegen($1, $2)', [u, name]);
  return (await db.query('select code from urlaub.mitarbeiter where umfrage_id = $1 and name = $2', [u, name])).rows[0].code;
}
const absenden = (code, antworten) => browser(db, 'select public.umfrage_absenden($1, $2)', [code, JSON.stringify(antworten)]);

test('Frage anlegen: Vorgaben je Typ und Reihenfolge', async () => {
  const u = await neueUmfrage();
  const ids = {};
  for (const typ of ['einfach', 'mehrfach', 'janein', 'skala', 'text_kurz', 'text_lang', 'zahl', 'datum', 'hinweis']) {
    ids[typ] = await frage(u, typ);
  }
  const fragen = await fragenVon(u);
  assert.deepEqual(fragen.map((f) => f.typ),
    ['urlaubswochen', 'einfach', 'mehrfach', 'janein', 'skala', 'text_kurz', 'text_lang', 'zahl', 'datum', 'hinweis']);
  assert.deepEqual(fragen.map((f) => f.position), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const einfach = fragen[1];
  assert.equal(einfach.text, 'Neue Frage');
  assert.deepEqual(einfach.optionen.map((o) => [o.text, o.aktiv, o.hat_antworten]), [['Antwort 1', true, false], ['Antwort 2', true, false]]);
  assert.deepEqual(einfach.regeln, {});
  assert.equal(einfach.aktiv, true);
  assert.equal(einfach.hat_antworten, false);
  assert.deepEqual(fragen[4].skala, { von: 1, bis: 5, links: null, rechts: null });
  assert.equal(fragen[9].text, 'Hinweis');
  assert.deepEqual(fragen[0].regeln.max_am_stueck, { wert: 3, aktiv: true });
  await assert.rejects(frage(u, 'urlaubswochen'), /URLAUBSWOCHEN_DOPPELT/);
  await assert.rejects(frage(u, 'quatsch'), /UNGUELTIGE_EINSTELLUNG/);
});

test('Frage speichern: Texte, Verknüpfung, Skala', async () => {
  const u = await neueUmfrage();
  const f = await frage(u, 'skala');
  await speichern(f, { text: '  Wie wichtig?  ', hilfetext: '1 = egal', verknuepfung: 'oder',
    skala_von: 0, skala_bis: 10, skala_links: 'egal', skala_rechts: 'sehr' });
  const g = await findeFrage(u, f);
  assert.deepEqual([g.text, g.hilfetext, g.verknuepfung], ['Wie wichtig?', '1 = egal', 'oder']);
  assert.deepEqual(g.skala, { von: 0, bis: 10, links: 'egal', rechts: 'sehr' });
  await assert.rejects(speichern(f, { text: '  ' }), /FRAGETEXT_LEER/);
  await assert.rejects(speichern(f, { verknuepfung: 'xor' }), /UNGUELTIGE_EINSTELLUNG/);
  await assert.rejects(speichern(f, { skala_von: 5, skala_bis: 3 }), /UNGUELTIGE_EINSTELLUNG/);
});

test('Typwechsel ohne Antworten räumt Optionen und Regeln auf', async () => {
  const u = await neueUmfrage();
  const f = await frage(u, 'mehrfach');
  await regel(f, 'pflicht', null);
  await regel(f, 'min_anzahl', 2);
  await speichern(f, { typ: 'text_kurz' });
  let g = await findeFrage(u, f);
  assert.equal(g.typ, 'text_kurz');
  assert.deepEqual(g.optionen, []);
  assert.deepEqual(Object.keys(g.regeln), ['pflicht']);
  await speichern(f, { typ: 'einfach' });
  g = await findeFrage(u, f);
  assert.deepEqual(g.optionen.map((o) => o.text), ['Antwort 1', 'Antwort 2']);
  await speichern(f, { typ: 'skala' });
  g = await findeFrage(u, f);
  assert.deepEqual(g.skala, { von: 1, bis: 5, links: null, rechts: null });
  await assert.rejects(speichern(f, { typ: 'urlaubswochen' }), /UNGUELTIGE_EINSTELLUNG/);
  const uw = (await fragenVon(u))[0].id;
  await assert.rejects(speichern(uw, { typ: 'text_kurz' }), /UNGUELTIGE_EINSTELLUNG/);
});

test('Schalter: Frage, Option, Regel, Bedingung unabhängig', async () => {
  const u = await neueUmfrage();
  const q = await frage(u, 'janein');
  const z = await frage(u, 'einfach');
  const b = await bedingung(z, q, 'ist', true);
  await regel(z, 'pflicht', null);
  const optionen = (await findeFrage(u, z)).optionen;
  await c('select public.org_option_schalten($1, false)', [optionen[0].id]);
  await c('select public.org_regel_setzen($1, $2, $3, false)', [z, 'pflicht', 'null']);
  await c('select public.org_bedingung_schalten($1, false)', [b]);
  await c('select public.org_frage_schalten($1, false)', [q]);
  const g = await findeFrage(u, z);
  assert.deepEqual(g.optionen.map((o) => o.aktiv), [false, true]);
  assert.deepEqual(g.regeln.pflicht, { wert: null, aktiv: false });
  assert.equal(g.bedingungen[0].aktiv, false);
  assert.equal((await findeFrage(u, q)).aktiv, false);
  const code = await mitarbeiterMitCode(u, 'Anna');
  const sicht = (await browser(db, 'select public.urlaub_laden($1) as r', [code]))[0].r;
  assert.ok(!sicht.fragen.some((f) => f.id === Number(q)));
  const zSicht = sicht.fragen.find((f) => f.id === Number(z));
  assert.deepEqual(zSicht.optionen.map((o) => o.text), ['Antwort 2']);
  assert.deepEqual(zSicht.regeln, {});
  assert.deepEqual(zSicht.bedingungen, []);
});

test('Reihenfolge: verschieben, Rand, Bedingungen', async () => {
  const u = await neueUmfrage();
  const a = await frage(u, 'text_kurz');
  const q = await frage(u, 'janein');
  const z = await frage(u, 'text_kurz');
  await bedingung(z, q, 'ist', true);
  const reihenfolge = async () => (await fragenVon(u)).map((f) => f.id);
  const uw = (await reihenfolge())[0];
  await c('select public.org_frage_verschieben($1, -1)', [uw]); // schon oben: nichts
  await c('select public.org_frage_verschieben($1, 1)', [z]);   // schon unten: nichts
  assert.deepEqual(await reihenfolge(), [uw, a, q, z].map(Number));
  await assert.rejects(c('select public.org_frage_verschieben($1, -1)', [z]), /REIHENFOLGE_BEDINGUNG/);
  await assert.rejects(c('select public.org_frage_verschieben($1, 1)', [q]), /REIHENFOLGE_BEDINGUNG/);
  await c('select public.org_frage_verschieben($1, 1)', [a]);
  assert.deepEqual(await reihenfolge(), [uw, q, a, z].map(Number));
  assert.deepEqual((await fragenVon(u)).map((f) => f.position), [1, 2, 3, 4]);
});

test('Löschen: geschützt durch Antworten und Bedingungen', async () => {
  const u = await neueUmfrage();
  const uw = (await fragenVon(u))[0].id;
  await regel(uw, 'pflicht', null, false);
  const e = await frage(u, 'einfach');
  const [o1, o2] = (await findeFrage(u, e)).optionen.map((o) => o.id);
  const z = await frage(u, 'text_kurz');
  const code = await mitarbeiterMitCode(u, 'Anna');
  await absenden(code, { [String(e)]: o1 });
  assert.equal((await findeFrage(u, e)).hat_antworten, true);
  assert.equal((await findeFrage(u, e)).optionen[0].hat_antworten, true);
  await assert.rejects(c('select public.org_frage_loeschen($1)', [e]), /HAT_ANTWORTEN/);
  await assert.rejects(c('select public.org_option_loeschen($1)', [o1]), /HAT_ANTWORTEN/);
  const b = await bedingung(z, e, 'ist_eine_von', [o2]);
  await assert.rejects(c('select public.org_option_loeschen($1)', [o2]), /BEDINGUNG_VERWEIST/);
  await c('select public.org_bedingung_loeschen($1)', [b]);
  await c('select public.org_option_loeschen($1)', [o2]);
  assert.equal((await findeFrage(u, e)).optionen.length, 1);
  const q = await frage(u, 'janein');
  const z2 = await frage(u, 'text_kurz');
  await bedingung(z2, q, 'ist', false);
  await assert.rejects(c('select public.org_frage_loeschen($1)', [q]), /BEDINGUNG_VERWEIST/);
  await c('select public.org_frage_loeschen($1)', [z]);
  assert.deepEqual((await fragenVon(u)).map((f) => f.position), [1, 2, 3, 4]);
});

test('Mit Antworten: Typ und Grunddaten gesperrt, Texte frei', async () => {
  const u = await neueUmfrage();
  const uw = (await fragenVon(u))[0].id;
  const s = await frage(u, 'skala');
  const code = await mitarbeiterMitCode(u, 'Anna');
  await absenden(code, { [String(uw)]: [5], [String(s)]: 3 });
  await assert.rejects(speichern(s, { typ: 'zahl' }), /TYP_GESPERRT/);
  await assert.rejects(speichern(s, { skala_bis: 7 }), /GRUNDDATEN_GESPERRT/);
  await speichern(s, { skala_von: 1, skala_bis: 5, text: 'Neu', skala_links: 'wenig' });
  assert.equal((await findeFrage(u, s)).text, 'Neu');
  await assert.rejects(speichern(uw, { jahr: 2028 }), /GRUNDDATEN_GESPERRT/);
  await assert.rejects(speichern(uw, { bundesland: 'NW' }), /GRUNDDATEN_GESPERRT/);
  await assert.rejects(speichern(uw, { arbeitstage_pro_woche: 5 }), /GRUNDDATEN_GESPERRT/);
  await speichern(uw, { jahr: 2027, sperr_hinweis: 'Dezember zu.' });
  assert.equal((await findeFrage(u, uw)).urlaubswochen.sperr_hinweis, 'Dezember zu.');
});

test('Urlaubswochen ohne Antworten: Jahr wechselt, Frist zieht mit', async () => {
  const u = await neueUmfrage();
  const uw = (await fragenVon(u))[0].id;
  await speichern(uw, { jahr: 2028, bundesland: 'NW', arbeitstage_pro_woche: 5 });
  const r = await umfrage(u);
  assert.equal(r.einstellungen.frist_eingabe, '2027-11-30T23:59');
  assert.deepEqual([r.fragen[0].urlaubswochen.jahr, r.fragen[0].urlaubswochen.bundesland, r.fragen[0].urlaubswochen.arbeitstage_pro_woche], [2028, 'NW', 5]);
  assert.equal(r.kalender.length, 52);
  await c('select public.org_umfrage_speichern($1, $2)', [u, { frist: '2027-10-01T12:00' }]);
  await speichern(uw, { jahr: 2029 });
  assert.equal((await umfrage(u)).einstellungen.frist_eingabe, '2027-10-01T12:00');
});

test('Regeln setzen: passend und mit gültigen Werten', async () => {
  const u = await neueUmfrage();
  const t = await frage(u, 'text_kurz');
  await regel(t, 'max_zeichen', 50);
  await regel(t, 'pflicht', 'egal');
  let g = await findeFrage(u, t);
  assert.deepEqual(g.regeln, { max_zeichen: { wert: 50, aktiv: true }, pflicht: { wert: null, aktiv: true } });
  await assert.rejects(regel(t, 'min_anzahl', 2), /REGEL_UNPASSEND/);
  await assert.rejects(regel(t, 'max_zeichen', 'viel'), /UNGUELTIGE_EINSTELLUNG/);
  await assert.rejects(regel(t, 'max_zeichen', 0), /UNGUELTIGE_EINSTELLUNG/);
  await assert.rejects(regel(t, 'max_zeichen', 2.5), /UNGUELTIGE_EINSTELLUNG/);
  await assert.rejects(regel(t, 'quatsch', 1), /REGEL_UNPASSEND/);
  const uw = (await fragenVon(u))[0].id;
  await regel(uw, 'gesperrte_monate', [12, 7, 7]);
  assert.deepEqual((await findeFrage(u, uw)).regeln.gesperrte_monate, { wert: [7, 12], aktiv: true });
  await assert.rejects(regel(uw, 'gesperrte_monate', [13]), /UNGUELTIGE_EINSTELLUNG/);
  await assert.rejects(regel(uw, 'max_wochen', -1), /UNGUELTIGE_EINSTELLUNG/);
  const d = await frage(u, 'datum');
  await regel(d, 'fruehestens', '2027-01-01');
  await assert.rejects(regel(d, 'spaetestens', '2027-02-30'), /UNGUELTIGE_EINSTELLUNG/);
  const z = await frage(u, 'zahl');
  await regel(z, 'min_zahl', -2.5);
  await assert.rejects(regel(z, 'max_zahl', 'x'), /UNGUELTIGE_EINSTELLUNG/);
  const h = await frage(u, 'hinweis');
  await assert.rejects(regel(h, 'pflicht', null), /REGEL_UNPASSEND/);
  await regel(t, 'max_zeichen', 50, false);
  g = await findeFrage(u, t);
  assert.deepEqual(g.regeln.max_zeichen, { wert: 50, aktiv: false });
});

test('Bedingungen: gültig, ungültig, ändern, schalten, löschen', async () => {
  const u = await neueUmfrage();
  const e = await frage(u, 'einfach');
  const m = await frage(u, 'mehrfach');
  const j = await frage(u, 'janein');
  const n = await frage(u, 'zahl');
  const t = await frage(u, 'text_kurz');
  const z = await frage(u, 'text_kurz');
  const eo = (await findeFrage(u, e)).optionen.map((o) => o.id);
  const mo = (await findeFrage(u, m)).optionen.map((o) => o.id);
  const b1 = await bedingung(z, e, 'ist_eine_von', [eo[0]]);
  await bedingung(z, m, 'enthaelt_keine_von', mo);
  await bedingung(z, j, 'ist', false);
  await bedingung(z, n, 'groesser', 2.5);
  const ungueltig = [
    [e, z, 'ist_eine_von', [eo[0]]],          // Quelle nach Ziel
    [z, z, 'ist', true],                      // Quelle = Ziel
    [z, t, 'ist', true],                      // Text ist keine Quelle
    [z, e, 'enthaelt_eine_von', [eo[0]]],     // Operator passt nicht
    [z, e, 'ist_eine_von', [mo[0]]],          // Option einer anderen Frage
    [z, e, 'ist_eine_von', []],               // leer
    [z, j, 'ist', 'ja'],                      // kein Wahrheitswert
    [z, n, 'gleich', [1]],                    // keine Zahl
    [z, n, 'quatsch', 1],
  ];
  for (const [ziel, quelle, op, werte] of ungueltig) {
    await assert.rejects(bedingung(ziel, quelle, op, werte), /BEDINGUNG_UNGUELTIG/, JSON.stringify([op, werte]));
  }
  const andere = await neueUmfrage('Andere');
  const fremdQuelle = await frage(andere, 'janein');
  await assert.rejects(bedingung(z, fremdQuelle, 'ist', true), /BEDINGUNG_UNGUELTIG/);
  await c('select public.org_bedingung_speichern($1, $2, $3)', [b1, 'ist_keine_von', JSON.stringify(eo)]);
  await assert.rejects(c('select public.org_bedingung_speichern($1, $2, $3)', [b1, 'ist', 'true']), /BEDINGUNG_UNGUELTIG/);
  await c('select public.org_bedingung_schalten($1, false)', [b1]);
  let g = await findeFrage(u, z);
  assert.equal(g.bedingungen.length, 4);
  assert.deepEqual([g.bedingungen[0].operator, g.bedingungen[0].werte.map(Number), g.bedingungen[0].aktiv],
    ['ist_keine_von', eo.map(Number), false]);
  await c('select public.org_bedingung_loeschen($1)', [b1]);
  g = await findeFrage(u, z);
  assert.equal(g.bedingungen.length, 3);
});

test('Kopieren: Struktur mit neuen IDs, ohne Mitarbeiter', async () => {
  const u = await neueUmfrage('Original');
  const e = await frage(u, 'einfach');
  const z = await frage(u, 'text_kurz');
  const [o1] = (await findeFrage(u, e)).optionen.map((o) => o.id);
  await c('select public.org_option_schalten($1, false)', [(await findeFrage(u, e)).optionen[1].id]);
  await bedingung(z, e, 'ist_eine_von', [o1]);
  await regel(z, 'max_zeichen', 20, false);
  await c('select public.org_freien_tag_hinzufuegen($1, $2, $3)', [u, '2027-08-09', 'Betriebsruhe']);
  await mitarbeiterMitCode(u, 'Anna');
  const k = (await c('select public.org_umfrage_kopieren($1) as id', [u])).id;
  const orig = await umfrage(u);
  const kopie = await umfrage(k);
  assert.equal(kopie.einstellungen.titel, 'Kopie von Original');
  assert.equal(kopie.einstellungen.frist, orig.einstellungen.frist);
  assert.deepEqual(kopie.freie_tage, orig.freie_tage);
  assert.deepEqual(kopie.mitarbeiter, []);
  const form = (fragen) => fragen.map((f) => [f.typ, f.text, f.position, f.aktiv, f.optionen.map((o) => [o.text, o.aktiv]),
    Object.fromEntries(Object.entries(f.regeln)), f.bedingungen.length]);
  assert.deepEqual(form(kopie.fragen), form(orig.fragen));
  const kopieIds = new Set(kopie.fragen.map((f) => f.id));
  assert.ok(orig.fragen.every((f) => !kopieIds.has(f.id)));
  const kz = kopie.fragen[2];
  const ke = kopie.fragen[1];
  assert.equal(kz.bedingungen[0].quelle_id, ke.id);
  assert.deepEqual(kz.bedingungen[0].werte.map(Number), [ke.optionen[0].id]);
  assert.equal((await umfrage(u)).mitarbeiter.length, 1);
});

test('Umfrage löschen mit Antworten und Bedingungen', async () => {
  const u = await neueUmfrage();
  const uw = (await fragenVon(u))[0].id;
  const e = await frage(u, 'einfach');
  const z = await frage(u, 'text_kurz');
  const [o1] = (await findeFrage(u, e)).optionen.map((o) => o.id);
  await bedingung(z, e, 'ist_eine_von', [o1]);
  const code = await mitarbeiterMitCode(u, 'Anna');
  await absenden(code, { [String(uw)]: [5], [String(e)]: o1, [String(z)]: 'Hallo' });
  await c('select public.org_umfrage_loeschen($1)', [u]);
  const rest = async (sql) => (await db.query(sql, [u])).rows[0].n;
  assert.equal(await rest('select count(*)::int as n from urlaub.fragen where umfrage_id = $1'), 0);
  assert.equal(await rest('select count(*)::int as n from urlaub.mitarbeiter where umfrage_id = $1'), 0);
  assert.equal(await rest(`select count(*)::int as n from urlaub.antworten an
    where not exists (select 1 from urlaub.fragen f where f.id = an.frage_id) and $1::bigint is not null`), 0);
});

test('Verwaltungs-Sicht: Antworten und Verstöße je Mitarbeiter', async () => {
  const u = await neueUmfrage();
  const uw = (await fragenVon(u))[0].id;
  const m = await frage(u, 'mehrfach');
  const mo = (await findeFrage(u, m)).optionen.map((o) => o.id);
  const code = await mitarbeiterMitCode(u, 'Anna');
  await mitarbeiterMitCode(u, 'Ben');
  await absenden(code, { [String(uw)]: [5, 6], [String(m)]: mo });
  await regel(m, 'max_anzahl', 1);
  const r = await umfrage(u);
  const anna = r.mitarbeiter.find((x) => x.name === 'Anna');
  const ben = r.mitarbeiter.find((x) => x.name === 'Ben');
  assert.deepEqual(anna.antworten[String(uw)], [5, 6]);
  assert.deepEqual(anna.verstoesse, { [String(m)]: 'ZU_VIELE_ANTWORTEN' });
  assert.deepEqual(ben.antworten, {});
  assert.deepEqual(ben.verstoesse, {});
  assert.ok(anna.geaendert_am);
  assert.equal(r.kalender.length, 52);
});

test('Trennung: Eva kann nichts an Chefs Fragen ändern', async () => {
  const u = await neueUmfrage();
  const e = await frage(u, 'einfach');
  const z = await frage(u, 'text_kurz');
  const [o1] = (await findeFrage(u, e)).optionen.map((o) => o.id);
  const b = await bedingung(z, e, 'ist_eine_von', [o1]);
  const alsEva = (sql, params) => als(db, 'authenticated', eva, sql, params);
  const verboten = [
    ["select public.org_frage_anlegen($1, 'janein')", [u], /UMFRAGE_NICHT_GEFUNDEN/],
    ['select public.org_umfrage_kopieren($1)', [u], /UMFRAGE_NICHT_GEFUNDEN/],
    ['select public.org_frage_speichern($1, $2)', [e, { text: 'x' }], /FRAGE_NICHT_GEFUNDEN/],
    ['select public.org_frage_schalten($1, false)', [e], /FRAGE_NICHT_GEFUNDEN/],
    ['select public.org_frage_verschieben($1, 1)', [e], /FRAGE_NICHT_GEFUNDEN/],
    ['select public.org_frage_loeschen($1)', [z], /FRAGE_NICHT_GEFUNDEN/],
    ["select public.org_option_anlegen($1, 'x')", [e], /FRAGE_NICHT_GEFUNDEN/],
    ["select public.org_option_speichern($1, 'x')", [o1], /OPTION_NICHT_GEFUNDEN/],
    ['select public.org_option_schalten($1, false)', [o1], /OPTION_NICHT_GEFUNDEN/],
    ['select public.org_option_verschieben($1, 1)', [o1], /OPTION_NICHT_GEFUNDEN/],
    ['select public.org_option_loeschen($1)', [o1], /OPTION_NICHT_GEFUNDEN/],
    ["select public.org_regel_setzen($1, 'pflicht', 'null', true)", [e], /FRAGE_NICHT_GEFUNDEN/],
    ["select public.org_bedingung_anlegen($1, $2, 'ist_eine_von', '[]')", [z, e], /FRAGE_NICHT_GEFUNDEN/],
    ["select public.org_bedingung_speichern($1, 'ist_eine_von', '[]')", [b], /BEDINGUNG_NICHT_GEFUNDEN/],
    ['select public.org_bedingung_schalten($1, false)', [b], /BEDINGUNG_NICHT_GEFUNDEN/],
    ['select public.org_bedingung_loeschen($1)', [b], /BEDINGUNG_NICHT_GEFUNDEN/],
  ];
  for (const [sql, params, fehler] of verboten) await assert.rejects(alsEva(sql, params), fehler, sql);
  const evaU = (await als(db, 'authenticated', eva, "select public.org_umfrage_anlegen('Evas', 2027, 'BY') as id"))[0].id;
  const evaZiel = (await als(db, 'authenticated', eva, "select public.org_frage_anlegen($1, 'text_kurz') as id", [evaU]))[0].id;
  await assert.rejects(alsEva("select public.org_bedingung_anlegen($1, $2, 'ist_eine_von', $3)", [evaZiel, e, JSON.stringify([o1])]), /BEDINGUNG_UNGUELTIG/);
  for (const sql of ["select public.org_frage_anlegen(1, 'janein')", 'select public.org_umfrage_kopieren(1)', 'select public.org_frage_loeschen(1)']) {
    await assert.rejects(browser(db, sql), /permission denied/, sql);
  }
  assert.equal((await findeFrage(u, e)).text, 'Neue Frage');
});
```

Die Zeile `const t = await frage(u, 'text_kurz');` im Regeltest bitte zu `const t = await frage(u, 'text_kurz');` vereinfachen.

- [ ] **Step 2: Tests laufen lassen – müssen fehlschlagen**

Run: `node --test tests/editor.test.mjs`
Expected: FAIL (`function public.org_frage_anlegen … does not exist`).

- [ ] **Step 3: Implementieren** – in `supabase/schema.sql`:
  - Neuen Abschnitt „Fragen-Editor“ nach `public.org_link_erneuern` und dessen revoke/grant-Zeilen, vor „Einladungen und Registrierung“, mit den internen Helfern und allen Funktionen der Tabelle oben. Muster wie die bestehenden `org_*`-Funktionen: Besitzprüfung im `declare`-Block, innere `begin … exception when check_violation or not_null_violation or data_exception then raise exception 'UNGUELTIGE_EINSTELLUNG'; end;`-Blöcke nur um Schreibzugriffe, die an Constraints scheitern können.
  - Verschieben: Nachbar = nächste Frage (bzw. Option) in `position, id`-Reihenfolge; Positionen tauschen, danach `urlaub.positionen_neu`. Prüfung `REIHENFOLGE_BEDINGUNG`: nach dem Tausch darf keine eingeschaltete **oder ausgeschaltete** Bedingung eine Quelle mit Position ≥ der Zielposition haben.
  - Kopieren in einer Funktion mit Zuordnungstabellen (z. B. `jsonb` alt→neu für Fragen und Optionen): Fragen in Positionsreihenfolge einfügen, dann Optionen, Regeln, Bedingungen (Quelle und Options-IDs in `werte` umschlüsseln), freie Tage.
  - `public.org_umfrage` auf die endgültige Form erweitern (siehe Interfaces).
  - Für jede neue `public`-Funktion revoke/grant wie in den Global Constraints.

- [ ] **Step 4: Tests laufen lassen**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Datenbank Stand 3: Fragen-Editor, Kopieren, Verwaltungs-Sicht

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Browser-Logik und Mitarbeiter-Seite

**Files:**
- Create: `docs/formular-logik.js`, `docs/formular.js`, `tests/formular-logik.test.mjs`
- Modify: `tests/sichtbarkeit.test.mjs` (Browser-Hälfte), `docs/api.js`, `docs/logik.js`, `tests/logik.test.mjs`
- Rewrite: `docs/app.js`, `docs/index.html` (Struktur), Ergänzungen in `docs/style.css`

**Interfaces:**
- Consumes: Antwort von `urlaub_laden`/`umfrage_absenden` (Task 2): `{name, titel, frist, offen, geaendert_am, fragen:[{id, typ, text, hilfetext, position, verknuepfung, optionen:[{id,text}], regeln:{art: wert}, bedingungen:[{quelle_id, operator, werte}], skala, urlaubswochen:{jahr, bundesland, arbeitstage_pro_woche, sperr_hinweis, kalender}}], antworten:{"<id>": wert}}`; Fehler `ANTWORTEN_UNGUELTIG` mit `details` = JSON-Text `{"<id>": code}`.
- Produces (`docs/formular-logik.js`, rein, ohne DOM):
  - `istLeer(wert) → boolean` (wie `urlaub.ist_leer`)
  - `sichtbareFragen(fragen, antworten) → Set<number>` (gleiche Regeln wie `urlaub.pruefe_antworten`; Quelle muss sichtbar und beantwortet sein; Quelle nicht in `fragen` → nicht erfüllt; `verknuepfung` und/oder; ohne Bedingungen sichtbar)
  - `antwortenZumAbsenden(fragen, antworten) → {"<id>": wert}` (nur sichtbare, nicht leere, kein Hinweistext)
  - `antwortText(frage, wert) → string` (einfach: Optionstext; mehrfach: Texte mit „, “; janein: „Ja“/„Nein“; skala/zahl: Zahl im deutschen Format; datum: `TT.MM.JJJJ`; urlaubswochen: „KW 3, KW 12“; Text: der Text; unbekannte Option: „(entfernt)“)
  - `fehlerText(code) → string` für alle Antwort-Codes der Global Constraints (Fallback: „Bitte prüfe diese Antwort.“)
  - `regelHinweis(frage) → string` (z. B. mehrfach `min_anzahl 2, max_anzahl 3` → „Bitte 2 bis 3 auswählen.“; nur max → „Höchstens 3 auswählen.“; nur min → „Mindestens 2 auswählen.“; text `max_zeichen 10` → „Höchstens 10 Zeichen.“; zahl min/max → „Zahl zwischen 0 und 40.“ / „Mindestens 0.“ / „Höchstens 40.“; datum → „Datum zwischen 01.01.2027 und 31.12.2027.“ / „Frühestens …“ / „Spätestens …“; sonst „“)
- Produces (`docs/formular.js`, DOM): `baueFormular(container, daten, {nurLesen = false, beiAenderung = () => {}}) → {antworten(): {"<id>": wert}, zeigeFehler(fehler: {"<id>": code}|null): void, sichtbarkeitAktualisieren(): void}`. Jede Frage ein `<fieldset class="frage" id="frage-<id>">` mit `<legend>` (Text, bei Pflicht „ *“), Hilfetext, Regelhinweis, Eingabe(n), `<p class="frage-fehler" role="alert" hidden>`. Unsichtbare Fragen `hidden`. Eingaben: einfach/janein → Radio-Buttons; mehrfach → Checkboxen; skala → Radio-Reihe von…bis mit Beschriftung links/rechts; zahl → `input type=number step=any`; datum → `input type=date`; text_kurz → `input type=text maxlength=200`; text_lang → `textarea maxlength=5000`; hinweis → nur Text; urlaubswochen → die bisherige Wochenauswahl (Monatsgruppen, Feiertagshinweise, gesperrte Bereiche mit `sperr_hinweis`, Zähler, Sperre bei erreichtem Limit und „am Stück“) mit den Regelwerten aus `frage.regeln` (fehlende Regel = keine Grenze). Bei jeder Änderung: Sichtbarkeit neu, `beiAenderung()` aufrufen.
- `docs/logik.js`: `zusammenfassung(kalender, auswahl, maxWochen, urlaubstage)` akzeptiert `maxWochen`/`urlaubstage` = `null` (Regel aus): Text dann „3 Wochen gewählt · 17 Urlaubstage“ bzw. ohne „von …“-Teile; `limitErreicht` nur bei gesetztem `maxWochen`.
- `docs/api.js`: Fehlerobjekt bekommt zusätzlich `details` (`inhalt?.details`).

- [ ] **Step 1: Tests schreiben**

`tests/formular-logik.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  istLeer, sichtbareFragen, antwortenZumAbsenden, antwortText, fehlerText, regelHinweis,
} from '../docs/formular-logik.js';

const fragen = [
  { id: 1, typ: 'janein', bedingungen: [], verknuepfung: 'und', optionen: [], regeln: {} },
  { id: 2, typ: 'text_kurz', bedingungen: [{ quelle_id: 1, operator: 'ist', werte: true }], verknuepfung: 'und', optionen: [], regeln: {} },
  { id: 3, typ: 'hinweis', bedingungen: [], verknuepfung: 'und', optionen: [], regeln: {} },
  { id: 4, typ: 'mehrfach', bedingungen: [], verknuepfung: 'und', optionen: [{ id: 41, text: 'Mo' }, { id: 42, text: 'Di' }], regeln: {} },
];

test('istLeer', () => {
  for (const w of [undefined, null, [], '', '   ']) assert.equal(istLeer(w), true, JSON.stringify(w));
  for (const w of [0, false, [1], 'x']) assert.equal(istLeer(w), false, JSON.stringify(w));
});

test('Sichtbarkeit und Absende-Auswahl', () => {
  assert.deepEqual([...sichtbareFragen(fragen, {})].sort(), [1, 3, 4]);
  assert.deepEqual([...sichtbareFragen(fragen, { 1: true })].sort(), [1, 2, 3, 4]);
  assert.deepEqual(antwortenZumAbsenden(fragen, { 1: false, 2: 'weg', 3: 'x', 4: [] }), { 1: false });
  assert.deepEqual(antwortenZumAbsenden(fragen, { 1: true, 2: ' hallo ', 4: [42] }), { 1: true, 2: ' hallo ', 4: [42] });
});

test('Antworttexte', () => {
  assert.equal(antwortText(fragen[0], true), 'Ja');
  assert.equal(antwortText(fragen[0], false), 'Nein');
  assert.equal(antwortText(fragen[3], [41, 42]), 'Mo, Di');
  assert.equal(antwortText(fragen[3], [99]), '(entfernt)');
  assert.equal(antwortText({ typ: 'einfach', optionen: [{ id: 5, text: 'Früh' }] }, 5), 'Früh');
  assert.equal(antwortText({ typ: 'zahl' }, 3.5), '3,5');
  assert.equal(antwortText({ typ: 'skala' }, 4), '4');
  assert.equal(antwortText({ typ: 'datum' }, '2027-03-01'), '01.03.2027');
  assert.equal(antwortText({ typ: 'urlaubswochen' }, [3, 12]), 'KW 3, KW 12');
  assert.equal(antwortText({ typ: 'text_lang' }, 'Hallo'), 'Hallo');
});

test('Fehlertexte und Regelhinweise', () => {
  assert.match(fehlerText('PFLICHT'), /Pflicht|beantworte/i);
  assert.match(fehlerText('ZU_VIELE_ANTWORTEN'), /zu viele/i);
  assert.match(fehlerText('ZU_VIELE_AM_STUECK'), /am Stück/);
  assert.equal(fehlerText('IRGENDWAS'), 'Bitte prüfe diese Antwort.');
  assert.equal(regelHinweis({ typ: 'mehrfach', regeln: { min_anzahl: 2, max_anzahl: 3 } }), 'Bitte 2 bis 3 auswählen.');
  assert.equal(regelHinweis({ typ: 'mehrfach', regeln: { max_anzahl: 3 } }), 'Höchstens 3 auswählen.');
  assert.equal(regelHinweis({ typ: 'mehrfach', regeln: { min_anzahl: 2 } }), 'Mindestens 2 auswählen.');
  assert.equal(regelHinweis({ typ: 'text_kurz', regeln: { max_zeichen: 10 } }), 'Höchstens 10 Zeichen.');
  assert.equal(regelHinweis({ typ: 'zahl', regeln: { min_zahl: 0, max_zahl: 40 } }), 'Zahl zwischen 0 und 40.');
  assert.equal(regelHinweis({ typ: 'zahl', regeln: { min_zahl: 0 } }), 'Mindestens 0.');
  assert.equal(regelHinweis({ typ: 'datum', regeln: { fruehestens: '2027-01-01', spaetestens: '2027-12-31' } }), 'Datum zwischen 01.01.2027 und 31.12.2027.');
  assert.equal(regelHinweis({ typ: 'datum', regeln: { spaetestens: '2027-12-31' } }), 'Spätestens 31.12.2027.');
  assert.equal(regelHinweis({ typ: 'janein', regeln: { pflicht: null } }), '');
});
```

In `tests/sichtbarkeit.test.mjs` den Import um `import { sichtbareFragen } from '../docs/formular-logik.js';` ergänzen und ans Ende anfügen:

```js
for (const fall of FIXTURE.faelle) {
  test(`Browser: ${fall.name}`, async () => {
    const daten = (await browser(db, 'select public.urlaub_laden($1) as r', [code]))[0].r;
    const sichtbar = sichtbareFragen(daten.fragen, mitIds(bau, fall.antworten));
    const inReihenfolge = daten.fragen.map((f) => f.id).filter((id) => sichtbar.has(id));
    assert.deepEqual(schluessel(bau, inReihenfolge), fall.sichtbar);
  });
}
```

In `tests/logik.test.mjs` anfügen:

```js
test('Zähler ohne Wochen- oder Tagesgrenze', () => {
  const kal = [{ kw: 1, monat: 1, arbeitstage: 5 }, { kw: 2, monat: 1, arbeitstage: 6 }];
  const ohneMax = zusammenfassung(kal, new Set([1, 2]), null, 36);
  assert.equal(ohneMax.text, '2 Wochen gewählt · 11 von 36 Urlaubstagen');
  assert.equal(ohneMax.limitErreicht, false);
  assert.equal(zusammenfassung(kal, new Set([1]), 6, null).text, '1 von 6 Wochen gewählt · 5 Urlaubstage');
  assert.equal(zusammenfassung(kal, new Set([1]), null, null).text, '1 Woche gewählt · 5 Urlaubstage');
});
```

- [ ] **Step 2: Tests laufen lassen – müssen fehlschlagen**

Run: `node --test tests/formular-logik.test.mjs tests/sichtbarkeit.test.mjs tests/logik.test.mjs`
Expected: FAIL (`Cannot find module …/docs/formular-logik.js`, Zählertext).

- [ ] **Step 3: Implementieren**
  - `docs/formular-logik.js` nach den Interfaces (rein, keine DOM-Zugriffe; Zahlenformat mit `Intl.NumberFormat('de-DE')`).
  - `docs/logik.js` `zusammenfassung` für `null`-Grenzen (Einzahl „1 Woche“).
  - `docs/formular.js` nach den Interfaces; die Wochenauswahl-Logik aus dem bisherigen `docs/app.js` (`baueFormular`, `aktualisiere`, Monatsgruppen, gesperrte Bereiche, Zähler, `istGesperrt`) dorthin verlagern und auf `frage.regeln` umstellen (`max_wochen`, `max_am_stueck`, `max_urlaubstage`, `min_wochen` – fehlend = ohne Grenze).
  - `docs/index.html`: Kopf (Titel, Begrüßung) bleibt; `#formular` enthält `#status`, `<div id="fragen"></div>`, die feste Leiste mit `#meldung` und `#absenden`; `#bestaetigung` bleibt (Liste aller Antworten als „Frage: Antworttext“), `#fehler`, `#laden` bleiben. Die bisherigen Elemente `#monate`, `#zaehler`, `#regeln`, `#gesperrt-*` wandern in den Urlaubswochen-Block von `formular.js`.
  - `docs/app.js`: lädt mit `urlaub_laden`, baut mit `baueFormular` (bei abgelaufener Frist `nurLesen`), sendet `umfrage_absenden` mit `antwortenZumAbsenden`; bei `ANTWORTEN_UNGUELTIG` `zeigeFehler(JSON.parse(details))`, Meldung „Bitte prüfe die markierten Fragen.“ und Sprung zur ersten fehlerhaften Frage; sonstige Fehler wie bisher. „Absenden“ ist deaktiviert, solange sich nichts gegenüber dem Gespeicherten geändert hat (Vergleich der `antwortenZumAbsenden`-Ergebnisse als JSON). Bestätigung listet sichtbare, beantwortete Fragen mit `antwortText`. Bisherige Hinweise (Frist, Stand, nachträglich gesperrte Wochen entfernt) bleiben sinngemäß erhalten.
  - `docs/api.js`: `fehler.details = inhalt?.details ?? null;`
  - `docs/style.css`: Stile für `.frage`, `.frage-fehler`, Radio-/Checkbox-Zeilen, Skala-Reihe (Handy: umbrechen).

- [ ] **Step 4: Tests laufen lassen**

Run: `npm test`
Expected: PASS. Zusätzlich `node --check` für `docs/app.js`, `docs/formular.js`, `docs/formular-logik.js`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Mitarbeiter-Seite: Formular aus Fragen, Sichtbarkeit im Browser, Fehler an der Frage

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Verwaltung – Reiter „Fragen“ mit Editor und Vorschau

**Files:**
- Create: `docs/admin-fragen.js`
- Modify: `docs/admin.html`, `docs/admin-umfrage.js`, `docs/admin-hilfe.js`, `docs/style.css`

**Interfaces:**
- Consumes: `org_umfrage` (Task 3, `fragen` in Verwaltungs-Sicht), alle `org_frage_*`, `org_option_*`, `org_regel_setzen`, `org_bedingung_*`; `baueFormular` (Task 4) für die Vorschau; `MONATE`, `BUNDESLAENDER`, `fuelleJahre`, `fuelleLaender`, `knopf`, `element`, `meldung` (bestehend).
- Produces: `initFragen({aufruf, fehlerAnzeigen, neuLaden})`, `zeigeFragen(daten)` in `docs/admin-fragen.js`; `admin-umfrage.js` ruft `zeigeFragen(daten)` nach jedem Laden auf.

**Verhalten (verbindlich):**
- Reiter-Reihenfolge in der Umfrage-Ansicht: **Fragen** (`data-reiter="fragen"`, Standard beim Öffnen) · Mitarbeiter · Antworten · Einstellungen. Container `#reiter-fragen`.
- `#reiter-fragen` enthält: Knopf „Vorschau“ (`#fragen-vorschau-knopf`), Liste `#fragen-liste` (Karten), Bereich „Frage hinzufügen“ mit `<select id="neue-frage-typ">` (alle Typen mit deutschen Namen; „Urlaubswochen“ nur, wenn noch keine existiert) und Knopf `#neue-frage-knopf`, Vorschau-Bereich `#fragen-vorschau` (anfangs `hidden`).
- Karte je Frage (`data-frage-id`): Typname, Fragetext (gekürzt), Kennzeichen „Pflicht“, „Bedingungen: n“, „ausgeschaltet“ (wenn `aktiv=false`), Schalter (Checkbox mit Beschriftung „aktiv“), Knöpfe ↑ ↓ „Bearbeiten“ „Löschen“. „Löschen“ fehlt, wenn `hat_antworten`; dann Hinweis „hat Antworten – nur ausschalten möglich“. Schalter und ↑/↓ rufen sofort die Funktion auf und laden neu.
- „Bearbeiten“ klappt unter der Karte den Bearbeitungsbereich auf (nur einer gleichzeitig offen; bleibt nach Neuladen offen, wenn die Frage noch existiert):
  - Typ (`select`, gesperrt bei `hat_antworten` oder Urlaubswochen), Fragetext, Hilfetext, Knopf „Speichern“ → `org_frage_speichern`.
  - Urlaubswochen: Jahr, Bundesland, Arbeitstage (gesperrt bei `hat_antworten`), Hinweis zu gesperrten Monaten.
  - Skala: von, bis, Beschriftung links/rechts (von/bis gesperrt bei `hat_antworten`).
  - Antwortmöglichkeiten (einfach/mehrfach): je Zeile Textfeld (Speichern beim Verlassen des Feldes, wenn geändert), Schalter, ↑/↓, „Löschen“ (fehlt bei `hat_antworten`); Feld + Knopf „Antwort hinzufügen“.
  - Prüfregeln: für jede erlaubte Art des Typs eine Zeile mit Schalter und (außer bei `pflicht`) Wertfeld; Änderung von Schalter oder Wert (beim Verlassen) → `org_regel_setzen(frage, art, wert, aktiv)`. `gesperrte_monate` als 12 Monats-Checkboxen. Beschriftungen: Pflichtfrage; Mindestens/Höchstens auswählen; Höchstens Zeichen; Kleinste/Größte Zahl; Frühestens/Spätestens; Mindestens/Höchstens Wochen; Höchstens Wochen am Stück; Höchstens Urlaubstage; Gesperrte Monate.
  - Bedingungen: Auswahl „Alle Bedingungen müssen zutreffen (und)“ / „Eine Bedingung reicht (oder)“ → `org_frage_speichern({verknuepfung})`; je Bedingung eine Zeile „Wenn [Frage] [Operator] [Wert] “, Schalter, „Entfernen“; „Bedingung hinzufügen“: Auswahl nur früherer Fragen der Typen einfach, mehrfach, janein, skala, zahl; Operatorliste je Quelltyp (ist eine von / ist keine von / enthält eine von / enthält keine von / ist / gleich / größer als / kleiner als); Wertfeld je Quelltyp (Checkboxen der Antwortmöglichkeiten, Ja/Nein, Zahl). Speichern → `org_bedingung_anlegen` bzw. `org_bedingung_speichern`.
- Vorschau: blendet `#fragen-vorschau` ein und baut mit `baueFormular(container, {fragen: nur aktive Fragen in Mitarbeiter-Form, antworten: {}}, {})` das Formular; ohne Absenden. Die Umwandlung Verwaltungs- → Mitarbeiter-Form (nur aktive Optionen/Bedingungen, Regeln `{art: wert}` nur aktive, Kalender aus `daten.kalender`) als exportierte reine Funktion `mitarbeiterSicht(fragen, kalender)` in `docs/admin-fragen.js` **oder** in `docs/formular-logik.js`, mit Test in `tests/formular-logik.test.mjs`:

```js
test('Vorschau: Verwaltungs-Sicht in Mitarbeiter-Sicht umwandeln', async () => {
  const { mitarbeiterSicht } = await import('../docs/formular-logik.js');
  const verwaltung = [
    { id: 1, typ: 'einfach', text: 'A', hilfetext: '', position: 1, verknuepfung: 'und', aktiv: true, hat_antworten: false,
      optionen: [{ id: 11, text: 'x', aktiv: true }, { id: 12, text: 'y', aktiv: false }],
      regeln: { pflicht: { wert: null, aktiv: true } }, bedingungen: [], skala: null, urlaubswochen: null },
    { id: 2, typ: 'text_kurz', text: 'B', hilfetext: '', position: 2, verknuepfung: 'oder', aktiv: true, hat_antworten: false,
      optionen: [], regeln: { max_zeichen: { wert: 5, aktiv: false } },
      bedingungen: [{ id: 7, quelle_id: 1, operator: 'ist_eine_von', werte: [11], aktiv: true },
                    { id: 8, quelle_id: 1, operator: 'ist_keine_von', werte: [11], aktiv: false }], skala: null, urlaubswochen: null },
    { id: 3, typ: 'janein', text: 'C', hilfetext: '', position: 3, verknuepfung: 'und', aktiv: false, hat_antworten: false,
      optionen: [], regeln: {}, bedingungen: [], skala: null, urlaubswochen: null },
  ];
  const sicht = mitarbeiterSicht(verwaltung, []);
  assert.deepEqual(sicht.map((f) => f.id), [1, 2]);
  assert.deepEqual(sicht[0].optionen, [{ id: 11, text: 'x' }]);
  assert.deepEqual(sicht[0].regeln, { pflicht: null });
  assert.deepEqual(sicht[1].regeln, {});
  assert.deepEqual(sicht[1].bedingungen, [{ quelle_id: 1, operator: 'ist_eine_von', werte: [11] }]);
});
```

  Liegt die Funktion in `docs/formular-logik.js`, gehört sie dort zu den Interfaces aus Task 4 (Ergänzung).
- Fehler aus der Datenbank über `fehlerAnzeigen` mit deutschen Texten in `docs/admin-hilfe.js` für: `FRAGE_NICHT_GEFUNDEN, OPTION_NICHT_GEFUNDEN, BEDINGUNG_NICHT_GEFUNDEN, URLAUBSWOCHEN_DOPPELT, TYP_GESPERRT, HAT_ANTWORTEN, BEDINGUNG_VERWEIST, REIHENFOLGE_BEDINGUNG, REGEL_UNPASSEND, BEDINGUNG_UNGUELTIG, FRAGETEXT_LEER` (z. B. REIHENFOLGE_BEDINGUNG: „Diese Frage hängt von einer anderen ab (oder umgekehrt). Eine Bedingung darf sich nur auf eine frühere Frage beziehen.“).
- Löschen von Fragen und Antwortmöglichkeiten mit Bestätigungsdialog.
- Nur `textContent`, keine `innerHTML`.

- [ ] **Step 1: Test für `mitarbeiterSicht` ergänzen** (siehe oben) und laufen lassen → FAIL.
- [ ] **Step 2: Implementieren** (Dateien oben; `admin-umfrage.js`: neuer Reiter, `initFragen` in `initUmfrage`, `zeigeFragen(daten)` in `zeichne()`; Einstellungsfelder für Jahr/Bundesland/Arbeitstage/Regeln aus dem Reiter „Einstellungen“ entfernen – sie stehen jetzt an der Frage).
- [ ] **Step 3: `npm test` → PASS; `node --check` für alle geänderten JS-Dateien; jede per `$('…')` verwendete ID existiert in `docs/admin.html` (Ergebnis im Report).**
- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Verwaltung: Fragen-Editor mit Schaltern, Regeln, Bedingungen und Vorschau

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Verwaltung – Auswertung, Excel, Einstellungen, Kopieren

**Files:**
- Rewrite: `docs/auswertung.js`, `tests/excel.test.mjs`
- Create: `tests/auswertung.test.mjs`
- Modify: `docs/admin-umfrage.js`, `docs/admin.html`, `docs/admin.js`, `docs/style.css`

**Interfaces:**
- Consumes: `org_umfrage` (Task 3), `org_umfrage_kopieren`, `antwortText`, `fehlerText`, `istLeer` (Task 4), `erzeugeXlsx` (bestehend), `zeitpunkt` (bestehend).
- Produces (`docs/auswertung.js`, rein):
  - `zusammenfassung(frage, daten) → object|null` je Typ:
    - einfach/mehrfach: `{art:'auswahl', beantwortet, zeilen:[{text, aktiv, anzahl, namen:[…]}]}` (alle Optionen in Reihenfolge, auch ausgeschaltete)
    - janein: `{art:'auswahl', beantwortet, zeilen:[{text:'Ja', aktiv:true, anzahl, namen}, {text:'Nein', …}]}`
    - skala: `{art:'auswahl', beantwortet, durchschnitt (auf 1 Nachkommastelle gerundet, null wenn keine), zeilen:[{text:'1', …}…]}`
    - zahl: `{art:'zahl', beantwortet, kleinster, groesster, durchschnitt, werte:[{name, wert}]}`
    - text_kurz/text_lang/datum: `{art:'liste', beantwortet, werte:[{name, text}]}` (Datum als `TT.MM.JJJJ`)
    - urlaubswochen: `{art:'wochen', beantwortet, wochen:[{kw, zeitraum, arbeitstage, feiertag, anzahl, namen}]}` (nur nicht gesperrte KW aus `daten.kalender`)
    - hinweis: `null`
  - `personenZeilen(daten) → [{id, name, link, abgegeben, stand, hinweise:[text]}]` (`hinweise` = „<Fragetext>: <fehlerText(code)>“ je Verstoß)
  - `excelBlaetter(daten) → Blätter` für `erzeugeXlsx`: „Antworten“ (Spalten: Name, Abgegeben, Letzte Änderung, je Frage außer Hinweistext eine Spalte mit Überschrift = Fragetext, bei ausgeschalteter Frage mit Zusatz „ (aus)“, zuletzt „Hinweis“), bei Urlaubswochen zusätzlich „Wochen“ und „Matrix“ wie bisher.
- `daten` = Antwort von `org_umfrage`.

**Verhalten (Oberfläche):**
- Reiter „Antworten“ (`data-reiter="antworten"`, Container `#reiter-antworten` mit `#antworten-liste`) ersetzt „Wochen“: je Frage (außer Hinweistext) eine Box mit Fragetext, „n beantwortet“ und der Zusammenfassung (Auswahl: Tabelle Antwort | Anzahl | Namen, ausgeschaltete Antwortmöglichkeiten mit „(aus)“; Zahl: kleinster/größter/Durchschnitt und Liste; Liste: Name – Text; Wochen: bisherige Wochentabelle mit Hervorhebung).
- Reiter „Mitarbeiter“: Statuszeile wie bisher, statt der Wochenliste „Abgegeben, Stand …“; Hinweise je Verstoß als `⚠`-Zeilen.
- Reiter „Einstellungen“: Titel, Frist, zusätzliche freie Tage, Knopf „Umfrage kopieren“ (`#umfrage-kopieren`, Bestätigung „Kopie mit allen Fragen anlegen? Mitarbeiter und Antworten werden nicht kopiert.“, danach öffnet die Kopie), „Umfrage löschen“.
- Excel-Knopf nutzt `excelBlaetter`.

- [ ] **Step 1: Tests schreiben**

`tests/auswertung.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zusammenfassung, personenZeilen } from '../docs/auswertung.js';

const kalender = Array.from({ length: 52 }, (_, i) => ({
  kw: i + 1, von: '01.01.', bis: '07.01.', monat: i >= 47 ? 12 : 1, arbeitstage: 6, feiertag: null, gesperrt: i >= 47,
}));
const f = (id, typ, extra = {}) => ({ id, typ, text: `Frage ${id}`, aktiv: true, optionen: [], regeln: {}, bedingungen: [], ...extra });
const daten = {
  kalender,
  fragen: [
    f(1, 'urlaubswochen'),
    f(2, 'einfach', { optionen: [{ id: 21, text: 'Früh', aktiv: true }, { id: 22, text: 'Nacht', aktiv: false }] }),
    f(3, 'mehrfach', { optionen: [{ id: 31, text: 'Mo', aktiv: true }, { id: 32, text: 'Di', aktiv: true }] }),
    f(4, 'janein'),
    f(5, 'skala', { skala: { von: 1, bis: 3 } }),
    f(6, 'zahl'),
    f(7, 'text_kurz'),
    f(8, 'datum'),
    f(9, 'hinweis'),
  ],
  mitarbeiter: [
    { id: 1, name: 'Anna', link: 'x', geaendert_am: '2026-10-01T14:00:00Z',
      antworten: { 1: [1, 30], 2: 21, 3: [31, 32], 4: true, 5: 3, 6: 2.5, 7: 'Hallo', 8: '2027-03-01' },
      verstoesse: { 3: 'ZU_VIELE_ANTWORTEN' } },
    { id: 2, name: 'Ben', link: 'y', geaendert_am: '2026-10-02T14:00:00Z',
      antworten: { 1: [30], 2: 22, 3: [31], 4: false, 5: 1, 6: 4.5 }, verstoesse: {} },
    { id: 3, name: 'Cem', link: 'z', geaendert_am: null, antworten: {}, verstoesse: {} },
  ],
};

test('Auswahl, Ja/Nein, Skala', () => {
  assert.deepEqual(zusammenfassung(daten.fragen[1], daten), { art: 'auswahl', beantwortet: 2, zeilen: [
    { text: 'Früh', aktiv: true, anzahl: 1, namen: ['Anna'] }, { text: 'Nacht', aktiv: false, anzahl: 1, namen: ['Ben'] }] });
  assert.deepEqual(zusammenfassung(daten.fragen[2], daten).zeilen.map((z) => [z.text, z.anzahl]), [['Mo', 2], ['Di', 1]]);
  assert.deepEqual(zusammenfassung(daten.fragen[3], daten).zeilen.map((z) => [z.text, z.namen]), [['Ja', ['Anna']], ['Nein', ['Ben']]]);
  const s = zusammenfassung(daten.fragen[4], daten);
  assert.equal(s.durchschnitt, 2);
  assert.deepEqual(s.zeilen.map((z) => [z.text, z.anzahl]), [['1', 1], ['2', 0], ['3', 1]]);
});

test('Zahl, Liste, Wochen, Hinweis', () => {
  assert.deepEqual(zusammenfassung(daten.fragen[5], daten),
    { art: 'zahl', beantwortet: 2, kleinster: 2.5, groesster: 4.5, durchschnitt: 3.5, werte: [{ name: 'Anna', wert: 2.5 }, { name: 'Ben', wert: 4.5 }] });
  assert.deepEqual(zusammenfassung(daten.fragen[6], daten), { art: 'liste', beantwortet: 1, werte: [{ name: 'Anna', text: 'Hallo' }] });
  assert.deepEqual(zusammenfassung(daten.fragen[7], daten).werte, [{ name: 'Anna', text: '01.03.2027' }]);
  const w = zusammenfassung(daten.fragen[0], daten);
  assert.equal(w.art, 'wochen');
  assert.equal(w.beantwortet, 2);
  assert.equal(w.wochen.length, 47);
  assert.deepEqual([w.wochen[29].kw, w.wochen[29].anzahl, w.wochen[29].namen], [30, 2, 'Anna, Ben']);
  assert.equal(zusammenfassung(daten.fragen[8], daten), null);
});

test('Personenzeilen mit Hinweisen', () => {
  const p = personenZeilen(daten);
  assert.deepEqual(p.map((x) => [x.name, x.abgegeben]), [['Anna', true], ['Ben', true], ['Cem', false]]);
  assert.equal(p[0].hinweise.length, 1);
  assert.match(p[0].hinweise[0], /^Frage 3: /);
});
```

`tests/excel.test.mjs` vollständig ersetzen:

```js
// Erzeugt die .xlsx-Datei der Auswertung und liest sie mit openpyxl (Python) zurück.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { erzeugeXlsx } from '../docs/xlsx.js';
import { excelBlaetter } from '../docs/auswertung.js';

const kalender = Array.from({ length: 52 }, (_, i) => ({
  kw: i + 1, von: '01.01.', bis: '07.01.', monat: i >= 47 ? 12 : 1,
  arbeitstage: i === 0 ? 5 : 6, feiertag: i === 0 ? 'Heilige Drei Könige' : null, gesperrt: i >= 47,
}));
const daten = {
  kalender,
  fragen: [
    { id: 1, typ: 'urlaubswochen', text: 'Urlaub', aktiv: true, optionen: [], regeln: {}, bedingungen: [] },
    { id: 2, typ: 'einfach', text: 'Schicht', aktiv: true, optionen: [{ id: 21, text: 'Früh', aktiv: true }], regeln: {}, bedingungen: [] },
    { id: 3, typ: 'text_kurz', text: 'Alt', aktiv: false, optionen: [], regeln: {}, bedingungen: [] },
    { id: 4, typ: 'hinweis', text: 'Info', aktiv: true, optionen: [], regeln: {}, bedingungen: [] },
  ],
  mitarbeiter: [
    { id: 1, name: 'Anna Ä. <&>', link: 'x', geaendert_am: '2026-10-01T14:00:00Z',
      antworten: { 1: [1, 30], 2: 21 }, verstoesse: { 1: 'ZU_VIELE_AM_STUECK' } },
    { id: 2, name: 'Ben', link: 'y', geaendert_am: null, antworten: {}, verstoesse: {} },
  ],
};

const python = spawnSync('python', ['-c', 'import openpyxl'], { encoding: 'utf8' });

test('Excel-Datei: Antworten, Wochen, Matrix', { skip: python.status !== 0 && 'python/openpyxl nicht verfügbar' }, () => {
  const datei = join(mkdtempSync(join(tmpdir(), 'urlaub-')), 'test.xlsx');
  writeFileSync(datei, erzeugeXlsx(excelBlaetter(daten)));
  const r = spawnSync('python', ['-c', `
import json, sys, openpyxl
wb = openpyxl.load_workbook(sys.argv[1])
print(json.dumps({ws.title: [[c for c in row] for row in ws.iter_rows(values_only=True)] for ws in wb}, ensure_ascii=False, default=str))
`, datei], { encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
  assert.equal(r.status, 0, r.stderr);
  const wb = JSON.parse(r.stdout);
  assert.deepEqual(Object.keys(wb), ['Antworten', 'Wochen', 'Matrix']);
  assert.deepEqual(wb.Antworten[0], ['Name', 'Abgegeben', 'Letzte Änderung', 'Urlaub', 'Schicht', 'Alt (aus)', 'Hinweis']);
  assert.deepEqual(wb.Antworten[1].slice(0, 6), ['Anna Ä. <&>', 'ja', '01.10.2026, 16:00 Uhr', 'KW 1, KW 30', 'Früh', null]);
  assert.match(wb.Antworten[1][6], /^Urlaub: .*am Stück/);
  assert.deepEqual(wb.Antworten[2], ['Ben', 'nein', null, null, null, null, null]);
  assert.equal(wb.Wochen.length, 48);
  assert.deepEqual(wb.Wochen[1], [1, '01.01.–07.01.', 5, 'Heilige Drei Könige', 1, 'Anna Ä. <&>']);
  assert.equal(wb.Matrix[0].length, 48);
  assert.equal(wb.Matrix[1][1], 'x');
});

test('Excel-Datei ohne Urlaubswochen hat nur das Blatt „Antworten“', { skip: python.status !== 0 && 'python/openpyxl nicht verfügbar' }, () => {
  const ohne = { ...daten, kalender: [], fragen: daten.fragen.slice(1) };
  const blaetter = excelBlaetter(ohne);
  assert.deepEqual(blaetter.map((b) => b.name), ['Antworten']);
});
```

- [ ] **Step 2: Tests laufen lassen → FAIL** (`zusammenfassung` fehlt, Blattnamen).
- [ ] **Step 3: Implementieren** (`docs/auswertung.js`, Oberflächenänderungen; Fehlertext `HAT_ANTWORTEN` usw. bereits aus Task 5).
- [ ] **Step 4: `npm test` → PASS; `node --check` der geänderten JS-Dateien; ID-Abgleich `$('…')` ↔ `admin.html` im Report.**
- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Verwaltung: Auswertung je Frage, Excel, Umfrage kopieren

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Anleitung und README

**Files:** Modify `ANLEITUNG.md`, `README.md`

- [ ] **Step 1: `ANLEITUNG.md` anpassen**
  - Teil A (Umstellung) ersetzen: Umstellung von Stand 2 auf Stand 3 – Vorabprüfung entfällt; Schritt: `supabase/schema.sql` ausführen (Bestätigungsdialog, „Success“), zur Kontrolle ein zweites Mal; Hinweis: jede bestehende Umfrage hat danach eine Frage „Urlaubswochen“ mit ihren bisherigen Regeln; Links und Abgaben bleiben gültig. Auth-Einstellungen bleiben wie sie sind.
  - Teil C ergänzen um „Fragen bearbeiten“: Reiter **Fragen** – Frage hinzufügen (Typen kurz erklärt), Bearbeiten (Text, Hilfetext, Antwortmöglichkeiten, Prüfregeln, Bedingungen mit „und/oder“), Schalter (ausgeschaltet = für Mitarbeiter unsichtbar, bleibt gespeichert), ↑/↓, Löschen nur ohne Antworten, Vorschau. Bedingungen nur auf frühere Fragen. Beispiel „Kinder? → nur bei Ja: Ferienfrage“.
  - Auswertung: Reiter **Antworten** statt „Wochen“; Excel-Blätter „Antworten“, „Wochen“, „Matrix“.
  - Einstellungen: Titel, Frist, freie Tage, **Umfrage kopieren**.
  - Probleme-Tabelle: „Frage lässt sich nicht löschen“ → hat Antworten oder wird in einer Bedingung verwendet – ausschalten bzw. Bedingung entfernen; „Frage lässt sich nicht verschieben“ → Bedingungen dürfen nur auf frühere Fragen zeigen.
- [ ] **Step 2: `README.md`**: Beschreibung um „Fragen-Baukasten“ ergänzen; Sicherheitsprinzip um `umfrage_absenden` ergänzen.
- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "Anleitung und README für den Fragen-Baukasten

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Nach den Tasks (Controller)

1. Gesamt-Review (Sicherheit, Umstellung, Bedingungs-Parität SQL ↔ Browser).
2. Browser-Durchlauf mit lokalem Supabase-Ersatz: Editor (alle Typen anlegen, Schalter, Regeln, Bedingungen, Verschieben, Löschschutz, Vorschau), Mitarbeiter-Seite (Bedingungen live, Fehler an der Frage, Bestätigung), Auswertung, Excel, Kopieren; Handy und PC.
3. Mit dem User: `schema.sql` ausführen (zweimal), Push, Live-Prüfung (Zugriffsschutz, eine Testabgabe mit Bedingungen).
