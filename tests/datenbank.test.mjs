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
