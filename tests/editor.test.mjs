import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { neueDatenbank, als, browser, organisator } from './helfer.mjs';

let db;
let chef;
let eva;

before(async () => {
  db = await neueDatenbank();
  chef = await organisator(db, 'chef');
  eva = await organisator(db, 'eva');
});

const c = async (sql, params) => (await als(db, 'authenticated', chef, sql, params))[0];
const umfrage = async (id) => (await c('select public.org_umfrage($1) as r', [id])).r;
const neueUmfrage = async (titel = 'Test') => (await c("select public.org_umfrage_anlegen($1, 2027, 'BY') as id", [titel])).id;
const frage = async (u, typ) => (await c('select public.org_frage_anlegen($1, $2) as id', [u, typ])).id;
const speichern = (f, d) => c('select public.org_frage_speichern($1, $2)', [f, d]);
const regel = (f, art, wert, aktiv = true) => c('select public.org_regel_setzen($1, $2, $3, $4)', [f, art, JSON.stringify(wert), aktiv]);
const bedingung = async (f, q, op, werte) =>
  (await c('select public.org_bedingung_anlegen($1, $2, $3, $4) as id', [f, q, op, JSON.stringify(werte)])).id;
const fragenVon = async (u) => (await umfrage(u)).fragen;
const findeFrage = async (u, id) => (await fragenVon(u)).find((f) => f.id === Number(id));
async function mitarbeiterMitCode(u, name) {
  await c('select public.org_mitarbeiter_anlegen($1, $2)', [u, name]);
  return (await db.query('select code from urlaub.mitarbeiter where umfrage_id = $1 and name = $2', [u, name])).rows[0].code;
}
const absenden = (code, antworten) => browser(db, 'select public.umfrage_absenden($1, $2)', [code, JSON.stringify(antworten)]);

test('Frage anlegen: Vorgaben je Typ und Reihenfolge', async () => {
  const u = await neueUmfrage();
  const ids = {};
  for (const typ of ['einfach', 'mehrfach', 'janein', 'skala', 'text_kurz', 'text_lang', 'zahl', 'datum', 'hinweis']) {
    ids[typ] = await frage(u, typ);
  }
  const fragen = await fragenVon(u);
  assert.deepEqual(fragen.map((f) => f.typ),
    ['urlaubswochen', 'einfach', 'mehrfach', 'janein', 'skala', 'text_kurz', 'text_lang', 'zahl', 'datum', 'hinweis']);
  assert.deepEqual(fragen.map((f) => f.position), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const einfach = fragen[1];
  assert.equal(einfach.text, 'Neue Frage');
  assert.deepEqual(einfach.optionen.map((o) => [o.text, o.aktiv, o.hat_antworten]), [['Antwort 1', true, false], ['Antwort 2', true, false]]);
  assert.deepEqual(einfach.regeln, {});
  assert.equal(einfach.aktiv, true);
  assert.equal(einfach.hat_antworten, false);
  assert.deepEqual(fragen[4].skala, { von: 1, bis: 5, links: null, rechts: null });
  assert.equal(fragen[9].text, 'Hinweis');
  assert.deepEqual(fragen[0].regeln.max_am_stueck, { wert: 3, aktiv: true });
  await assert.rejects(frage(u, 'urlaubswochen'), /URLAUBSWOCHEN_DOPPELT/);
  await assert.rejects(frage(u, 'quatsch'), /UNGUELTIGE_EINSTELLUNG/);
});

test('Frage speichern: Texte, Verknüpfung, Skala', async () => {
  const u = await neueUmfrage();
  const f = await frage(u, 'skala');
  await speichern(f, { text: '  Wie wichtig?  ', hilfetext: '1 = egal', verknuepfung: 'oder',
    skala_von: 0, skala_bis: 10, skala_links: 'egal', skala_rechts: 'sehr' });
  const g = await findeFrage(u, f);
  assert.deepEqual([g.text, g.hilfetext, g.verknuepfung], ['Wie wichtig?', '1 = egal', 'oder']);
  assert.deepEqual(g.skala, { von: 0, bis: 10, links: 'egal', rechts: 'sehr' });
  await assert.rejects(speichern(f, { text: '  ' }), /FRAGETEXT_LEER/);
  await assert.rejects(speichern(f, { verknuepfung: 'xor' }), /UNGUELTIGE_EINSTELLUNG/);
  await assert.rejects(speichern(f, { skala_von: 5, skala_bis: 3 }), /UNGUELTIGE_EINSTELLUNG/);
});

test('Typwechsel ohne Antworten räumt Optionen und Regeln auf', async () => {
  const u = await neueUmfrage();
  const f = await frage(u, 'mehrfach');
  await regel(f, 'pflicht', null);
  await regel(f, 'min_anzahl', 2);
  await speichern(f, { typ: 'text_kurz' });
  let g = await findeFrage(u, f);
  assert.equal(g.typ, 'text_kurz');
  assert.deepEqual(g.optionen, []);
  assert.deepEqual(Object.keys(g.regeln), ['pflicht']);
  await speichern(f, { typ: 'einfach' });
  g = await findeFrage(u, f);
  assert.deepEqual(g.optionen.map((o) => o.text), ['Antwort 1', 'Antwort 2']);
  await speichern(f, { typ: 'skala' });
  g = await findeFrage(u, f);
  assert.deepEqual(g.skala, { von: 1, bis: 5, links: null, rechts: null });
  await assert.rejects(speichern(f, { typ: 'urlaubswochen' }), /UNGUELTIGE_EINSTELLUNG/);
  const uw = (await fragenVon(u))[0].id;
  await assert.rejects(speichern(uw, { typ: 'text_kurz' }), /UNGUELTIGE_EINSTELLUNG/);
});

test('Schalter: Frage, Option, Regel, Bedingung unabhängig', async () => {
  const u = await neueUmfrage();
  const q = await frage(u, 'janein');
  const z = await frage(u, 'einfach');
  const b = await bedingung(z, q, 'ist', true);
  await regel(z, 'pflicht', null);
  const optionen = (await findeFrage(u, z)).optionen;
  await c('select public.org_option_schalten($1, false)', [optionen[0].id]);
  await c('select public.org_regel_setzen($1, $2, $3, false)', [z, 'pflicht', 'null']);
  await c('select public.org_bedingung_schalten($1, false)', [b]);
  await c('select public.org_frage_schalten($1, false)', [q]);
  const g = await findeFrage(u, z);
  assert.deepEqual(g.optionen.map((o) => o.aktiv), [false, true]);
  assert.deepEqual(g.regeln.pflicht, { wert: null, aktiv: false });
  assert.equal(g.bedingungen[0].aktiv, false);
  assert.equal((await findeFrage(u, q)).aktiv, false);
  const code = await mitarbeiterMitCode(u, 'Anna');
  const sicht = (await browser(db, 'select public.urlaub_laden($1) as r', [code]))[0].r;
  assert.ok(!sicht.fragen.some((f) => f.id === Number(q)));
  const zSicht = sicht.fragen.find((f) => f.id === Number(z));
  assert.deepEqual(zSicht.optionen.map((o) => o.text), ['Antwort 2']);
  assert.deepEqual(zSicht.regeln, {});
  assert.deepEqual(zSicht.bedingungen, []);
});

test('Reihenfolge: verschieben, Rand, Bedingungen', async () => {
  const u = await neueUmfrage();
  const a = await frage(u, 'text_kurz');
  const q = await frage(u, 'janein');
  const z = await frage(u, 'text_kurz');
  await bedingung(z, q, 'ist', true);
  const reihenfolge = async () => (await fragenVon(u)).map((f) => f.id);
  const uw = (await reihenfolge())[0];
  await c('select public.org_frage_verschieben($1, -1)', [uw]); // schon oben: nichts
  await c('select public.org_frage_verschieben($1, 1)', [z]);   // schon unten: nichts
  assert.deepEqual(await reihenfolge(), [uw, a, q, z].map(Number));
  await assert.rejects(c('select public.org_frage_verschieben($1, -1)', [z]), /REIHENFOLGE_BEDINGUNG/);
  await assert.rejects(c('select public.org_frage_verschieben($1, 1)', [q]), /REIHENFOLGE_BEDINGUNG/);
  await c('select public.org_frage_verschieben($1, 1)', [a]);
  assert.deepEqual(await reihenfolge(), [uw, q, a, z].map(Number));
  assert.deepEqual((await fragenVon(u)).map((f) => f.position), [1, 2, 3, 4]);
});

test('Löschen: geschützt durch Antworten und Bedingungen', async () => {
  const u = await neueUmfrage();
  const uw = (await fragenVon(u))[0].id;
  await regel(uw, 'pflicht', null, false);
  const e = await frage(u, 'einfach');
  const [o1, o2] = (await findeFrage(u, e)).optionen.map((o) => o.id);
  const z = await frage(u, 'text_kurz');
  const code = await mitarbeiterMitCode(u, 'Anna');
  await absenden(code, { [String(e)]: o1 });
  assert.equal((await findeFrage(u, e)).hat_antworten, true);
  assert.equal((await findeFrage(u, e)).optionen[0].hat_antworten, true);
  await assert.rejects(c('select public.org_frage_loeschen($1)', [e]), /HAT_ANTWORTEN/);
  await assert.rejects(c('select public.org_option_loeschen($1)', [o1]), /HAT_ANTWORTEN/);
  const b = await bedingung(z, e, 'ist_eine_von', [o2]);
  await assert.rejects(c('select public.org_option_loeschen($1)', [o2]), /BEDINGUNG_VERWEIST/);
  await c('select public.org_bedingung_loeschen($1)', [b]);
  await c('select public.org_option_loeschen($1)', [o2]);
  assert.equal((await findeFrage(u, e)).optionen.length, 1);
  const q = await frage(u, 'janein');
  const z2 = await frage(u, 'text_kurz');
  await bedingung(z2, q, 'ist', false);
  await assert.rejects(c('select public.org_frage_loeschen($1)', [q]), /BEDINGUNG_VERWEIST/);
  await c('select public.org_frage_loeschen($1)', [z]);
  assert.deepEqual((await fragenVon(u)).map((f) => f.position), [1, 2, 3, 4]);
});

test('Mit Antworten: Typ und Grunddaten gesperrt, Texte frei', async () => {
  const u = await neueUmfrage();
  const uw = (await fragenVon(u))[0].id;
  const s = await frage(u, 'skala');
  const code = await mitarbeiterMitCode(u, 'Anna');
  await absenden(code, { [String(uw)]: [5], [String(s)]: 3 });
  await assert.rejects(speichern(s, { typ: 'zahl' }), /TYP_GESPERRT/);
  await assert.rejects(speichern(s, { skala_bis: 7 }), /GRUNDDATEN_GESPERRT/);
  await speichern(s, { skala_von: 1, skala_bis: 5, text: 'Neu', skala_links: 'wenig' });
  assert.equal((await findeFrage(u, s)).text, 'Neu');
  await assert.rejects(speichern(uw, { jahr: 2028 }), /GRUNDDATEN_GESPERRT/);
  await assert.rejects(speichern(uw, { bundesland: 'NW' }), /GRUNDDATEN_GESPERRT/);
  await assert.rejects(speichern(uw, { arbeitstage_pro_woche: 5 }), /GRUNDDATEN_GESPERRT/);
  await speichern(uw, { jahr: 2027, sperr_hinweis: 'Dezember zu.' });
  assert.equal((await findeFrage(u, uw)).urlaubswochen.sperr_hinweis, 'Dezember zu.');
});

test('Urlaubswochen ohne Antworten: Jahr wechselt, Frist zieht mit', async () => {
  const u = await neueUmfrage();
  const uw = (await fragenVon(u))[0].id;
  await speichern(uw, { jahr: 2028, bundesland: 'NW', arbeitstage_pro_woche: 5 });
  const r = await umfrage(u);
  assert.equal(r.einstellungen.frist_eingabe, '2027-11-30T23:59');
  assert.deepEqual([r.fragen[0].urlaubswochen.jahr, r.fragen[0].urlaubswochen.bundesland, r.fragen[0].urlaubswochen.arbeitstage_pro_woche], [2028, 'NW', 5]);
  assert.equal(r.kalender.length, 52);
  await c('select public.org_umfrage_speichern($1, $2)', [u, { frist: '2027-10-01T12:00' }]);
  await speichern(uw, { jahr: 2029 });
  assert.equal((await umfrage(u)).einstellungen.frist_eingabe, '2027-10-01T12:00');
});

test('Regeln setzen: passend und mit gültigen Werten', async () => {
  const u = await neueUmfrage();
  const t = await frage(u, 'text_kurz');
  await regel(t, 'max_zeichen', 50);
  await regel(t, 'pflicht', 'egal');
  let g = await findeFrage(u, t);
  assert.deepEqual(g.regeln, { max_zeichen: { wert: 50, aktiv: true }, pflicht: { wert: null, aktiv: true } });
  await assert.rejects(regel(t, 'min_anzahl', 2), /REGEL_UNPASSEND/);
  await assert.rejects(regel(t, 'max_zeichen', 'viel'), /UNGUELTIGE_EINSTELLUNG/);
  await assert.rejects(regel(t, 'max_zeichen', 0), /UNGUELTIGE_EINSTELLUNG/);
  await assert.rejects(regel(t, 'max_zeichen', 2.5), /UNGUELTIGE_EINSTELLUNG/);
  await assert.rejects(regel(t, 'quatsch', 1), /REGEL_UNPASSEND/);
  const uw = (await fragenVon(u))[0].id;
  await regel(uw, 'gesperrte_monate', [12, 7, 7]);
  assert.deepEqual((await findeFrage(u, uw)).regeln.gesperrte_monate, { wert: [7, 12], aktiv: true });
  await assert.rejects(regel(uw, 'gesperrte_monate', [13]), /UNGUELTIGE_EINSTELLUNG/);
  await assert.rejects(regel(uw, 'max_wochen', -1), /UNGUELTIGE_EINSTELLUNG/);
  const d = await frage(u, 'datum');
  await regel(d, 'fruehestens', '2027-01-01');
  await assert.rejects(regel(d, 'spaetestens', '2027-02-30'), /UNGUELTIGE_EINSTELLUNG/);
  const z = await frage(u, 'zahl');
  await regel(z, 'min_zahl', -2.5);
  await assert.rejects(regel(z, 'max_zahl', 'x'), /UNGUELTIGE_EINSTELLUNG/);
  const h = await frage(u, 'hinweis');
  await assert.rejects(regel(h, 'pflicht', null), /REGEL_UNPASSEND/);
  await regel(t, 'max_zeichen', 50, false);
  g = await findeFrage(u, t);
  assert.deepEqual(g.regeln.max_zeichen, { wert: 50, aktiv: false });
});

test('Bedingungen: gültig, ungültig, ändern, schalten, löschen', async () => {
  const u = await neueUmfrage();
  const e = await frage(u, 'einfach');
  const m = await frage(u, 'mehrfach');
  const j = await frage(u, 'janein');
  const n = await frage(u, 'zahl');
  const t = await frage(u, 'text_kurz');
  const z = await frage(u, 'text_kurz');
  const eo = (await findeFrage(u, e)).optionen.map((o) => o.id);
  const mo = (await findeFrage(u, m)).optionen.map((o) => o.id);
  const b1 = await bedingung(z, e, 'ist_eine_von', [eo[0]]);
  await bedingung(z, m, 'enthaelt_keine_von', mo);
  await bedingung(z, j, 'ist', false);
  await bedingung(z, n, 'groesser', 2.5);
  const ungueltig = [
    [e, z, 'ist_eine_von', [eo[0]]],          // Quelle nach Ziel
    [z, z, 'ist', true],                      // Quelle = Ziel
    [z, t, 'ist', true],                      // Text ist keine Quelle
    [z, e, 'enthaelt_eine_von', [eo[0]]],     // Operator passt nicht
    [z, e, 'ist_eine_von', [mo[0]]],          // Option einer anderen Frage
    [z, e, 'ist_eine_von', []],               // leer
    [z, j, 'ist', 'ja'],                      // kein Wahrheitswert
    [z, n, 'gleich', [1]],                    // keine Zahl
    [z, n, 'quatsch', 1],
  ];
  for (const [ziel, quelle, op, werte] of ungueltig) {
    await assert.rejects(bedingung(ziel, quelle, op, werte), /BEDINGUNG_UNGUELTIG/, JSON.stringify([op, werte]));
  }
  const andere = await neueUmfrage('Andere');
  const fremdQuelle = await frage(andere, 'janein');
  await assert.rejects(bedingung(z, fremdQuelle, 'ist', true), /BEDINGUNG_UNGUELTIG/);
  await c('select public.org_bedingung_speichern($1, $2, $3)', [b1, 'ist_keine_von', JSON.stringify(eo)]);
  await assert.rejects(c('select public.org_bedingung_speichern($1, $2, $3)', [b1, 'ist', 'true']), /BEDINGUNG_UNGUELTIG/);
  await c('select public.org_bedingung_schalten($1, false)', [b1]);
  let g = await findeFrage(u, z);
  assert.equal(g.bedingungen.length, 4);
  assert.deepEqual([g.bedingungen[0].operator, g.bedingungen[0].werte.map(Number), g.bedingungen[0].aktiv],
    ['ist_keine_von', eo.map(Number), false]);
  await c('select public.org_bedingung_loeschen($1)', [b1]);
  g = await findeFrage(u, z);
  assert.equal(g.bedingungen.length, 3);
});

test('Kopieren: Struktur mit neuen IDs, ohne Mitarbeiter', async () => {
  const u = await neueUmfrage('Original');
  const e = await frage(u, 'einfach');
  const z = await frage(u, 'text_kurz');
  const [o1] = (await findeFrage(u, e)).optionen.map((o) => o.id);
  await c('select public.org_option_schalten($1, false)', [(await findeFrage(u, e)).optionen[1].id]);
  await bedingung(z, e, 'ist_eine_von', [o1]);
  await regel(z, 'max_zeichen', 20, false);
  await c('select public.org_freien_tag_hinzufuegen($1, $2, $3)', [u, '2027-08-09', 'Betriebsruhe']);
  await mitarbeiterMitCode(u, 'Anna');
  const k = (await c('select public.org_umfrage_kopieren($1) as id', [u])).id;
  const orig = await umfrage(u);
  const kopie = await umfrage(k);
  assert.equal(kopie.einstellungen.titel, 'Kopie von Original');
  assert.equal(kopie.einstellungen.frist, orig.einstellungen.frist);
  assert.deepEqual(kopie.freie_tage, orig.freie_tage);
  assert.deepEqual(kopie.mitarbeiter, []);
  const form = (fragen) => fragen.map((f) => [f.typ, f.text, f.position, f.aktiv, f.optionen.map((o) => [o.text, o.aktiv]),
    Object.fromEntries(Object.entries(f.regeln)), f.bedingungen.length]);
  assert.deepEqual(form(kopie.fragen), form(orig.fragen));
  const kopieIds = new Set(kopie.fragen.map((f) => f.id));
  assert.ok(orig.fragen.every((f) => !kopieIds.has(f.id)));
  const kz = kopie.fragen[2];
  const ke = kopie.fragen[1];
  assert.equal(kz.bedingungen[0].quelle_id, ke.id);
  assert.deepEqual(kz.bedingungen[0].werte.map(Number), [ke.optionen[0].id]);
  assert.equal((await umfrage(u)).mitarbeiter.length, 1);
});

test('Umfrage löschen mit Antworten und Bedingungen', async () => {
  const u = await neueUmfrage();
  const uw = (await fragenVon(u))[0].id;
  const e = await frage(u, 'einfach');
  const z = await frage(u, 'text_kurz');
  const [o1] = (await findeFrage(u, e)).optionen.map((o) => o.id);
  await bedingung(z, e, 'ist_eine_von', [o1]);
  const code = await mitarbeiterMitCode(u, 'Anna');
  await absenden(code, { [String(uw)]: [5], [String(e)]: o1, [String(z)]: 'Hallo' });
  await c('select public.org_umfrage_loeschen($1)', [u]);
  const rest = async (sql) => (await db.query(sql, [u])).rows[0].n;
  assert.equal(await rest('select count(*)::int as n from urlaub.fragen where umfrage_id = $1'), 0);
  assert.equal(await rest('select count(*)::int as n from urlaub.mitarbeiter where umfrage_id = $1'), 0);
  assert.equal(await rest(`select count(*)::int as n from urlaub.antworten an
    where not exists (select 1 from urlaub.fragen f where f.id = an.frage_id) and $1::bigint is not null`), 0);
});

test('Verwaltungs-Sicht: Antworten und Verstöße je Mitarbeiter', async () => {
  const u = await neueUmfrage();
  const uw = (await fragenVon(u))[0].id;
  const m = await frage(u, 'mehrfach');
  const mo = (await findeFrage(u, m)).optionen.map((o) => o.id);
  const code = await mitarbeiterMitCode(u, 'Anna');
  await mitarbeiterMitCode(u, 'Ben');
  await absenden(code, { [String(uw)]: [5, 6], [String(m)]: mo });
  await regel(m, 'max_anzahl', 1);
  const r = await umfrage(u);
  const anna = r.mitarbeiter.find((x) => x.name === 'Anna');
  const ben = r.mitarbeiter.find((x) => x.name === 'Ben');
  assert.deepEqual(anna.antworten[String(uw)], [5, 6]);
  assert.deepEqual(anna.verstoesse, { [String(m)]: 'ZU_VIELE_ANTWORTEN' });
  assert.deepEqual(ben.antworten, {});
  assert.deepEqual(ben.verstoesse, {});
  assert.ok(anna.geaendert_am);
  assert.equal(r.kalender.length, 52);
});

test('Trennung: Eva kann nichts an Chefs Fragen ändern', async () => {
  const u = await neueUmfrage();
  const e = await frage(u, 'einfach');
  const z = await frage(u, 'text_kurz');
  const [o1] = (await findeFrage(u, e)).optionen.map((o) => o.id);
  const b = await bedingung(z, e, 'ist_eine_von', [o1]);
  const alsEva = (sql, params) => als(db, 'authenticated', eva, sql, params);
  const verboten = [
    ["select public.org_frage_anlegen($1, 'janein')", [u], /UMFRAGE_NICHT_GEFUNDEN/],
    ['select public.org_umfrage_kopieren($1)', [u], /UMFRAGE_NICHT_GEFUNDEN/],
    ['select public.org_frage_speichern($1, $2)', [e, { text: 'x' }], /FRAGE_NICHT_GEFUNDEN/],
    ['select public.org_frage_schalten($1, false)', [e], /FRAGE_NICHT_GEFUNDEN/],
    ['select public.org_frage_verschieben($1, 1)', [e], /FRAGE_NICHT_GEFUNDEN/],
    ['select public.org_frage_loeschen($1)', [z], /FRAGE_NICHT_GEFUNDEN/],
    ["select public.org_option_anlegen($1, 'x')", [e], /FRAGE_NICHT_GEFUNDEN/],
    ["select public.org_option_speichern($1, 'x')", [o1], /OPTION_NICHT_GEFUNDEN/],
    ['select public.org_option_schalten($1, false)', [o1], /OPTION_NICHT_GEFUNDEN/],
    ['select public.org_option_verschieben($1, 1)', [o1], /OPTION_NICHT_GEFUNDEN/],
    ['select public.org_option_loeschen($1)', [o1], /OPTION_NICHT_GEFUNDEN/],
    ["select public.org_regel_setzen($1, 'pflicht', 'null', true)", [e], /FRAGE_NICHT_GEFUNDEN/],
    ["select public.org_bedingung_anlegen($1, $2, 'ist_eine_von', '[]')", [z, e], /FRAGE_NICHT_GEFUNDEN/],
    ["select public.org_bedingung_speichern($1, 'ist_eine_von', '[]')", [b], /BEDINGUNG_NICHT_GEFUNDEN/],
    ['select public.org_bedingung_schalten($1, false)', [b], /BEDINGUNG_NICHT_GEFUNDEN/],
    ['select public.org_bedingung_loeschen($1)', [b], /BEDINGUNG_NICHT_GEFUNDEN/],
  ];
  for (const [sql, params, fehler] of verboten) await assert.rejects(alsEva(sql, params), fehler, sql);
  const evaU = (await als(db, 'authenticated', eva, "select public.org_umfrage_anlegen('Evas', 2027, 'BY') as id"))[0].id;
  const evaZiel = (await als(db, 'authenticated', eva, "select public.org_frage_anlegen($1, 'text_kurz') as id", [evaU]))[0].id;
  await assert.rejects(alsEva("select public.org_bedingung_anlegen($1, $2, 'ist_eine_von', $3)", [evaZiel, e, JSON.stringify([o1])]), /BEDINGUNG_UNGUELTIG/);
  for (const sql of ["select public.org_frage_anlegen(1, 'janein')", 'select public.org_umfrage_kopieren(1)', 'select public.org_frage_loeschen(1)']) {
    await assert.rejects(browser(db, sql), /permission denied/, sql);
  }
  assert.equal((await findeFrage(u, e)).text, 'Neue Frage');
});
