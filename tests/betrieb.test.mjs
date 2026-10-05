import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { neueDatenbank, als, browser, organisator } from './helfer.mjs';

let db;
let chef;

before(async () => {
  db = await neueDatenbank();
  chef = await organisator(db, 'chef');
});

const lebenszeichen = async () => (await als(db, 'authenticated', chef, 'select public.org_lebenszeichen() as z'))[0].z;

test('Lebenszeichen: anon schreibt, Verwaltung liest, Tabelle bleibt verborgen', async () => {
  assert.equal(await lebenszeichen(), null);
  await browser(db, 'select public.lebenszeichen()');
  await browser(db, 'select public.lebenszeichen()'); // zweimal kurz hintereinander: kein Fehler
  const z1 = new Date(await lebenszeichen());
  assert.ok(Math.abs(Date.now() - z1.getTime()) < 60_000);
  await db.query("update urlaub.lebenszeichen set zeit = now() - interval '2 days'");
  await browser(db, 'select public.lebenszeichen()');
  assert.ok(Math.abs(Date.now() - new Date(await lebenszeichen()).getTime()) < 60_000);
  await assert.rejects(browser(db, 'select * from urlaub.lebenszeichen'), /permission denied/);
  await assert.rejects(browser(db, 'select public.org_lebenszeichen()'), /permission denied/);
});

test('Rechte: anon nur für die öffentlichen Funktionen, Angemeldete nur für org_/haupt_', async () => {
  const { rows } = await db.query(`
    select n.nspname, p.proname,
           has_function_privilege('anon', p.oid, 'execute') as anon,
           has_function_privilege('authenticated', p.oid, 'execute') as angemeldet
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'urlaub')`);
  const OEFFENTLICH = ['urlaub_laden', 'umfrage_absenden', 'einladung_pruefen', 'lebenszeichen'];
  assert.ok(rows.some((f) => f.proname === 'lebenszeichen'));
  for (const f of rows) {
    if (f.nspname === 'urlaub') {
      assert.deepEqual([f.anon, f.angemeldet], [false, false], `urlaub.${f.proname}`);
    } else {
      assert.equal(f.anon, OEFFENTLICH.includes(f.proname), `anon: ${f.proname}`);
      if (!OEFFENTLICH.includes(f.proname)) {
        assert.equal(f.angemeldet, /^(org|haupt)_/.test(f.proname), `angemeldet: ${f.proname}`);
      }
    }
  }
});
