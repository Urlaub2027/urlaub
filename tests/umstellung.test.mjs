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
