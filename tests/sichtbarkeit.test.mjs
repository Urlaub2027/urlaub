// Gemeinsame Testfälle für die Sichtbarkeit: hier gegen die Datenbank.
// Task 4 ergänzt dieselben Fälle gegen docs/formular-logik.js.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { neueDatenbank, browser, organisator } from './helfer.mjs';
import { baueUmfrage, mitIds, schluessel } from './umfrage-bauer.mjs';

const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/sichtbarkeit-faelle.json', import.meta.url), 'utf8'));
let db;
let bau;
let code;

before(async () => {
  db = await neueDatenbank();
  const chef = await organisator(db, 'chef');
  bau = await baueUmfrage(db, chef, { fragen: FIXTURE.fragen });
  code = (await db.query("insert into urlaub.mitarbeiter (umfrage_id, name) values ($1, 'Test') returning code", [bau.umfrageId])).rows[0].code;
});

for (const fall of FIXTURE.faelle) {
  test(`Datenbank: ${fall.name}`, async () => {
    const r = (await db.query('select urlaub.pruefe_antworten($1, $2) as r', [bau.umfrageId, JSON.stringify(mitIds(bau, fall.antworten))])).rows[0].r;
    assert.deepEqual(schluessel(bau, r.sichtbar), fall.sichtbar);
    assert.deepEqual(r.fehler, {});
  });
}

test('Mitarbeiter-Sicht enthält ausgeschaltete Fragen und Bedingungen nicht', async () => {
  const r = (await browser(db, 'select public.urlaub_laden($1) as r', [code]))[0].r;
  const keys = schluessel(bau, r.fragen.map((f) => f.id));
  assert.ok(!keys.includes('aus'));
  const bedingungAus = r.fragen.find((f) => f.id === Number(bau.ids.bedingung_aus));
  assert.deepEqual(bedingungAus.bedingungen, []);
});
