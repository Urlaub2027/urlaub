import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  VORLAGEN, vorlagenTitel, namenAusText, erinnerungsText, offenListeText, wachStatus,
} from '../docs/verwaltung-logik.js';
import { zeitpunkt } from '../docs/logik.js';

test('Vorlagen in fester Reihenfolge; nur „urlaub“ braucht Jahr und Bundesland', () => {
  assert.deepEqual(VORLAGEN.map((v) => v.name), ['urlaub', 'leer', 'schicht', 'feier']);
  assert.deepEqual(VORLAGEN.map((v) => v.titel), ['Urlaubswünsche', 'Leer', 'Schicht- und Verfügbarkeitswünsche', 'Weihnachtsfeier']);
  assert.deepEqual(VORLAGEN.filter((v) => v.mitJahr).map((v) => v.name), ['urlaub']);
});

test('Titelvorschlag je Vorlage', () => {
  const heute = new Date('2026-10-05T12:00:00Z');
  assert.equal(vorlagenTitel('urlaub', 2027, heute), 'Urlaubswünsche 2027');
  assert.equal(vorlagenTitel('leer', 2027, heute), 'Neue Umfrage');
  assert.equal(vorlagenTitel('schicht', 2027, heute), 'Schicht- und Verfügbarkeitswünsche');
  assert.equal(vorlagenTitel('feier', 2027, heute), 'Weihnachtsfeier 2026');
});

test('Namen aus eingefügtem Text (z. B. aus Excel)', () => {
  assert.deepEqual(namenAusText('  Anna Huber\r\n\r\nBen Maier\t\n   \nCem'), ['Anna Huber', 'Ben Maier', 'Cem']);
  assert.deepEqual(namenAusText('Anna\tHuber\r\nBen   Maier'), ['Anna Huber', 'Ben Maier']);
  assert.deepEqual(namenAusText(''), []);
  assert.deepEqual(namenAusText(null), []);
});

test('Erinnerung und Liste „noch offen“', () => {
  const frist = '2026-11-30T22:59:00Z';
  assert.equal(erinnerungsText('Anna', 'Urlaub 2027', frist, 'https://x/#abc'),
    `Hallo Anna, kurze Erinnerung: Bitte trag deine Antworten für „Urlaub 2027“ bis ${zeitpunkt(frist)} ein. `
    + 'Dein persönlicher Link (bitte nicht weitergeben):\nhttps://x/#abc');
  assert.equal(offenListeText(['Anna', 'Ben'], 'Urlaub 2027', frist),
    `Noch nicht abgegeben – „Urlaub 2027“ (Frist ${zeitpunkt(frist)}):\nAnna\nBen`);
});

test('Wach-Status: zuletzt, veraltet ab 3 Tagen, noch nie', () => {
  const jetzt = new Date('2026-10-10T12:00:00Z');
  assert.deepEqual(wachStatus('2026-10-10T03:17:00Z', jetzt),
    { warnung: false, text: `Wach-Automatik: zuletzt ${zeitpunkt('2026-10-10T03:17:00Z')}` });
  assert.equal(wachStatus('2026-10-07T13:00:00Z', jetzt).warnung, false);
  const alt = wachStatus('2026-10-07T12:00:00Z', jetzt);
  assert.equal(alt.warnung, true);
  assert.match(alt.text, /seit 3 Tagen/);
  const nie = wachStatus(null, jetzt);
  assert.equal(nie.warnung, true);
  assert.match(nie.text, /noch nicht gemeldet/);
});
