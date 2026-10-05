import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  codeAusLink, fehlertext, zusammenfassung, istGesperrt, nachMonat, gleicheAuswahl, zeitpunkt,
  folgeLaenge, gesperrteBereiche, regelText, gesperrteGewaehlte,
} from '../docs/logik.js';

const kalender = [
  { kw: 1, monat: 1, arbeitstage: 5 },
  { kw: 2, monat: 1, arbeitstage: 6 },
  { kw: 5, monat: 2, arbeitstage: 6 },
];

test('Code aus dem Link lesen', () => {
  const code = 'a'.repeat(32);
  assert.equal(codeAusLink(`#${code}`), code);
  assert.equal(codeAusLink(`#${code.toUpperCase()}`), code);
  assert.equal(codeAusLink(''), null);
  assert.equal(codeAusLink('#abc'), null);
  assert.equal(codeAusLink(`#${'g'.repeat(32)}`), null);
});

test('Zähler zeigt Wochen und Urlaubstage', () => {
  const z = zusammenfassung(kalender, new Set([1, 2]), 6, 36);
  assert.equal(z.text, '2 von 6 Wochen gewählt · 11 von 36 Urlaubstagen');
  assert.equal(z.limitErreicht, false);
  assert.equal(zusammenfassung(kalender, new Set([1, 2]), 2, 36).limitErreicht, true);
});

test('Bei erreichtem Limit sind nur die nicht gewählten Kästchen gesperrt', () => {
  const auswahl = new Set([1, 2]);
  assert.equal(istGesperrt(5, auswahl, true, true), true);
  assert.equal(istGesperrt(1, auswahl, true, true), false);
  assert.equal(istGesperrt(5, auswahl, false, true), false);
  assert.equal(istGesperrt(1, auswahl, false, false), true);
});

test('Gruppierung nach Monaten', () => {
  const g = nachMonat(kalender);
  assert.deepEqual(g.map((x) => [x.name, x.wochen.length]), [['Januar', 2], ['Februar', 1]]);
});

test('Hilfsfunktionen', () => {
  assert.equal(gleicheAuswahl(new Set([1, 2]), new Set([2, 1])), true);
  assert.equal(gleicheAuswahl(new Set([1]), new Set([1, 2])), false);
  assert.match(fehlertext('ZU_VIELE_WOCHEN'), /zu viele Wochen/);
  assert.match(fehlertext('IRGENDWAS'), /später/);
  assert.equal(zeitpunkt('2026-11-30T22:59:59Z'), '30.11.2026, 23:59 Uhr');
});

test('Folge am Stück', () => {
  const auswahl = new Set([10, 11, 13]);
  assert.equal(folgeLaenge(12, auswahl), 4);
  assert.equal(folgeLaenge(20, auswahl), 1);
  assert.equal(folgeLaenge(9, auswahl), 3);
});

test('Kästchen, das die Folge zu lang machen würde, ist gesperrt', () => {
  const auswahl = new Set([10, 11, 12]);
  assert.equal(istGesperrt(13, auswahl, false, true, 3), true);
  assert.equal(istGesperrt(9, auswahl, false, true, 3), true);
  assert.equal(istGesperrt(14, auswahl, false, true, 3), false);
  assert.equal(istGesperrt(11, auswahl, false, true, 3), false); // abwählen geht immer
});

test('Gesperrte Wochen erscheinen nicht in den Monaten, sondern als Bereiche', () => {
  const kal = [
    { kw: 47, monat: 11, arbeitstage: 6, gesperrt: false },
    { kw: 48, monat: 12, arbeitstage: 6, gesperrt: true },
    { kw: 49, monat: 12, arbeitstage: 6, gesperrt: true },
    { kw: 30, monat: 7, arbeitstage: 6, gesperrt: true },
  ];
  assert.deepEqual(nachMonat(kal).map((g) => g.name), ['November']);
  assert.deepEqual(gesperrteBereiche(kal), [
    { name: 'Juli', vonKw: 30, bisKw: 30 },
    { name: 'Dezember', vonKw: 48, bisKw: 49 },
  ]);
});

test('Regeltext', () => {
  assert.equal(regelText({ min_wochen: 1, max_wochen: 6, max_am_stueck: 3 }),
    'mindestens 1, höchstens 6 Wochen, davon höchstens 3 am Stück');
  assert.equal(regelText({ min_wochen: 2, max_wochen: 4, max_am_stueck: 4 }),
    'mindestens 2, höchstens 4 Wochen');
});

test('Neue Fehlertexte', () => {
  assert.match(fehlertext('ZU_VIELE_AM_STUECK'), /am Stück/);
  assert.match(fehlertext('ZU_WENIGE_WOCHEN'), /mehr Wochen/);
  assert.match(fehlertext('UNGUELTIGE_WOCHE'), /nicht wählbar/);
});

test('Gewählte Wochen in gesperrten Monaten oder ohne Kalendereintrag werden erkannt', () => {
  const k = [{ kw: 1, gesperrt: false }, { kw: 2, gesperrt: true }, { kw: 3, gesperrt: false }];
  assert.deepEqual(gesperrteGewaehlte(k, [1, 2, 3, 99]), [2, 99]);
  assert.deepEqual(gesperrteGewaehlte(k, [1, 3]), []);
});

test('Zähler ohne Wochen- oder Tagesgrenze', () => {
  const kal = [{ kw: 1, monat: 1, arbeitstage: 5 }, { kw: 2, monat: 1, arbeitstage: 6 }];
  const ohneMax = zusammenfassung(kal, new Set([1, 2]), null, 36);
  assert.equal(ohneMax.text, '2 Wochen gewählt · 11 von 36 Urlaubstagen');
  assert.equal(ohneMax.limitErreicht, false);
  assert.equal(zusammenfassung(kal, new Set([1]), 6, null).text, '1 von 6 Wochen gewählt · 5 Urlaubstage');
  assert.equal(zusammenfassung(kal, new Set([1]), null, null).text, '1 Woche gewählt · 5 Urlaubstage');
});
