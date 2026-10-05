// Umstellung Stand 2 (eine Wochenauswahl pro Umfrage) → Stand 3 (Fragen-Baukasten).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { neueDatenbank, als, SCHEMA, SCHEMA_V2 } from './helfer.mjs';

const AW = '11111111-1111-1111-1111-111111111111';
const BB = '22222222-2222-2222-2222-222222222222';
let db;
let umfrage;
let umfrage2;
let benId;
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
  await db.query(`insert into urlaub.organisatoren (user_id, anzeigename, benutzername) values ($1, 'bb', 'bb')`, [BB]);
  umfrage2 = (await db.query(`insert into urlaub.umfragen
      (organisator_id, titel, jahr, bundesland, arbeitstage_pro_woche, urlaubstage, min_wochen, max_wochen,
       max_am_stueck, gesperrte_monate, sperr_hinweis, frist)
    values ($1, 'Team B 2028', 2028, 'BY', 6, 24, 1, 3, 3, '{1}', 'Januar zu.',
            '2027-11-30 23:59:59 Europe/Berlin') returning id`, [BB])).rows[0].id;
  benId = (await db.query("insert into urlaub.mitarbeiter (umfrage_id, name) values ($1, 'Ben B') returning id", [umfrage2])).rows[0].id;
  await db.query("insert into urlaub.abgaben (mitarbeiter_id, wochen) values ($1, '{5,6,7}')", [benId]);
  frist = (await db.query("select to_char(frist at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') as f from urlaub.umfragen where id = $1", [umfrage])).rows[0].f;
  await db.exec(SCHEMA);
  await db.exec(SCHEMA); // zweites Mal: darf nichts verdoppeln
});

test('Umfrage behält Titel, Frist und freie Tage; alte Spalten sind weg', async () => {
  const u = (await db.query("select titel, to_char(frist at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') as f from urlaub.umfragen where id = $1", [umfrage])).rows;
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
  assert.equal((await db.query('select count(*)::int as n from urlaub.fragen')).rows[0].n, 2);
  const f = (await db.query('select * from urlaub.fragen where umfrage_id = $1', [umfrage])).rows;
  assert.equal(f.length, 1);
  assert.equal(f[0].typ, 'urlaubswochen');
  assert.equal(f[0].position, 1);
  assert.equal(f[0].aktiv, true);
  assert.deepEqual([f[0].jahr, f[0].bundesland, f[0].arbeitstage_pro_woche, f[0].sperr_hinweis],
    [2027, 'HE', 5, 'Sommer und Dezember zu.']);
  const regeln = Object.fromEntries((await db.query('select art, wert, aktiv from urlaub.regeln where frage_id = $1 order by art', [f[0].id])).rows
    .map((r) => [r.art, [r.wert, r.aktiv]]));
  assert.deepEqual(regeln, {
    gesperrte_monate: [[7, 12], true],
    max_am_stueck: [2, true],
    max_urlaubstage: [30, true],
    max_wochen: [5, true],
    min_wochen: [2, true],
    pflicht: [null, true],
  });
  // Zweite Umfrage: eigene Frage mit eigenen Werten
  const f2 = (await db.query('select * from urlaub.fragen where umfrage_id = $1', [umfrage2])).rows;
  assert.equal(f2.length, 1);
  assert.deepEqual([f2[0].jahr, f2[0].bundesland, f2[0].arbeitstage_pro_woche, f2[0].sperr_hinweis],
    [2028, 'BY', 6, 'Januar zu.']);
  const regeln2 = Object.fromEntries((await db.query('select art, wert from urlaub.regeln where frage_id = $1', [f2[0].id]))
    .rows.map((r) => [r.art, r.wert]));
  assert.deepEqual(regeln2, { pflicht: null, min_wochen: 1, max_wochen: 3, max_am_stueck: 3, max_urlaubstage: 24, gesperrte_monate: [1] });
});

test('Abgabe wird Antwort der Urlaubswochen-Frage, Zeitstempel bleibt', async () => {
  const alle = (await db.query(`select a.mitarbeiter_id, a.wert, f.umfrage_id from urlaub.antworten a
    join urlaub.fragen f on f.id = a.frage_id order by a.mitarbeiter_id`)).rows;
  assert.equal(alle.length, 2);
  const b = alle.find((x) => Number(x.mitarbeiter_id) === Number(benId));
  assert.equal(Number(b.umfrage_id), Number(umfrage2));
  assert.deepEqual(b.wert, [5, 6, 7]);
  const a = alle.filter((x) => Number(x.mitarbeiter_id) === Number(annaId));
  assert.equal(a.length, 1);
  assert.equal(Number(a[0].umfrage_id), Number(umfrage));
  assert.equal(Number(a[0].mitarbeiter_id), Number(annaId));
  assert.deepEqual(a[0].wert, [12, 30]);
  const z = (await db.query("select to_char(geaendert_am at time zone 'UTC', 'YYYY-MM-DD HH24:MI') as z from urlaub.abgaben where mitarbeiter_id = $1", [annaId])).rows;
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

test('Übernommene Regeln bestehen die Prüfungen von org_regel_setzen (unverändert neu setzen)', async () => {
  for (const [nutzer, u] of [[AW, umfrage], [BB, umfrage2]]) {
    const regeln = (await db.query(`select r.frage_id, r.art, r.wert from urlaub.regeln r
      join urlaub.fragen f on f.id = r.frage_id where f.umfrage_id = $1 order by r.art`, [u])).rows;
    assert.equal(regeln.length, 6);
    for (const r of regeln) {
      await als(db, 'authenticated', nutzer, 'select public.org_regel_setzen($1, $2, $3, true)',
        [r.frage_id, r.art, JSON.stringify(r.wert)]);
    }
    const danach = (await db.query(`select r.art, r.wert, r.aktiv from urlaub.regeln r
      join urlaub.fragen f on f.id = r.frage_id where f.umfrage_id = $1 order by r.art`, [u])).rows;
    assert.deepEqual(danach, regeln.map((r) => ({ art: r.art, wert: r.wert, aktiv: true })));
  }
});
