import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  codeAusLink, fehlertext, zusammenfassung, istGesperrt, nachMonat, gleicheAuswahl, zeitpunkt,
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
