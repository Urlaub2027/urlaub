# Einzelne Urlaubstage nach den Wochen – Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wer die Höchstzahl an Urlaubswochen gewählt hat und noch Urlaubstage übrig hat, kann den Rest als einzelne Tage wünschen – mit sichtbarer Erklärung, wenn ein Tag gesperrt ist.

**Architecture:** Die Antwort der Urlaubswochen-Frage bleibt eine JSON-Liste; Zahlen sind KWs, Texte `"YYYY-MM-DD"` einzelne Tage. Die Datenbank (`supabase/schema.sql`) prüft verbindlich; `docs/logik.js` bildet dieselben Regeln für die Anzeige nach (Fachregel-Duplikat, beidseitig kommentiert). Ein neuer Regel-Schalter `einzeltage` an der Urlaubswochen-Frage schaltet das Ganze ein.

**Tech Stack:** PostgreSQL/PL/pgSQL (Supabase), Vanilla-JS-Module ohne Build, Tests mit `node --test` und PGlite.

**Spec:** `spezifikation/2026-10-09-einzelne-tage-design.md`

## Global Constraints

- Arbeitsverzeichnis: `C:\Users\dtn\Documents\Urlaubsvertretung-einzeltage` (Worktree, Branch `einzeltage`). Tests: `npm test` (alle) oder `node --test tests/<datei>.test.mjs`.
- `supabase/schema.sql` muss **zweimal hintereinander** fehlerfrei laufen (`tests/helfer.mjs` tut das) – nur `create or replace`, `if not exists`.
- `language sql`-Funktionen werden beim Anlegen geprüft: Eine Funktion muss **vor** ihrer ersten Verwendung in einer `language sql`-Funktion stehen.
- Neue `urlaub.*`-Funktionen: `set search_path = ''`, alle Namen voll qualifiziert (`urlaub.…`, `pg_catalog` implizit).
- Browser ruft nur `public.*`-Funktionen; keine neuen Tabellen, keine neuen Rechte.
- Deutsche Texte, deutsche Anführungszeichen („…“), Bezeichner deutsch wie im Bestand.
- Gespeicherte Form: KWs aufsteigend, danach Tage aufsteigend: `[12, 13, 30, "2027-07-23", "2027-08-17"]`.
- Nur Texte im Format `^\d{4}-\d{2}-\d{2}$` sind Tage. Passt das Format, aber das Datum ist ungültig (`2027-02-30`) → `UNGUELTIGER_TAG`. Jeder andere Text (z. B. `'5'`) → wie bisher `UNGUELTIGE_WOCHE`.
- Regel `einzeltage` hat wie `pflicht` immer den Wert `null`. **Falle:** In JS ist `regeln.einzeltage === null`; Hilfen wie `hat()`/`zahlRegel()` werten `null` als „nicht vorhanden“. Prüfen immer mit `einzeltageAn(regeln)` (hasOwnProperty).
- Neue Fehlercodes Mitarbeiter-Seite: `UNGUELTIGER_TAG`, `DOPPELTER_TAG`, `TAGE_ERST_NACH_WOCHEN`, `TAG_ZU_VIELE_AM_STUECK`. Neuer Code Verwaltung: `EINZELTAGE_OHNE_GRENZEN`.
- Texte wörtlich:
  - `UNGUELTIGER_TAG`: „Mindestens ein gewählter Tag ist nicht wählbar.“
  - `DOPPELTER_TAG`: „Ein Tag wurde doppelt gewählt.“
  - `TAGE_ERST_NACH_WOCHEN`: „Einzelne Tage gehen erst, wenn du alle Wochen gewählt hast.“
  - `TAG_ZU_VIELE_AM_STUECK`: „Ein gewählter Tag macht deinen Urlaub zu lang am Stück.“
  - `EINZELTAGE_OHNE_GRENZEN`: „Einzelne Tage gehen nur, wenn „Höchstens Wochen“ und „Höchstens Urlaubstage“ eingeschaltet sind. Schalte zuerst die einzelnen Tage aus.“
  - Sperrgrund am Tag: „Nicht wählbar: würde deinen Urlaub KW 30–32 auf mehr als 3 Wochen am Stück verlängern.“
  - Regelschalter: „Einzelne Tage nach den Wochen erlauben“

## Review Focus

1. **Gemischte Liste in alten Lesern** – jede Stelle, die heute `wert` der Urlaubsfrage als KW-Liste liest (`app.js` `entfernteWochen`/Bestätigung, `auswertung.js` Wochen/Matrix, `antwortSchluessel`-Sortierung), muss Tage ignorieren bzw. richtig sortieren; sonst erscheint „KW 2027-08-17 · nicht mehr wählbar“ oder der Absenden-Knopf bleibt nach dem Laden aktiv. Tests in Task 3/4/5.
2. **Woche gewechselt, Tage passen nicht mehr** – andere Woche mit mehr Arbeitstagen gewählt (Rest schrumpft), Woche gewählt, die einen gewählten Tag enthält, oder Block auf Höchstlänge gebracht: Tage müssen sofort entfernt werden, mit Hinweis; sonst lehnt die Datenbank beim Absenden ab. Tests in Task 3 (`tageBereinigen`).
3. **Organisator schaltet `einzeltage` aus, Antworten mit Tagen existieren** – Formular entfernt die Tage beim Laden mit Hinweis; Auswertung zeigt sie weiter und meldet den Verstoß. Tests in Task 3 (`grund: 'aus'`) und Task 2.
4. **Feiertag oder freier Tag als Brücke** – Montag nach dem Block ist Feiertag → Dienstag verlängert den Block. Tests in Task 2 (SQL) und Task 3 (JS) mit identischen Fällen.
5. **Sicherung/Kopieren mit Tagen** – Antworten mit Tagen und die Regel `einzeltage` überstehen Sicherung → Einspielen; Sicherung mit `einzeltage` ohne `max_wochen` wird abgelehnt. Tests in Task 1.

---

## Testdaten (für alle Tasks gleich)

Umfrage 2027, Bayern, Standardregeln (6 Arbeitstage Mo–Sa, `max_wochen` 6, `max_am_stueck` 3, `max_urlaubstage` 36, Dezember gesperrt). Gemessen mit `urlaub.kalender`:

| KW | Montag | Arbeitstage | Feiertag |
|---|---|---|---|
| 12 | 2027-03-22 | 5 | Karfreitag |
| 13 | 2027-03-29 | 5 | Ostermontag |
| 20 | 2027-05-17 | 5 | Pfingstmontag (17.05.) |
| 30 | 2027-07-26 | 6 | – |
| 31 | 2027-08-02 | 6 | – |
| 32 | 2027-08-09 | 6 | – |
| 33 | 2027-08-16 | 6 | – |
| 44 | 2027-11-01 | 5 | Allerheiligen |

Wochen `[12, 13, 30, 31, 32, 44]` = 5+5+6+6+6+5 = **33 Tage, 3 übrig**. Block KW 30–32 hat die Höchstlänge 3.
- `2027-08-16` (Mo KW 33) verlängert den Block → gesperrt.
- `2027-08-17` (Di KW 33) erlaubt (Mo wird gearbeitet).
- `2027-07-24` (Sa vor KW 30, Samstag ist Arbeitstag) verlängert → gesperrt.
- `2027-07-23` (Fr vor KW 30) erlaubt (Sa wird gearbeitet).
- `2027-08-15` ist Sonntag → kein Arbeitstag → `UNGUELTIGER_TAG`.

---

### Task 1: Datenbank-Grundlagen – freie Tage, Kalender, Regel `einzeltage`, Form und Normalisierung

**Files:**
- Modify: `supabase/schema.sql` (neue Funktion `urlaub.frei` vor `urlaub.kalender` ~Z. 267; `urlaub.kalender` ~Z. 270–313; `urlaub.kalender_json` ~Z. 315–330; `urlaub.antwort_normalisiert` ~Z. 645; `urlaub.antwort_form_ok` ~Z. 664–690; `urlaub.frage_json` ~Z. 818–821; `urlaub.erlaubte_regeln` ~Z. 1420; `urlaub.regelwert` ~Z. 1467; `public.org_regel_setzen` ~Z. 1919; Sicherung-Einspielen ~Z. 2153)
- Test: `tests/kalender.test.mjs`, `tests/editor.test.mjs`, `tests/sicherung.test.mjs`

**Interfaces:**
- Produces:
  - `urlaub.frei(p_umfrage_id bigint) returns table (datum date, name text)`: Feiertage des Bundeslands (Vorjahr bis Folgejahr) plus `urlaub.freie_tage` der Umfrage.
  - `urlaub.ist_datumstext(p_e jsonb) returns boolean`: JSON-String im Format `YYYY-MM-DD` und gültiges Datum.
  - `urlaub.antwort_wochen(p_wert jsonb) returns int[]`: alle JSON-Zahlen, aufsteigend (Duplikate bleiben).
  - `urlaub.antwort_tage(p_wert jsonb) returns date[]`: alle JSON-Strings als Datum, aufsteigend (nur nach Formprüfung aufrufen).
  - `urlaub.einzeltage_ohne_grenzen(p_frage_id bigint) returns boolean`
  - `kalender_json` liefert zusätzlich `"montag": "YYYY-MM-DD"`.
  - Fragen-JSON `urlaubswochen.freie_tage`: `[{"datum": "YYYY-MM-DD", "name": "…"}]`.

- [ ] **Step 1: Failing tests schreiben**

In `tests/kalender.test.mjs` den Test „kalender_json liefert Anzeigeformat“ anpassen (erwartetes Objekt um `montag` ergänzen):

```js
  assert.deepEqual(j[0], { kw: 1, von: '04.01.', bis: '10.01.', montag: '2027-01-04', monat: 1, arbeitstage: 5,
    feiertag: 'Heilige Drei Könige', gesperrt: false });
```

und am Ende von `tests/kalender.test.mjs` anfügen:

```js
test('urlaub.frei: Feiertage und freie Tage der Umfrage; kalender unverändert', async () => {
  const id = await umfrageAnlegen(db, chef);
  await db.query("insert into urlaub.freie_tage (umfrage_id, datum, name) values ($1, '2027-08-19', 'Betriebsausflug')", [id]);
  const frei = (await db.query('select datum::text, name from urlaub.frei($1) order by datum', [id])).rows;
  assert.ok(frei.some((t) => t.datum === '2027-05-17' && t.name === 'Pfingstmontag'));
  assert.ok(frei.some((t) => t.datum === '2027-08-19' && t.name === 'Betriebsausflug'));
  assert.ok(frei.some((t) => t.datum === '2026-12-25'), 'Vorjahr enthalten');
  const k = await kalender(id);
  assert.equal(k.find((x) => x.kw === 33).arbeitstage, 5);
  assert.equal(k.find((x) => x.kw === 20).arbeitstage, 5);
});
```

In `tests/editor.test.mjs` am Ende anfügen:

```js
test('Regel einzeltage: nur mit max_wochen und max_urlaubstage', async () => {
  const u = await neueUmfrage();
  const uw = (await fragenVon(u))[0].id; // Standard: max_wochen 6, max_urlaubstage 36 eingeschaltet
  await regel(uw, 'einzeltage', 'egal');
  assert.deepEqual((await findeFrage(u, uw)).regeln.einzeltage, { wert: null, aktiv: true });
  // Grenzen ausschalten, solange einzeltage an ist: abgelehnt, nichts geändert.
  await assert.rejects(regel(uw, 'max_wochen', 6, false), /EINZELTAGE_OHNE_GRENZEN/);
  await assert.rejects(regel(uw, 'max_urlaubstage', 36, false), /EINZELTAGE_OHNE_GRENZEN/);
  assert.deepEqual((await findeFrage(u, uw)).regeln.max_wochen, { wert: 6, aktiv: true });
  // Erst einzeltage aus, dann geht es; einzeltage wieder an scheitert.
  await regel(uw, 'einzeltage', null, false);
  await regel(uw, 'max_wochen', 6, false);
  await assert.rejects(regel(uw, 'einzeltage', null, true), /EINZELTAGE_OHNE_GRENZEN/);
  assert.deepEqual((await findeFrage(u, uw)).regeln.einzeltage, { wert: null, aktiv: false });
  const t = await frage(u, 'text_kurz');
  await assert.rejects(regel(t, 'einzeltage', null), /REGEL_UNPASSEND/);
});

test('Fragen-JSON: freie_tage und montag im Kalender', async () => {
  const u = await neueUmfrage();
  const f = (await fragenVon(u))[0];
  assert.ok(f.urlaubswochen.freie_tage.some((t) => t.datum === '2027-05-17' && t.name === 'Pfingstmontag'));
  assert.ok(f.urlaubswochen.freie_tage.every((t) => t.datum >= '2026-12-25' && t.datum <= '2028-01-07'));
  assert.equal(f.urlaubswochen.kalender[0].montag, '2027-01-04');
});
```

In `tests/sicherung.test.mjs` am Ende anfügen:

```js
test('Sicherung mit einzelnen Tagen und Regel einzeltage', async () => {
  const bau = await baueUmfrage(db, chef, { titel: 'Tage', fragen: [{ key: 'w', typ: 'urlaubswochen', regeln: { einzeltage: null } }] });
  const code = (await db.query("insert into urlaub.mitarbeiter (umfrage_id, name) values ($1, 'Anna') returning code",
    [bau.umfrageId])).rows[0].code;
  await browser(db, 'select public.umfrage_absenden($1, $2)',
    [code, JSON.stringify({ [bau.ids.w]: ['2027-08-17', 44, 12, 13, 30, 31, 32] })]);
  const s = await sicherung(bau.umfrageId);
  const r = await einspielen(s);
  const nachher = await umfrage(r.id);
  assert.deepEqual(nachher.fragen[0].regeln.einzeltage, { wert: null, aktiv: true });
  assert.deepEqual(nachher.mitarbeiter[0].antworten[String(nachher.fragen[0].id)], [12, 13, 30, 31, 32, 44, '2027-08-17']);
  // Kaputte Tage oder einzeltage ohne Grenzen: abgelehnt.
  const kaputt = structuredClone(s);
  kaputt.mitarbeiter[0].antworten[String(s.fragen[0].id)] = [12, '2027-02-30'];
  await assert.rejects(einspielen(kaputt), /SICHERUNG_UNGUELTIG/);
  const ohne = structuredClone(s);
  ohne.fragen[0].regeln = ohne.fragen[0].regeln.filter((x) => x.art !== 'max_wochen');
  await assert.rejects(einspielen(ohne), /SICHERUNG_UNGUELTIG/);
});
```

Hinweis: Diese Abgabe setzt die Prüfung aus Task 2 voraus. Bis Task 2 fertig ist, lehnt `umfrage_absenden` Texte ab. Deshalb in Task 1 die Antwort **direkt** schreiben statt über `umfrage_absenden`:

```js
  await db.query('insert into urlaub.abgaben (mitarbeiter_id) select id from urlaub.mitarbeiter where code = $1', [code]);
  await db.query(`insert into urlaub.antworten (mitarbeiter_id, frage_id, wert)
    select id, $2, $3::jsonb from urlaub.mitarbeiter where code = $1`,
    [code, bau.ids.w, JSON.stringify([12, 13, 30, 31, 32, 44, '2027-08-17'])]);
```

(Diese zwei Zeilen ersetzen den `browser(…umfrage_absenden…)`-Aufruf im Test oben.) Wie `s.mitarbeiter[i].antworten` und `s.fragen[i].regeln` in der Sicherungsdatei aussehen, vorher mit `console.log(JSON.stringify(s, null, 1))` prüfen und die Pfade im Test daran anpassen. Format siehe Kommentar über `urlaub.umfrage_json` (~Z. 2010).

- [ ] **Step 2: Tests laufen lassen – müssen fehlschlagen**

Run: `node --test tests/kalender.test.mjs tests/editor.test.mjs tests/sicherung.test.mjs`
Expected: FAIL (`montag` fehlt, `urlaub.frei` existiert nicht, `REGEL_UNPASSEND` für `einzeltage`, …)

- [ ] **Step 3: `urlaub.frei` und `urlaub.ist_datumstext` anlegen** – direkt **vor** `create or replace function urlaub.kalender`:

```sql
-- Feiertage des Bundeslands (Vorjahr bis Folgejahr, damit KW 1 und die letzte KW stimmen)
-- und freie Tage der Umfrage. Ohne Urlaubswochen-Frage nur die freien Tage.
create or replace function urlaub.frei(p_umfrage_id bigint)
returns table (datum date, name text)
language sql stable
set search_path = ''
as $$
  select l.datum, l.name
  from urlaub.fragen f, generate_series(f.jahr - 1, f.jahr + 1) j (jahr), urlaub.landesfeiertage(j.jahr, f.bundesland) l
  where f.umfrage_id = p_umfrage_id and f.typ = 'urlaubswochen'
  union
  select fr.datum, fr.name from urlaub.freie_tage fr where fr.umfrage_id = p_umfrage_id
$$;

-- JSON-Text im Format YYYY-MM-DD mit gültigem Datum (einzelner Urlaubstag).
create or replace function urlaub.ist_datumstext(p_e jsonb)
returns boolean
language plpgsql immutable
set search_path = ''
as $$
declare
  v_datum date;
begin
  if jsonb_typeof(p_e) is distinct from 'string' or (p_e #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$' then
    return false;
  end if;
  v_datum := (p_e #>> '{}')::date;
  return true;
exception when data_exception then
  return false;
end;
$$;
```

- [ ] **Step 4: `urlaub.kalender` auf `urlaub.frei` umstellen.** Im CTE `frei` den Inhalt ersetzen:

```sql
  frei as (
    select fr.datum, fr.name from urlaub.frei(p_umfrage_id) fr
  ),
```

(Die CTE `u` bleibt; `u.jahr`/`u.bundesland` werden in `frei` nicht mehr gebraucht, aber in `w` weiter über `u.*`.)

- [ ] **Step 5: `kalender_json` um `montag` ergänzen** (nach `'bis'`):

```sql
           'montag',      to_char(k.montag, 'YYYY-MM-DD'),
```

- [ ] **Step 6: `antwort_wochen`, `antwort_tage` anlegen** – direkt vor `urlaub.wochen_verstoss` (~Z. 497):

```sql
-- Urlaubswochen-Antwort: Zahlen = KWs, Texte "YYYY-MM-DD" = einzelne Tage.
-- Nur über diese beiden Funktionen lesen. antwort_tage erst nach der Formprüfung
-- aufrufen (wochen_verstoss / antwort_form_ok), sonst scheitert ::date.
create or replace function urlaub.antwort_wochen(p_wert jsonb)
returns int[]
language sql immutable
set search_path = ''
as $$
  select coalesce(array_agg(((e #>> '{}')::numeric)::int order by (e #>> '{}')::numeric), '{}'::int[])
  from jsonb_array_elements(case when jsonb_typeof(p_wert) = 'array' then p_wert else '[]'::jsonb end) e
  where jsonb_typeof(e) = 'number'
$$;

create or replace function urlaub.antwort_tage(p_wert jsonb)
returns date[]
language sql immutable
set search_path = ''
as $$
  select coalesce(array_agg((e #>> '{}')::date order by (e #>> '{}')), '{}'::date[])
  from jsonb_array_elements(case when jsonb_typeof(p_wert) = 'array' then p_wert else '[]'::jsonb end) e
  where jsonb_typeof(e) = 'string'
$$;
```

- [ ] **Step 7: `antwort_normalisiert` – Urlaubswochen getrennt sortieren.** Den Zweig `when p_frage.typ in ('urlaubswochen', 'mehrfach')` aufteilen:

```sql
    when p_frage.typ = 'urlaubswochen' then
      (select coalesce(jsonb_agg(x order by s, n, t), '[]'::jsonb)
       from (select to_jsonb(((e #>> '{}')::numeric)::bigint) as x, 0 as s, (e #>> '{}')::numeric as n, null::text as t
             from jsonb_array_elements(p_wert) e where jsonb_typeof(e) = 'number'
             union all
             select e, 1, null, e #>> '{}'
             from jsonb_array_elements(p_wert) e where jsonb_typeof(e) = 'string') a)
    when p_frage.typ = 'mehrfach' then
      (select jsonb_agg(to_jsonb(((e #>> '{}')::numeric)::bigint) order by (e #>> '{}')::numeric)
       from jsonb_array_elements(p_wert) e)
```

- [ ] **Step 8: `antwort_form_ok` – Tage zulassen.** Im Zweig `when 'urlaubswochen', 'mehrfach'` die Zeile mit `jsonb_typeof(e) <> 'number'` und die Doppelten-Prüfung für Urlaubswochen ersetzen. Der Zweig wird:

```sql
  when 'urlaubswochen', 'mehrfach' then
    if v_typ is distinct from 'array' or jsonb_array_length(p_wert) = 0 then
      return false;
    end if;
    if p_frage.typ = 'urlaubswochen' then
      if exists (select 1 from jsonb_array_elements(p_wert) e
                 where not (jsonb_typeof(e) = 'number' or urlaub.ist_datumstext(e))) then
        return false;
      end if;
      if (select count(distinct e) from jsonb_array_elements(p_wert) e where jsonb_typeof(e) = 'string')
         + (select count(distinct (e #>> '{}')::numeric) from jsonb_array_elements(p_wert) e where jsonb_typeof(e) = 'number')
         <> jsonb_array_length(p_wert) then
        return false;
      end if;
      return not exists (select 1 from jsonb_array_elements(p_wert) e
                         where jsonb_typeof(e) = 'number'
                           and ((e #>> '{}')::numeric <> trunc((e #>> '{}')::numeric)
                                or (e #>> '{}')::numeric not between 1 and 53));
    end if;
    if exists (select 1 from jsonb_array_elements(p_wert) e where jsonb_typeof(e) <> 'number') then
      return false;
    end if;
    if (select count(distinct (e #>> '{}')::numeric) from jsonb_array_elements(p_wert) e) <> jsonb_array_length(p_wert) then
      return false;
    end if;
    return not exists (select 1 from jsonb_array_elements(p_wert) e
                       where not exists (select 1 from urlaub.optionen o
                                         where o.frage_id = p_frage.id and o.id::numeric = (e #>> '{}')::numeric));
```

- [ ] **Step 9: `frage_json` – `freie_tage` ausliefern.** Im `jsonb_build_object` für `'urlaubswochen'` nach `'kalender', urlaub.kalender_json(p_f.umfrage_id)` ergänzen:

```sql
                              'kalender', urlaub.kalender_json(p_f.umfrage_id),
                              'freie_tage', (select coalesce(jsonb_agg(jsonb_build_object(
                                               'datum', to_char(fr.datum, 'YYYY-MM-DD'), 'name', fr.name)
                                               order by fr.datum, fr.name), '[]'::jsonb)
                                             from urlaub.frei(p_f.umfrage_id) fr
                                             where fr.datum between make_date(p_f.jahr - 1, 12, 25)
                                                                and make_date(p_f.jahr + 1, 1, 7))) end)
```

(Achtung: `frage_json` ist `language sql` und steht nach `urlaub.frei` – passt.)

- [ ] **Step 10: Regel `einzeltage` zulassen.**
  - `urlaub.erlaubte_regeln`: Urlaubswochen-Array wird
    `array['pflicht', 'min_wochen', 'max_wochen', 'max_am_stueck', 'max_urlaubstage', 'einzeltage', 'gesperrte_monate', 'gesperrte_wochen']`
  - `urlaub.regelwert`: `if p_art = 'pflicht' then` → `if p_art in ('pflicht', 'einzeltage') then`
  - Neue Funktion direkt nach `urlaub.regeln_widerspruch`:

```sql
-- Einzelne Tage brauchen eingeschaltete Grenzen: "Wochen voll" und "Tage übrig" sind sonst
-- nicht definiert.
create or replace function urlaub.einzeltage_ohne_grenzen(p_frage_id bigint)
returns boolean
language sql stable
set search_path = ''
as $$
  select exists (select 1 from urlaub.regeln r where r.frage_id = p_frage_id and r.art = 'einzeltage' and r.aktiv)
     and (select count(*) from urlaub.regeln r
          where r.frage_id = p_frage_id and r.art in ('max_wochen', 'max_urlaubstage') and r.aktiv) < 2
$$;
```

  - `public.org_regel_setzen`: nach dem bestehenden `regeln_widerspruch`-Block ergänzen:

```sql
  if urlaub.einzeltage_ohne_grenzen(v_f.id) then
    raise exception 'EINZELTAGE_OHNE_GRENZEN';
  end if;
```

  - Einspielen (~Z. 2153): `if urlaub.regeln_widerspruch(v_neu) then` → `if urlaub.regeln_widerspruch(v_neu) or urlaub.einzeltage_ohne_grenzen(v_neu) then`

- [ ] **Step 11: Tests laufen lassen**

Run: `node --test tests/kalender.test.mjs tests/editor.test.mjs tests/sicherung.test.mjs`
Expected: PASS. Danach `npm test` – alle grün. Schlagen andere Tests nur wegen des neuen Felds `montag` oder `freie_tage` in einem `deepEqual` fehl, die Erwartung um das Feld ergänzen (nicht das Feld weglassen).

- [ ] **Step 12: Commit**

```bash
git add supabase/schema.sql tests/kalender.test.mjs tests/editor.test.mjs tests/sicherung.test.mjs
git commit -m "Einzeltage: freie Tage, Kalender mit Montag, Regel einzeltage, Form und Normalisierung"
```

---

### Task 2: Datenbank-Prüfung der einzelnen Tage (`wochen_verstoss`)

**Files:**
- Modify: `supabase/schema.sql` (`urlaub.wochen_verstoss` ~Z. 497–548; zwei neue Funktionen direkt davor)
- Create: `tests/einzeltage.test.mjs`

**Interfaces:**
- Consumes (Task 1): `urlaub.frei`, `urlaub.ist_datumstext`, `urlaub.antwort_wochen`, `urlaub.antwort_tage`, Regel `einzeltage`.
- Produces:
  - `urlaub.waehlbare_tage(p_frage urlaub.fragen, p_wochen int[]) returns setof date`
  - `urlaub.tag_verlaengert_block(p_frage urlaub.fragen, p_tag date, p_wochen int[], p_tage date[], p_max int) returns boolean`
  - Fehlercodes `UNGUELTIGER_TAG`, `DOPPELTER_TAG`, `TAGE_ERST_NACH_WOCHEN`, `TAG_ZU_VIELE_AM_STUECK` im `details`-Objekt von `ANTWORTEN_UNGUELTIG`.

- [ ] **Step 1: Failing tests schreiben** – `tests/einzeltage.test.mjs`:

```js
// Einzelne Urlaubstage nach vollen Wochen: Prüfung in der Datenbank.
// Testdaten: 2027, Bayern, Mo–Sa; Wochen [12, 13, 30, 31, 32, 44] = 33 Tage, 3 übrig.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { neueDatenbank, browser, organisator } from './helfer.mjs';
import { baueUmfrage, fehlerVon } from './umfrage-bauer.mjs';

const WOCHEN = [12, 13, 30, 31, 32, 44];
let db;
let chef;

before(async () => {
  db = await neueDatenbank();
  chef = await organisator(db, 'chef');
});

async function umfrageMit(regeln = { einzeltage: null }) {
  const bau = await baueUmfrage(db, chef, { fragen: [{ key: 'urlaub', typ: 'urlaubswochen', regeln }] });
  const code = (await db.query("insert into urlaub.mitarbeiter (umfrage_id, name) values ($1, 'Anna') returning code",
    [bau.umfrageId])).rows[0].code;
  const absenden = (liste) => browser(db, 'select public.umfrage_absenden($1, $2) as r',
    [code, JSON.stringify({ [bau.ids.urlaub]: liste })]);
  const fehler = async (liste) => (await fehlerVon(bau, absenden(liste))).fehler?.urlaub;
  const gespeichert = async () => (await browser(db, 'select public.urlaub_laden($1) as r', [code]))[0].r
    .antworten[String(bau.ids.urlaub)];
  return { bau, absenden, fehler, gespeichert };
}

test('Gültig: 6 Wochen + 3 Tage, gespeichert sortiert (KWs, dann Tage)', async () => {
  const u = await umfrageMit();
  await u.absenden(['2027-08-18', 44, '2027-07-23', 12, 13, 30, 31, 32, '2027-08-17']);
  assert.deepEqual(await u.gespeichert(), [...WOCHEN, '2027-07-23', '2027-08-17', '2027-08-18']);
});

test('Nur Wochen bleibt gültig (bestehende Antworten)', async () => {
  const u = await umfrageMit();
  await u.absenden(WOCHEN);
  assert.deepEqual(await u.gespeichert(), WOCHEN);
});

test('Ungültige Tage', async () => {
  const u = await umfrageMit();
  const faelle = [
    ['2027-08-15', 'UNGUELTIGER_TAG'],      // Sonntag
    ['2027-05-17', 'UNGUELTIGER_TAG'],      // Pfingstmontag
    ['2027-08-02', 'UNGUELTIGER_TAG'],      // in gewählter KW 31
    ['2027-12-01', 'UNGUELTIGER_TAG'],      // Dezember gesperrt
    ['2027-02-30', 'UNGUELTIGER_TAG'],      // kein Datum
    ['17.08.2027', 'UNGUELTIGE_WOCHE'],     // falsches Format = weder Woche noch Tag
  ];
  for (const [tag, code] of faelle) assert.equal(await u.fehler([...WOCHEN, tag]), code, tag);
  assert.equal(await u.fehler([...WOCHEN, '2027-08-17', '2027-08-17']), 'DOPPELTER_TAG');
});

test('Tage erst bei vollen Wochen; Summe zählt die Tage mit', async () => {
  const u = await umfrageMit();
  assert.equal(await u.fehler([12, 13, 30, 31, 32, '2027-08-17']), 'TAGE_ERST_NACH_WOCHEN');
  assert.equal(await u.fehler([...WOCHEN, '2027-07-23', '2027-08-17', '2027-08-18', '2027-08-19']), 'ZU_VIELE_TAGE');
});

test('Am Stück: Tag direkt am vollen Block gesperrt, mit gearbeitetem Tag dazwischen erlaubt', async () => {
  const u = await umfrageMit();
  assert.equal(await u.fehler([...WOCHEN, '2027-08-16']), 'TAG_ZU_VIELE_AM_STUECK');   // Mo nach KW 32
  assert.equal(await u.fehler([...WOCHEN, '2027-07-24']), 'TAG_ZU_VIELE_AM_STUECK');   // Sa vor KW 30
  assert.equal(await u.fehler([...WOCHEN, '2027-08-16', '2027-08-17']), 'TAG_ZU_VIELE_AM_STUECK');
  await u.absenden([...WOCHEN, '2027-08-17']);                                         // Di: Mo wird gearbeitet
  await u.absenden([...WOCHEN, '2027-07-23']);                                         // Fr: Sa wird gearbeitet
  // Block unter der Höchstlänge darf verlängert werden: KW 31–32 statt 30–32.
  await u.absenden([12, 13, 20, 31, 32, 44, '2027-08-16']);
});

test('Feiertag/freier Tag überbrückt', async () => {
  const u = await umfrageMit();
  await db.query("insert into urlaub.freie_tage (umfrage_id, datum, name) values ($1, '2027-08-16', 'Betriebsruhe')",
    [u.bau.umfrageId]);
  assert.equal(await u.fehler([...WOCHEN, '2027-08-17']), 'TAG_ZU_VIELE_AM_STUECK');
  assert.equal(await u.fehler([...WOCHEN, '2027-08-16']), 'UNGUELTIGER_TAG');
  await u.absenden([...WOCHEN, '2027-08-18']);
});

test('max_am_stueck aus: keine Verlängerungsprüfung', async () => {
  const u = await umfrageMit({ einzeltage: null, max_am_stueck: { wert: 3, aktiv: false } });
  await u.absenden([...WOCHEN, '2027-08-16']);
});

test('Ohne Regel einzeltage sind Tage ungültig', async () => {
  const u = await umfrageMit({});
  assert.equal(await u.fehler([...WOCHEN, '2027-08-17']), 'UNGUELTIGER_TAG');
});

test('Verwaltung sieht Verstoß, wenn einzeltage nachträglich ausgeschaltet wird', async () => {
  const u = await umfrageMit();
  await u.absenden([...WOCHEN, '2027-08-17']);
  await db.query("update urlaub.regeln set aktiv = false where frage_id = $1 and art = 'einzeltage'", [u.bau.ids.urlaub]);
  const v = (await db.query(
    `select urlaub.antwort_verstoss(f, a.wert) as code from urlaub.antworten a join urlaub.fragen f on f.id = a.frage_id
     where a.frage_id = $1`, [u.bau.ids.urlaub])).rows[0].code;
  assert.equal(v, 'UNGUELTIGER_TAG');
});
```

- [ ] **Step 2: Laufen lassen – muss fehlschlagen**

Run: `node --test tests/einzeltage.test.mjs`
Expected: FAIL (Tage werden als `UNGUELTIGE_WOCHE` abgelehnt)

- [ ] **Step 3: Hilfsfunktionen anlegen** – direkt vor `urlaub.wochen_verstoss`:

```sql
-- Grundsätzlich wählbare einzelne Tage: Arbeitstage (ISO-Wochentag ≤ arbeitstage_pro_woche)
-- in nicht gesperrten KWs, ohne Feiertage und freie Tage, ohne Tage in den gewählten Wochen.
-- Fachregel-Duplikat: waehlbareTage in docs/logik.js. Änderungen dort nachziehen.
create or replace function urlaub.waehlbare_tage(p_frage urlaub.fragen, p_wochen int[])
returns setof date
language sql stable
set search_path = ''
as $$
  select (k.montag + g.i)::date
  from urlaub.kalender(p_frage.umfrage_id) k, generate_series(0, p_frage.arbeitstage_pro_woche - 1) g (i)
  where not k.gesperrt
    and not (k.kw = any (p_wochen))
    and not exists (select 1 from urlaub.frei(p_frage.umfrage_id) fr where fr.datum = k.montag + g.i)
$$;

-- Verlängert p_tag einen Block aus mindestens p_max aufeinanderfolgenden gewählten KWs?
-- Verlängern: Zwischen Block und Tag liegt kein gearbeiteter Arbeitstag. Überbrückt wird
-- durch Nicht-Arbeitstage, Feiertage/freie Tage und andere gewählte Einzeltage (p_tage).
-- Fachregel-Duplikat: tagSperrgrund in docs/logik.js. Änderungen dort nachziehen.
create or replace function urlaub.tag_verlaengert_block(p_frage urlaub.fragen, p_tag date, p_wochen int[],
                                                        p_tage date[], p_max int)
returns boolean
language plpgsql stable
set search_path = ''
as $$
declare
  v_frei  date[] := array(select fr.datum from urlaub.frei(p_frage.umfrage_id) fr);
  v_block record;
  v_d     date;
begin
  for v_block in
    select min(k.montag) as anfang, max(k.sonntag) as ende
    from (select x, x - row_number() over (order by x) as gruppe from unnest(p_wochen) x) s
    join urlaub.kalender(p_frage.umfrage_id) k on k.kw = s.x
    group by s.gruppe
    having count(*) >= p_max
  loop
    if p_tag > v_block.ende then
      v_d := v_block.ende + 1;
      while v_d < p_tag and (extract(isodow from v_d) > p_frage.arbeitstage_pro_woche
                             or v_d = any (v_frei) or v_d = any (p_tage)) loop
        v_d := v_d + 1;
      end loop;
    elsif p_tag < v_block.anfang then
      v_d := v_block.anfang - 1;
      while v_d > p_tag and (extract(isodow from v_d) > p_frage.arbeitstage_pro_woche
                             or v_d = any (v_frei) or v_d = any (p_tage)) loop
        v_d := v_d - 1;
      end loop;
    else
      continue;
    end if;
    if v_d = p_tag then
      return true;
    end if;
  end loop;
  return false;
end;
$$;
```

- [ ] **Step 4: `urlaub.wochen_verstoss` ersetzen** (ganze Funktion):

```sql
create or replace function urlaub.wochen_verstoss(p_frage urlaub.fragen, p_wochen jsonb)
returns text
language plpgsql stable
set search_path = ''
as $$
declare
  v_regel   jsonb := (select coalesce(jsonb_object_agg(r.art, r.wert), '{}'::jsonb)
                      from urlaub.regeln r where r.frage_id = p_frage.id and r.aktiv);
  v_liste   int[];
  v_tage    date[];
  v_erlaubt int[];
  v_stueck  int;
  v_summe   int;
  v_tag     date;
begin
  -- Zahlen = KWs, Texte im Format YYYY-MM-DD = einzelne Tage, alles andere ist keine Woche.
  if jsonb_typeof(p_wochen) <> 'array'
     or exists (select 1 from jsonb_array_elements(p_wochen) e
                where not (jsonb_typeof(e) = 'number'
                           or (jsonb_typeof(e) = 'string' and (e #>> '{}') ~ '^\d{4}-\d{2}-\d{2}$')))
     or exists (select 1 from jsonb_array_elements(p_wochen) e
                where jsonb_typeof(e) = 'number'
                  and (abs((e #>> '{}')::numeric) > 100
                       or (e #>> '{}')::numeric <> trunc((e #>> '{}')::numeric))) then
    return 'UNGUELTIGE_WOCHE';
  end if;
  if exists (select 1 from jsonb_array_elements(p_wochen) e
             where jsonb_typeof(e) = 'string' and not urlaub.ist_datumstext(e)) then
    return 'UNGUELTIGER_TAG';
  end if;
  v_liste := urlaub.antwort_wochen(p_wochen);
  v_tage  := urlaub.antwort_tage(p_wochen);

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

  if cardinality(v_tage) > 0 then
    if not (v_regel ? 'einzeltage')
       or exists (select 1 from unnest(v_tage) t
                  where not (t = any (array(select urlaub.waehlbare_tage(p_frage, v_liste))))) then
      return 'UNGUELTIGER_TAG';
    end if;
    if (select count(distinct t) from unnest(v_tage) t) <> cardinality(v_tage) then
      return 'DOPPELTER_TAG';
    end if;
    if not (v_regel ? 'max_wochen') or cardinality(v_liste) <> (v_regel ->> 'max_wochen')::int then
      return 'TAGE_ERST_NACH_WOCHEN';
    end if;
    if v_regel ? 'max_am_stueck' then
      foreach v_tag in array v_tage loop
        if urlaub.tag_verlaengert_block(p_frage, v_tag, v_liste, v_tage, (v_regel ->> 'max_am_stueck')::int) then
          return 'TAG_ZU_VIELE_AM_STUECK';
        end if;
      end loop;
    end if;
  end if;

  if v_regel ? 'max_urlaubstage' then
    select coalesce(sum(k.arbeitstage), 0) + cardinality(v_tage) into v_summe
    from urlaub.kalender(p_frage.umfrage_id) k where k.kw = any (v_liste);
    if v_summe > (v_regel ->> 'max_urlaubstage')::int then
      return 'ZU_VIELE_TAGE';
    end if;
  end if;
  return null;
end;
$$;
```

- [ ] **Step 5: Tests laufen lassen**

Run: `node --test tests/einzeltage.test.mjs` → PASS. Dann `npm test` → alle grün (insbesondere `datenbank.test.mjs` „Ungültige Formen“: `['5']` bleibt `UNGUELTIGE_WOCHE`).

- [ ] **Step 6: Task-1-Sicherungstest auf echte Abgabe umstellen** – in `tests/sicherung.test.mjs` die zwei direkten `insert`-Zeilen aus Task 1 durch die Abgabe über `umfrage_absenden` ersetzen (Code aus Task 1, Step 1, oberer Block). Run: `node --test tests/sicherung.test.mjs` → PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase/schema.sql tests/einzeltage.test.mjs tests/sicherung.test.mjs
git commit -m "Einzeltage: Prüfung beim Absenden (wählbar, volle Wochen, am Stück, Summe)"
```

---

### Task 3: Anzeige-Logik in `docs/logik.js`

**Files:**
- Modify: `docs/logik.js`
- Test: `tests/logik.test.mjs`

**Interfaces:**
- Consumes: Kalender-Einträge `{ kw, montag: 'YYYY-MM-DD', arbeitstage, gesperrt, … }`, `urlaubswochen.freie_tage` (Task 1).
- Produces (alle `export`):
  - `wochenAus(wert) → number[]`, `tageAus(wert) → string[]` (Reihenfolge wie im Wert)
  - `einzeltageAn(regeln) → boolean`
  - `plusTage(iso, n) → iso`, `wochentag(iso) → 1..7` (1 = Mo), `tagKurz(iso) → 'Di 17.08.'`, `tagLang(iso) → 'Di 17.08.2027'`
  - `kwVon(kalender, iso) → number | null`
  - `tageKontext(uw) → { kalender, frei: Set<string>, arbeitstage }`
  - `waehlbareTage(ctx, wochen) → [{ datum, kw }]` (nach Datum)
  - `tagSperrgrund(ctx, tag, wochen, tage, maxAmStueck) → null | { vonKw, bisKw, anfang, ende }`
  - `sperrText(block, maxAmStueck) → string`
  - `tageBereinigen(ctx, wochen, tage, { einzeltage, maxWochen, maxTage, maxAmStueck }) → { tage: string[], grund: null | 'aus' | 'wochen' | 'regel' }`
  - `hinweisEntfernt(grund, maxWochen) → string`
  - `zusammenfassung(kalender, auswahl, maxWochen, urlaubstage, anzahlTage = 0)` (neuer 5. Parameter)
  - `FEHLERTEXTE` um die vier neuen Codes ergänzt.

- [ ] **Step 1: Failing tests** – an `tests/logik.test.mjs` anfügen (Import-Liste oben ergänzen um `wochenAus, tageAus, einzeltageAn, plusTage, wochentag, tagKurz, tagLang, kwVon, tageKontext, waehlbareTage, tagSperrgrund, sperrText, tageBereinigen, hinweisEntfernt`):

```js
// Ausschnitt 2027, Mo–Sa (siehe Plan „Testdaten“).
const MONTAGE = { 29: '2027-07-19', 30: '2027-07-26', 31: '2027-08-02', 32: '2027-08-09', 33: '2027-08-16', 34: '2027-08-23' };
const kal = Object.entries(MONTAGE).map(([kw, montag]) => ({ kw: Number(kw), montag, monat: 8, arbeitstage: 6, gesperrt: false }));
const ctx = (frei = []) => tageKontext({ kalender: kal, arbeitstage_pro_woche: 6,
  freie_tage: frei.map((datum) => ({ datum, name: 'Frei' })) });
const BLOCK = [30, 31, 32];

test('Gemischte Antwort zerlegen', () => {
  assert.deepEqual(wochenAus([30, '2027-08-17', 12]), [30, 12]);
  assert.deepEqual(tageAus([30, '2027-08-17', 12]), ['2027-08-17']);
  assert.deepEqual(wochenAus(undefined), []);
  assert.equal(einzeltageAn({ einzeltage: null }), true);
  assert.equal(einzeltageAn({ pflicht: null }), false);
});

test('Datumshelfer', () => {
  assert.equal(plusTage('2027-07-31', 1), '2027-08-01');
  assert.equal(plusTage('2027-08-01', -1), '2027-07-31');
  assert.equal(wochentag('2027-08-16'), 1);
  assert.equal(wochentag('2027-08-22'), 7);
  assert.equal(tagKurz('2027-08-17'), 'Di 17.08.');
  assert.equal(tagLang('2027-08-17'), 'Di 17.08.2027');
  assert.equal(kwVon(kal, '2027-08-22'), 33);
  assert.equal(kwVon(kal, '2027-09-30'), null);
});

test('Wählbare Tage: Arbeitstage außerhalb gewählter Wochen, ohne freie Tage', () => {
  const t = waehlbareTage(ctx(), BLOCK).map((x) => x.datum);
  assert.equal(t.length, 18);                 // KW 29, 33, 34 je 6
  assert.ok(t.includes('2027-07-24'));        // Samstag ist Arbeitstag
  assert.ok(!t.includes('2027-07-25'));       // Sonntag nicht
  assert.ok(!t.includes('2027-08-02'));       // in gewählter KW 31
  assert.ok(!waehlbareTage(ctx(['2027-08-16']), BLOCK).some((x) => x.datum === '2027-08-16'));
  const gesperrt = tageKontext({ kalender: kal.map((k) => ({ ...k, gesperrt: k.kw === 34 })), arbeitstage_pro_woche: 6 });
  assert.ok(!waehlbareTage(gesperrt, BLOCK).some((x) => x.kw === 34));
});

test('Sperrgrund: Verlängerung eines vollen Blocks', () => {
  const grund = (tag, { frei = [], tage = [], wochen = BLOCK, max = 3 } = {}) =>
    tagSperrgrund(ctx(frei), tag, wochen, tage, max);
  assert.deepEqual(grund('2027-08-16'), { vonKw: 30, bisKw: 32, anfang: '2027-07-26', ende: '2027-08-15' });
  assert.equal(grund('2027-08-17'), null);
  assert.ok(grund('2027-07-24'));                              // Sa vor dem Block
  assert.equal(grund('2027-07-23'), null);                     // Fr: Sa wird gearbeitet
  assert.ok(grund('2027-08-17', { frei: ['2027-08-16'] }));    // Feiertag überbrückt
  assert.ok(grund('2027-08-17', { tage: ['2027-08-16'] }));    // gewählter Tag überbrückt
  assert.equal(grund('2027-08-16', { max: 4 }), null);         // Block unter Höchstlänge
  assert.equal(grund('2027-08-16', { wochen: [31, 32] }), null);
  assert.equal(grund('2027-08-16', { max: Infinity }), null);
  assert.equal(sperrText(grund('2027-08-16'), 3),
    'Nicht wählbar: würde deinen Urlaub KW 30–32 auf mehr als 3 Wochen am Stück verlängern.');
  assert.equal(sperrText({ vonKw: 30, bisKw: 30 }, 1),
    'Nicht wählbar: würde deinen Urlaub KW 30 auf mehr als 1 Woche am Stück verlängern.');
});

test('Tage bereinigen nach Wochenwechsel', () => {
  const g = { einzeltage: true, maxWochen: 3, maxTage: 20, maxAmStueck: 3 };   // 18 + 2 übrig
  const b = (wochen, tage, extra = {}) => tageBereinigen(ctx(), wochen, tage, { ...g, ...extra });
  assert.deepEqual(b(BLOCK, []), { tage: [], grund: null });
  assert.deepEqual(b(BLOCK, ['2027-08-18']), { tage: ['2027-08-18'], grund: null });
  assert.deepEqual(b([30, 31], ['2027-08-18']), { tage: [], grund: 'wochen' });
  assert.deepEqual(b(BLOCK, ['2027-08-18'], { einzeltage: false }), { tage: [], grund: 'aus' });
  // Mo verlängert, Di danach nicht mehr (Mo wird gearbeitet) → nur Mo fällt weg.
  assert.deepEqual(b(BLOCK, ['2027-08-17', '2027-08-16']), { tage: ['2027-08-17'], grund: 'regel' });
  assert.deepEqual(b(BLOCK, ['2027-08-10']), { tage: [], grund: 'regel' });          // in gewählter KW
  assert.deepEqual(b(BLOCK, ['2027-08-18', '2027-08-20'], { maxTage: 19 }), { tage: ['2027-08-18'], grund: 'regel' });
});

test('Hinweise und Zähler mit Tagen', () => {
  assert.equal(hinweisEntfernt('wochen', 6),
    'Deine einzelnen Tage wurden entfernt, weil du nicht mehr alle 6 Wochen gewählt hast.');
  assert.match(hinweisEntfernt('regel', 6), /nicht mehr wählbar/);
  assert.match(hinweisEntfernt('aus', 6), /nicht mehr möglich/);
  assert.equal(zusammenfassung(kalender, new Set([1, 2]), 6, 36, 2).text,
    '2 von 6 Wochen gewählt · 2 einzelne Tage · 13 von 36 Urlaubstagen');
  assert.equal(zusammenfassung(kalender, new Set([1, 2]), 6, 36, 1).text,
    '2 von 6 Wochen gewählt · 1 einzelner Tag · 12 von 36 Urlaubstagen');
  assert.equal(zusammenfassung(kalender, new Set([1, 2]), 6, 36).text, '2 von 6 Wochen gewählt · 11 von 36 Urlaubstagen');
  assert.equal(fehlertext('TAGE_ERST_NACH_WOCHEN'), 'Einzelne Tage gehen erst, wenn du alle Wochen gewählt hast.');
  assert.equal(fehlertext('TAG_ZU_VIELE_AM_STUECK'), 'Ein gewählter Tag macht deinen Urlaub zu lang am Stück.');
  assert.equal(fehlertext('UNGUELTIGER_TAG'), 'Mindestens ein gewählter Tag ist nicht wählbar.');
  assert.equal(fehlertext('DOPPELTER_TAG'), 'Ein Tag wurde doppelt gewählt.');
});
```

- [ ] **Step 2: Laufen lassen – FAIL**

Run: `node --test tests/logik.test.mjs` → FAIL (Exporte fehlen)

- [ ] **Step 3: Implementieren** in `docs/logik.js`.

`FEHLERTEXTE` ergänzen:

```js
  UNGUELTIGER_TAG: 'Mindestens ein gewählter Tag ist nicht wählbar.',
  DOPPELTER_TAG: 'Ein Tag wurde doppelt gewählt.',
  TAGE_ERST_NACH_WOCHEN: 'Einzelne Tage gehen erst, wenn du alle Wochen gewählt hast.',
  TAG_ZU_VIELE_AM_STUECK: 'Ein gewählter Tag macht deinen Urlaub zu lang am Stück.',
```

`zusammenfassung` ersetzen:

```js
// maxWochen / urlaubstage = null: Regel ausgeschaltet, keine Grenze. anzahlTage: einzelne Tage.
export function zusammenfassung(kalender, auswahl, maxWochen, urlaubstage, anzahlTage = 0) {
  const gewaehlt = kalender.filter((k) => auswahl.has(k.kw));
  const anzahl = gewaehlt.length;
  const tage = gewaehlt.reduce((summe, k) => summe + k.arbeitstage, 0) + anzahlTage;
  const mitMax = maxWochen !== null && maxWochen !== undefined;
  const mitTagen = urlaubstage !== null && urlaubstage !== undefined;
  const wochen = mitMax
    ? `${anzahl} von ${maxWochen} Wochen gewählt`
    : `${anzahl} ${anzahl === 1 ? 'Woche' : 'Wochen'} gewählt`;
  const einzeln = anzahlTage > 0 ? ` · ${anzahlTage} ${anzahlTage === 1 ? 'einzelner Tag' : 'einzelne Tage'}` : '';
  const urlaub = mitTagen
    ? `${tage} von ${urlaubstage} Urlaubstagen`
    : `${tage} ${tage === 1 ? 'Urlaubstag' : 'Urlaubstage'}`;
  return {
    anzahl,
    tage,
    limitErreicht: mitMax && anzahl >= maxWochen,
    text: `${wochen}${einzeln} · ${urlaub}`,
  };
}
```

Am Dateiende anfügen:

```js
// ---------------------------------------------------------------- Einzelne Tage
// Antwort der Urlaubswochen-Frage: Zahlen = KWs, Texte "YYYY-MM-DD" = einzelne Tage.
// Fachregel-Duplikat: waehlbareTage und tagSperrgrund spiegeln urlaub.waehlbare_tage und
// urlaub.tag_verlaengert_block in supabase/schema.sql. Änderungen dort nachziehen.

const DATUMSTEXT = /^\d{4}-\d{2}-\d{2}$/;
const WOCHENTAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const MS_TAG = 86400000;

export const wochenAus = (wert) => (Array.isArray(wert) ? wert.filter((x) => typeof x === 'number') : []);
export const tageAus = (wert) => (Array.isArray(wert)
  ? wert.filter((x) => typeof x === 'string' && DATUMSTEXT.test(x)) : []);
// einzeltage hat immer den Wert null – deshalb hasOwnProperty statt Wertprüfung.
export const einzeltageAn = (regeln) => Object.prototype.hasOwnProperty.call(regeln || {}, 'einzeltage');

const zeitVon = (iso) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
export const plusTage = (iso, n) => new Date(zeitVon(iso) + n * MS_TAG).toISOString().slice(0, 10);
export const wochentag = (iso) => ((new Date(zeitVon(iso)).getUTCDay() + 6) % 7) + 1;
export const tagKurz = (iso) => `${WOCHENTAGE[wochentag(iso) - 1]} ${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;
export const tagLang = (iso) => `${tagKurz(iso)}${iso.slice(0, 4)}`;

export function kwVon(kalender, iso) {
  const k = (kalender || []).find((x) => x.montag && x.montag <= iso && iso <= plusTage(x.montag, 6));
  return k ? k.kw : null;
}

export function tageKontext(uw) {
  return {
    kalender: uw?.kalender || [],
    frei: new Set((uw?.freie_tage || []).map((t) => t.datum)),
    arbeitstage: uw?.arbeitstage_pro_woche || 5,
  };
}

export function waehlbareTage(ctx, wochen) {
  const gewaehlt = new Set(wochen);
  const tage = [];
  for (const k of ctx.kalender) {
    if (k.gesperrt || gewaehlt.has(k.kw) || !k.montag) continue;
    for (let i = 0; i < ctx.arbeitstage; i += 1) {
      const datum = plusTage(k.montag, i);
      if (!ctx.frei.has(datum)) tage.push({ datum, kw: k.kw });
    }
  }
  return tage.sort((a, b) => (a.datum < b.datum ? -1 : 1));
}

// Blöcke aufeinanderfolgender gewählter KWs mit mindestens `mindestens` Wochen.
function volleBloecke(ctx, wochen, mindestens) {
  const montag = new Map(ctx.kalender.map((k) => [k.kw, k.montag]));
  const sortiert = [...new Set(wochen)].sort((a, b) => a - b);
  const bloecke = [];
  for (const kw of sortiert) {
    const letzter = bloecke[bloecke.length - 1];
    if (letzter && kw === letzter.bisKw + 1) letzter.bisKw = kw;
    else bloecke.push({ vonKw: kw, bisKw: kw });
  }
  return bloecke
    .filter((b) => b.bisKw - b.vonKw + 1 >= mindestens && montag.get(b.vonKw) && montag.get(b.bisKw))
    .map((b) => ({ ...b, anfang: montag.get(b.vonKw), ende: plusTage(montag.get(b.bisKw), 6) }));
}

export function tagSperrgrund(ctx, tag, wochen, tage, maxAmStueck) {
  if (!Number.isFinite(maxAmStueck)) return null;
  const ueberbrueckt = (d) => wochentag(d) > ctx.arbeitstage || ctx.frei.has(d) || tage.includes(d);
  for (const b of volleBloecke(ctx, wochen, maxAmStueck)) {
    let d;
    if (tag > b.ende) {
      d = plusTage(b.ende, 1);
      while (d < tag && ueberbrueckt(d)) d = plusTage(d, 1);
    } else if (tag < b.anfang) {
      d = plusTage(b.anfang, -1);
      while (d > tag && ueberbrueckt(d)) d = plusTage(d, -1);
    } else continue;
    if (d === tag) return b;
  }
  return null;
}

export function sperrText(block, maxAmStueck) {
  const kws = block.vonKw === block.bisKw ? `KW ${block.vonKw}` : `KW ${block.vonKw}–${block.bisKw}`;
  return `Nicht wählbar: würde deinen Urlaub ${kws} auf mehr als ${maxAmStueck} `
    + `${maxAmStueck === 1 ? 'Woche' : 'Wochen'} am Stück verlängern.`;
}

// Gewählte Tage, die zur Wochenauswahl nicht mehr passen, entfernen.
// grund: null (nichts entfernt), 'aus' (Regel aus), 'wochen' (nicht mehr alle Wochen), 'regel' (einzelne Tage).
export function tageBereinigen(ctx, wochen, tage, { einzeltage, maxWochen, maxTage, maxAmStueck }) {
  if (!tage.length) return { tage: [], grund: null };
  if (!einzeltage) return { tage: [], grund: 'aus' };
  if (wochen.length !== maxWochen) return { tage: [], grund: 'wochen' };
  const erlaubt = new Set(waehlbareTage(ctx, wochen).map((t) => t.datum));
  let rest = [...new Set(tage)].filter((d) => erlaubt.has(d)).sort();
  // Erst die Tage direkt am Block entfernen (ohne Brücke über andere Tage), dann neu prüfen:
  // ein entfernter Tag ist danach ein Arbeitstag und trennt die übrigen vom Block.
  for (;;) {
    const verlaengert = rest.filter((d) => tagSperrgrund(ctx, d, wochen, rest, maxAmStueck));
    if (!verlaengert.length) break;
    const direkt = rest.filter((d) => tagSperrgrund(ctx, d, wochen, [], maxAmStueck));
    rest = rest.filter((d) => !direkt.includes(d));
  }
  const kalenderTage = ctx.kalender.filter((k) => wochen.includes(k.kw)).reduce((s, k) => s + k.arbeitstage, 0);
  while (rest.length && kalenderTage + rest.length > maxTage) rest = rest.slice(0, -1);
  return { tage: rest, grund: rest.length === tage.length ? null : 'regel' };
}

export function hinweisEntfernt(grund, maxWochen) {
  if (grund === 'wochen') {
    return `Deine einzelnen Tage wurden entfernt, weil du nicht mehr alle ${maxWochen} Wochen gewählt hast.`;
  }
  if (grund === 'aus') return 'Einzelne Tage sind in dieser Umfrage nicht mehr möglich und wurden entfernt.';
  if (grund === 'regel') {
    return 'Einzelne Tage wurden entfernt, weil sie nicht mehr wählbar sind (in einer gewählten Woche, '
      + 'zu lang am Stück oder keine Urlaubstage mehr übrig).';
  }
  return '';
}
```

Hinweis zur Schleife: Wenn `verlaengert` nicht leer ist, ist `direkt` nie leer (der blocknächste Tag einer Kette verlängert auch ohne Brücke) – die Schleife endet also.

- [ ] **Step 4: Tests laufen lassen**

Run: `node --test tests/logik.test.mjs` → PASS; `npm test` → grün.

- [ ] **Step 5: Commit**

```bash
git add docs/logik.js tests/logik.test.mjs
git commit -m "Einzeltage: Anzeige-Logik (wählbare Tage, Sperrgrund, Bereinigen, Zähler)"
```

---

### Task 4: Formular der Mitarbeiter-Seite

**Files:**
- Modify: `docs/formular-logik.js` (`antwortSchluessel`, `antwortText`, `WOCHEN_FEHLER`, `wochenHinweis`, `mitarbeiterSicht`)
- Modify: `docs/formular.js` (`urlaubswochen()` ~Z. 171–237, Imports)
- Modify: `docs/app.js` (`entfernteWochen`, `zeigeBestaetigung`)
- Modify: `docs/style.css` (nach `.feiertag` ~Z. 151)
- Test: `tests/formular-logik.test.mjs`

**Interfaces:**
- Consumes (Task 3): `wochenAus`, `tageAus`, `einzeltageAn`, `tagKurz`, `tagLang`, `tageKontext`, `waehlbareTage`, `tagSperrgrund`, `sperrText`, `tageBereinigen`, `hinweisEntfernt`, `zusammenfassung(…, anzahlTage)`, `MONATE`.
- Produces: keine neuen Exporte.

- [ ] **Step 1: Failing tests** – an `tests/formular-logik.test.mjs` anfügen (`antwortSchluessel`, `mitarbeiterSicht` ggf. importieren):

```js
test('Urlaubswochen mit einzelnen Tagen: Text, Schlüssel, Hinweis, Vorschau', () => {
  const uw = { id: 9, typ: 'urlaubswochen', bedingungen: [], verknuepfung: 'und', optionen: [],
    regeln: { max_wochen: 6, max_urlaubstage: 36, einzeltage: null } };
  assert.equal(antwortText(uw, [12, 30, '2027-08-17', '2027-08-18']), 'KW 12, KW 30 · Di 17.08., Mi 18.08.');
  assert.equal(antwortText(uw, [12]), 'KW 12');
  // Gleiche Auswahl in anderer Reihenfolge = gleicher Schlüssel (Absenden-Knopf bleibt aus).
  assert.equal(antwortSchluessel([uw], { 9: ['2027-08-18', 30, '2027-08-17', 12] }),
    antwortSchluessel([uw], { 9: [12, 30, '2027-08-17', '2027-08-18'] }));
  assert.equal(antwortSchluessel([uw], { 9: [30, 12, '2027-08-17'] }), JSON.stringify([['9', [12, 30, '2027-08-17']]]));
  assert.match(regelHinweis(uw), /Übrige Urlaubstage danach als einzelne Tage\.$/);
  assert.doesNotMatch(regelHinweis({ ...uw, regeln: { max_wochen: 6 } }), /einzelne Tage/);
  for (const code of ['UNGUELTIGER_TAG', 'DOPPELTER_TAG', 'TAGE_ERST_NACH_WOCHEN', 'TAG_ZU_VIELE_AM_STUECK']) {
    assert.notEqual(fehlerText(code, uw), 'Bitte prüfe diese Antwort.', code);
  }
  const sicht = mitarbeiterSicht([{ ...uw, aktiv: true, regeln: { einzeltage: { wert: null, aktiv: true } },
    urlaubswochen: { jahr: 2027, kalender: [], freie_tage: [{ datum: '2027-05-17', name: 'Pfingstmontag' }] } }]);
  assert.deepEqual(sicht[0].regeln, { einzeltage: null });
  assert.deepEqual(sicht[0].urlaubswochen.freie_tage, [{ datum: '2027-05-17', name: 'Pfingstmontag' }]);
});
```

- [ ] **Step 2: Laufen lassen – FAIL**

Run: `node --test tests/formular-logik.test.mjs` → FAIL

- [ ] **Step 3: `docs/formular-logik.js` anpassen.**

Import: `import { fehlertext, wochenAus, tageAus, tagKurz, einzeltageAn } from './logik.js';`

`antwortSchluessel` – Sortierung für gemischte Listen (Zahlen vor Texten):

```js
const vergleiche = (x, y) => {
  if (typeof x !== typeof y) return typeof x === 'number' ? -1 : 1;
  if (typeof x === 'number') return x - y;
  return x < y ? -1 : x > y ? 1 : 0;
};
```

und in `antwortSchluessel`: `if (Array.isArray(w)) w = [...w].sort(vergleiche);`
(Achtung: Bisher `Number(x) - Number(y)` – für `mehrfach` liefern beide dasselbe, weil dort nur Zahlen stehen.)

`antwortText`, Fall `urlaubswochen`:

```js
    case 'urlaubswochen': {
      const liste = Array.isArray(wert) ? wert : [wert];
      const kws = wochenAus(liste).map((kw) => `KW ${kw}`).join(', ');
      const tage = tageAus(liste).map(tagKurz).join(', ');
      return kws && tage ? `${kws} · ${tage}` : kws || tage;
    }
```

`WOCHEN_FEHLER` um `'UNGUELTIGER_TAG', 'DOPPELTER_TAG', 'TAGE_ERST_NACH_WOCHEN', 'TAG_ZU_VIELE_AM_STUECK'` ergänzen.

`wochenHinweis` – vor `return`:

```js
  const satz = teile.length ? `${teile.join(', ')}.` : '';
  if (einzeltageAn(r) && hat(r, 'max_wochen') && hat(r, 'max_urlaubstage')) {
    return `${satz} Übrige Urlaubstage danach als einzelne Tage.`.trim();
  }
  return satz;
```

(die bisherige `return`-Zeile entfällt).

`mitarbeiterSicht`, im `urlaubswochen`-Objekt ergänzen: `freie_tage: uw.freie_tage || [],`

- [ ] **Step 4: Tests laufen lassen** – `node --test tests/formular-logik.test.mjs` → PASS.

- [ ] **Step 5: `docs/formular.js` – Wochen und Tage.**

Import aus `./logik.js` erweitern:

```js
import {
  zusammenfassung, istGesperrt, nachMonat, gesperrteZeitraeume, gesperrteGewaehlte, MONATE,
  wochenAus, tageAus, einzeltageAn, tagKurz, tageKontext, waehlbareTage, tagSperrgrund, sperrText,
  tageBereinigen, hinweisEntfernt,
} from './logik.js';
```

Die Funktion `urlaubswochen(f)` komplett ersetzen:

```js
  // Wochenauswahl: Monatsgruppen, Feiertage, gesperrte Bereiche, Zähler; danach einzelne Tage.
  function urlaubswochen(f) {
    const uw = f.urlaubswochen || {};
    const kalender = uw.kalender || [];
    const ctx = tageKontext(uw);
    const r = f.regeln || {};
    const maxWochen = zahlRegel(r, 'max_wochen');
    const maxTage = zahlRegel(r, 'max_urlaubstage');
    const maxAmStueck = zahlRegel(r, 'max_am_stueck') ?? Infinity;
    const grenzen = { einzeltage: einzeltageAn(r) && maxWochen !== null && maxTage !== null, maxWochen, maxTage, maxAmStueck };
    const wochenVon = () => wochenAus(werte[f.id]);
    const tageVon = () => tageAus(werte[f.id]);
    const hinweis = el('p', 'klein tage-hinweis');
    hinweis.setAttribute('aria-live', 'polite');

    // Gespeicherte Wochen, die inzwischen gesperrt sind, und unpassende Tage fallen aus der Auswahl.
    // (Hier direkt in werte, nicht über geaendert(): der Block ist noch nicht registriert.)
    const entfernt = gesperrteGewaehlte(kalender, wochenVon());
    const wochenStart = wochenVon().filter((kw) => !entfernt.includes(kw));
    const start = tageBereinigen(ctx, wochenStart, tageVon(), grenzen);
    const anfang = [...wochenStart, ...start.tage];
    if (anfang.length) werte[f.id] = anfang; else delete werte[f.id];
    hinweis.textContent = hinweisEntfernt(start.grund, maxWochen);

    const erklaerung = el('p', 'erklaerung',
      'Die Wochen müssen nicht zusammenhängen. Es sind Wünsche, keine Genehmigungen.');
    const zaehler = el('p', 'zaehler');
    zaehler.setAttribute('aria-live', 'polite');
    const monate = el('div', 'monate');
    for (const gruppe of nachMonat(kalender)) {
      const block = el('fieldset', 'monat');
      block.append(el('legend', null, gruppe.name));
      for (const k of gruppe.wochen) {
        const zeile = el('label', 'woche');
        const kaestchen = document.createElement('input');
        kaestchen.type = 'checkbox';
        kaestchen.value = String(k.kw);
        kaestchen.addEventListener('change', () => {
          const auswahl = new Set(wochenVon());
          if (kaestchen.checked) auswahl.add(k.kw); else auswahl.delete(k.kw);
          const wochen = [...auswahl].sort((a, b) => a - b);
          const b = tageBereinigen(ctx, wochen, tageVon(), grenzen);
          hinweis.textContent = hinweisEntfernt(b.grund, maxWochen);
          geaendert(f, [...wochen, ...b.tage]);
          aktualisiere();
        });
        zeile.append(kaestchen, el('span', 'kw', `KW ${k.kw}`), el('span', 'datum', `${k.von}–${k.bis}`));
        if (k.arbeitstage !== uw.arbeitstage_pro_woche) {
          zeile.append(el('span', 'feiertag', `nur ${k.arbeitstage} Urlaubstage · ${k.feiertag}`));
        }
        block.append(zeile);
      }
      monate.append(block);
    }

    const tageBox = el('section', 'box einzeltage');
    const tageText = el('p', null);
    const tageMonate = el('div', 'monate');
    tageBox.append(el('h3', null, 'Einzelne Tage'), tageText, tageMonate);
    tageBox.hidden = true;

    const teile = [erklaerung, zaehler, hinweis, monate, tageBox];
    const bereiche = gesperrteZeitraeume(kalender);
    if (bereiche.length) {
      const box = el('section', 'box box-gesperrt');
      const liste = el('ul', 'liste');
      liste.append(...bereiche.map((b) => el('li', null,
        b.vonKw === b.bisKw ? `KW ${b.vonKw} (${b.von}–${b.bis})` : `KW ${b.vonKw}–${b.bisKw} (${b.von}–${b.bis})`)));
      box.append(el('h3', null, 'Nicht wählbar'), liste);
      if (uw.sperr_hinweis) box.append(el('p', null, uw.sperr_hinweis));
      teile.push(box);
    }

    // Tage je Monat, eingeklappt; offen, wenn darin ein Tag gewählt ist.
    function zeichneTage(wochen, tage, rest) {
      const gruppen = new Map();
      for (const t of waehlbareTage(ctx, wochen)) {
        const monat = Number(t.datum.slice(5, 7));
        if (!gruppen.has(monat)) gruppen.set(monat, []);
        gruppen.get(monat).push(t);
      }
      tageMonate.replaceChildren(...[...gruppen].map(([monat, liste]) => {
        const auf = document.createElement('details');
        auf.className = 'monat';
        auf.open = liste.some((t) => tage.includes(t.datum));
        auf.append(el('summary', null, MONATE[monat - 1]));
        for (const t of liste) {
          const zeile = el('label', 'woche');
          const kaestchen = document.createElement('input');
          kaestchen.type = 'checkbox';
          kaestchen.value = t.datum;
          kaestchen.checked = tage.includes(t.datum);
          const block = kaestchen.checked ? null : tagSperrgrund(ctx, t.datum, wochen, tage, maxAmStueck);
          kaestchen.disabled = nurLesen || (!kaestchen.checked && (rest <= 0 || Boolean(block)));
          kaestchen.addEventListener('change', () => {
            const neu = kaestchen.checked ? [...tageVon(), t.datum] : tageVon().filter((d) => d !== t.datum);
            hinweis.textContent = '';
            geaendert(f, [...wochenVon(), ...neu.sort()]);
            aktualisiere();
          });
          zeile.append(kaestchen, el('span', 'kw', tagKurz(t.datum)), el('span', 'datum', `KW ${t.kw}`));
          if (block) zeile.append(el('span', 'sperrgrund', sperrText(block, maxAmStueck)));
          zeile.classList.toggle('gewaehlt', kaestchen.checked);
          auf.append(zeile);
        }
        return auf;
      }));
    }

    function aktualisiere() {
      const wochen = wochenVon();
      const tage = tageVon();
      const auswahl = new Set(wochen);
      const z = zusammenfassung(kalender, auswahl, maxWochen, maxTage, tage.length);
      zaehler.textContent = z.text;
      for (const kaestchen of monate.querySelectorAll('input')) {
        const kw = Number(kaestchen.value);
        kaestchen.checked = auswahl.has(kw);
        kaestchen.disabled = istGesperrt(kw, auswahl, z.limitErreicht, !nurLesen, maxAmStueck);
        const zeile = kaestchen.closest('label');
        zeile.title = kaestchen.disabled && !nurLesen && !z.limitErreicht
          ? `Höchstens ${maxAmStueck} ${maxAmStueck === 1 ? 'Woche' : 'Wochen'} am Stück` : '';
        zeile.classList.toggle('gewaehlt', kaestchen.checked);
      }
      const rest = grenzen.einzeltage ? maxTage - z.tage : 0;
      tageBox.hidden = !grenzen.einzeltage || wochen.length !== maxWochen || (rest <= 0 && !tage.length);
      if (!tageBox.hidden) {
        tageText.textContent = rest > 0
          ? `Du hast noch ${rest} ${rest === 1 ? 'Urlaubstag' : 'Urlaubstage'} übrig. Du kannst sie als einzelne Tage wählen.`
          : 'Alle Urlaubstage sind verplant.';
        zeichneTage(wochen, tage, rest);
      }
    }
    aktualisiere();
    return { teile, aktualisiere };
  }
```

- [ ] **Step 6: `docs/app.js` anpassen.**

Import aus `./logik.js` um `wochenAus, tageAus, tagLang` ergänzen (bestehende Importzeile erweitern).

`entfernteWochen`:

```js
  return Array.isArray(gewaehlt) ? gesperrteGewaehlte(f.urlaubswochen?.kalender || [], wochenAus(gewaehlt)) : [];
```

In `zeigeBestaetigung` die Wochenliste:

```js
      wochen.append(
        ...wochenAus(wert).map((kw) => {
          const w = document.createElement('li');
          w.textContent = wochenText(f, kw);
          return w;
        }),
        ...tageAus(wert).map((d) => {
          const w = document.createElement('li');
          w.textContent = `Einzelner Tag: ${tagLang(d)}`;
          return w;
        }),
      );
```

und den Zähler:

```js
    const wert = daten.antworten[uf.id];
    stand.push(zusammenfassung(uf.urlaubswochen?.kalender || [], new Set(wochenAus(wert)),
      uf.regeln?.max_wochen ?? null, uf.regeln?.max_urlaubstage ?? null, tageAus(wert).length).text);
```

- [ ] **Step 7: `docs/style.css`** – nach dem `.feiertag`-Block:

```css
.sperrgrund {
  grid-column: 2 / -1;
  font-size: 0.85rem;
  color: var(--feiertag);
}
.einzeltage summary { font-weight: 600; color: var(--monat); padding: 6px 0; cursor: pointer; }
.tage-hinweis:empty { display: none; }
```

**Achtung:** `.woche:has(input:disabled) { opacity: 0.5 }` macht auch den Sperrgrund blass – gewollt (Tag ist gesperrt), der Text bleibt lesbar. Nicht ändern.

- [ ] **Step 8: Tests und Sichtprüfung**

Run: `npm test` → alle grün.
Sichtprüfung im Browser (Skill `run` oder lokal `npx serve docs`): `docs/index.html` braucht die Supabase-Verbindung. Ist keine lokale Instanz verfügbar, Sichtprüfung **auslassen und im Abschlussbericht ausdrücklich als „nicht im Browser geprüft“ melden**.

- [ ] **Step 9: Commit**

```bash
git add docs/formular-logik.js docs/formular.js docs/app.js docs/style.css tests/formular-logik.test.mjs
git commit -m "Einzeltage: Auswahl im Formular mit Sperrgrund, Bestätigung und Zähler"
```

---

### Task 5: Verwaltung, Auswertung, Excel und Doku

**Files:**
- Modify: `docs/admin-fragen-regeln.js` (`REGELN`, `REGEL_TEXT`, `regelZeile`)
- Modify: `docs/admin-hilfe.js` (Fehlertexte)
- Modify: `docs/auswertung.js` (`wochenZeilen`, neue `tageZeilen`, `zusammenfassung`, `excelBlaetter`)
- Modify: `docs/admin-umfrage.js` (`wochenInhalt`)
- Modify: `ANLEITUNG.md`, `README.md`, `spezifikation/2026-10-09-einzelne-tage-design.md`
- Test: `tests/auswertung.test.mjs`, `tests/excel.test.mjs`

**Interfaces:**
- Consumes (Task 3): `wochenAus`, `tageAus`, `tagLang`, `kwVon`.
- Produces: `zusammenfassung(urlaubsfrage).tage: [{ datum, text, kw, anzahl, namen }]`; Excel-Blatt „Einzelne Tage“.

- [ ] **Step 1: Failing tests.**

`tests/auswertung.test.mjs` – in `daten.kalender` reicht es, für den Test KW 33 mit Montag zu versehen; im Test „Zahl, Liste, Wochen, Hinweis“ nach dem Wochenteil ergänzen und Annas Antwort auf Frage 1 auf `[1, 30, '2027-08-17']` ändern:

```js
  // Tage stören die Wochen nicht und erscheinen in einer eigenen Liste.
  assert.deepEqual([w.wochen[29].kw, w.wochen[29].anzahl], [30, 2]);
  assert.deepEqual(w.tage, [{ datum: '2027-08-17', text: 'Di 17.08.2027', kw: null, anzahl: 1, namen: 'Anna' }]);
```

(`kw: null`, weil der Testkalender keine `montag`-Felder hat; ein zweiter Fall mit `montag`:)

```js
test('Einzelne Tage: KW aus dem Kalender', () => {
  const mitMontag = { ...daten, kalender: [{ kw: 33, montag: '2027-08-16', von: '16.08.', bis: '22.08.', monat: 8,
    arbeitstage: 6, feiertag: null, gesperrt: false }] };
  assert.equal(zusammenfassung(daten.fragen[0], mitMontag).tage[0].kw, 33);
  assert.equal(zusammenfassung(daten.fragen[0], { ...daten, mitarbeiter: [] }).tage.length, 0);
});
```

`tests/excel.test.mjs` – im ersten Test Annas Antwort auf `[1, 30, '2027-08-17']` ändern und in der Python-Prüfung die Blattnamen um `'Einzelne Tage'` erweitern; Zeile 2 des Blatts: `['Di 17.08.2027', None, 1, 'Anna Ä. <&>']`. Die Matrix darf keine Spalte/kein „x“ für den Tag haben (bestehende Matrix-Erwartungen bleiben gleich). Im Test „ohne Urlaubswochen“ bleibt es bei einem Blatt; zusätzlich prüfen: ohne gewählte Tage gibt es **kein** Blatt „Einzelne Tage“ (`excelBlaetter` mit Antworten nur aus Wochen → Blattnamen `['Antworten', 'Wochen', 'Matrix']`, ohne Python prüfbar):

```js
test('Ohne einzelne Tage kein Blatt „Einzelne Tage“', () => {
  const ohneTage = { ...daten, mitarbeiter: daten.mitarbeiter.map((m) => ({ ...m, antworten: { ...m.antworten, 1: [1, 30] } })) };
  assert.deepEqual(excelBlaetter(ohneTage).map((b) => b.name), ['Antworten', 'Wochen', 'Matrix']);
});
```

- [ ] **Step 2: Laufen lassen – FAIL**

Run: `node --test tests/auswertung.test.mjs tests/excel.test.mjs`

- [ ] **Step 3: `docs/auswertung.js`.**

Import: `import { zeitpunkt, wochenAus, tageAus, tagLang, kwVon } from './logik.js';`

`wochenZeilen`: `alsListe(x.wert).some((kw) => gleicheId(kw, k.kw))` → `wochenAus(alsListe(x.wert)).some((kw) => gleicheId(kw, k.kw))`

Neu nach `wochenZeilen`:

```js
// Einzelne Tage (Urlaubswochen-Antwort mit Datumstexten), nach Datum.
function tageZeilen(frage, daten) {
  const antworten = beantwortet(frage, daten);
  const alle = [...new Set(antworten.flatMap((x) => tageAus(alsListe(x.wert))))].sort();
  return alle.map((datum) => {
    const namen = antworten.filter((x) => tageAus(alsListe(x.wert)).includes(datum)).map((x) => x.name);
    return { datum, text: tagLang(datum), kw: kwVon(daten.kalender, datum), anzahl: namen.length, namen: namen.join(', ') };
  });
}
```

`zusammenfassung`, Fall `urlaubswochen`:

```js
      return { art: 'wochen', beantwortet: antworten.length, wochen: wochenZeilen(frage, daten), tage: tageZeilen(frage, daten) };
```

`excelBlaetter`: Matrix-Zeile `alsListe(antwortVon(m, urlaub)).map(Number)` → `wochenAus(alsListe(antwortVon(m, urlaub)))`. Nach `blaetter.push(…Wochen…, …Matrix…)` vor `return`:

```js
  const tage = tageZeilen(urlaub, daten);
  if (tage.length) {
    blaetter.push({
      name: 'Einzelne Tage',
      spalten: [{ titel: 'Datum', breite: 16 }, { titel: 'KW', breite: 6 }, { titel: 'Anzahl', breite: 9 },
        { titel: 'Namen', breite: 60 }],
      zeilen: tage.map((t) => [t.text, t.kw, t.anzahl, t.namen]),
    });
  }
```

- [ ] **Step 4: `docs/admin-umfrage.js` – `wochenInhalt`** gibt künftig ein Array zurück:

```js
function wochenInhalt(z) {
  const max = Math.max(1, ...z.wochen.map((w) => w.anzahl));
  const teile = [tabelle(['KW', 'Zeitraum', 'Anzahl', 'Namen'], z.wochen.map((w) => zeile(
    [`KW ${w.kw}`, w.zeitraum + (w.feiertag ? ` (${w.feiertag})` : ''), w.anzahl, w.namen],
    w.anzahl > 0 && w.anzahl >= Math.max(2, max * 0.75) ? 'viel' : null,
  )))];
  if (z.tage?.length) {
    teile.push(element('h4', null, 'Einzelne Tage'),
      tabelle(['Datum', 'KW', 'Anzahl', 'Namen'], z.tage.map((t) => zeile([t.text, t.kw ? `KW ${t.kw}` : '', t.anzahl, t.namen]))));
  }
  return teile;
}
```

und beim Aufruf `box.append(wochenInhalt(z));` → `box.append(...wochenInhalt(z));`
(Signatur von `zeile`/`tabelle` vorher in `admin-umfrage.js` nachsehen: `zeile(zellen, klasse?)`, `tabelle(kopf, zeilen, klasse?)`.)

- [ ] **Step 5: Verwaltung – Regel-Schalter.**

`docs/admin-fragen-regeln.js` – Kopfkommentar sagt: `REGELN` spiegelt `urlaub.erlaubte_regeln` (Task 1); gleiche Reihenfolge:

```js
  urlaubswochen: ['pflicht', 'min_wochen', 'max_wochen', 'max_am_stueck', 'max_urlaubstage', 'einzeltage',
    'gesperrte_monate', 'gesperrte_wochen'],
```

`REGEL_TEXT`: `einzeltage: 'Einzelne Tage nach den Wochen erlauben',`

`regelZeile`: `if (art === 'pflicht') {` → `if (art === 'pflicht' || art === 'einzeltage') {`

`docs/admin-hilfe.js`, im Fehlertext-Objekt nach `UNGUELTIGE_EINSTELLUNG`:

```js
  EINZELTAGE_OHNE_GRENZEN: 'Einzelne Tage gehen nur, wenn „Höchstens Wochen“ und „Höchstens Urlaubstage“ eingeschaltet sind. Schalte zuerst die einzelnen Tage aus.',
```

- [ ] **Step 6: Doku.**
  - `ANLEITUNG.md`: Im Abschnitt zu den Prüfregeln der Urlaubswochen (Stelle mit „Höchstens Urlaubstage“ suchen) einen Absatz ergänzen: „**Einzelne Tage nach den Wochen erlauben:** Hat jemand alle erlaubten Wochen gewählt und wegen Feiertagen noch Urlaubstage übrig, kann er den Rest als einzelne Tage wählen. Ein Tag, der einen Urlaub mit der Höchstzahl Wochen am Stück direkt verlängern würde, ist gesperrt – der Grund steht am Tag. Geht nur, wenn „Höchstens Wochen“ und „Höchstens Urlaubstage“ eingeschaltet sind. Die Auswertung zeigt die Tage in einer eigenen Tabelle, die Excel-Datei in einem eigenen Blatt.“
  - `README.md`: Im Einleitungsabsatz nach „gesperrten Monate/Wochen mit.“ ergänzen: „Optional dürfen nach vollen Wochen übrige Urlaubstage als einzelne Tage gewählt werden.“
  - Spezifikation: Unter „Schalter“ `UNGUELTIGE_EINSTELLUNG` durch `EINZELTAGE_OHNE_GRENZEN` ersetzen; unter „Daten für das Formular“ ergänzen: „Jeder Kalendereintrag bekommt zusätzlich `montag` (`YYYY-MM-DD`).“; unter „Prüfung“ ergänzen: „Texte, die nicht dem Format `YYYY-MM-DD` entsprechen, bleiben `UNGUELTIGE_WOCHE`.“

- [ ] **Step 7: Tests**

Run: `npm test` → alle grün.

- [ ] **Step 8: Commit**

```bash
git add docs/admin-fragen-regeln.js docs/admin-hilfe.js docs/auswertung.js docs/admin-umfrage.js tests/auswertung.test.mjs tests/excel.test.mjs ANLEITUNG.md README.md spezifikation/2026-10-09-einzelne-tage-design.md
git commit -m "Einzeltage: Schalter in der Verwaltung, Auswertung und Excel-Blatt, Anleitung"
```

---

## Nach dem letzten Task

- `git fetch origin` und prüfen, ob `origin/main` inzwischen `supabase/schema.sql` oder `docs/` geändert hat (`git log --oneline HEAD..origin/main`); falls ja, rebasen und `npm test` erneut.
- **Ausrollen:** `supabase/schema.sql` einmal im Supabase-SQL-Editor ausführen (erneutes Ausführen ist unschädlich), danach GitHub Pages aktualisieren. Reihenfolge: **erst Datenbank, dann Seite** – die neue Seite braucht `montag`/`freie_tage`, die alte Seite läuft mit der neuen Datenbank weiter (zusätzliche Felder werden ignoriert, Tage gibt es erst nach dem Einschalten).
