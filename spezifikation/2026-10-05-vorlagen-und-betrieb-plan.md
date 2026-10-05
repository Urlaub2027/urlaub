# Vorlagen, Sicherung, Mitarbeiter-Liste, Erinnern, Wach-Automatik – Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fünf Verbesserungen laut Entwurf: Wach-Automatik gegen die Supabase-Pause, Sicherung
herunterladen/einspielen, viele Mitarbeiter auf einmal, Erinnern per WhatsApp, Vorlagen beim Anlegen.

**Architecture:** Alle Regeln in der Datenbank (`supabase/schema.sql`, Schema `urlaub`, nur
`SECURITY DEFINER`-Funktionen in `public`). Die Seite (`docs/`) ruft nur diese Funktionen auf.
Reine Hilfslogik der Verwaltung kommt in ein neues DOM-freies Modul `docs/verwaltung-logik.js`.
Ein GitHub-Zeitplan (`.github/workflows/wachhalten.yml`) ruft täglich `public.lebenszeichen()`.

**Tech Stack:** PostgreSQL/plpgsql (Supabase), Vanilla-JS-Module, Tests mit `node --test` und PGlite.

**Spec:** `spezifikation/2026-10-05-vorlagen-und-betrieb-design.md`

## Global Constraints

- Jede neue Funktion in `public`: `security definer`, `set search_path = ''`, danach
  `revoke all … from public, anon, authenticated;` und `grant execute … to <rolle>`.
  `anon` darf nur `urlaub_laden`, `umfrage_absenden`, `einladung_pruefen`, `lebenszeichen`.
- Interne Funktionen im Schema `urlaub`, ebenfalls `set search_path = ''`.
- `schema.sql` bleibt in `begin; … commit;` und mehrfach ausführbar (die Tests führen es zweimal aus).
- SQL-Funktionen (`language sql`) werden beim Anlegen geprüft: alles, was sie aufrufen, muss
  in der Datei **davor** stehen. plpgsql-Funktionen lösen Namen erst beim Aufruf auf.
- Fehler als Codes in GROSSBUCHSTABEN (`raise exception 'CODE'`); die Seite übersetzt sie in `docs/admin-hilfe.js`.
- Oberfläche: nur `textContent`/`createElement`, kein `innerHTML`; keine fremden Ressourcen;
  CSP unverändert; deutsche Texte in Du-Form; keine Lookbehind-Regex (Safari < 16.4).
- Kommentardichte und Benennung wie im umgebenden Code (deutsch).
- Tests: `npm test` (= `node --test tests/*.test.mjs`) muss vollständig grün sein.
- Commit-Trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

## Review Focus

1. **Veränderte oder kaputte Sicherungsdatei** → `SICHERUNG_UNGUELTIG`, es entsteht nichts (Task 4, Test „Veränderte oder kaputte Dateien“).
2. **Einspielen, während das Original noch existiert** → neue Codes, alte Links zeigen weiter aufs Original (Task 4).
3. **Aus Excel eingefügte Namen** mit `\r\n`, Tabs, Leerzeilen, Dubletten in anderer Schreibweise (Task 3 + Task 5).
4. **Umfrage ohne Urlaubsfrage** (Leer/Schicht/Feier) auf der Mitarbeiter-Seite und in der Auswertung (Task 2 Test „feier“ mit Abgabe; Controller-E2E).
5. **Alte Seite gegen neues SQL** (3-Parameter-`org_umfrage_anlegen` bleibt) und Rechte aller Funktionen (Task 1 Rechte-Test, Task 2).

---

### Task 1: Lebenszeichen, Rechte-Test, GitHub-Zeitplan

**Files:**
- Modify: `supabase/schema.sql`
- Create: `tests/betrieb.test.mjs`
- Create: `.github/workflows/wachhalten.yml`

**Interfaces:**
- Produces: `public.lebenszeichen() returns void` (anon), `public.org_lebenszeichen() returns timestamptz` (authenticated; `null`, wenn noch nie).

- [ ] **Step 1: Test schreiben** – `tests/betrieb.test.mjs`:

```js
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { neueDatenbank, als, browser, organisator } from './helfer.mjs';

let db;
let chef;

before(async () => {
  db = await neueDatenbank();
  chef = await organisator(db, 'chef');
});

const lebenszeichen = async () => (await als(db, 'authenticated', chef, 'select public.org_lebenszeichen() as z'))[0].z;

test('Lebenszeichen: anon schreibt, Verwaltung liest, Tabelle bleibt verborgen', async () => {
  assert.equal(await lebenszeichen(), null);
  await browser(db, 'select public.lebenszeichen()');
  await browser(db, 'select public.lebenszeichen()'); // zweimal kurz hintereinander: kein Fehler
  const z1 = new Date(await lebenszeichen());
  assert.ok(Math.abs(Date.now() - z1.getTime()) < 60_000);
  await db.query("update urlaub.lebenszeichen set zeit = now() - interval '2 days'");
  await browser(db, 'select public.lebenszeichen()');
  assert.ok(Math.abs(Date.now() - new Date(await lebenszeichen()).getTime()) < 60_000);
  await assert.rejects(browser(db, 'select * from urlaub.lebenszeichen'), /permission denied/);
  await assert.rejects(browser(db, 'select public.org_lebenszeichen()'), /permission denied/);
});

test('Rechte: anon nur für die öffentlichen Funktionen, Angemeldete nur für org_/haupt_', async () => {
  const { rows } = await db.query(`
    select n.nspname, p.proname,
           has_function_privilege('anon', p.oid, 'execute') as anon,
           has_function_privilege('authenticated', p.oid, 'execute') as angemeldet
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'urlaub')`);
  const OEFFENTLICH = ['urlaub_laden', 'umfrage_absenden', 'einladung_pruefen', 'lebenszeichen'];
  assert.ok(rows.some((f) => f.proname === 'lebenszeichen'));
  for (const f of rows) {
    if (f.nspname === 'urlaub') {
      assert.deepEqual([f.anon, f.angemeldet], [false, false], `urlaub.${f.proname}`);
    } else {
      assert.equal(f.anon, OEFFENTLICH.includes(f.proname), `anon: ${f.proname}`);
      if (!OEFFENTLICH.includes(f.proname)) {
        assert.equal(f.angemeldet, /^(org|haupt)_/.test(f.proname), `angemeldet: ${f.proname}`);
      }
    }
  }
});
```

Falls PGlite eigene Funktionen im Schema `public` mitbringt, die der Test fälschlich meldet:
nicht den Test aufweichen, sondern im Report nennen (Controller entscheidet).

- [ ] **Step 2: Test laufen lassen** – `node --test tests/betrieb.test.mjs` → FAIL (`function public.org_lebenszeichen() does not exist`).

- [ ] **Step 3: Tabelle** – in `supabase/schema.sql` direkt nach der Tabelle `urlaub.antwort_optionen`
  (vor `insert into urlaub.app …`) einfügen:

```sql
-- Eine Zeile: Zeitpunkt des letzten Lebenszeichens der Wach-Automatik (siehe public.lebenszeichen).
create table if not exists urlaub.lebenszeichen (
  id   boolean primary key default true check (id),
  zeit timestamptz not null default now()
);
```

  und in der Liste „Nacharbeiten an Tabellen“ nach `alter table urlaub.antwort_optionen enable row level security;`:

```sql
alter table urlaub.lebenszeichen    enable row level security;
```

- [ ] **Step 4: Funktionen** – neuer Abschnitt direkt vor `-- Rechte zum Schluss` (also nach den
  `grant`-Zeilen des Hauptadmin-Abschnitts):

```sql
-- ---------------------------------------------------------------------------
-- Betrieb: Lebenszeichen
-- ---------------------------------------------------------------------------
-- Supabase pausiert kostenlose Projekte nach etwa 7 Tagen ohne Datenbank-Aktivität
-- (reine Lesezugriffe zählen laut Berichten nicht). Der GitHub-Zeitplan
-- .github/workflows/wachhalten.yml ruft deshalb täglich lebenszeichen() auf. Es schreibt
-- nur diesen Zeitstempel, höchstens einmal pro Minute.

create or replace function public.lebenszeichen()
returns void
language sql volatile
security definer
set search_path = ''
as $$
  insert into urlaub.lebenszeichen (id, zeit) values (true, now())
  on conflict (id) do update set zeit = excluded.zeit
  where urlaub.lebenszeichen.zeit < now() - interval '1 minute'
$$;

create or replace function public.org_lebenszeichen()
returns timestamptz
language plpgsql stable
security definer
set search_path = ''
as $$
begin
  perform urlaub.ich();
  return (select zeit from urlaub.lebenszeichen);
end;
$$;

revoke all on function public.lebenszeichen()     from public, anon, authenticated;
revoke all on function public.org_lebenszeichen() from public, anon, authenticated;
grant execute on function public.lebenszeichen()     to anon;
grant execute on function public.org_lebenszeichen() to authenticated;
```

- [ ] **Step 5: GitHub-Zeitplan** – `.github/workflows/wachhalten.yml`:

```yaml
# Hält die kostenlose Supabase-Datenbank wach: Supabase pausiert Projekte nach etwa
# 7 Tagen ohne Datenbank-Aktivität. Täglich ein Lebenszeichen (schreibt nur einen
# Zeitstempel, siehe public.lebenszeichen in supabase/schema.sql). Schlägt der Aufruf
# fehl, meldet GitHub das per E-Mail. URL und öffentlicher Schlüssel kommen aus docs/config.js.
name: Datenbank wachhalten

on:
  schedule:
    - cron: '17 3 * * *'
  workflow_dispatch:

permissions:
  contents: read
  actions: write

jobs:
  lebenszeichen:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v4
      - name: Lebenszeichen an Supabase senden
        run: |
          URL=$(grep -oP "SUPABASE_URL = '\K[^']+" docs/config.js)
          KEY=$(grep -oP "SUPABASE_KEY = '\K[^']+" docs/config.js)
          # Alte "anon"-Schlüssel (JWT) zusätzlich als Bearer, wie docs/api.js
          AUTH=()
          case "$KEY" in eyJ*) AUTH=(-H "Authorization: Bearer $KEY") ;; esac
          curl --fail-with-body --silent --show-error --max-time 30 \
            -X POST "$URL/rest/v1/rpc/lebenszeichen" \
            -H "apikey: $KEY" -H "Content-Type: application/json" "${AUTH[@]}" -d '{}'
      # GitHub schaltet Zeitpläne öffentlicher Repos nach 60 Tagen ohne Repo-Aktivität ab.
      # Ob dieser Aufruf das verhindert, ist nicht belegt; die Verwaltung warnt zusätzlich.
      - name: Zeitplan aktiv halten
        continue-on-error: true
        env:
          GH_TOKEN: ${{ github.token }}
        run: gh api -X PUT "repos/${{ github.repository }}/actions/workflows/wachhalten.yml/enable"
```

- [ ] **Step 6: Tests** – `npm test` → alles grün (bisher 126 + 2 neue).

- [ ] **Step 7: Commit**

```bash
git add supabase/schema.sql tests/betrieb.test.mjs .github/workflows/wachhalten.yml
git commit -m "Wach-Automatik: Lebenszeichen-Funktion, täglicher GitHub-Zeitplan, Rechte-Test aller Funktionen"
```

---

### Task 2: Vorlagen beim Anlegen

**Files:**
- Modify: `supabase/schema.sql`
- Create: `tests/vorlagen.test.mjs`

**Interfaces:**
- Produces: `public.org_umfrage_anlegen(p_titel text, p_vorlage text, p_jahr int, p_bundesland text) returns bigint`,
  `p_vorlage ∈ {'urlaub','leer','schicht','feier'}`. Die alte Fassung
  `public.org_umfrage_anlegen(p_titel text, p_jahr int, p_bundesland text)` bleibt und legt immer `'urlaub'` an.

- [ ] **Step 1: Test schreiben** – `tests/vorlagen.test.mjs`:

```js
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { neueDatenbank, als, browser, organisator } from './helfer.mjs';

let db;
let chef;

before(async () => {
  db = await neueDatenbank();
  chef = await organisator(db, 'chef');
});

const c = async (sql, params) => (await als(db, 'authenticated', chef, sql, params))[0];
const anlegen = async (vorlage, titel = 'Test', jahr = 2027, land = 'BY') =>
  (await c('select public.org_umfrage_anlegen($1, $2, $3, $4) as id', [titel, vorlage, jahr, land])).id;
const umfrage = async (id) => (await c('select public.org_umfrage($1) as r', [id])).r;
const form = (u) => u.fragen.map((f) => [f.typ, f.text, f.optionen.map((o) => o.text),
  Object.fromEntries(Object.entries(f.regeln).map(([art, r]) => [art, r.wert])), f.bedingungen.length]);

async function mitarbeiterCode(umfrageId, name) {
  await c('select public.org_mitarbeiter_anlegen($1, $2)', [umfrageId, name]);
  return (await db.query('select code from urlaub.mitarbeiter where umfrage_id = $1 and name = $2', [umfrageId, name])).rows[0].code;
}
const absenden = (code, antworten) =>
  browser(db, 'select public.umfrage_absenden($1, $2)', [code, JSON.stringify(antworten)]);
const fehlerVon = (versprechen) => versprechen.then(() => null, (e) => e);

test('Vorlage „urlaub“ entspricht der bisherigen Standard-Umfrage', async () => {
  const u = await umfrage(await anlegen('urlaub'));
  assert.equal(u.einstellungen.frist_eingabe, '2026-11-30T23:59');
  assert.deepEqual(u.fragen.map((f) => f.typ), ['urlaubswochen']);
  assert.deepEqual(Object.keys(u.fragen[0].regeln).sort(),
    ['gesperrte_monate', 'max_am_stueck', 'max_urlaubstage', 'max_wochen', 'min_wochen', 'pflicht']);
});

test('Vorlage „leer“: keine Fragen, Frist in 14 Tagen um 23:59', async () => {
  const u = await umfrage(await anlegen('leer', 'Leer', null, null));
  assert.deepEqual(u.fragen, []);
  const erwartet = (await db.query(
    "select to_char((now() at time zone 'Europe/Berlin')::date + 14, 'YYYY-MM-DD') || 'T23:59' as d")).rows[0].d;
  assert.equal(u.einstellungen.frist_eingabe, erwartet);
});

test('Vorlage „schicht“: Fragen, Optionen und Regeln; gültige Abgabe', async () => {
  const id = await anlegen('schicht', 'Schicht');
  const u = await umfrage(id);
  assert.deepEqual(form(u), [
    ['hinweis', 'Bitte gib an, wann du arbeiten kannst und was du bevorzugst.', [], {}, 0],
    ['mehrfach', 'An welchen Tagen kannst du arbeiten?',
      ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'], { pflicht: null, min_anzahl: 1 }, 0],
    ['einfach', 'Welche Schicht ist dir am liebsten?', ['Frühschicht', 'Spätschicht', 'Nachtschicht', 'Egal'], { pflicht: null }, 0],
    ['zahl', 'Wie viele Tage pro Woche möchtest du arbeiten?', [], { pflicht: null, min_zahl: 1, max_zahl: 6 }, 0],
    ['janein', 'Kannst du bei Bedarf kurzfristig einspringen?', [], { pflicht: null }, 0],
    ['text_lang', 'Gibt es Zeiten, in denen du nicht arbeiten kannst?', [], { max_zeichen: 500 }, 0],
  ]);
  assert.ok(u.fragen.every((f) => f.aktiv));
  assert.equal(u.fragen[0].hilfetext, 'Es sind Wünsche – wir berücksichtigen sie, so gut es geht.');
  const [, tage, schicht, anzahl, einspringen] = u.fragen;
  const code = await mitarbeiterCode(id, 'Anna');
  const fehler = await fehlerVon(absenden(code, { [tage.id]: [tage.optionen[0].id], [schicht.id]: schicht.optionen[0].id,
    [anzahl.id]: 7, [einspringen.id]: true }));
  assert.equal(fehler.message, 'ANTWORTEN_UNGUELTIG');
  assert.deepEqual(JSON.parse(fehler.detail), { [anzahl.id]: 'ZAHL_ZU_GROSS' });
  await absenden(code, { [tage.id]: [tage.optionen[0].id, tage.optionen[5].id], [schicht.id]: schicht.optionen[0].id,
    [anzahl.id]: 4, [einspringen.id]: true });
});

test('Vorlage „feier“: Folgefragen nur bei „Ja“', async () => {
  const id = await anlegen('feier', 'Feier');
  const u = await umfrage(id);
  assert.deepEqual(form(u), [
    ['janein', 'Möchtest du zur Weihnachtsfeier kommen?', [], { pflicht: null }, 0],
    ['mehrfach', 'An welchen Terminen kannst du?', ['Termin 1', 'Termin 2', 'Termin 3'], { pflicht: null }, 1],
    ['einfach', 'Was möchtest du essen?', ['Mit Fleisch', 'Vegetarisch', 'Vegan'], { pflicht: null }, 1],
    ['janein', 'Bringst du eine Begleitung mit?', [], { pflicht: null }, 1],
    ['text_lang', 'Hast du noch Wünsche oder Ideen für die Feier?', [], { max_zeichen: 500 }, 1],
  ]);
  const [kommt, termine, essen, begleitung, wuensche] = u.fragen;
  for (const f of u.fragen.slice(1)) {
    assert.deepEqual([f.bedingungen[0].quelle_id, f.bedingungen[0].operator, f.bedingungen[0].werte, f.bedingungen[0].aktiv],
      [kommt.id, 'ist', true, true]);
  }
  const code = await mitarbeiterCode(id, 'Anna');
  await absenden(code, { [kommt.id]: false });
  const fehler = await fehlerVon(absenden(code, { [kommt.id]: true }));
  assert.equal(fehler.message, 'ANTWORTEN_UNGUELTIG');
  assert.deepEqual(JSON.parse(fehler.detail), { [termine.id]: 'PFLICHT', [essen.id]: 'PFLICHT', [begleitung.id]: 'PFLICHT' });
  await absenden(code, { [kommt.id]: true, [termine.id]: [termine.optionen[1].id], [essen.id]: essen.optionen[1].id,
    [begleitung.id]: false, [wuensche.id]: 'Glühwein' });
});

test('Regeln und Bedingungen der Vorlagen bestehen die Editor-Prüfungen', async () => {
  for (const vorlage of ['schicht', 'feier']) {
    const id = await anlegen(vorlage);
    const vorher = await umfrage(id);
    for (const f of vorher.fragen) {
      for (const [art, r] of Object.entries(f.regeln)) {
        await c('select public.org_regel_setzen($1, $2, $3, $4)', [f.id, art, JSON.stringify(r.wert), r.aktiv]);
      }
      for (const b of f.bedingungen) {
        await c('select public.org_bedingung_speichern($1, $2, $3)', [b.id, b.operator, JSON.stringify(b.werte)]);
      }
    }
    assert.deepEqual(form(await umfrage(id)), form(vorher), vorlage);
  }
});

test('Vorlagen: ungültige Angaben, Rechte, alte Fassung', async () => {
  await assert.rejects(anlegen('quatsch'), /UNGUELTIGE_EINSTELLUNG/);
  await assert.rejects(anlegen(null), /UNGUELTIGE_EINSTELLUNG/);
  await assert.rejects(anlegen('urlaub', 'X', null), /UNGUELTIGE_EINSTELLUNG/);
  await assert.rejects(anlegen('urlaub', 'X', 2027, 'XX'), /UNGUELTIGE_EINSTELLUNG/);
  await assert.rejects(anlegen('leer', '   '), /TITEL_LEER/);
  await anlegen('schicht', 'Jahr egal', 1999, 'XX'); // Jahr und Bundesland zählen nur bei „urlaub“
  await assert.rejects(browser(db, "select public.org_umfrage_anlegen('X', 'leer', null, null)"), /permission denied/);
  const alt = (await c("select public.org_umfrage_anlegen('Alt', 2027, 'BY') as id")).id;
  assert.deepEqual((await umfrage(alt)).fragen.map((f) => f.typ), ['urlaubswochen']);
});
```

- [ ] **Step 2: Test laufen lassen** – `node --test tests/vorlagen.test.mjs` → FAIL (Funktion mit 4 Parametern fehlt).

- [ ] **Step 3: `org_umfrage_anlegen` ersetzen** – in `supabase/schema.sql` die bestehende Funktion
  `public.org_umfrage_anlegen(p_titel text, p_jahr int, p_bundesland text)` samt Kommentar
  „Vorgabe-Frist: 30.11. des Vorjahres …“ ersetzen durch:

```sql
-- Neue Umfrage nach Vorlage (siehe urlaub.vorlage_anwenden). Vorgabe-Frist: bei
-- 'urlaub' der 30.11. des Vorjahres, sonst heute in 14 Tagen; jeweils 23:59:59 deutscher Zeit.
-- Jahr und Bundesland zählen nur bei 'urlaub'.
create or replace function public.org_umfrage_anlegen(p_titel text, p_vorlage text, p_jahr int, p_bundesland text)
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
  if p_vorlage is null or p_vorlage not in ('urlaub', 'leer', 'schicht', 'feier') then
    raise exception 'UNGUELTIGE_EINSTELLUNG';
  end if;
  begin
    insert into urlaub.umfragen (organisator_id, titel, frist)
    values (v_uid, btrim(p_titel),
            case when p_vorlage = 'urlaub'
                 then make_timestamp(p_jahr - 1, 11, 30, 23, 59, 59) at time zone 'Europe/Berlin'
                 else (date_trunc('day', now() at time zone 'Europe/Berlin') + interval '14 days 23:59:59')
                      at time zone 'Europe/Berlin' end)
    returning id into v_id;
    perform urlaub.vorlage_anwenden(v_id, p_vorlage, p_jahr, p_bundesland);
  exception when check_violation or not_null_violation or data_exception then
    raise exception 'UNGUELTIGE_EINSTELLUNG';
  end;
  return v_id;
end;
$$;

-- Fassung von vor den Vorlagen (ältere Seiten): legt immer „Urlaubswünsche“ an.
create or replace function public.org_umfrage_anlegen(p_titel text, p_jahr int, p_bundesland text)
returns bigint
language sql volatile
security definer
set search_path = ''
as $$
  select public.org_umfrage_anlegen(p_titel, 'urlaub', p_jahr, p_bundesland)
$$;
```

  In den `revoke`/`grant`-Blöcken direkt darunter jeweils eine Zeile für die neue Signatur ergänzen
  (die bestehende Zeile für `(text, int, text)` bleibt):

```sql
revoke all on function public.org_umfrage_anlegen(text, text, int, text)       from public, anon, authenticated;
grant execute on function public.org_umfrage_anlegen(text, text, int, text)     to authenticated;
```

- [ ] **Step 4: Vorlagen-Funktionen** – neuer Abschnitt direkt **nach** den `grant`-Zeilen des
  Fragen-Editors (nach `grant execute on function public.org_umfrage_kopieren(bigint) to authenticated;`,
  vor `-- Einladungen und Registrierung`):

```sql
-- ---------------------------------------------------------------------------
-- Vorlagen für neue Umfragen
-- ---------------------------------------------------------------------------

-- Hängt eine eingeschaltete Frage an (Skala 1–5). Regelwerte laufen durch dieselben
-- Prüfungen wie im Editor (erlaubte_regeln, regelwert).
create or replace function urlaub.vorlage_frage(p_umfrage_id bigint, p_typ text, p_text text,
                                                p_hilfetext text default '', p_optionen text[] default '{}',
                                                p_regeln jsonb default '{}')
returns bigint
language plpgsql volatile
set search_path = ''
as $$
declare
  v_id   bigint;
  v_art  text;
  v_wert jsonb;
begin
  insert into urlaub.fragen (umfrage_id, position, typ, text, hilfetext, skala_von, skala_bis)
  values (p_umfrage_id,
          coalesce((select max(position) from urlaub.fragen where umfrage_id = p_umfrage_id), 0) + 1,
          p_typ, p_text, p_hilfetext,
          case when p_typ = 'skala' then 1 end,
          case when p_typ = 'skala' then 5 end)
  returning id into v_id;
  insert into urlaub.optionen (frage_id, position, text)
  select v_id, o.n, o.text from unnest(p_optionen) with ordinality as o (text, n);
  for v_art, v_wert in select key, value from jsonb_each(p_regeln) loop
    if not (v_art = any (urlaub.erlaubte_regeln(p_typ))) then
      raise exception 'REGEL_UNPASSEND';
    end if;
    insert into urlaub.regeln (frage_id, art, wert) values (v_id, v_art, urlaub.regelwert(v_art, v_wert));
  end loop;
  return v_id;
end;
$$;

-- Sichtbarkeits-Bedingung, geprüft wie im Editor (urlaub.bedingung_werte).
create or replace function urlaub.vorlage_bedingung(p_frage_id bigint, p_quelle_id bigint, p_operator text, p_werte jsonb)
returns void
language plpgsql volatile
set search_path = ''
as $$
declare
  v_f urlaub.fragen;
begin
  select * into v_f from urlaub.fragen where id = p_frage_id;
  insert into urlaub.bedingungen (frage_id, quelle_id, operator, werte)
  values (p_frage_id, p_quelle_id, p_operator, urlaub.bedingung_werte(v_f, p_quelle_id, p_operator, p_werte));
end;
$$;

-- Füllt eine frisch angelegte Umfrage: 'urlaub' (Urlaubswochen mit Standard-Regeln),
-- 'leer', 'schicht' (Schicht- und Verfügbarkeitswünsche), 'feier' (Weihnachtsfeier).
-- Bewusst keine Frage nach Allergien: Gesundheitsdaten (DSGVO Art. 9), Antworten sind nicht anonym.
create or replace function urlaub.vorlage_anwenden(p_umfrage_id bigint, p_vorlage text, p_jahr int, p_bundesland text)
returns void
language plpgsql volatile
set search_path = ''
as $$
declare
  v_kommt bigint;
begin
  case p_vorlage
  when 'urlaub' then
    perform urlaub.standard_urlaubsfrage(p_umfrage_id, p_jahr, p_bundesland);
  when 'leer' then
    null;
  when 'schicht' then
    perform urlaub.vorlage_frage(p_umfrage_id, 'hinweis',
      'Bitte gib an, wann du arbeiten kannst und was du bevorzugst.',
      'Es sind Wünsche – wir berücksichtigen sie, so gut es geht.');
    perform urlaub.vorlage_frage(p_umfrage_id, 'mehrfach', 'An welchen Tagen kannst du arbeiten?', '',
      array['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'],
      '{"pflicht": null, "min_anzahl": 1}');
    perform urlaub.vorlage_frage(p_umfrage_id, 'einfach', 'Welche Schicht ist dir am liebsten?', '',
      array['Frühschicht', 'Spätschicht', 'Nachtschicht', 'Egal'], '{"pflicht": null}');
    perform urlaub.vorlage_frage(p_umfrage_id, 'zahl', 'Wie viele Tage pro Woche möchtest du arbeiten?', '',
      '{}', '{"pflicht": null, "min_zahl": 1, "max_zahl": 6}');
    perform urlaub.vorlage_frage(p_umfrage_id, 'janein', 'Kannst du bei Bedarf kurzfristig einspringen?', '',
      '{}', '{"pflicht": null}');
    perform urlaub.vorlage_frage(p_umfrage_id, 'text_lang', 'Gibt es Zeiten, in denen du nicht arbeiten kannst?',
      'Zum Beispiel Schule, Kinderbetreuung oder ein fester Termin.', '{}', '{"max_zeichen": 500}');
  when 'feier' then
    v_kommt := urlaub.vorlage_frage(p_umfrage_id, 'janein', 'Möchtest du zur Weihnachtsfeier kommen?', '',
      '{}', '{"pflicht": null}');
    perform urlaub.vorlage_bedingung(urlaub.vorlage_frage(p_umfrage_id, 'mehrfach', 'An welchen Terminen kannst du?',
      'Kreuze alle Termine an, an denen du kannst.', array['Termin 1', 'Termin 2', 'Termin 3'], '{"pflicht": null}'),
      v_kommt, 'ist', 'true');
    perform urlaub.vorlage_bedingung(urlaub.vorlage_frage(p_umfrage_id, 'einfach', 'Was möchtest du essen?', '',
      array['Mit Fleisch', 'Vegetarisch', 'Vegan'], '{"pflicht": null}'),
      v_kommt, 'ist', 'true');
    perform urlaub.vorlage_bedingung(urlaub.vorlage_frage(p_umfrage_id, 'janein', 'Bringst du eine Begleitung mit?', '',
      '{}', '{"pflicht": null}'),
      v_kommt, 'ist', 'true');
    perform urlaub.vorlage_bedingung(urlaub.vorlage_frage(p_umfrage_id, 'text_lang',
      'Hast du noch Wünsche oder Ideen für die Feier?', '', '{}', '{"max_zeichen": 500}'),
      v_kommt, 'ist', 'true');
  else
    raise exception 'UNGUELTIGE_EINSTELLUNG';
  end case;
end;
$$;
```

- [ ] **Step 5: Tests** – `npm test` → alles grün. Achtung: Der bestehende Test „Ungültige Angaben beim
  Anlegen“ in `tests/admin.test.mjs` nutzt die alte Fassung und muss unverändert grün bleiben.

- [ ] **Step 6: Commit**

```bash
git add supabase/schema.sql tests/vorlagen.test.mjs
git commit -m "Vorlagen beim Anlegen: Urlaubswünsche, Leer, Schicht- und Verfügbarkeitswünsche, Weihnachtsfeier"
```

---

### Task 3: Viele Mitarbeiter auf einmal (Datenbank)

**Files:**
- Modify: `supabase/schema.sql`
- Modify: `tests/betrieb.test.mjs`

**Interfaces:**
- Produces: `public.org_mitarbeiter_anlegen_liste(p_umfrage_id bigint, p_namen text[]) returns int`;
  Fehler `NAME_LEER`, `ZU_VIELE_NAMEN`, `NAME_DOPPELT` (detail = der doppelte Name, wie eingegeben, getrimmt).

- [ ] **Step 1: Test anhängen** – in `tests/betrieb.test.mjs`:

```js
test('Mitarbeiter-Liste: trimmt, überspringt Leerzeilen, ganz oder gar nicht', async () => {
  const u = (await als(db, 'authenticated', chef, "select public.org_umfrage_anlegen('Liste', 2027, 'BY') as id"))[0].id;
  // Liste als JSON übergeben (so kommt sie auch über PostgREST an)
  const liste = async (namen, wer = chef) => (await als(db, 'authenticated', wer,
    'select public.org_mitarbeiter_anlegen_liste($1, array(select jsonb_array_elements_text($2::jsonb))) as n',
    [u, JSON.stringify(namen)]))[0].n;
  const namen = async () => (await db.query('select name from urlaub.mitarbeiter where umfrage_id = $1 order by name', [u]))
    .rows.map((r) => r.name);
  assert.equal(await liste(['  Anna Huber\t', '', '   ', 'Ben Maier\r']), 2);
  assert.deepEqual(await namen(), ['Anna Huber', 'Ben Maier']);
  await assert.rejects(liste(['Cem', 'anna huber']), (e) => e.message === 'NAME_DOPPELT' && e.detail === 'anna huber');
  await assert.rejects(liste(['Cem', 'Dora', ' CEM ']), (e) => e.message === 'NAME_DOPPELT' && e.detail === 'CEM');
  assert.deepEqual(await namen(), ['Anna Huber', 'Ben Maier']);
  await assert.rejects(liste(['', '  ']), /NAME_LEER/);
  await assert.rejects(liste([]), /NAME_LEER/);
  await assert.rejects(liste(Array.from({ length: 201 }, (_, i) => `Person ${i}`)), /ZU_VIELE_NAMEN/);
  assert.equal(await liste(Array.from({ length: 200 }, (_, i) => `Person ${i}`)), 200);
  const eva = await organisator(db, 'eva');
  await assert.rejects(liste(['X'], eva), /UMFRAGE_NICHT_GEFUNDEN/);
  await assert.rejects(browser(db, "select public.org_mitarbeiter_anlegen_liste($1, array['X'])", [u]), /permission denied/);
});
```

- [ ] **Step 2: Test laufen lassen** → FAIL (Funktion fehlt).

- [ ] **Step 3: Funktion** – in `supabase/schema.sql` direkt nach `public.org_mitarbeiter_anlegen`:

```sql
-- Mehrere auf einmal, ganz oder gar nicht. Leerraum an den Enden wird entfernt, leere
-- Zeilen übersprungen. Ein Name doppelt (in der Liste oder schon vorhanden, Groß/klein
-- egal) → NAME_DOPPELT mit dem Namen als detail. Höchstens 200 auf einmal.
create or replace function public.org_mitarbeiter_anlegen_liste(p_umfrage_id bigint, p_namen text[])
returns int
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_u     urlaub.umfragen := urlaub.eigene_umfrage(p_umfrage_id);
  v_namen text[];
  v_name  text;
begin
  select coalesce(array_agg(s.n order by s.i), '{}') into v_namen
  from (select urlaub.trim_alles(t.x) as n, t.i from unnest(p_namen) with ordinality as t (x, i)) s
  where s.n is not null and s.n <> '';
  if cardinality(v_namen) = 0 then
    raise exception 'NAME_LEER';
  end if;
  if cardinality(v_namen) > 200 then
    raise exception 'ZU_VIELE_NAMEN';
  end if;
  perform 1 from urlaub.umfragen where id = v_u.id for update;
  select t.n into v_name
  from unnest(v_namen) with ordinality as t (n, i)
  where exists (select 1 from urlaub.mitarbeiter m where m.umfrage_id = v_u.id and lower(m.name) = lower(t.n))
     or exists (select 1 from unnest(v_namen) with ordinality as d (n, j) where lower(d.n) = lower(t.n) and d.j < t.i)
  order by t.i
  limit 1;
  if v_name is not null then
    raise exception 'NAME_DOPPELT' using detail = v_name;
  end if;
  insert into urlaub.mitarbeiter (umfrage_id, name) select v_u.id, n from unnest(v_namen) as n;
  return cardinality(v_namen);
end;
$$;
```

  Rechte im Block darunter ergänzen:

```sql
revoke all on function public.org_mitarbeiter_anlegen_liste(bigint, text[])    from public, anon, authenticated;
grant execute on function public.org_mitarbeiter_anlegen_liste(bigint, text[])  to authenticated;
```

- [ ] **Step 4: Tests** – `npm test` → grün.

- [ ] **Step 5: Commit**

```bash
git add supabase/schema.sql tests/betrieb.test.mjs
git commit -m "Mitarbeiter als Liste anlegen (ganz oder gar nicht, höchstens 200)"
```

---

### Task 4: Sicherung herunterladen und einspielen (Datenbank); Kopieren nutzt denselben Weg

**Files:**
- Modify: `supabase/schema.sql`
- Create: `tests/sicherung.test.mjs`

**Interfaces:**
- Consumes: `tests/umfrage-bauer.mjs` (`baueUmfrage`, `mitIds`), `tests/helfer.mjs`.
- Produces: `public.org_sicherung(p_umfrage_id bigint) returns jsonb` (Format siehe `urlaub.umfrage_json`),
  `public.org_sicherung_einspielen(p_daten jsonb) returns jsonb` = `{"id": <neue Umfrage>, "neue_links": <Anzahl>}`,
  Fehler `SICHERUNG_UNGUELTIG`. `public.org_umfrage_kopieren` verhält sich wie bisher.

- [ ] **Step 1: Test schreiben** – `tests/sicherung.test.mjs`:

```js
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { neueDatenbank, als, browser, organisator } from './helfer.mjs';
import { baueUmfrage, mitIds } from './umfrage-bauer.mjs';

let db;
let chef;
let eva;

before(async () => {
  db = await neueDatenbank();
  chef = await organisator(db, 'chef');
  eva = await organisator(db, 'eva');
});

const c = async (sql, params) => (await als(db, 'authenticated', chef, sql, params))[0];
const umfrage = async (id, wer = chef) => (await als(db, 'authenticated', wer, 'select public.org_umfrage($1) as r', [id]))[0].r;
const sicherung = async (id) => (await c('select public.org_sicherung($1) as s', [id])).s;
const einspielen = async (daten, wer = chef) =>
  (await als(db, 'authenticated', wer, 'select public.org_sicherung_einspielen($1) as r', [JSON.stringify(daten)]))[0].r;

// Umfrage mit allen Fragetypen, Bedingungen, ausgeschalteten Teilen, freiem Tag und drei
// Mitarbeitern (zwei mit Abgabe). Danach wird die gewählte Option „Spät“ ausgeschaltet.
async function reicheUmfrage() {
  const bau = await baueUmfrage(db, chef, { titel: 'Sicherungstest', fragen: [
    { key: 'wochen', typ: 'urlaubswochen' },
    { key: 'schicht', typ: 'einfach', optionen: ['Früh', { key: 'Nacht', aktiv: false }, 'Spät'] },
    { key: 'tage', typ: 'mehrfach', optionen: ['Mo', 'Di', 'Mi'], regeln: { min_anzahl: 1, max_anzahl: { wert: 2, aktiv: false } } },
    { key: 'kinder', typ: 'janein', regeln: { pflicht: null } },
    { key: 'ferien', typ: 'text_kurz', bedingungen: [{ quelle: 'kinder', operator: 'ist', werte: true }] },
    { key: 'spaet', typ: 'text_lang', verknuepfung: 'oder', bedingungen: [
      { quelle: 'schicht', operator: 'ist_eine_von', werte: ['Spät', 'Nacht'] },
      { quelle: 'tage', operator: 'enthaelt_keine_von', werte: ['Mi'], aktiv: false }] },
    { key: 'laune', typ: 'skala', skala: { von: 0, bis: 10 } },
    { key: 'anzahl', typ: 'zahl', regeln: { min_zahl: 1, max_zahl: 5 } },
    { key: 'start', typ: 'datum', regeln: { fruehestens: '2027-01-01' } },
    { key: 'info', typ: 'hinweis', aktiv: false },
  ] });
  await db.query("insert into urlaub.freie_tage (umfrage_id, datum, name) values ($1, '2027-08-09', 'Betriebsruhe')", [bau.umfrageId]);
  const codes = {};
  for (const name of ['Anna', 'Ben', 'Cem']) {
    codes[name] = (await db.query('insert into urlaub.mitarbeiter (umfrage_id, name) values ($1, $2) returning code',
      [bau.umfrageId, name])).rows[0].code;
  }
  const absenden = (code, a) => browser(db, 'select public.umfrage_absenden($1, $2)', [code, JSON.stringify(mitIds(bau, a))]);
  await absenden(codes.Anna, { wochen: [10, 30], schicht: 'Spät', tage: ['Mo', 'Di'], kinder: true, ferien: 'Sommer',
    spaet: 'Nur abends', laune: 7, anzahl: 3, start: '2027-02-01' });
  await absenden(codes.Ben, { wochen: [31], schicht: 'Früh', tage: ['Mi'], kinder: false, laune: 0, anzahl: 5 });
  await db.query('update urlaub.optionen set aktiv = false where id = $1', [bau.optionen.schicht['Spät']]);
  return { bau, codes };
}

// org_umfrage ohne IDs: Fragen über ihren Index, Optionen über „Frage.Index“.
function vergleichbar(u, { mitLinks = true } = {}) {
  const fIndex = new Map(u.fragen.map((f, i) => [String(f.id), i]));
  const typ = new Map(u.fragen.map((f) => [String(f.id), f.typ]));
  const oIndex = new Map(u.fragen.flatMap((f) => f.optionen.map((o, j) => [String(o.id), `${fIndex.get(String(f.id))}.${j}`])));
  const opt = (x) => oIndex.get(String(x));
  const wert = (fid, w) => {
    if (typ.get(fid) === 'einfach') return opt(w);
    if (typ.get(fid) === 'mehrfach') return w.map(opt).sort();
    return w;
  };
  return {
    einstellungen: { titel: u.einstellungen.titel, frist: u.einstellungen.frist },
    freie_tage: u.freie_tage,
    fragen: u.fragen.map((f) => ({
      typ: f.typ, text: f.text, hilfetext: f.hilfetext, aktiv: f.aktiv, verknuepfung: f.verknuepfung,
      position: f.position, skala: f.skala, urlaubswochen: f.urlaubswochen, regeln: f.regeln,
      hat_antworten: f.hat_antworten,
      optionen: f.optionen.map((o) => [o.text, o.aktiv, o.hat_antworten]),
      bedingungen: f.bedingungen.map((b) => [fIndex.get(String(b.quelle_id)), b.operator,
        Array.isArray(b.werte) ? b.werte.map(opt).sort() : b.werte, b.aktiv]),
    })),
    mitarbeiter: u.mitarbeiter.map((m) => ({
      name: m.name, link: mitLinks ? m.link : undefined, geaendert_am: m.geaendert_am,
      verstoesse: Object.fromEntries(Object.entries(m.verstoesse).map(([k, v]) => [fIndex.get(k), v])),
      antworten: Object.fromEntries(Object.entries(m.antworten).map(([k, w]) => [fIndex.get(k), wert(k, w)])),
    })),
  };
}

test('Sicherung → Original löschen → Einspielen: alles wieder da, alte Links gehen wieder', async () => {
  const { bau, codes } = await reicheUmfrage();
  const vorher = await umfrage(bau.umfrageId);
  const s = await sicherung(bau.umfrageId);
  assert.deepEqual([s.format, s.version, s.mitarbeiter.length, s.fragen.length], ['urlaub-sicherung', 1, 3, 10]);
  await c('select public.org_umfrage_loeschen($1)', [bau.umfrageId]);
  const r = await einspielen(s);
  assert.equal(r.neue_links, 0);
  const nachher = await umfrage(r.id);
  assert.deepEqual(vergleichbar(nachher), vergleichbar(vorher));
  assert.ok(vorher.mitarbeiter[0].verstoesse && Object.keys(vorher.mitarbeiter[0].verstoesse).length > 0,
    'Annas Antwort auf die ausgeschaltete Option zählt als Verstoß – und bleibt erhalten');
  const anna = (await browser(db, 'select public.urlaub_laden($1) as r', [codes.Anna]))[0].r;
  assert.equal(anna.name, 'Anna');
  assert.deepEqual(anna.antworten[String(nachher.fragen[0].id)], [10, 30]);
});

test('Einspielen, während das Original noch existiert: neue Links, Original unberührt', async () => {
  const { bau, codes } = await reicheUmfrage();
  const vorher = await umfrage(bau.umfrageId);
  const r = await einspielen(await sicherung(bau.umfrageId));
  assert.equal(r.neue_links, 3);
  const kopie = await umfrage(r.id);
  assert.deepEqual(vergleichbar(kopie, { mitLinks: false }), vergleichbar(vorher, { mitLinks: false }));
  for (const code of Object.values(codes)) {
    assert.equal((await db.query('select umfrage_id from urlaub.mitarbeiter where code = $1', [code])).rows[0].umfrage_id,
      bau.umfrageId);
    assert.ok(kopie.mitarbeiter.every((m) => !m.link.endsWith(code)));
  }
  assert.deepEqual(await umfrage(bau.umfrageId), vorher);
});

test('Veränderte oder kaputte Dateien: SICHERUNG_UNGUELTIG, nichts angelegt', async () => {
  const { bau } = await reicheUmfrage();
  const s = await sicherung(bau.umfrageId);
  const anzahl = async () => Number((await db.query('select count(*) as n from urlaub.umfragen')).rows[0].n);
  const vorher = await anzahl();
  const frage = (d, typ) => d.fragen.find((f) => f.typ === typ);
  const anna = (d) => d.mitarbeiter.find((m) => m.name === 'Anna');
  const geaendert = (aendern) => { const d = structuredClone(s); aendern(d); return d; };
  const faelle = {
    'kein Objekt': [1, 2],
    'falsches Format': { ...s, format: 'etwas' },
    'falsche Version': { ...s, version: 2 },
    'Fragen kein Array': { ...s, fragen: {} },
    'Frist unendlich': { ...s, umfrage: { ...s.umfrage, frist: 'infinity' } },
    'Regel unpassend': geaendert((d) => frage(d, 'janein').regeln.push({ art: 'max_zeichen', wert: 5, aktiv: true })),
    'Regelwert ungültig': geaendert((d) => { frage(d, 'zahl').regeln.find((r) => r.art === 'min_zahl').wert = 'abc'; }),
    'Regeln widersprüchlich': geaendert((d) => { frage(d, 'zahl').regeln.find((r) => r.art === 'min_zahl').wert = 9; }),
    'Optionen bei Ja/Nein': geaendert((d) => frage(d, 'janein').optionen.push({ id: 1, text: 'x', aktiv: true })),
    'Frage-ID doppelt': geaendert((d) => { frage(d, 'zahl').id = frage(d, 'janein').id; }),
    'Bedingung zeigt nach vorn': geaendert((d) => frage(d, 'janein').bedingungen.push(
      { quelle_id: frage(d, 'zahl').id, operator: 'gleich', werte: 1, aktiv: true })),
    'Bedingung mit fremder Option': geaendert((d) => { frage(d, 'text_lang').bedingungen[0].werte = [frage(d, 'mehrfach').optionen[0].id]; }),
    'Antwort mit fremder Option': geaendert((d) => { anna(d).antworten[frage(d, 'einfach').id] = frage(d, 'mehrfach').optionen[0].id; }),
    'Antwort falscher Typ': geaendert((d) => { anna(d).antworten[frage(d, 'janein').id] = 'ja'; }),
    'Woche außerhalb': geaendert((d) => { anna(d).antworten[frage(d, 'urlaubswochen').id] = [54]; }),
    'Skala außerhalb': geaendert((d) => { anna(d).antworten[frage(d, 'skala').id] = 11; }),
    'Datum ungültig': geaendert((d) => { anna(d).antworten[frage(d, 'datum').id] = '2027-02-30'; }),
    'Antwort auf Hinweis': geaendert((d) => { anna(d).antworten[frage(d, 'hinweis').id] = 'x'; }),
    'Antwort auf unbekannte Frage': geaendert((d) => { anna(d).antworten['999999'] = 'x'; }),
    'Namen doppelt': geaendert((d) => { d.mitarbeiter[1].name = 'ANNA'; }),
    'Abgabezeit kaputt': geaendert((d) => { anna(d).geaendert_am = 'gestern'; }),
  };
  for (const [name, daten] of Object.entries(faelle)) {
    await assert.rejects(einspielen(daten), /SICHERUNG_UNGUELTIG/, name);
  }
  assert.equal(await anzahl(), vorher);
});

test('Sicherung: nur eigene Umfragen, nur angemeldet; Einspielen gehört dem Einspielenden', async () => {
  const { bau } = await reicheUmfrage();
  await assert.rejects(als(db, 'authenticated', eva, 'select public.org_sicherung($1)', [bau.umfrageId]), /UMFRAGE_NICHT_GEFUNDEN/);
  await assert.rejects(browser(db, 'select public.org_sicherung($1)', [bau.umfrageId]), /permission denied/);
  await assert.rejects(browser(db, "select public.org_sicherung_einspielen('{}')"), /permission denied/);
  const s = await sicherung(bau.umfrageId);
  const gesperrt = await organisator(db, 'weg', { gesperrt: true });
  await assert.rejects(einspielen(s, gesperrt), /KEIN_ZUGRIFF/);
  const r = await einspielen(s, eva);
  assert.equal((await umfrage(r.id, eva)).einstellungen.titel, 'Sicherungstest');
  await assert.rejects(umfrage(r.id, chef), /UMFRAGE_NICHT_GEFUNDEN/);
});
```

- [ ] **Step 2: Test laufen lassen** → FAIL (`org_sicherung` fehlt).

- [ ] **Step 3: Widerspruchsprüfung herauslösen** – direkt vor `public.org_regel_setzen` einfügen:

```sql
-- Widersprechen sich zwei eingeschaltete Regeln eines Paares (min/max, frühestens/spätestens)?
-- p_art: nur Paare prüfen, zu denen diese Art gehört (null = alle).
create or replace function urlaub.regeln_widerspruch(p_frage_id bigint, p_art text default null)
returns boolean
language sql stable
set search_path = ''
as $$
  select exists (
    select 1
    from (values ('min_wochen', 'max_wochen'), ('min_anzahl', 'max_anzahl'), ('min_zahl', 'max_zahl'),
                 ('fruehestens', 'spaetestens')) as p (unten, oben)
    join urlaub.regeln ru on ru.frage_id = p_frage_id and ru.art = p.unten and ru.aktiv
    join urlaub.regeln ro on ro.frage_id = p_frage_id and ro.art = p.oben and ro.aktiv
    where (p_art is null or p_art in (p.unten, p.oben))
      and case when p.unten = 'fruehestens' then (ru.wert #>> '{}')::date > (ro.wert #>> '{}')::date
               else (ru.wert #>> '{}')::numeric > (ro.wert #>> '{}')::numeric end)
$$;
```

  und in `public.org_regel_setzen` den Block `if exists ( select 1 from (values …) … ) then raise exception 'UNGUELTIGE_EINSTELLUNG'; end if;` ersetzen durch:

```sql
  if urlaub.regeln_widerspruch(v_f.id, p_art) then
    raise exception 'UNGUELTIGE_EINSTELLUNG';
  end if;
```

- [ ] **Step 4: Formprüfung für gespeicherte Antworten** – direkt nach `urlaub.antwort_normalisiert` einfügen:

```sql
-- Form einer gespeicherten Antwort (Einspielen einer Sicherung). Anders als antwort_verstoss
-- ohne Regeln und auch für ausgeschaltete Optionen – gespeicherte Antworten dürfen später
-- verschärfte Regeln verletzen –, garantiert aber, dass alle späteren Umwandlungen
-- (::int, ::numeric, ::date, Options-IDs der Frage) gelingen.
create or replace function urlaub.antwort_form_ok(p_frage urlaub.fragen, p_wert jsonb)
returns boolean
language plpgsql stable
set search_path = ''
as $$
declare
  v_typ   text := jsonb_typeof(p_wert);
  v_zahl  numeric;
  v_datum date;
begin
  case p_frage.typ
  when 'urlaubswochen', 'mehrfach' then
    if v_typ is distinct from 'array' or jsonb_array_length(p_wert) = 0 then
      return false;
    end if;
    if exists (select 1 from jsonb_array_elements(p_wert) e where jsonb_typeof(e) <> 'number') then
      return false;
    end if;
    if (select count(distinct (e #>> '{}')::numeric) from jsonb_array_elements(p_wert) e) <> jsonb_array_length(p_wert) then
      return false;
    end if;
    if p_frage.typ = 'urlaubswochen' then
      return not exists (select 1 from jsonb_array_elements(p_wert) e
                         where (e #>> '{}')::numeric <> trunc((e #>> '{}')::numeric)
                            or (e #>> '{}')::numeric not between 1 and 53);
    end if;
    return not exists (select 1 from jsonb_array_elements(p_wert) e
                       where not exists (select 1 from urlaub.optionen o
                                         where o.frage_id = p_frage.id and o.id::numeric = (e #>> '{}')::numeric));
  when 'einfach' then
    if v_typ is distinct from 'number' then
      return false;
    end if;
    return exists (select 1 from urlaub.optionen o
                   where o.frage_id = p_frage.id and o.id::numeric = (p_wert #>> '{}')::numeric);
  when 'janein' then
    return v_typ is not distinct from 'boolean';
  when 'skala', 'zahl' then
    if v_typ is distinct from 'number' then
      return false;
    end if;
    v_zahl := (p_wert #>> '{}')::numeric;
    if p_frage.typ = 'zahl' then
      return abs(v_zahl) < 1e12;
    end if;
    return v_zahl = trunc(v_zahl) and v_zahl between p_frage.skala_von and p_frage.skala_bis;
  when 'text_kurz', 'text_lang' then
    if v_typ is distinct from 'string' then
      return false;
    end if;
    return char_length(urlaub.trim_alles(p_wert #>> '{}'))
           between 1 and (case p_frage.typ when 'text_kurz' then 200 else 5000 end);
  when 'datum' then
    if v_typ is distinct from 'string' or (p_wert #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$' then
      return false;
    end if;
    begin
      v_datum := (p_wert #>> '{}')::date;
    exception when data_exception then
      return false;
    end;
    return true;
  else
    return false;
  end case;
end;
$$;
```

- [ ] **Step 5: Umfrage als JSON und aus JSON; Kopieren darauf umstellen** – die bestehende
  Funktion `public.org_umfrage_kopieren` samt ihrem Kommentar („Kopie mit allen Fragen …“) ersetzen durch:

```sql
-- ---------------------------------------------------------------------------
-- Sicherung und Kopie
-- ---------------------------------------------------------------------------
--
-- Format (version 1): {"format": "urlaub-sicherung", "version": 1, "erstellt_am",
--   "umfrage": {"titel", "frist"}, "freie_tage": [{"datum", "name"}],
--   "fragen": [{"id", "typ", "text", "hilfetext", "aktiv", "verknuepfung", "jahr", "bundesland",
--               "arbeitstage_pro_woche", "sperr_hinweis", "skala_von", "skala_bis", "skala_links",
--               "skala_rechts", "optionen": [{"id", "text", "aktiv"}],
--               "regeln": [{"art", "wert", "aktiv"}], "bedingungen": [{"quelle_id", "operator", "werte", "aktiv"}]}],
--   "mitarbeiter": [{"name", "code", "geaendert_am" (null = keine Abgabe), "antworten": {"<frage_id>": wert}}]}
-- IDs sind die alten; umfrage_aus_json schlüsselt sie um.

create or replace function urlaub.umfrage_json(p_umfrage_id bigint, p_mit_mitarbeiter boolean)
returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'format',      'urlaub-sicherung',
    'version',     1,
    'erstellt_am', now(),
    'umfrage',     jsonb_build_object('titel', u.titel, 'frist', u.frist),
    'freie_tage',  coalesce((select jsonb_agg(jsonb_build_object('datum', t.datum, 'name', t.name) order by t.datum)
                             from urlaub.freie_tage t where t.umfrage_id = u.id), '[]'::jsonb),
    'fragen', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', f.id, 'typ', f.typ, 'text', f.text, 'hilfetext', f.hilfetext, 'aktiv', f.aktiv,
               'verknuepfung', f.verknuepfung, 'jahr', f.jahr, 'bundesland', f.bundesland,
               'arbeitstage_pro_woche', f.arbeitstage_pro_woche, 'sperr_hinweis', f.sperr_hinweis,
               'skala_von', f.skala_von, 'skala_bis', f.skala_bis,
               'skala_links', f.skala_links, 'skala_rechts', f.skala_rechts,
               'optionen', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'text', o.text, 'aktiv', o.aktiv)
                                                      order by o.position, o.id)
                                     from urlaub.optionen o where o.frage_id = f.id), '[]'::jsonb),
               'regeln', coalesce((select jsonb_agg(jsonb_build_object('art', r.art, 'wert', r.wert, 'aktiv', r.aktiv)
                                                    order by r.id)
                                   from urlaub.regeln r where r.frage_id = f.id), '[]'::jsonb),
               'bedingungen', coalesce((select jsonb_agg(jsonb_build_object('quelle_id', b.quelle_id, 'operator', b.operator,
                                                                            'werte', b.werte, 'aktiv', b.aktiv)
                                                         order by b.id)
                                        from urlaub.bedingungen b where b.frage_id = f.id), '[]'::jsonb))
             order by f.position, f.id)
      from urlaub.fragen f where f.umfrage_id = u.id), '[]'::jsonb),
    'mitarbeiter', case when p_mit_mitarbeiter then coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', m.name, 'code', m.code, 'geaendert_am', a.geaendert_am,
               'antworten', coalesce((select jsonb_object_agg(an.frage_id::text, an.wert)
                                      from urlaub.antworten an where an.mitarbeiter_id = m.id), '{}'::jsonb))
             order by m.name)
      from urlaub.mitarbeiter m
      left join urlaub.abgaben a on a.mitarbeiter_id = m.id
      where m.umfrage_id = u.id), '[]'::jsonb) else '[]'::jsonb end)
  from urlaub.umfragen u where u.id = p_umfrage_id
$$;

-- Legt aus dem Format oben eine neue Umfrage für p_organisator an (Titel p_titel oder der
-- aus den Daten). Prüft wie der Editor: Tabellenprüfungen, erlaubte Regeln und Regelwerte,
-- widersprüchliche Paare, Bedingungen (bedingung_werte) und die Form jeder Antwort
-- (antwort_form_ok). Link-Codes werden übernommen, wenn es sie nirgends mehr gibt, sonst
-- neu erzeugt. Fehler brechen ab (die aufrufende Funktion macht daraus ihren Code).
-- Rückgabe: {"id": neue Umfrage, "neue_links": Anzahl neu erzeugter Codes}.
create or replace function urlaub.umfrage_aus_json(p_organisator uuid, p_daten jsonb, p_titel text)
returns jsonb
language plpgsql volatile
set search_path = ''
as $$
declare
  v_id         bigint;
  v_fragen     jsonb := '{}';  -- alte Frage-ID → neue
  v_optionen   jsonb := '{}';  -- alte Options-ID → neue
  v_f          jsonb;
  v_o          jsonb;
  v_r          jsonb;
  v_b          jsonb;
  v_m          jsonb;
  v_frage      urlaub.fragen;
  v_neu        bigint;
  v_neue_opt   bigint;
  v_pos        int := 0;
  v_opos       int;
  v_quelle     bigint;
  v_werte      jsonb;
  v_mid        bigint;
  v_code       text;
  v_neue_links int := 0;
  v_schluessel text;
  v_wert       jsonb;
begin
  if jsonb_typeof(p_daten) is distinct from 'object'
     or p_daten ->> 'format' is distinct from 'urlaub-sicherung'
     or p_daten -> 'version' is distinct from '1'::jsonb
     or (p_daten #>> '{umfrage,frist}') ~* 'infinity' then
    raise exception 'SICHERUNG_UNGUELTIG';
  end if;
  insert into urlaub.umfragen (organisator_id, titel, frist)
  values (p_organisator, coalesce(p_titel, btrim(p_daten #>> '{umfrage,titel}')), (p_daten #>> '{umfrage,frist}')::timestamptz)
  returning id into v_id;

  -- Fragen, Optionen, Regeln (Position = Reihenfolge in der Datei)
  for v_f in select value from jsonb_array_elements(p_daten -> 'fragen') loop
    if v_fragen ? (v_f ->> 'id') then
      raise exception 'SICHERUNG_UNGUELTIG';
    end if;
    v_pos := v_pos + 1;
    insert into urlaub.fragen (umfrage_id, position, typ, text, hilfetext, aktiv, verknuepfung, jahr, bundesland,
                               arbeitstage_pro_woche, sperr_hinweis, skala_von, skala_bis, skala_links, skala_rechts)
    values (v_id, v_pos, v_f ->> 'typ', v_f ->> 'text', coalesce(v_f ->> 'hilfetext', ''),
            coalesce((v_f ->> 'aktiv')::boolean, true), coalesce(v_f ->> 'verknuepfung', 'und'),
            (v_f ->> 'jahr')::int, v_f ->> 'bundesland', (v_f ->> 'arbeitstage_pro_woche')::int, v_f ->> 'sperr_hinweis',
            (v_f ->> 'skala_von')::int, (v_f ->> 'skala_bis')::int, v_f ->> 'skala_links', v_f ->> 'skala_rechts')
    returning id into v_neu;
    v_fragen := v_fragen || jsonb_build_object(v_f ->> 'id', v_neu);
    if jsonb_array_length(coalesce(v_f -> 'optionen', '[]')) > 0 and (v_f ->> 'typ') not in ('einfach', 'mehrfach') then
      raise exception 'SICHERUNG_UNGUELTIG';
    end if;
    v_opos := 0;
    for v_o in select value from jsonb_array_elements(coalesce(v_f -> 'optionen', '[]')) loop
      if v_optionen ? (v_o ->> 'id') then
        raise exception 'SICHERUNG_UNGUELTIG';
      end if;
      v_opos := v_opos + 1;
      insert into urlaub.optionen (frage_id, position, text, aktiv)
      values (v_neu, v_opos, v_o ->> 'text', coalesce((v_o ->> 'aktiv')::boolean, true))
      returning id into v_neue_opt;
      v_optionen := v_optionen || jsonb_build_object(v_o ->> 'id', v_neue_opt);
    end loop;
    for v_r in select value from jsonb_array_elements(coalesce(v_f -> 'regeln', '[]')) loop
      if (v_r ->> 'art') is null or not ((v_r ->> 'art') = any (urlaub.erlaubte_regeln(v_f ->> 'typ'))) then
        raise exception 'SICHERUNG_UNGUELTIG';
      end if;
      insert into urlaub.regeln (frage_id, art, wert, aktiv)
      values (v_neu, v_r ->> 'art', urlaub.regelwert(v_r ->> 'art', v_r -> 'wert'),
              coalesce((v_r ->> 'aktiv')::boolean, true));
    end loop;
    if urlaub.regeln_widerspruch(v_neu) then
      raise exception 'SICHERUNG_UNGUELTIG';
    end if;
  end loop;

  -- Bedingungen (erst jetzt, weil sie auf andere Fragen zeigen). Options-IDs nur bei
  -- Auswahl-Operatoren umschlüsseln; andere Werte (true, 2.5) bleiben.
  for v_f in select value from jsonb_array_elements(p_daten -> 'fragen') loop
    select * into v_frage from urlaub.fragen where id = (v_fragen ->> (v_f ->> 'id'))::bigint;
    for v_b in select value from jsonb_array_elements(coalesce(v_f -> 'bedingungen', '[]')) loop
      v_quelle := (v_fragen ->> (v_b ->> 'quelle_id'))::bigint;
      v_werte := v_b -> 'werte';
      if (v_b ->> 'operator') in ('ist_eine_von', 'ist_keine_von', 'enthaelt_eine_von', 'enthaelt_keine_von') then
        if jsonb_typeof(v_werte) is distinct from 'array' then
          raise exception 'SICHERUNG_UNGUELTIG';
        end if;
        v_werte := (select coalesce(jsonb_agg(coalesce(v_optionen -> (e #>> '{}'), 'null'::jsonb)), '[]'::jsonb)
                    from jsonb_array_elements(v_werte) e);
      end if;
      insert into urlaub.bedingungen (frage_id, quelle_id, operator, werte, aktiv)
      values (v_frage.id, v_quelle, v_b ->> 'operator',
              urlaub.bedingung_werte(v_frage, v_quelle, v_b ->> 'operator', v_werte),
              coalesce((v_b ->> 'aktiv')::boolean, true));
    end loop;
  end loop;

  insert into urlaub.freie_tage (umfrage_id, datum, name)
  select v_id, (t ->> 'datum')::date, btrim(t ->> 'name')
  from jsonb_array_elements(coalesce(p_daten -> 'freie_tage', '[]')) t;

  -- Mitarbeiter, Abgaben, Antworten
  for v_m in select value from jsonb_array_elements(coalesce(p_daten -> 'mitarbeiter', '[]')) loop
    v_code := v_m ->> 'code';
    if v_code is null or v_code !~ '^[0-9a-f]{32}$' or exists (select 1 from urlaub.mitarbeiter where code = v_code) then
      v_code := replace(gen_random_uuid()::text, '-', '');
      v_neue_links := v_neue_links + 1;
    end if;
    insert into urlaub.mitarbeiter (umfrage_id, name, code) values (v_id, btrim(v_m ->> 'name'), v_code)
    returning id into v_mid;
    if (v_m ->> 'geaendert_am') is not null then
      insert into urlaub.abgaben (mitarbeiter_id, geaendert_am) values (v_mid, (v_m ->> 'geaendert_am')::timestamptz);
    end if;
    for v_schluessel, v_wert in select key, value from jsonb_each(coalesce(v_m -> 'antworten', '{}')) loop
      select * into v_frage from urlaub.fragen where id = (v_fragen ->> v_schluessel)::bigint and umfrage_id = v_id;
      if not found then
        raise exception 'SICHERUNG_UNGUELTIG';
      end if;
      if v_frage.typ = 'einfach' and jsonb_typeof(v_wert) = 'number' then
        v_wert := coalesce(v_optionen -> (v_wert #>> '{}'), 'null'::jsonb);
      elsif v_frage.typ = 'mehrfach' and jsonb_typeof(v_wert) = 'array' then
        v_wert := (select coalesce(jsonb_agg(coalesce(v_optionen -> (e #>> '{}'), 'null'::jsonb)), '[]'::jsonb)
                   from jsonb_array_elements(v_wert) e);
      end if;
      if not urlaub.antwort_form_ok(v_frage, v_wert) then
        raise exception 'SICHERUNG_UNGUELTIG';
      end if;
      v_wert := urlaub.antwort_normalisiert(v_frage, v_wert);
      insert into urlaub.antworten (mitarbeiter_id, frage_id, wert) values (v_mid, v_frage.id, v_wert);
      if v_frage.typ = 'einfach' then
        insert into urlaub.antwort_optionen (mitarbeiter_id, frage_id, option_id)
        values (v_mid, v_frage.id, (v_wert #>> '{}')::bigint);
      elsif v_frage.typ = 'mehrfach' then
        insert into urlaub.antwort_optionen (mitarbeiter_id, frage_id, option_id)
        select v_mid, v_frage.id, (e #>> '{}')::bigint from jsonb_array_elements(v_wert) e;
      end if;
    end loop;
  end loop;
  return jsonb_build_object('id', v_id, 'neue_links', v_neue_links);
end;
$$;

-- Kopie mit allen Fragen, Optionen, Regeln, Bedingungen (Schalter wie im Original) und
-- freien Tagen; ohne Mitarbeiter und Antworten. Derselbe Weg wie beim Einspielen einer Sicherung.
create or replace function public.org_umfrage_kopieren(p_umfrage_id bigint)
returns bigint
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_u urlaub.umfragen := urlaub.eigene_umfrage(p_umfrage_id);
begin
  return (urlaub.umfrage_aus_json(v_u.organisator_id, urlaub.umfrage_json(v_u.id, false),
                                  'Kopie von ' || v_u.titel) ->> 'id')::bigint;
end;
$$;

create or replace function public.org_sicherung(p_umfrage_id bigint)
returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  v_u urlaub.umfragen := urlaub.eigene_umfrage(p_umfrage_id);
begin
  return urlaub.umfrage_json(v_u.id, true);
end;
$$;

-- Jeder Fehler in den Daten wird SICHERUNG_UNGUELTIG; es bleibt nichts zurück.
-- Die Anmeldeprüfung (declare-Block) liegt außerhalb, damit KEIN_ZUGRIFF erhalten bleibt.
create or replace function public.org_sicherung_einspielen(p_daten jsonb)
returns jsonb
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (urlaub.ich()).user_id;
begin
  begin
    return urlaub.umfrage_aus_json(v_uid, p_daten, null);
  exception when others then
    raise exception 'SICHERUNG_UNGUELTIG';
  end;
end;
$$;

revoke all on function public.org_sicherung(bigint)            from public, anon, authenticated;
revoke all on function public.org_sicherung_einspielen(jsonb)  from public, anon, authenticated;
grant execute on function public.org_sicherung(bigint)           to authenticated;
grant execute on function public.org_sicherung_einspielen(jsonb) to authenticated;
```

  Die bestehenden `revoke`/`grant`-Zeilen für `org_umfrage_kopieren(bigint)` im Block darunter bleiben.

- [ ] **Step 6: Tests** – `npm test` → alles grün, insbesondere der bestehende Test
  „Kopieren: Struktur mit neuen IDs, ohne Mitarbeiter“ in `tests/editor.test.mjs` (unverändert!).

- [ ] **Step 7: Commit**

```bash
git add supabase/schema.sql tests/sicherung.test.mjs
git commit -m "Sicherung herunterladen und einspielen; Kopieren nutzt denselben Weg"
```

---

### Task 5: Reine Hilfslogik der Verwaltung

**Files:**
- Create: `docs/verwaltung-logik.js`
- Create: `tests/verwaltung-logik.test.mjs`

**Interfaces:**
- Consumes: `zeitpunkt(iso)` aus `docs/logik.js` (liefert z. B. „30.11.2026, 23:59 Uhr“).
- Produces: `VORLAGEN`, `vorlagenTitel(name, jahr, heute?)`, `namenAusText(text)`,
  `erinnerungsText(name, titel, frist, link)`, `offenListeText(namen, titel, frist)`, `wachStatus(zeit, jetzt?)`.

- [ ] **Step 1: Test schreiben** – `tests/verwaltung-logik.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  VORLAGEN, vorlagenTitel, namenAusText, erinnerungsText, offenListeText, wachStatus,
} from '../docs/verwaltung-logik.js';
import { zeitpunkt } from '../docs/logik.js';

test('Vorlagen in fester Reihenfolge; nur „urlaub“ braucht Jahr und Bundesland', () => {
  assert.deepEqual(VORLAGEN.map((v) => v.name), ['urlaub', 'leer', 'schicht', 'feier']);
  assert.deepEqual(VORLAGEN.map((v) => v.titel), ['Urlaubswünsche', 'Leer', 'Schicht- und Verfügbarkeitswünsche', 'Weihnachtsfeier']);
  assert.deepEqual(VORLAGEN.filter((v) => v.mitJahr).map((v) => v.name), ['urlaub']);
});

test('Titelvorschlag je Vorlage', () => {
  const heute = new Date('2026-10-05T12:00:00Z');
  assert.equal(vorlagenTitel('urlaub', 2027, heute), 'Urlaubswünsche 2027');
  assert.equal(vorlagenTitel('leer', 2027, heute), 'Neue Umfrage');
  assert.equal(vorlagenTitel('schicht', 2027, heute), 'Schicht- und Verfügbarkeitswünsche');
  assert.equal(vorlagenTitel('feier', 2027, heute), 'Weihnachtsfeier 2026');
});

test('Namen aus eingefügtem Text (z. B. aus Excel)', () => {
  assert.deepEqual(namenAusText('  Anna Huber\r\n\r\nBen Maier\t\n   \nCem'), ['Anna Huber', 'Ben Maier', 'Cem']);
  assert.deepEqual(namenAusText(''), []);
  assert.deepEqual(namenAusText(null), []);
});

test('Erinnerung und Liste „noch offen“', () => {
  const frist = '2026-11-30T22:59:00Z';
  assert.equal(erinnerungsText('Anna', 'Urlaub 2027', frist, 'https://x/#abc'),
    `Hallo Anna, kurze Erinnerung: Bitte trag deine Antworten für „Urlaub 2027“ bis ${zeitpunkt(frist)} ein. `
    + 'Dein persönlicher Link (bitte nicht weitergeben):\nhttps://x/#abc');
  assert.equal(offenListeText(['Anna', 'Ben'], 'Urlaub 2027', frist),
    `Noch nicht abgegeben – „Urlaub 2027“ (Frist ${zeitpunkt(frist)}):\nAnna\nBen`);
});

test('Wach-Status: zuletzt, veraltet ab 3 Tagen, noch nie', () => {
  const jetzt = new Date('2026-10-10T12:00:00Z');
  assert.deepEqual(wachStatus('2026-10-10T03:17:00Z', jetzt),
    { warnung: false, text: `Wach-Automatik: zuletzt ${zeitpunkt('2026-10-10T03:17:00Z')}` });
  assert.equal(wachStatus('2026-10-07T13:00:00Z', jetzt).warnung, false);
  const alt = wachStatus('2026-10-07T12:00:00Z', jetzt);
  assert.equal(alt.warnung, true);
  assert.match(alt.text, /seit 3 Tagen/);
  const nie = wachStatus(null, jetzt);
  assert.equal(nie.warnung, true);
  assert.match(nie.text, /noch nicht gemeldet/);
});
```

- [ ] **Step 2: Test laufen lassen** → FAIL (Modul fehlt).

- [ ] **Step 3: Modul** – `docs/verwaltung-logik.js`:

```js
// Reine Hilfslogik der Verwaltung (ohne DOM): Vorlagen, Namenslisten, Erinnerungstexte,
// Wach-Status. Die Vorlagen-Namen spiegeln urlaub.vorlage_anwenden in supabase/schema.sql.
import { zeitpunkt } from './logik.js';

export const VORLAGEN = [
  { name: 'urlaub', titel: 'Urlaubswünsche', mitJahr: true },
  { name: 'leer', titel: 'Leer', mitJahr: false },
  { name: 'schicht', titel: 'Schicht- und Verfügbarkeitswünsche', mitJahr: false },
  { name: 'feier', titel: 'Weihnachtsfeier', mitJahr: false },
];

// Titel, wenn das Feld leer bleibt.
export function vorlagenTitel(name, jahr, heute = new Date()) {
  if (name === 'urlaub') return `Urlaubswünsche ${jahr}`;
  if (name === 'schicht') return 'Schicht- und Verfügbarkeitswünsche';
  if (name === 'feier') return `Weihnachtsfeier ${heute.getFullYear()}`;
  return 'Neue Umfrage';
}

// Ein Name pro Zeile; Leerraum an den Enden und leere Zeilen fallen weg.
export function namenAusText(text) {
  return String(text ?? '').split(/\r?\n/).map((z) => z.trim()).filter(Boolean);
}

export function erinnerungsText(name, titel, frist, link) {
  return `Hallo ${name}, kurze Erinnerung: Bitte trag deine Antworten für „${titel}“ bis ${zeitpunkt(frist)} ein. `
    + `Dein persönlicher Link (bitte nicht weitergeben):\n${link}`;
}

// Nur Namen, ohne Links – zum Posten in eine Gruppe.
export function offenListeText(namen, titel, frist) {
  return `Noch nicht abgegeben – „${titel}“ (Frist ${zeitpunkt(frist)}):\n${namen.join('\n')}`;
}

const TAG = 24 * 60 * 60 * 1000;
const PAUSE = 'Supabase pausiert die Datenbank nach etwa 7 Tagen ohne Nutzung – siehe Anleitung, Abschnitt „Probleme“.';

// Lebenszeichen der Wach-Automatik (null = noch nie). Ab 3 Tagen ohne Lebenszeichen: Warnung.
export function wachStatus(zeit, jetzt = new Date()) {
  if (!zeit) return { warnung: true, text: `⚠ Die Wach-Automatik hat sich noch nicht gemeldet. ${PAUSE}` };
  const tage = Math.floor((jetzt - new Date(zeit)) / TAG);
  if (tage >= 3) {
    return { warnung: true, text: `⚠ Die Wach-Automatik hat sich seit ${tage} Tagen nicht gemeldet. ${PAUSE}` };
  }
  return { warnung: false, text: `Wach-Automatik: zuletzt ${zeitpunkt(zeit)}` };
}
```

- [ ] **Step 4: Tests** – `npm test` → grün.

- [ ] **Step 5: Commit**

```bash
git add docs/verwaltung-logik.js tests/verwaltung-logik.test.mjs
git commit -m "Verwaltung: reine Hilfslogik für Vorlagen, Namenslisten, Erinnerungen und Wach-Status"
```

---

### Task 6: Oberfläche der Verwaltung

**Files:**
- Modify: `docs/admin.html`, `docs/admin.js`, `docs/admin-umfrage.js`, `docs/admin-hilfe.js`, `docs/style.css`

**Interfaces:**
- Consumes: Task 1–5 (`org_lebenszeichen`, `org_umfrage_anlegen` mit 4 Parametern,
  `org_mitarbeiter_anlegen_liste`, `org_sicherung`, `org_sicherung_einspielen`, `docs/verwaltung-logik.js`).

- [ ] **Step 1: `docs/admin-hilfe.js`**
  - `FEHLER` ergänzen bzw. ändern:

```js
  NAME_DOPPELT: 'Diesen Namen gibt es schon (in der Umfrage oder doppelt in deiner Liste). Bitte unterscheide ihn, z. B. „Anna K.“ und „Anna M.“.',
  ZU_VIELE_NAMEN: 'Höchstens 200 Namen auf einmal.',
  SICHERUNG_UNGUELTIG: 'Die Datei ist keine gültige Sicherung oder wurde verändert. Es wurde nichts angelegt.',
```

  - `whatsappLink` bekommt eine Beschriftung:

```js
export function whatsappLink(text, beschriftung = 'WhatsApp') {
  const a = element('a', 'knopf-link', beschriftung);
```

  - neue Funktion (am Ende der Datei):

```js
export function herunterladen(blob, dateiname) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = dateiname;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}
```

- [ ] **Step 2: `docs/admin.html`**
  - Am Anfang von `<section id="ansicht-liste" hidden>` (vor dem Formular): `<p id="wach-status" hidden></p>`
  - Das Formular `neu-umfrage-form` ersetzen durch:

```html
      <form id="neu-umfrage-form" class="box formular-box" novalidate>
        <h2>Neue Umfrage</h2>
        <label class="feld">Vorlage
          <select id="neu-vorlage"></select>
        </label>
        <label class="feld">Titel
          <input id="neu-titel" type="text" autocomplete="off">
        </label>
        <div id="neu-urlaub-felder" class="felder-gruppe">
          <label class="feld">Jahr
            <select id="neu-jahr"></select>
          </label>
          <label class="feld">Bundesland (für die Feiertage)
            <select id="neu-land"></select>
          </label>
        </div>
        <button type="submit">Umfrage anlegen</button>
      </form>
```

  - Nach `<ul id="umfragen" class="karten"></ul>`:

```html
      <div class="box formular-box">
        <h2>Sicherung einspielen</h2>
        <p class="klein">Legt aus einer Sicherungsdatei eine neue Umfrage an – mit Fragen, Mitarbeitern und Antworten. Die bisherigen Mitarbeiter-Links funktionieren wieder, wenn die ursprüngliche Umfrage gelöscht ist; sonst bekommen die Mitarbeiter neue Links.</p>
        <label class="feld">Sicherungsdatei (.json)
          <input id="sicherung-datei" type="file" accept=".json,application/json">
        </label>
        <button type="button" id="sicherung-einspielen">Einspielen</button>
      </div>
```

  - Im Reiter `reiter-personen` das Formular `neu-form` und den Hinweis ersetzen durch:

```html
        <form id="neu-form" class="box formular-box" novalidate>
          <label class="feld">Neue Mitarbeiter (ein Name pro Zeile)
            <textarea id="neu-namen" rows="4" placeholder="Anna Huber&#10;Ben Maier" autocomplete="off"></textarea>
          </label>
          <button type="submit">Anlegen</button>
        </form>
        <p class="klein">Jeder Link ist persönlich. „WhatsApp“ öffnet WhatsApp mit dem Link, „Erinnern“ mit einer Erinnerung samt Frist – du wählst dort nur noch den Empfänger.</p>
        <div id="offen-aktionen" class="karte-aktionen"></div>
```

  - Im Reiter `reiter-einstellungen` vor dem Block „Umfrage kopieren“:

```html
        <div class="box formular-box">
          <h2>Sicherung</h2>
          <p class="klein">Speichert die ganze Umfrage – Fragen, Mitarbeiter mit ihren persönlichen Links und alle Antworten – als Datei. Einspielen unter „Meine Umfragen“. Die Datei enthält die persönlichen Links: sicher aufbewahren und nicht weitergeben.</p>
          <button type="button" id="sicherung-herunterladen" class="zweitrangig">Sicherung herunterladen</button>
        </div>
```

- [ ] **Step 3: `docs/style.css`** – ans Ende anhängen:

```css
/* Verwaltung: Feldgruppe im Formular „Neue Umfrage“, Wach-Status */
.felder-gruppe { display: grid; gap: 14px; }
#wach-status { margin: 0 0 12px; }
#offen-aktionen { margin: 0 0 12px; }
```

- [ ] **Step 4: `docs/admin.js`**
  - Import ergänzen: `import { VORLAGEN, vorlagenTitel, wachStatus } from './verwaltung-logik.js';`
  - In `zeigeListe()` nach dem erfolgreichen Laden der Umfragen (direkt nach dem `try/catch` um `org_umfragen`):

```js
  // Lebenszeichen der Wach-Automatik; ein Fehler hier blendet nur die Zeile aus.
  aufruf('org_lebenszeichen').then(zeigeWachStatus, () => { $('wach-status').hidden = true; });
```

  - Neue Funktionen (im Abschnitt „Umfrageliste“):

```js
function zeigeWachStatus(zeit) {
  const s = wachStatus(zeit);
  const p = $('wach-status');
  p.className = s.warnung ? 'karte-warnung' : 'klein';
  p.textContent = s.text;
  p.hidden = false;
}

function vorlageGeaendert() {
  const vorlage = $('neu-vorlage').value;
  $('neu-urlaub-felder').hidden = !VORLAGEN.find((v) => v.name === vorlage)?.mitJahr;
  $('neu-titel').placeholder = vorlagenTitel(vorlage, Number($('neu-jahr').value));
}

const MAX_SICHERUNG = 5 * 1024 * 1024;

async function sicherungEinspielen() {
  meldung('');
  const datei = $('sicherung-datei').files[0];
  if (!datei) return meldung('Bitte zuerst eine Sicherungsdatei auswählen.');
  if (datei.size > MAX_SICHERUNG) return meldung('Die Datei ist zu groß für eine Sicherung (höchstens 5 MB).');
  let daten;
  try {
    daten = JSON.parse(await datei.text());
  } catch {
    return meldung(fehlerText('SICHERUNG_UNGUELTIG'));
  }
  if (!window.confirm('Aus dieser Sicherung eine neue Umfrage anlegen?')) return;
  const knopfEinspielen = $('sicherung-einspielen');
  knopfEinspielen.disabled = true;
  let r;
  try {
    r = await aufruf('org_sicherung_einspielen', { p_daten: daten });
  } catch (fehler) {
    fehlerAnzeigen(fehler);
    return;
  } finally {
    knopfEinspielen.disabled = false;
  }
  $('sicherung-datei').value = '';
  await oeffneUmfrage(r.id);
  meldung(r.neue_links
    ? `Sicherung eingespielt. ${r.neue_links} Mitarbeiter haben einen neuen Link bekommen, weil ihr alter Link noch zu einer bestehenden Umfrage gehört – bitte neu verschicken.`
    : 'Sicherung eingespielt.');
}
```

  - `umfrageAnlegen` ersetzen:

```js
async function umfrageAnlegen(ereignis) {
  ereignis.preventDefault();
  meldung('');
  const vorlage = $('neu-vorlage').value;
  const mitJahr = Boolean(VORLAGEN.find((v) => v.name === vorlage)?.mitJahr);
  const jahr = Number($('neu-jahr').value);
  try {
    const id = await aufruf('org_umfrage_anlegen', {
      p_titel: $('neu-titel').value.trim() || vorlagenTitel(vorlage, jahr),
      p_vorlage: vorlage,
      p_jahr: mitJahr ? jahr : null,
      p_bundesland: mitJahr ? $('neu-land').value : null,
    });
    $('neu-titel').value = '';
    await oeffneUmfrage(id);
  } catch (fehler) {
    fehlerAnzeigen(fehler);
  }
}
```

  - In `start()` die vier Zeilen zum Titel-Platzhalter (`$('neu-jahr').addEventListener('change', …)` und
    `$('neu-titel').placeholder = …`) ersetzen durch:

```js
  $('neu-vorlage').replaceChildren(...VORLAGEN.map((v) => {
    const o = element('option', null, v.titel);
    o.value = v.name;
    return o;
  }));
  $('neu-vorlage').addEventListener('change', vorlageGeaendert);
  $('neu-jahr').addEventListener('change', vorlageGeaendert);
  vorlageGeaendert();
```

    und bei den übrigen Listenern ergänzen: `$('sicherung-einspielen').addEventListener('click', sicherungEinspielen);`

- [ ] **Step 5: `docs/admin-umfrage.js`**
  - Imports: aus `./admin-hilfe.js` zusätzlich `fehlerText, herunterladen`; neu
    `import { namenAusText, erinnerungsText, offenListeText } from './verwaltung-logik.js';`
  - In `initUmfrage`: `$('sicherung-herunterladen').addEventListener('click', sicherungHerunterladen);`
  - In `zeigeUmfrage` zusätzlich leeren: `$('offen-aktionen').replaceChildren();`
  - `zeichnePersonen` ersetzen:

```js
function zeichnePersonen(personen) {
  const e = daten.einstellungen;
  const offen = personen.filter((p) => !p.abgegeben);
  const offenAktionen = $('offen-aktionen');
  offenAktionen.replaceChildren();
  if (e.offen && offen.length) {
    const listeKnopf = knopf(`Liste „noch offen“ kopieren (${offen.length})`, 'zweitrangig klein-knopf',
      () => kopieren(offenListeText(offen.map((p) => p.name), e.titel, e.frist), listeKnopf));
    offenAktionen.append(listeKnopf);
  }
  const liste = $('personen');
  liste.replaceChildren();
  if (!personen.length) liste.append(element('li', 'klein', 'Noch keine Mitarbeiter angelegt.'));
  for (const p of personen) {
    const karte = element('li', 'karte');
    karte.append(element('p', 'karte-name', p.name));
    karte.append(element('p', p.abgegeben ? 'karte-status ok' : 'karte-status offen',
      p.abgegeben ? `Abgegeben, Stand ${p.stand}` : 'Noch nicht abgegeben'));
    for (const h of p.hinweise) karte.append(element('p', 'karte-warnung', `⚠ ${h}`));
    const aktionen = element('div', 'karte-aktionen');
    const kopierKnopf = knopf('Link kopieren', 'zweitrangig klein-knopf', () => kopieren(p.link, kopierKnopf));
    aktionen.append(
      kopierKnopf,
      whatsappLink(`Hallo ${p.name}, hier ist dein persönlicher Link für „${e.titel}“. `
        + `Bitte nicht weitergeben – über diesen Link kann man deine Wünsche ändern:\n${p.link}`),
    );
    if (!p.abgegeben && e.offen) aktionen.append(whatsappLink(erinnerungsText(p.name, e.titel, e.frist, p.link), 'Erinnern'));
    aktionen.append(
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
```

  - `mitarbeiterAnlegen` ersetzen:

```js
async function mitarbeiterAnlegen(ereignis) {
  ereignis.preventDefault();
  const feld = $('neu-namen');
  const namen = namenAusText(feld.value);
  meldung('');
  if (!namen.length) {
    meldung(fehlerText('NAME_LEER'));
    feld.focus();
    return;
  }
  try {
    const anzahl = await ctx.aufruf('org_mitarbeiter_anlegen_liste', { p_umfrage_id: umfrageId, p_namen: namen });
    feld.value = '';
    await laden();
    meldung(anzahl === 1 ? '1 Mitarbeiter angelegt.' : `${anzahl} Mitarbeiter angelegt.`);
  } catch (fehler) {
    if (fehler.message === 'NAME_DOPPELT' && fehler.details) meldung(`„${fehler.details}“: ${fehlerText('NAME_DOPPELT')}`);
    else ctx.fehlerAnzeigen(fehler);
  }
  feld.focus();
}
```

  - Dateinamen und Downloads – `excelHerunterladen` ersetzen und Sicherung ergänzen:

```js
// Dateiname aus Titel und heutigem Datum (deutsche Zeit).
function dateiBasis() {
  const heute = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date());
  const name = daten.einstellungen.titel.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'Umfrage';
  return { name, heute };
}

function excelHerunterladen() {
  if (!datenPasst()) return;
  const { name, heute } = dateiBasis();
  herunterladen(new Blob([erzeugeXlsx(excelBlaetter(daten))],
    { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${name}_Stand-${heute}.xlsx`);
}

async function sicherungHerunterladen() {
  if (!datenPasst()) return;
  meldung('');
  const { name, heute } = dateiBasis();
  try {
    const s = await ctx.aufruf('org_sicherung', { p_umfrage_id: umfrageId });
    herunterladen(new Blob([JSON.stringify(s, null, 2)], { type: 'application/json' }), `${name}_Sicherung-${heute}.json`);
  } catch (fehler) {
    ctx.fehlerAnzeigen(fehler);
  }
}
```

- [ ] **Step 6: Prüfen** – `node --check` für jede geänderte JS-Datei; `npm test` grün;
  ID-Abgleich: jede `$('…')`-ID in `admin.js`/`admin-umfrage.js` existiert in `admin.html` und umgekehrt
  sind alle neuen IDs verwendet (`grep -o "\$('[a-z-]*')" docs/admin*.js | sort -u` gegen `grep -o 'id="[a-z-]*"' docs/admin.html`).
  `neu-name` darf nirgends mehr vorkommen.

- [ ] **Step 7: Commit**

```bash
git add docs/admin.html docs/admin.js docs/admin-umfrage.js docs/admin-hilfe.js docs/style.css
git commit -m "Verwaltung: Vorlagen-Auswahl, Mitarbeiter als Liste, Erinnern, Sicherung, Wach-Status"
```

---

### Task 7: Anleitung und README

**Files:**
- Modify: `ANLEITUNG.md`, `README.md`

- [ ] **Step 1: `ANLEITUNG.md`**
  - Neuer Abschnitt direkt vor „## Teil A“: **„## Update Oktober 2026 – Vorlagen, Sicherung, Wach-Automatik“**
    mit genau diesen Schritten: (1) `supabase/schema.sql` im SQL Editor komplett ausführen → „Success“;
    (2) erst danach wird die neue Seite veröffentlicht (die alte Seite läuft mit dem neuen SQL weiter, die
    neue braucht es); (3) GitHub → Repo → **Actions**: falls GitHub fragt, Workflows aktivieren; Workflow
    „Datenbank wachhalten“ → **Run workflow** einmal von Hand starten → grüner Haken; danach zeigt die
    Verwaltung „Wach-Automatik: zuletzt …“.
  - „### Umfrage anlegen“: Vorlage wählen (Urlaubswünsche, Leer, Schicht- und Verfügbarkeitswünsche,
    Weihnachtsfeier); Jahr und Bundesland nur bei Urlaubswünsche; Frist sonst heute + 14 Tage (unter
    Einstellungen änderbar); bei der Weihnachtsfeier die Termine im Reiter „Fragen“ eintragen
    („Termin 1–3“ ersetzen); Hinweis, dass Antworten nicht anonym sind und deshalb bewusst keine Frage
    nach Allergien enthalten ist.
  - „### Mitarbeiter anlegen und Links verschicken“: Namen untereinander einfügen (z. B. aus Excel kopiert),
    ganz oder gar nicht, höchstens 200; **Erinnern** bei allen ohne Abgabe; **Liste „noch offen“ kopieren**
    (nur Namen, für Gruppen-Chats). Beides nur, solange die Frist läuft.
  - Neuer Abschnitt „### Sicherung“: herunterladen (Einstellungen), was drin ist, Datei enthält die
    persönlichen Links → sicher aufbewahren; einspielen (Meine Umfragen); alte Links gehen wieder, wenn das
    Original gelöscht ist, sonst neue Links; empfohlen: nach Ablauf der Frist einmal sichern.
  - Neuer Abschnitt „### Wach-Automatik“: was sie tut (täglich 05:17 Uhr Sommerzeit / 04:17 Uhr Winterzeit
    ein Lebenszeichen), wo man den Status sieht, dass GitHub bei Fehlschlag eine E-Mail schickt, dass GitHub
    Zeitpläne nach 60 Tagen ohne Änderung am Repo abschalten kann.
  - Tabelle „Probleme“ um zwei Zeilen ergänzen: „⚠ Wach-Automatik hat sich nicht gemeldet“ → GitHub →
    Actions → „Datenbank wachhalten“ → ggf. **Enable workflow**, dann **Run workflow**; ist die Datenbank
    schon pausiert: Supabase → **Restore project**. Und: „Einspielen meldet ‚keine gültige Sicherung‘“ →
    Datei unverändert lassen (nicht in Excel/Editor speichern), ggf. neu herunterladen.
  - „Datenschutz und Sicherheit in Kürze“: Sicherungsdatei enthält Namen, Antworten und die persönlichen
    Links; sie liegt nur dort, wo der Organisator sie speichert.
- [ ] **Step 2: `README.md`** – Einleitung um Vorlagen und Sicherung ergänzen; Tabelle „Aufbau“ um
  `.github/workflows/wachhalten.yml` (täglicher Aufruf von `public.lebenszeichen`) ergänzen; in der
  Funktionsliste `lebenszeichen` bei „ohne Anmeldung“ nennen.
- [ ] **Step 3: Commit**

```bash
git add ANLEITUNG.md README.md
git commit -m "Anleitung und README: Vorlagen, Mitarbeiter-Liste, Erinnern, Sicherung, Wach-Automatik"
```
