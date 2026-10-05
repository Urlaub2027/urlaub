import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zusammenfassung, personenZeilen } from '../docs/auswertung.js';

const kalender = Array.from({ length: 52 }, (_, i) => ({
  kw: i + 1, von: '01.01.', bis: '07.01.', monat: i >= 47 ? 12 : 1, arbeitstage: 6, feiertag: null, gesperrt: i >= 47,
}));
const f = (id, typ, extra = {}) => ({ id, typ, text: `Frage ${id}`, aktiv: true, optionen: [], regeln: {}, bedingungen: [], ...extra });
const daten = {
  kalender,
  fragen: [
    f(1, 'urlaubswochen'),
    f(2, 'einfach', { optionen: [{ id: 21, text: 'Früh', aktiv: true }, { id: 22, text: 'Nacht', aktiv: false }] }),
    f(3, 'mehrfach', { optionen: [{ id: 31, text: 'Mo', aktiv: true }, { id: 32, text: 'Di', aktiv: true }] }),
    f(4, 'janein'),
    f(5, 'skala', { skala: { von: 1, bis: 3 } }),
    f(6, 'zahl'),
    f(7, 'text_kurz'),
    f(8, 'datum'),
    f(9, 'hinweis'),
  ],
  mitarbeiter: [
    { id: 1, name: 'Anna', link: 'x', geaendert_am: '2026-10-01T14:00:00Z',
      antworten: { 1: [1, 30], 2: 21, 3: [31, 32], 4: true, 5: 3, 6: 2.5, 7: 'Hallo', 8: '2027-03-01' },
      verstoesse: { 3: 'ZU_VIELE_ANTWORTEN' } },
    { id: 2, name: 'Ben', link: 'y', geaendert_am: '2026-10-02T14:00:00Z',
      antworten: { 1: [30], 2: 22, 3: [31], 4: false, 5: 1, 6: 4.5 }, verstoesse: {} },
    { id: 3, name: 'Cem', link: 'z', geaendert_am: null, antworten: {}, verstoesse: {} },
  ],
};

test('Auswahl, Ja/Nein, Skala', () => {
  assert.deepEqual(zusammenfassung(daten.fragen[1], daten), { art: 'auswahl', beantwortet: 2, zeilen: [
    { text: 'Früh', aktiv: true, anzahl: 1, namen: ['Anna'] }, { text: 'Nacht', aktiv: false, anzahl: 1, namen: ['Ben'] }] });
  assert.deepEqual(zusammenfassung(daten.fragen[2], daten).zeilen.map((z) => [z.text, z.anzahl]), [['Mo', 2], ['Di', 1]]);
  assert.deepEqual(zusammenfassung(daten.fragen[3], daten).zeilen.map((z) => [z.text, z.namen]), [['Ja', ['Anna']], ['Nein', ['Ben']]]);
  const s = zusammenfassung(daten.fragen[4], daten);
  assert.equal(s.durchschnitt, 2);
  assert.deepEqual(s.zeilen.map((z) => [z.text, z.anzahl]), [['1', 1], ['2', 0], ['3', 1]]);
});

test('Zahl, Liste, Wochen, Hinweis', () => {
  assert.deepEqual(zusammenfassung(daten.fragen[5], daten),
    { art: 'zahl', beantwortet: 2, kleinster: 2.5, groesster: 4.5, durchschnitt: 3.5, werte: [{ name: 'Anna', wert: 2.5 }, { name: 'Ben', wert: 4.5 }] });
  assert.deepEqual(zusammenfassung(daten.fragen[6], daten), { art: 'liste', beantwortet: 1, werte: [{ name: 'Anna', text: 'Hallo' }] });
  assert.deepEqual(zusammenfassung(daten.fragen[7], daten).werte, [{ name: 'Anna', text: '01.03.2027' }]);
  const w = zusammenfassung(daten.fragen[0], daten);
  assert.equal(w.art, 'wochen');
  assert.equal(w.beantwortet, 2);
  assert.equal(w.wochen.length, 47);
  assert.deepEqual([w.wochen[29].kw, w.wochen[29].anzahl, w.wochen[29].namen], [30, 2, 'Anna, Ben']);
  assert.equal(zusammenfassung(daten.fragen[8], daten), null);
});

test('Personenzeilen mit Hinweisen', () => {
  const p = personenZeilen(daten);
  assert.deepEqual(p.map((x) => [x.name, x.abgegeben]), [['Anna', true], ['Ben', true], ['Cem', false]]);
  assert.equal(p[0].hinweise.length, 1);
  assert.match(p[0].hinweise[0], /^Frage 3: /);
});
