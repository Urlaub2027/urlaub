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
