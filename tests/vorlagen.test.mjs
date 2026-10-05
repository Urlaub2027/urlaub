import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { neueDatenbank, als, browser, organisator } from './helfer.mjs';

let db;
let chef;

before(async () => {
  db = await neueDatenbank();
  chef = await organisator(db, 'chef');
});

const c = async (sql, params) => (await als(db, 'authenticated', chef, sql, params))[0];
const anlegen = async (vorlage, titel = 'Test', jahr = 2027, land = 'BY') =>
  (await c('select public.org_umfrage_anlegen($1, $2, $3, $4) as id', [titel, vorlage, jahr, land])).id;
const umfrage = async (id) => (await c('select public.org_umfrage($1) as r', [id])).r;
const form = (u) => u.fragen.map((f) => [f.typ, f.text, f.optionen.map((o) => o.text),
  Object.fromEntries(Object.entries(f.regeln).map(([art, r]) => [art, r.wert])), f.bedingungen.length]);

async function mitarbeiterCode(umfrageId, name) {
  await c('select public.org_mitarbeiter_anlegen($1, $2)', [umfrageId, name]);
  return (await db.query('select code from urlaub.mitarbeiter where umfrage_id = $1 and name = $2', [umfrageId, name])).rows[0].code;
}
const absenden = (code, antworten) =>
  browser(db, 'select public.umfrage_absenden($1, $2)', [code, JSON.stringify(antworten)]);
const fehlerVon = (versprechen) => versprechen.then(() => null, (e) => e);

test('Vorlage „urlaub“ entspricht der bisherigen Standard-Umfrage', async () => {
  const u = await umfrage(await anlegen('urlaub'));
  assert.equal(u.einstellungen.frist_eingabe, '2026-11-30T23:59');
  assert.deepEqual(u.fragen.map((f) => f.typ), ['urlaubswochen']);
  assert.deepEqual(Object.keys(u.fragen[0].regeln).sort(),
    ['gesperrte_monate', 'max_am_stueck', 'max_urlaubstage', 'max_wochen', 'min_wochen', 'pflicht']);
});

test('Vorlage „leer“: keine Fragen, Frist in 14 Tagen um 23:59', async () => {
  const u = await umfrage(await anlegen('leer', 'Leer', null, null));
  assert.deepEqual(u.fragen, []);
  const erwartet = (await db.query(
    "select to_char((now() at time zone 'Europe/Berlin')::date + 14, 'YYYY-MM-DD') || 'T23:59' as d")).rows[0].d;
  assert.equal(u.einstellungen.frist_eingabe, erwartet);
});

test('Vorlage „schicht“: Fragen, Optionen und Regeln; gültige Abgabe', async () => {
  const id = await anlegen('schicht', 'Schicht');
  const u = await umfrage(id);
  assert.deepEqual(form(u), [
    ['hinweis', 'Bitte gib an, wann du arbeiten kannst und was du bevorzugst.', [], {}, 0],
    ['mehrfach', 'An welchen Tagen kannst du arbeiten?',
      ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'], { pflicht: null, min_anzahl: 1 }, 0],
    ['einfach', 'Welche Schicht ist dir am liebsten?', ['Frühschicht', 'Spätschicht', 'Nachtschicht', 'Egal'], { pflicht: null }, 0],
    ['zahl', 'Wie viele Tage pro Woche möchtest du arbeiten?', [], { pflicht: null, min_zahl: 1, max_zahl: 6 }, 0],
    ['janein', 'Kannst du bei Bedarf kurzfristig einspringen?', [], { pflicht: null }, 0],
    ['text_lang', 'Gibt es Zeiten, in denen du nicht arbeiten kannst?', [], { max_zeichen: 500 }, 0],
  ]);
  assert.ok(u.fragen.every((f) => f.aktiv));
  assert.equal(u.fragen[0].hilfetext, 'Es sind Wünsche – wir berücksichtigen sie, so gut es geht.');
  const [, tage, schicht, anzahl, einspringen] = u.fragen;
  const code = await mitarbeiterCode(id, 'Anna');
  const fehler = await fehlerVon(absenden(code, { [tage.id]: [tage.optionen[0].id], [schicht.id]: schicht.optionen[0].id,
    [anzahl.id]: 7, [einspringen.id]: true }));
  assert.equal(fehler.message, 'ANTWORTEN_UNGUELTIG');
  assert.deepEqual(JSON.parse(fehler.detail), { [anzahl.id]: 'ZAHL_ZU_GROSS' });
  await absenden(code, { [tage.id]: [tage.optionen[0].id, tage.optionen[5].id], [schicht.id]: schicht.optionen[0].id,
    [anzahl.id]: 4, [einspringen.id]: true });
});

test('Vorlage „feier“: Folgefragen nur bei „Ja“', async () => {
  const id = await anlegen('feier', 'Feier');
  const u = await umfrage(id);
  assert.deepEqual(form(u), [
    ['janein', 'Möchtest du zur Weihnachtsfeier kommen?', [], { pflicht: null }, 0],
    ['mehrfach', 'An welchen Terminen kannst du?', ['Termin 1', 'Termin 2', 'Termin 3'], { pflicht: null }, 1],
    ['einfach', 'Was möchtest du essen?', ['Mit Fleisch', 'Vegetarisch', 'Vegan'], { pflicht: null }, 1],
    ['janein', 'Bringst du eine Begleitung mit?', [], { pflicht: null }, 1],
    ['text_lang', 'Hast du noch Wünsche oder Ideen für die Feier?', [], { max_zeichen: 500 }, 1],
  ]);
  const [kommt, termine, essen, begleitung, wuensche] = u.fragen;
  for (const f of u.fragen.slice(1)) {
    assert.deepEqual([f.bedingungen[0].quelle_id, f.bedingungen[0].operator, f.bedingungen[0].werte, f.bedingungen[0].aktiv],
      [kommt.id, 'ist', true, true]);
  }
  const code = await mitarbeiterCode(id, 'Anna');
  await absenden(code, { [kommt.id]: false });
  const fehler = await fehlerVon(absenden(code, { [kommt.id]: true }));
  assert.equal(fehler.message, 'ANTWORTEN_UNGUELTIG');
  assert.deepEqual(JSON.parse(fehler.detail), { [termine.id]: 'PFLICHT', [essen.id]: 'PFLICHT', [begleitung.id]: 'PFLICHT' });
  await absenden(code, { [kommt.id]: true, [termine.id]: [termine.optionen[1].id], [essen.id]: essen.optionen[1].id,
    [begleitung.id]: false, [wuensche.id]: 'Glühwein' });
});

test('Regeln und Bedingungen der Vorlagen bestehen die Editor-Prüfungen', async () => {
  for (const vorlage of ['schicht', 'feier']) {
    const id = await anlegen(vorlage);
    const vorher = await umfrage(id);
    for (const f of vorher.fragen) {
      for (const [art, r] of Object.entries(f.regeln)) {
        await c('select public.org_regel_setzen($1, $2, $3, $4)', [f.id, art, JSON.stringify(r.wert), r.aktiv]);
      }
      for (const b of f.bedingungen) {
        await c('select public.org_bedingung_speichern($1, $2, $3)', [b.id, b.operator, JSON.stringify(b.werte)]);
      }
    }
    assert.deepEqual(form(await umfrage(id)), form(vorher), vorlage);
  }
});

test('Vorlagen: ungültige Angaben, Rechte, alte Fassung', async () => {
  await assert.rejects(anlegen('quatsch'), /UNGUELTIGE_EINSTELLUNG/);
  await assert.rejects(anlegen(null), /UNGUELTIGE_EINSTELLUNG/);
  await assert.rejects(anlegen('urlaub', 'X', null), /UNGUELTIGE_EINSTELLUNG/);
  await assert.rejects(anlegen('urlaub', 'X', 2027, 'XX'), /UNGUELTIGE_EINSTELLUNG/);
  await assert.rejects(anlegen('leer', '   '), /TITEL_LEER/);
  await anlegen('schicht', 'Jahr egal', 1999, 'XX'); // Jahr und Bundesland zählen nur bei „urlaub“
  await assert.rejects(browser(db, "select public.org_umfrage_anlegen('X', 'leer', null, null)"), /permission denied/);
  const alt = (await c("select public.org_umfrage_anlegen('Alt', 2027, 'BY') as id")).id;
  assert.deepEqual((await umfrage(alt)).fragen.map((f) => f.typ), ['urlaubswochen']);
});
