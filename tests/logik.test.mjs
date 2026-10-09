import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  codeAusLink, fehlertext, zusammenfassung, istGesperrt, nachMonat, zeitpunkt,
  folgeLaenge, gesperrteZeitraeume, gesperrteGewaehlte,
  wochenAus, tageAus, einzeltageAn, plusTage, wochentag, tagKurz, tagLang, kwVon, tageKontext,
  waehlbareTage, tagSperrgrund, sperrText, tageBereinigen, hinweisEntfernt,
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

test('Gesperrte Wochen erscheinen nicht in den Monaten', () => {
  const kal = [
    { kw: 47, monat: 11, arbeitstage: 6, gesperrt: false },
    { kw: 48, monat: 12, arbeitstage: 6, gesperrt: true },
    { kw: 30, monat: 7, arbeitstage: 6, gesperrt: true },
  ];
  assert.deepEqual(nachMonat(kal).map((g) => g.name), ['November']);
});

test('gesperrteZeitraeume fasst aufeinanderfolgende KWs zusammen', () => {
  const k = (kw, gesperrt) => ({ kw, von: `v${kw}`, bis: `b${kw}`, monat: 1, arbeitstage: 5, gesperrt });
  assert.deepEqual(gesperrteZeitraeume([k(1, false), k(2, false)]), []);
  assert.deepEqual(gesperrteZeitraeume([k(11, false), k(12, true), k(13, false)]),
    [{ vonKw: 12, bisKw: 12, von: 'v12', bis: 'b12' }]);
  assert.deepEqual(gesperrteZeitraeume([k(9, true), k(10, true), k(11, false), k(12, true), k(13, true), k(14, true)]), [
    { vonKw: 9, bisKw: 10, von: 'v9', bis: 'b10' },
    { vonKw: 12, bisKw: 14, von: 'v12', bis: 'b14' },
  ]);
  assert.deepEqual(gesperrteZeitraeume([k(51, false), k(52, true), k(53, true)]),
    [{ vonKw: 52, bisKw: 53, von: 'v52', bis: 'b53' }]);
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

// Ausschnitt 2027, Mo–Sa (siehe Plan „Testdaten“).
const MONTAGE = { 29: '2027-07-19', 30: '2027-07-26', 31: '2027-08-02', 32: '2027-08-09', 33: '2027-08-16', 34: '2027-08-23' };
const kal = Object.entries(MONTAGE).map(([kw, montag]) => ({ kw: Number(kw), montag, monat: 8, arbeitstage: 6, gesperrt: false }));
const ctx = (frei = []) => tageKontext({ kalender: kal, arbeitstage_pro_woche: 6,
  freie_tage: frei.map((datum) => ({ datum, name: 'Frei' })) });
const BLOCK = [30, 31, 32];

test('Gemischte Antwort zerlegen', () => {
  assert.deepEqual(wochenAus([30, '2027-08-17', 12]), [30, 12]);
  assert.deepEqual(tageAus([30, '2027-08-17', 12]), ['2027-08-17']);
  assert.deepEqual(wochenAus(undefined), []);
  assert.equal(einzeltageAn({ einzeltage: null }), true);
  assert.equal(einzeltageAn({ pflicht: null }), false);
});

test('Datumshelfer', () => {
  assert.equal(plusTage('2027-07-31', 1), '2027-08-01');
  assert.equal(plusTage('2027-08-01', -1), '2027-07-31');
  assert.equal(wochentag('2027-08-16'), 1);
  assert.equal(wochentag('2027-08-22'), 7);
  assert.equal(tagKurz('2027-08-17'), 'Di 17.08.');
  assert.equal(tagLang('2027-08-17'), 'Di 17.08.2027');
  assert.equal(kwVon(kal, '2027-08-22'), 33);
  assert.equal(kwVon(kal, '2027-09-30'), null);
});

test('Wählbare Tage: Arbeitstage außerhalb gewählter Wochen, ohne freie Tage', () => {
  const t = waehlbareTage(ctx(), BLOCK).map((x) => x.datum);
  assert.equal(t.length, 18);                 // KW 29, 33, 34 je 6
  assert.ok(t.includes('2027-07-24'));        // Samstag ist Arbeitstag
  assert.ok(!t.includes('2027-07-25'));       // Sonntag nicht
  assert.ok(!t.includes('2027-08-02'));       // in gewählter KW 31
  assert.ok(!waehlbareTage(ctx(['2027-08-16']), BLOCK).some((x) => x.datum === '2027-08-16'));
  const gesperrt = tageKontext({ kalender: kal.map((k) => ({ ...k, gesperrt: k.kw === 34 })), arbeitstage_pro_woche: 6 });
  assert.ok(!waehlbareTage(gesperrt, BLOCK).some((x) => x.kw === 34));
});

test('Sperrgrund: Verlängerung eines vollen Blocks', () => {
  const grund = (tag, { frei = [], tage = [], wochen = BLOCK, max = 3 } = {}) =>
    tagSperrgrund(ctx(frei), tag, wochen, tage, max);
  assert.deepEqual(grund('2027-08-16'), { vonKw: 30, bisKw: 32, anfang: '2027-07-26', ende: '2027-08-15' });
  assert.equal(grund('2027-08-17'), null);
  assert.ok(grund('2027-07-24'));                              // Sa vor dem Block
  assert.equal(grund('2027-07-23'), null);                     // Fr: Sa wird gearbeitet
  assert.ok(grund('2027-08-17', { frei: ['2027-08-16'] }));    // Feiertag überbrückt
  assert.ok(grund('2027-08-17', { tage: ['2027-08-16'] }));    // gewählter Tag überbrückt
  assert.equal(grund('2027-08-16', { max: 4 }), null);         // Block unter Höchstlänge
  assert.equal(grund('2027-08-16', { wochen: [31, 32] }), null);
  assert.equal(grund('2027-08-16', { max: Infinity }), null);
  assert.equal(sperrText(grund('2027-08-16'), 3),
    'Nicht wählbar: würde deinen Urlaub KW 30–32 auf mehr als 3 Wochen am Stück verlängern.');
  assert.equal(sperrText({ vonKw: 30, bisKw: 30 }, 1),
    'Nicht wählbar: würde deinen Urlaub KW 30 auf mehr als 1 Woche am Stück verlängern.');
});

test('Tage bereinigen nach Wochenwechsel', () => {
  const g = { einzeltage: true, maxWochen: 3, maxTage: 20, maxAmStueck: 3 };   // 18 + 2 übrig
  const b = (wochen, tage, extra = {}) => tageBereinigen(ctx(), wochen, tage, { ...g, ...extra });
  assert.deepEqual(b(BLOCK, []), { tage: [], grund: null });
  assert.deepEqual(b(BLOCK, ['2027-08-18']), { tage: ['2027-08-18'], grund: null });
  assert.deepEqual(b([30, 31], ['2027-08-18']), { tage: [], grund: 'wochen' });
  assert.deepEqual(b(BLOCK, ['2027-08-18'], { einzeltage: false }), { tage: [], grund: 'aus' });
  // Mo verlängert, Di danach nicht mehr (Mo wird gearbeitet) → nur Mo fällt weg.
  assert.deepEqual(b(BLOCK, ['2027-08-17', '2027-08-16']), { tage: ['2027-08-17'], grund: 'regel' });
  assert.deepEqual(b(BLOCK, ['2027-08-10']), { tage: [], grund: 'regel' });          // in gewählter KW
  assert.deepEqual(b(BLOCK, ['2027-08-18', '2027-08-20'], { maxTage: 19 }), { tage: ['2027-08-18'], grund: 'regel' });
});

test('Hinweise und Zähler mit Tagen', () => {
  assert.equal(hinweisEntfernt('wochen', 6),
    'Deine einzelnen Tage wurden entfernt, weil du nicht mehr alle 6 Wochen gewählt hast.');
  assert.match(hinweisEntfernt('regel', 6), /nicht mehr wählbar/);
  assert.match(hinweisEntfernt('aus', 6), /nicht mehr möglich/);
  assert.equal(zusammenfassung(kalender, new Set([1, 2]), 6, 36, 2).text,
    '2 von 6 Wochen gewählt · 2 einzelne Tage · 13 von 36 Urlaubstagen');
  assert.equal(zusammenfassung(kalender, new Set([1, 2]), 6, 36, 1).text,
    '2 von 6 Wochen gewählt · 1 einzelner Tag · 12 von 36 Urlaubstagen');
  assert.equal(zusammenfassung(kalender, new Set([1, 2]), 6, 36).text, '2 von 6 Wochen gewählt · 11 von 36 Urlaubstagen');
  assert.equal(fehlertext('TAGE_ERST_NACH_WOCHEN'), 'Einzelne Tage gehen erst, wenn du alle Wochen gewählt hast.');
  assert.equal(fehlertext('TAG_ZU_VIELE_AM_STUECK'), 'Ein gewählter Tag macht deinen Urlaub zu lang am Stück.');
  assert.equal(fehlertext('UNGUELTIGER_TAG'), 'Mindestens ein gewählter Tag ist nicht wählbar.');
  assert.equal(fehlertext('DOPPELTER_TAG'), 'Ein Tag wurde doppelt gewählt.');
});
