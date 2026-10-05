// Gemeinsame Testfälle für die Sichtbarkeit: gegen die Datenbank und gegen
// docs/formular-logik.js (Browser) – beide müssen dasselbe Ergebnis liefern.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { neueDatenbank, browser, organisator } from './helfer.mjs';
import { baueUmfrage, mitIds, schluessel } from './umfrage-bauer.mjs';
import { sichtbareFragen } from '../docs/formular-logik.js';

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

for (const fall of FIXTURE.faelle) {
  test(`Browser: ${fall.name}`, async () => {
    const daten = (await browser(db, 'select public.urlaub_laden($1) as r', [code]))[0].r;
    const sichtbar = sichtbareFragen(daten.fragen, mitIds(bau, fall.antworten));
    const inReihenfolge = daten.fragen.map((f) => f.id).filter((id) => sichtbar.has(id));
    assert.deepEqual(schluessel(bau, inReihenfolge), fall.sichtbar);
  });
}
