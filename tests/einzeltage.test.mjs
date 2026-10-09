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
