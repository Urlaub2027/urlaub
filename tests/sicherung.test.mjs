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
    'Abgabezeit unendlich': geaendert((d) => { anna(d).geaendert_am = 'infinity'; }),
    'Abgabezeit Zukunft': geaendert((d) => { anna(d).geaendert_am = '2999-01-01T00:00:00Z'; }),
    'Frist weit weg': { ...s, umfrage: { ...s.umfrage, frist: '280000-01-01T00:00:00Z' } },
    'Freier Tag unendlich': geaendert((d) => { d.freie_tage[0].datum = 'infinity'; }),
    'Freier Tag falsches Jahr': geaendert((d) => { d.freie_tage[0].datum = '2030-01-01'; }),
    'Fragetext nur Leerraum': geaendert((d) => { frage(d, 'janein').text = '\n '; }),
    'Name nur Leerraum': geaendert((d) => { d.mitarbeiter[1].name = ' '; }),
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

test('Widerrufene Links werden beim Einspielen nie wiederbelebt', async () => {
  const { bau, codes } = await reicheUmfrage();
  const s = await sicherung(bau.umfrageId);
  const annaId = (await db.query('select id from urlaub.mitarbeiter where code = $1', [codes.Anna])).rows[0].id;
  await c('select public.org_link_erneuern($1)', [annaId]);
  await c('select public.org_umfrage_loeschen($1)', [bau.umfrageId]);
  const r = await einspielen(s);
  assert.equal(r.neue_links, 1);
  await assert.rejects(browser(db, 'select public.urlaub_laden($1)', [codes.Anna]), /LINK_UNGUELTIG/);
  assert.equal((await browser(db, 'select public.urlaub_laden($1) as r', [codes.Ben]))[0].r.name, 'Ben');
});
