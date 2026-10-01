// Testet die Admin-Funktionen aus supabase/schema.sql. auth.uid() wird wie in
// Supabase aus den JWT-Angaben der Anfrage gelesen (request.jwt.claims).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const SCHEMA = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
const ADMIN = '11111111-1111-1111-1111-111111111111';
const FREMD = '22222222-2222-2222-2222-222222222222';

let db;

before(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
    create schema auth;
    grant usage on schema auth to anon, authenticated;
    create or replace function auth.uid() returns uuid language sql stable as $$
      select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
    $$;
  `);
  await db.exec(SCHEMA);
  await db.exec(SCHEMA);
  await db.query('insert into urlaub.admins (user_id, notiz) values ($1, $2)', [ADMIN, 'aw']);
});

// Führt SQL als Rolle mit optionaler Nutzer-ID aus, wie PostgREST es tut.
async function als(rolle, nutzer, sql, params = []) {
  await db.exec(`set role ${rolle}`);
  await db.query("select set_config('request.jwt.claims', $1, false)",
    [nutzer ? JSON.stringify({ sub: nutzer, role: rolle }) : '']);
  try {
    return (await db.query(sql, params)).rows;
  } finally {
    await db.exec('reset role');
  }
}
const admin = (sql, params) => als('authenticated', ADMIN, sql, params);
const uebersicht = async () => (await admin('select public.admin_uebersicht() as r'))[0].r;

test('Admin sieht Einstellungen, Mitarbeiter und Kalender', async () => {
  await admin('select public.admin_mitarbeiter_anlegen($1)', ['  Zoe  ']);
  await admin('select public.admin_mitarbeiter_anlegen($1)', ['Anna']);
  const r = await uebersicht();
  assert.deepEqual(r.mitarbeiter.map((m) => m.name), ['Anna', 'Zoe']);
  assert.match(r.mitarbeiter[0].link, /^https:\/\/dangtu1190-tech\.github\.io\/Urlaub\/#[0-9a-f]{32}$/);
  assert.deepEqual(r.mitarbeiter[0].wochen, []);
  assert.equal(r.mitarbeiter[0].urlaubstage, 0);
  assert.equal(r.kalender.length, 47);
  assert.equal(r.einstellungen.max_wochen, 6);
});

test('Abgaben erscheinen in der Übersicht mit Urlaubstagen', async () => {
  await db.exec("update urlaub.einstellungen set frist = now() + interval '1 day'");
  const code = (await db.query("select code from urlaub.mitarbeiter where name = 'Anna'")).rows[0].code;
  await als('anon', null, 'select public.urlaub_speichern($1, $2::int[])', [code, [1, 30]]);
  const anna = (await uebersicht()).mitarbeiter.find((m) => m.name === 'Anna');
  assert.deepEqual(anna.wochen, [1, 30]);
  assert.equal(anna.urlaubstage, 11);
  assert.ok(anna.geaendert_am);
});

test('Doppelter oder leerer Name wird abgelehnt', async () => {
  await assert.rejects(admin('select public.admin_mitarbeiter_anlegen($1)', ['anna']), /NAME_DOPPELT/);
  await assert.rejects(admin('select public.admin_mitarbeiter_anlegen($1)', ['   ']), /NAME_LEER/);
  await assert.rejects(admin('select public.admin_mitarbeiter_anlegen($1)', [null]), /NAME_LEER/);
});

test('Link erneuern: alter Code ungültig, Abgabe bleibt', async () => {
  const vorher = (await db.query("select id, code from urlaub.mitarbeiter where name = 'Anna'")).rows[0];
  await admin('select public.admin_link_erneuern($1)', [vorher.id]);
  const nachher = (await db.query('select code from urlaub.mitarbeiter where id = $1', [vorher.id])).rows[0].code;
  assert.notEqual(nachher, vorher.code);
  assert.match(nachher, /^[0-9a-f]{32}$/);
  await assert.rejects(als('anon', null, 'select public.urlaub_laden($1)', [vorher.code]), /LINK_UNGUELTIG/);
  const r = await als('anon', null, 'select public.urlaub_laden($1) as r', [nachher]);
  assert.deepEqual(r[0].r.wochen, [1, 30]);
});

test('Einstellungen speichern: Frist wird als deutsche Zeit gelesen', async () => {
  await admin('select public.admin_einstellungen_speichern($1, $2)', ['2026-12-15T18:00', ' Inventur im Dezember. ']);
  const e = (await uebersicht()).einstellungen;
  assert.equal(e.frist_eingabe, '2026-12-15T18:00');
  assert.equal(e.dezember_hinweis, 'Inventur im Dezember.');
  const utc = (await db.query("select to_char(frist at time zone 'UTC', 'YYYY-MM-DD HH24:MI') as t from urlaub.einstellungen")).rows[0].t;
  assert.equal(utc, '2026-12-15 17:00');
  await assert.rejects(admin('select public.admin_einstellungen_speichern($1, $2)', ['2026-12-15T18:00', '']), /HINWEIS_LEER/);
  await assert.rejects(admin('select public.admin_einstellungen_speichern($1, $2)', ['', 'x']), /FRIST_LEER/);
  await assert.rejects(admin('select public.admin_einstellungen_speichern($1, $2)', [null, 'x']), /FRIST_LEER/);
  await assert.rejects(admin('select public.admin_einstellungen_speichern($1, $2)', ['kein Datum', 'x']));
});

test('Nur Hinweis ändern lässt die Frist sekundengenau unverändert', async () => {
  await db.exec("update urlaub.einstellungen set frist = '2026-11-30 23:59:59 Europe/Berlin'");
  await admin('select public.admin_einstellungen_speichern($1, $2)', ['2026-11-30T23:59', 'Neuer Hinweis']);
  const t = (await db.query("select to_char(frist at time zone 'Europe/Berlin', 'YYYY-MM-DD HH24:MI:SS') as t from urlaub.einstellungen")).rows[0].t;
  assert.equal(t, '2026-11-30 23:59:59');
});

test('Mitarbeiter löschen entfernt auch die Abgabe', async () => {
  const id = (await db.query("select id from urlaub.mitarbeiter where name = 'Anna'")).rows[0].id;
  await admin('select public.admin_mitarbeiter_loeschen($1)', [id]);
  assert.deepEqual((await uebersicht()).mitarbeiter.map((m) => m.name), ['Zoe']);
  const rest = (await db.query('select count(*)::int as n from urlaub.abgaben where mitarbeiter_id = $1', [id])).rows[0].n;
  assert.equal(rest, 0);
});

test('Angemeldeter Nutzer, der nicht auf der Admin-Liste steht, wird abgewiesen', async () => {
  for (const sql of ['select public.admin_uebersicht()',
                     "select public.admin_mitarbeiter_anlegen('Eve')",
                     'select public.admin_mitarbeiter_loeschen(1)',
                     'select public.admin_link_erneuern(1)',
                     "select public.admin_einstellungen_speichern('2030-01-01T00:00', 'x')"]) {
    await assert.rejects(als('authenticated', FREMD, sql), /KEIN_ADMIN/, sql);
    await assert.rejects(als('authenticated', null, sql), /KEIN_ADMIN/, sql);
  }
});

test('Browser-Schlüssel ohne Anmeldung darf keine Admin-Funktion aufrufen', async () => {
  for (const sql of ['select public.admin_uebersicht()',
                     "select public.admin_mitarbeiter_anlegen('Eve')",
                     'select public.admin_link_erneuern(1)']) {
    await assert.rejects(als('anon', null, sql), /permission denied/, sql);
  }
  // auch nicht mit gefälschter Nutzer-ID in den Angaben
  await assert.rejects(als('anon', ADMIN, 'select public.admin_uebersicht()'), /permission denied/);
});

test('Admin kann Tabellen nicht direkt lesen, nur über die Funktionen', async () => {
  await assert.rejects(admin('select * from urlaub.mitarbeiter'), /permission denied/);
  await assert.rejects(admin('select * from urlaub.admins'), /permission denied/);
  await assert.rejects(admin("insert into urlaub.admins (user_id) values ('33333333-3333-3333-3333-333333333333')"), /permission denied/);
});
