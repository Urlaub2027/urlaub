// Erzeugt eine .xlsx-Datei und lässt sie von openpyxl (Python) wieder einlesen.
// Fehlt Python/openpyxl, wird der Lesetest übersprungen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { erzeugeXlsx } from '../docs/xlsx.js';
import { excelBlaetter, wochenZeilen } from '../docs/auswertung.js';

const kalender = Array.from({ length: 52 }, (_, i) => ({
  kw: i + 1, von: '01.01.', bis: '07.01.', monat: i >= 47 ? 12 : 1,
  arbeitstage: i === 0 ? 5 : 6, feiertag: i === 0 ? 'Heilige Drei Könige' : null, gesperrt: i >= 47,
}));
const daten = {
  kalender,
  mitarbeiter: [
    { id: 1, name: 'Anna Ä. <&>', link: 'x', wochen: [1, 30], urlaubstage: 11, geaendert_am: '2026-10-01T14:00:00Z', regelverstoss: 'ZU_VIELE_AM_STUECK' },
    { id: 2, name: 'Ben', link: 'y', wochen: [], urlaubstage: 0, geaendert_am: null, regelverstoss: null },
  ],
};

test('Wochenübersicht zählt Namen pro KW', () => {
  const w = wochenZeilen(daten);
  assert.equal(w[0].anzahl, 1);
  assert.equal(w[0].namen, 'Anna Ä. <&>');
  assert.equal(w[1].anzahl, 0);
});

const python = spawnSync('python', ['-c', 'import openpyxl'], { encoding: 'utf8' });

test('Excel-Datei lässt sich öffnen und enthält die erwarteten Werte',
  { skip: python.status !== 0 && 'python/openpyxl nicht verfügbar' }, () => {
    const datei = join(mkdtempSync(join(tmpdir(), 'urlaub-')), 'test.xlsx');
    writeFileSync(datei, erzeugeXlsx(excelBlaetter(daten)));
    const r = spawnSync('python', ['-c', `
import json, sys, openpyxl
wb = openpyxl.load_workbook(sys.argv[1])
out = {ws.title: [[c for c in row] for row in ws.iter_rows(values_only=True)] for ws in wb}
out['_fixiert'] = {ws.title: ws.freeze_panes for ws in wb}
print(json.dumps(out, ensure_ascii=False, default=str))
`, datei], { encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
    assert.equal(r.status, 0, r.stderr);
    const wb = JSON.parse(r.stdout);
    assert.deepEqual(Object.keys(wb).filter((k) => k !== '_fixiert'), ['Personen', 'Wochen', 'Matrix']);
    assert.deepEqual(wb.Personen[0], ['Name', 'Abgegeben', 'Gewählte KWs', 'Anzahl Wochen', 'Urlaubstage', 'Letzte Änderung', 'Hinweis']);
    assert.deepEqual(wb.Personen[1], ['Anna Ä. <&>', 'ja', 'KW 1, KW 30', 2, 11, '01.10.2026, 16:00 Uhr', 'verstößt gegen aktuelle Regeln: zu viele Wochen am Stück']);
    assert.deepEqual(wb.Personen[2], ['Ben', 'nein', null, null, null, null, null]);
    assert.equal(wb.Wochen.length, 48);
    assert.deepEqual(wb.Wochen[1], [1, '01.01.–07.01.', 5, 'Heilige Drei Könige', 1, 'Anna Ä. <&>']);
    assert.equal(wb.Matrix[0].length, 48);
    assert.equal(wb.Matrix[1][1], 'x');
    assert.equal(wb.Matrix[1][30], 'x');
    assert.equal(wb.Matrix[1][2], null);
    assert.deepEqual(wb.Matrix[3].slice(0, 3), ['Anzahl', 1, 0]);
    assert.equal(wb._fixiert.Matrix, 'B2');
    assert.equal(wb._fixiert.Personen, 'A2');
  });
