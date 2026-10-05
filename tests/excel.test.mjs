// Erzeugt die .xlsx-Datei der Auswertung und liest sie mit openpyxl (Python) zurück.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { erzeugeXlsx } from '../docs/xlsx.js';
import { excelBlaetter } from '../docs/auswertung.js';

const kalender = Array.from({ length: 52 }, (_, i) => ({
  kw: i + 1, von: '01.01.', bis: '07.01.', monat: i >= 47 ? 12 : 1,
  arbeitstage: i === 0 ? 5 : 6, feiertag: i === 0 ? 'Heilige Drei Könige' : null, gesperrt: i >= 47,
}));
const daten = {
  kalender,
  fragen: [
    { id: 1, typ: 'urlaubswochen', text: 'Urlaub', aktiv: true, optionen: [], regeln: {}, bedingungen: [] },
    { id: 2, typ: 'einfach', text: 'Schicht', aktiv: true, optionen: [{ id: 21, text: 'Früh', aktiv: true }], regeln: {}, bedingungen: [] },
    { id: 3, typ: 'text_kurz', text: 'Alt', aktiv: false, optionen: [], regeln: {}, bedingungen: [] },
    { id: 4, typ: 'hinweis', text: 'Info', aktiv: true, optionen: [], regeln: {}, bedingungen: [] },
  ],
  mitarbeiter: [
    { id: 1, name: 'Anna Ä. <&>', link: 'x', geaendert_am: '2026-10-01T14:00:00Z',
      antworten: { 1: [1, 30], 2: 21 }, verstoesse: { 1: 'ZU_VIELE_AM_STUECK' } },
    { id: 2, name: 'Ben', link: 'y', geaendert_am: null, antworten: {}, verstoesse: {} },
  ],
};

const python = spawnSync('python', ['-c', 'import openpyxl'], { encoding: 'utf8' });

test('Excel-Datei: Antworten, Wochen, Matrix', { skip: python.status !== 0 && 'python/openpyxl nicht verfügbar' }, () => {
  const datei = join(mkdtempSync(join(tmpdir(), 'urlaub-')), 'test.xlsx');
  writeFileSync(datei, erzeugeXlsx(excelBlaetter(daten)));
  const r = spawnSync('python', ['-c', `
import json, sys, openpyxl
wb = openpyxl.load_workbook(sys.argv[1])
print(json.dumps({ws.title: [[c for c in row] for row in ws.iter_rows(values_only=True)] for ws in wb}, ensure_ascii=False, default=str))
`, datei], { encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
  assert.equal(r.status, 0, r.stderr);
  const wb = JSON.parse(r.stdout);
  assert.deepEqual(Object.keys(wb), ['Antworten', 'Wochen', 'Matrix']);
  assert.deepEqual(wb.Antworten[0], ['Name', 'Abgegeben', 'Letzte Änderung', 'Urlaub', 'Schicht', 'Alt (aus)', 'Hinweis']);
  assert.deepEqual(wb.Antworten[1].slice(0, 6), ['Anna Ä. <&>', 'ja', '01.10.2026, 16:00 Uhr', 'KW 1, KW 30', 'Früh', null]);
  assert.match(wb.Antworten[1][6], /^Urlaub: .*am Stück/);
  assert.deepEqual(wb.Antworten[2], ['Ben', 'nein', null, null, null, null, null]);
  assert.equal(wb.Wochen.length, 48);
  assert.deepEqual(wb.Wochen[1], [1, '01.01.–07.01.', 5, 'Heilige Drei Könige', 1, 'Anna Ä. <&>']);
  assert.equal(wb.Matrix[0].length, 48);
  assert.equal(wb.Matrix[1][1], 'x');
});

test('Excel-Datei ohne Urlaubswochen hat nur das Blatt „Antworten“', { skip: python.status !== 0 && 'python/openpyxl nicht verfügbar' }, () => {
  const ohne = { ...daten, kalender: [], fragen: daten.fragen.slice(1) };
  const blaetter = excelBlaetter(ohne);
  assert.deepEqual(blaetter.map((b) => b.name), ['Antworten']);
});
