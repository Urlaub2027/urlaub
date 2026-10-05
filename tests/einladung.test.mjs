import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { neueDatenbank, als, browser, registriere } from './helfer.mjs';

let db;
let chef;

const codeAus = (link) => link.split('einladung=')[1];
const einladungVon = async (wer) => (await als(db, 'authenticated', wer,
  'select public.org_einladung_erstellen() as r'))[0].r;
const pruefen = async (code) => (await browser(db, 'select public.einladung_pruefen($1) as r', [code]))[0].r;
const anzahlKonten = async () => (await db.query('select count(*)::int as n from auth.users')).rows[0].n;

before(async () => {
  db = await neueDatenbank();
  const link = (await db.query('select urlaub.start_einladung() as l')).rows[0].l;
  assert.match(link, /^https:\/\/urlaub2027\.github\.io\/urlaub\/admin\.html#einladung=[0-9a-f]{32}$/);
  chef = await registriere(db, 'chef', codeAus(link), 'Chef');
});

test('Start-Einladung macht zum Hauptadmin', async () => {
  const o = (await db.query('select * from urlaub.organisatoren where user_id = $1', [chef])).rows[0];
  assert.equal(o.benutzername, 'chef');
  assert.equal(o.anzeigename, 'Chef');
  assert.equal(o.ist_hauptadmin, true);
  assert.equal(o.eingeladen_von, null);
});

test('Einladung erstellen, prüfen und einlösen', async () => {
  const e = await einladungVon(chef);
  assert.match(e.code, /^[0-9a-f]{32}$/);
  assert.equal(e.link, `https://urlaub2027.github.io/urlaub/admin.html#einladung=${e.code}`);
  assert.deepEqual(await pruefen(e.code), { gueltig: true, eingeladen_von: 'Chef' });
  const eva = await registriere(db, 'eva', e.code, '  Eva  ');
  const o = (await db.query('select * from urlaub.organisatoren where user_id = $1', [eva])).rows[0];
  assert.equal(o.anzeigename, 'Eva');
  assert.equal(o.ist_hauptadmin, false);
  assert.equal(o.eingeladen_von, chef);
  assert.deepEqual(await pruefen(e.code), { gueltig: false, eingeladen_von: null });
  const vorher = await anzahlKonten();
  await assert.rejects(registriere(db, 'eva2', e.code), /EINLADUNG_UNGUELTIG/);
  assert.equal(await anzahlKonten(), vorher);
  // Eingeladene dürfen selbst einladen
  const e2 = await einladungVon(eva);
  assert.deepEqual(await pruefen(e2.code), { gueltig: true, eingeladen_von: 'Eva' });
});

test('Registrierung ohne gültige Einladung wird abgelehnt', async () => {
  const vorher = await anzahlKonten();
  await assert.rejects(registriere(db, 'x1', undefined), /EINLADUNG_FEHLT/);
  await assert.rejects(registriere(db, 'x2', '0'.repeat(32)), /EINLADUNG_UNGUELTIG/);
  const abgelaufen = await einladungVon(chef);
  await db.query("update urlaub.einladungen set gueltig_bis = now() - interval '1 second' where code = $1", [abgelaufen.code]);
  await assert.rejects(registriere(db, 'x3', abgelaufen.code), /EINLADUNG_UNGUELTIG/);
  assert.equal((await pruefen(abgelaufen.code)).gueltig, false);
  const ohneName = await einladungVon(chef);
  await assert.rejects(registriere(db, 'x4', ohneName.code, '   '), /NAME_LEER/);
  assert.equal(await anzahlKonten(), vorher);
  assert.equal((await pruefen(ohneName.code)).gueltig, true); // nicht verbraucht
});

test('Einladung eines gesperrten Organisators ist ungültig', async () => {
  const e = await einladungVon(chef);
  const tim = await registriere(db, 'tim', e.code, 'Tim');
  const vonTim = await einladungVon(tim);
  await db.query('update urlaub.organisatoren set gesperrt = true where user_id = $1', [tim]);
  assert.equal((await pruefen(vonTim.code)).gueltig, false);
  await assert.rejects(registriere(db, 'tims-freund', vonTim.code), /EINLADUNG_UNGUELTIG/);
  await db.query('update urlaub.organisatoren set gesperrt = false where user_id = $1', [tim]);
});

test('Hauptadmin sieht Organisatoren und kann sperren', async () => {
  const e = await einladungVon(chef);
  const lena = await registriere(db, 'lena', e.code, 'Lena');
  await als(db, 'authenticated', lena, "select public.org_umfrage_anlegen('Lenas Team', 2027, 'HE')");
  const liste = (await als(db, 'authenticated', chef, 'select public.haupt_organisatoren() as r'))[0].r;
  const l = liste.find((o) => o.benutzername === 'lena');
  assert.equal(l.anzeigename, 'Lena');
  assert.equal(l.eingeladen_von, 'Chef');
  assert.equal(l.anzahl_umfragen, 1);
  assert.equal(l.gesperrt, false);
  assert.equal(l.ich, false);
  assert.equal(liste.find((o) => o.benutzername === 'chef').ich, true);
  assert.ok(!JSON.stringify(liste).includes('Lenas Team')); // keine Umfrage-Inhalte

  await als(db, 'authenticated', chef, 'select public.haupt_sperren($1, true)', [lena]);
  await assert.rejects(als(db, 'authenticated', lena, 'select public.org_ich()'), /KEIN_ZUGRIFF/);
  await als(db, 'authenticated', chef, 'select public.haupt_sperren($1, false)', [lena]);
  assert.equal((await als(db, 'authenticated', lena, 'select public.org_ich() as r'))[0].r.benutzername, 'lena');

  await assert.rejects(als(db, 'authenticated', chef, 'select public.haupt_sperren($1, true)', [chef]), /NICHT_SELBST/);
  await assert.rejects(als(db, 'authenticated', chef, 'select public.haupt_sperren($1, true)',
    ['44444444-4444-4444-4444-444444444444']), /NICHT_GEFUNDEN/);
  await assert.rejects(als(db, 'authenticated', lena, 'select public.haupt_organisatoren()'), /KEIN_ZUGRIFF/);
  await assert.rejects(als(db, 'authenticated', lena, 'select public.haupt_sperren($1, true)', [chef]), /KEIN_ZUGRIFF/);
});

test('Hauptadmins können nicht gesperrt werden', async () => {
  const link = (await db.query('select urlaub.start_einladung() as l')).rows[0].l;
  const zweiter = await registriere(db, 'chef2', codeAus(link), 'Chef 2');
  assert.equal((await db.query('select ist_hauptadmin from urlaub.organisatoren where user_id = $1', [zweiter])).rows[0].ist_hauptadmin, true);
  await assert.rejects(als(db, 'authenticated', chef, 'select public.haupt_sperren($1, true)', [zweiter]),
    /HAUPTADMIN_NICHT_SPERRBAR/);
  await als(db, 'authenticated', chef, 'select public.haupt_sperren($1, false)', [zweiter]); // Entsperren bleibt harmlos
});

test('Rechte: wer darf was aufrufen', async () => {
  assert.deepEqual(await pruefen(null), { gueltig: false, eingeladen_von: null });
  for (const sql of ['select public.org_einladung_erstellen()', 'select public.haupt_organisatoren()',
                     "select public.haupt_sperren('44444444-4444-4444-4444-444444444444', true)"]) {
    await assert.rejects(browser(db, sql), /permission denied/, sql);
  }
  await assert.rejects(browser(db, 'select urlaub.start_einladung()'), /permission denied/);
  await assert.rejects(als(db, 'authenticated', chef, 'select urlaub.start_einladung()'), /permission denied/);
});
