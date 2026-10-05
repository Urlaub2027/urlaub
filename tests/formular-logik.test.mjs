import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  istLeer, sichtbareFragen, antwortenZumAbsenden, antwortText, fehlerText, regelHinweis,
} from '../docs/formular-logik.js';
import { antwortSchluessel } from '../docs/formular-logik.js';

const fragen = [
  { id: 1, typ: 'janein', bedingungen: [], verknuepfung: 'und', optionen: [], regeln: {} },
  { id: 2, typ: 'text_kurz', bedingungen: [{ quelle_id: 1, operator: 'ist', werte: true }], verknuepfung: 'und', optionen: [], regeln: {} },
  { id: 3, typ: 'hinweis', bedingungen: [], verknuepfung: 'und', optionen: [], regeln: {} },
  { id: 4, typ: 'mehrfach', bedingungen: [], verknuepfung: 'und', optionen: [{ id: 41, text: 'Mo' }, { id: 42, text: 'Di' }], regeln: {} },
];

test('istLeer', () => {
  for (const w of [undefined, null, [], '', '   ']) assert.equal(istLeer(w), true, JSON.stringify(w));
  for (const w of [0, false, [1], 'x']) assert.equal(istLeer(w), false, JSON.stringify(w));
});

test('Sichtbarkeit und Absende-Auswahl', () => {
  assert.deepEqual([...sichtbareFragen(fragen, {})].sort(), [1, 3, 4]);
  assert.deepEqual([...sichtbareFragen(fragen, { 1: true })].sort(), [1, 2, 3, 4]);
  assert.deepEqual(antwortenZumAbsenden(fragen, { 1: false, 2: 'weg', 3: 'x', 4: [] }), { 1: false });
  assert.deepEqual(antwortenZumAbsenden(fragen, { 1: true, 2: ' hallo ', 4: [42] }), { 1: true, 2: ' hallo ', 4: [42] });
});

test('Antworttexte', () => {
  assert.equal(antwortText(fragen[0], true), 'Ja');
  assert.equal(antwortText(fragen[0], false), 'Nein');
  assert.equal(antwortText(fragen[3], [41, 42]), 'Mo, Di');
  assert.equal(antwortText(fragen[3], [99]), '(entfernt)');
  assert.equal(antwortText({ typ: 'einfach', optionen: [{ id: 5, text: 'Früh' }] }, 5), 'Früh');
  assert.equal(antwortText({ typ: 'zahl' }, 3.5), '3,5');
  assert.equal(antwortText({ typ: 'skala' }, 4), '4');
  assert.equal(antwortText({ typ: 'datum' }, '2027-03-01'), '01.03.2027');
  assert.equal(antwortText({ typ: 'urlaubswochen' }, [3, 12]), 'KW 3, KW 12');
  assert.equal(antwortText({ typ: 'text_lang' }, 'Hallo'), 'Hallo');
});

test('Fehlertexte und Regelhinweise', () => {
  assert.match(fehlerText('PFLICHT'), /Pflicht|beantworte/i);
  assert.match(fehlerText('ZU_VIELE_ANTWORTEN'), /zu viele/i);
  assert.match(fehlerText('ZU_VIELE_AM_STUECK'), /am Stück/);
  assert.equal(fehlerText('IRGENDWAS'), 'Bitte prüfe diese Antwort.');
  assert.equal(regelHinweis({ typ: 'mehrfach', regeln: { min_anzahl: 2, max_anzahl: 3 } }), 'Bitte 2 bis 3 auswählen.');
  assert.equal(regelHinweis({ typ: 'mehrfach', regeln: { max_anzahl: 3 } }), 'Höchstens 3 auswählen.');
  assert.equal(regelHinweis({ typ: 'mehrfach', regeln: { min_anzahl: 2 } }), 'Mindestens 2 auswählen.');
  assert.equal(regelHinweis({ typ: 'text_kurz', regeln: { max_zeichen: 10 } }), 'Höchstens 10 Zeichen.');
  assert.equal(regelHinweis({ typ: 'zahl', regeln: { min_zahl: 0, max_zahl: 40 } }), 'Zahl zwischen 0 und 40.');
  assert.equal(regelHinweis({ typ: 'zahl', regeln: { min_zahl: 0 } }), 'Mindestens 0.');
  assert.equal(regelHinweis({ typ: 'datum', regeln: { fruehestens: '2027-01-01', spaetestens: '2027-12-31' } }), 'Datum zwischen 01.01.2027 und 31.12.2027.');
  assert.equal(regelHinweis({ typ: 'datum', regeln: { spaetestens: '2027-12-31' } }), 'Spätestens 31.12.2027.');
  assert.equal(regelHinweis({ typ: 'janein', regeln: { pflicht: null } }), '');
});

// ---------------------------------------------------------------- Ergänzungen

const f = (id, typ, bedingungen = [], verknuepfung = 'und', extra = {}) =>
  ({ id, typ, bedingungen, verknuepfung, optionen: [], regeln: {}, ...extra });

test('Operatoren wie urlaub.bedingung_erfuellt', () => {
  const quelle = [f(1, 'einfach'), f(2, 'mehrfach'), f(3, 'zahl')];
  const ziel = (id, b) => f(id, 'text_kurz', [b]);
  const alle = [...quelle,
    ziel(10, { quelle_id: 1, operator: 'ist_eine_von', werte: [7, 8] }),
    ziel(11, { quelle_id: 1, operator: 'ist_keine_von', werte: [8] }),
    ziel(12, { quelle_id: 2, operator: 'enthaelt_eine_von', werte: [7] }),
    ziel(13, { quelle_id: 2, operator: 'enthaelt_keine_von', werte: [7] }),
    ziel(14, { quelle_id: 3, operator: 'gleich', werte: 5 }),
    ziel(15, { quelle_id: 3, operator: 'groesser', werte: 5 }),
    ziel(16, { quelle_id: 3, operator: 'kleiner', werte: 5 }),
  ];
  const sicht = (a) => [...sichtbareFragen(alle, a)].filter((id) => id >= 10);
  assert.deepEqual(sicht({}), []); // unbeantwortet: auch "keine von" ist nicht erfüllt
  assert.deepEqual(sicht({ 1: 8, 2: [6], 3: 5 }), [10, 13, 14]);
  assert.deepEqual(sicht({ 1: 9, 2: [6, 7], 3: 6 }), [11, 12, 15]);
  assert.deepEqual(sicht({ 3: 4.5 }), [16]);
  assert.deepEqual(sicht({ 2: [] }), []); // leere Liste = unbeantwortet
});

test('Quelle fehlt, ist später, ist Hinweis oder unsichtbar: nicht erfüllt', () => {
  const alle = [
    f(1, 'text_kurz', [{ quelle_id: 99, operator: 'ist', werte: true }]),
    f(2, 'text_kurz', [{ quelle_id: 3, operator: 'ist', werte: true }]),
    f(3, 'janein'),
    f(4, 'hinweis'),
    f(5, 'text_kurz', [{ quelle_id: 4, operator: 'ist', werte: 'x' }]),
    f(6, 'janein', [{ quelle_id: 3, operator: 'ist', werte: false }]),
    f(7, 'text_kurz', [{ quelle_id: 6, operator: 'ist', werte: true }]),
  ];
  assert.deepEqual([...sichtbareFragen(alle, { 3: true, 4: 'x', 6: true, 99: true })], [3, 4]);
});

test('oder: eine erfüllte Bedingung reicht; und: alle', () => {
  const b = [{ quelle_id: 1, operator: 'ist', werte: true }, { quelle_id: 2, operator: 'ist', werte: true }];
  const alle = [f(1, 'janein'), f(2, 'janein'), f(3, 'text_kurz', b, 'oder'), f(4, 'text_kurz', b, 'und')];
  assert.deepEqual([...sichtbareFragen(alle, { 1: true, 2: false })], [1, 2, 3]);
  assert.deepEqual([...sichtbareFragen(alle, { 1: true, 2: true })], [1, 2, 3, 4]);
});

test('istLeer: Leerraum aller Art', () => {
  assert.equal(istLeer(' \t\n\r '), true);
  assert.equal(istLeer(' a '), false);
});

test('Antworttexte: Randfälle', () => {
  const mf = fragen[3];
  assert.equal(antwortText(mf, [41, 99]), 'Mo, (entfernt)');
  assert.equal(antwortText({ typ: 'einfach', optionen: [] }, 5), '(entfernt)');
  assert.equal(antwortText({ typ: 'zahl' }, 1234.5), '1.234,5');
  assert.equal(antwortText({ typ: 'janein' }, null), '');
});

test('Fehlertext PFLICHT bei der Urlaubswochen-Frage', () => {
  assert.equal(fehlerText('PFLICHT', { typ: 'urlaubswochen' }), 'Bitte wähle mindestens eine Woche.');
  assert.equal(fehlerText('PFLICHT', { typ: 'janein' }), fehlerText('PFLICHT'));
  for (const code of ['UNGUELTIGE_ANTWORT', 'ZU_WENIGE_ANTWORTEN', 'ZAHL_ZU_KLEIN', 'ZAHL_ZU_GROSS', 'TEXT_ZU_LANG',
    'DATUM_ZU_FRUEH', 'DATUM_ZU_SPAET', 'UNGUELTIGE_WOCHE', 'DOPPELTE_WOCHE', 'ZU_WENIGE_WOCHEN', 'ZU_VIELE_WOCHEN',
    'ZU_VIELE_TAGE']) {
    assert.notEqual(fehlerText(code), 'Bitte prüfe diese Antwort.', code);
  }
});

test('Regelhinweise: Urlaubswochen und weitere', () => {
  const uw = (regeln) => regelHinweis({ typ: 'urlaubswochen', regeln });
  assert.equal(uw({ pflicht: null, min_wochen: 1, max_wochen: 6, max_am_stueck: 3, max_urlaubstage: 36, gesperrte_monate: [12] }),
    'Mindestens 1, höchstens 6 Wochen, davon höchstens 3 am Stück, insgesamt höchstens 36 Urlaubstage.');
  assert.equal(uw({ min_wochen: 2, max_wochen: 4, max_am_stueck: 4 }), 'Mindestens 2, höchstens 4 Wochen.');
  assert.equal(uw({ max_wochen: 1 }), 'Höchstens 1 Woche.');
  assert.equal(uw({ max_am_stueck: 2 }), 'Höchstens 2 Wochen am Stück.');
  assert.equal(uw({}), '');
  assert.equal(regelHinweis({ typ: 'mehrfach', regeln: { min_anzahl: 2, max_anzahl: 2 } }), 'Bitte genau 2 auswählen.');
  assert.equal(regelHinweis({ typ: 'zahl', regeln: { max_zahl: 40 } }), 'Höchstens 40.');
  assert.equal(regelHinweis({ typ: 'datum', regeln: { fruehestens: '2027-01-01' } }), 'Frühestens 01.01.2027.');
  assert.equal(regelHinweis({ typ: 'text_lang', regeln: {} }), '');
});

test('antwortSchluessel: gleiche Antworten trotz Reihenfolge und Leerraum', () => {
  const a = antwortSchluessel(fragen, { 1: true, 2: ' hallo ', 4: [42, 41] });
  assert.equal(a, antwortSchluessel(fragen, { 4: [41, 42], 2: 'hallo', 1: true }));
  assert.notEqual(a, antwortSchluessel(fragen, { 1: true, 2: 'hallo', 4: [41] }));
  assert.equal(antwortSchluessel(fragen, { 1: false, 2: 'weg' }), antwortSchluessel(fragen, { 1: false }));
});
