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
  assert.deepEqual(k.filter((w) => w.arbeitstage === 5).map((w) => w.kw), [1, 12, 13, 17, 18, 20, 21, 44, 51]); // 51: Sa 25.12. zählt in der 6-Tage-Woche
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
