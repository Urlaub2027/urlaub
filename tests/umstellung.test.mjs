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
  await db.exec(`update urlaub.einstellungen set link_basis = 'https://beispiel.invalid/urlaub/',
                 urlaubstage = 30, max_wochen = 5, frist = '2026-11-30 23:59:59 Europe/Berlin',
                 dezember_hinweis = 'Inventur im Dezember.'`);
  await db.query("insert into urlaub.feiertage (datum, name) values ('2027-08-09', 'Betriebsruhe')");
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
  assert.equal(u[0].max_wochen, 5);
  assert.equal(u[0].max_am_stueck, 3);
  assert.equal(u[0].urlaubstage, 30);
  assert.deepEqual(u[0].gesperrte_monate, [12]);
  const frei = (await db.query('select datum::text as d, name from urlaub.freie_tage order by datum')).rows;
  assert.deepEqual(frei, [{ d: '2027-08-09', name: 'Betriebsruhe' }, { d: '2027-08-15', name: 'Mariä Himmelfahrt' }]);
  const link = (await db.query('select link_basis from urlaub.app')).rows[0].link_basis;
  assert.equal(link, 'https://beispiel.invalid/urlaub/');
});

test('Alte Links und Abgaben funktionieren weiter', async () => {
  const r = (await browser(db, 'select public.urlaub_laden($1) as r', [annaCode]))[0].r;
  assert.equal(r.name, 'Anna');
  assert.deepEqual(r.wochen, [12, 30]);
  assert.equal(r.titel, 'Urlaubswünsche 2027');
  assert.deepEqual(r.kalender.filter((k) => k.gesperrt).map((k) => k.kw), [48, 49, 50, 51, 52]);
  // urlaub.kalender zaehlt Feiertage des Nachbarjahres mit (Controller-Entscheidung); KW 32 wegen übernommenem Betriebsruhe-Tag
  assert.deepEqual(r.kalender.filter((k) => k.arbeitstage === 5).map((k) => k.kw), [1, 12, 13, 17, 18, 20, 21, 32, 44, 51, 52]);
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
  await leer.exec('rollback'); // PGlite lässt die Transaktion nach dem Fehler abgebrochen offen, daher hier ausdrücklich zurückrollen
  await nichtUmgestellt(leer);
});

async function nichtUmgestellt(d) {
  const e = (await d.query("select to_regclass('urlaub.einstellungen')::text as r")).rows[0].r;
  assert.notEqual(e, null);
  const c = (await d.query(`select count(*)::int as n from information_schema.columns
    where table_schema = 'urlaub' and table_name = 'mitarbeiter' and column_name = 'umfrage_id'`)).rows[0].n;
  assert.equal(c, 0);
}

test('Namen nur in Groß-/Kleinschreibung verschieden brechen ab', async () => {
  const d = await neueDatenbank({ schema: false });
  await d.exec(SCHEMA_V1);
  await d.query("insert into auth.users (id, email) values ($1, 'aw@example.com')", [AW]);
  await d.query("insert into urlaub.admins (user_id, notiz) values ($1, 'aw')", [AW]);
  await d.query("insert into urlaub.mitarbeiter (name) values ('Anna'), ('anna')");
  await assert.rejects(d.exec(SCHEMA), /UMSTELLUNG/);
  await d.exec('rollback');
  await nichtUmgestellt(d);
});
