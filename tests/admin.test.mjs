import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { neueDatenbank, als, browser, organisator } from './helfer.mjs';

let db;
let chef;
let eva;

before(async () => {
  db = await neueDatenbank();
  chef = await organisator(db, 'chef', { hauptadmin: true });
  eva = await organisator(db, 'eva');
});

const alsChef = async (sql, params) => (await als(db, 'authenticated', chef, sql, params))[0];
const alsEva = async (sql, params) => (await als(db, 'authenticated', eva, sql, params))[0];
const umfrageVon = async (wer, id) => (await als(db, 'authenticated', wer,
  'select public.org_umfrage($1) as r', [id]))[0].r;

async function neueUmfrage(wer, titel = 'Team A', jahr = 2027, land = 'BY') {
  return (await als(db, 'authenticated', wer, 'select public.org_umfrage_anlegen($1, $2, $3) as id',
    [titel, jahr, land]))[0].id;
}

test('org_ich liefert eigenes Profil', async () => {
  const r = (await alsChef('select public.org_ich() as r')).r;
  assert.deepEqual(r, { anzeigename: 'chef', benutzername: 'chef', ist_hauptadmin: true });
});

test('Umfrage anlegen mit Vorgaben', async () => {
  const id = await neueUmfrage(chef, '  Team A  ');
  const u = await umfrageVon(chef, id);
  const e = u.einstellungen;
  assert.equal(e.titel, 'Team A');
  assert.equal(e.jahr, 2027);
  assert.equal(e.bundesland, 'BY');
  assert.equal(e.arbeitstage_pro_woche, 6);
  assert.equal(e.urlaubstage, 36);
  assert.equal(e.min_wochen, 1);
  assert.equal(e.max_wochen, 6);
  assert.equal(e.max_am_stueck, 3);
  assert.deepEqual(e.gesperrte_monate, [12]);
  assert.equal(e.frist_eingabe, '2026-11-30T23:59');
  assert.equal(e.grunddaten_aenderbar, true);
  assert.equal(u.kalender.length, 52);
  assert.deepEqual(u.mitarbeiter, []);
  const liste = (await alsChef('select public.org_umfragen() as r')).r;
  assert.ok(liste.some((x) => x.id === Number(id) && x.mitarbeiter === 0 && x.abgegeben === 0));
});

test('Ungültige Angaben beim Anlegen', async () => {
  await assert.rejects(neueUmfrage(chef, '   '), /TITEL_LEER/);
  await assert.rejects(neueUmfrage(chef, 'X', 2027, 'XX'), /UNGUELTIGE_EINSTELLUNG/);
  await assert.rejects(neueUmfrage(chef, 'X', 1999), /UNGUELTIGE_EINSTELLUNG/);
  await assert.rejects(neueUmfrage(chef, 'X', null), /UNGUELTIGE_EINSTELLUNG/);
});

test('Mitarbeiter anlegen: Name je Umfrage eindeutig (Groß/klein egal)', async () => {
  const a = await neueUmfrage(chef, 'A');
  const b = await neueUmfrage(chef, 'B');
  await alsChef('select public.org_mitarbeiter_anlegen($1, $2)', [a, 'Anna']);
  await assert.rejects(alsChef('select public.org_mitarbeiter_anlegen($1, $2)', [a, ' anna ']), /NAME_DOPPELT/);
  await assert.rejects(alsChef('select public.org_mitarbeiter_anlegen($1, $2)', [a, '  ']), /NAME_LEER/);
  await alsChef('select public.org_mitarbeiter_anlegen($1, $2)', [b, 'Anna']);
  const u = await umfrageVon(chef, a);
  assert.equal(u.mitarbeiter.length, 1);
  assert.match(u.mitarbeiter[0].link, /^https:\/\/urlaub2027\.github\.io\/urlaub\/#[0-9a-f]{32}$/);
  assert.equal(u.mitarbeiter[0].regelverstoss, null);
});

test('Einstellungen speichern', async () => {
  const id = await neueUmfrage(chef);
  await alsChef('select public.org_umfrage_speichern($1, $2)', [id, {
    titel: 'Neu', max_am_stueck: 2, gesperrte_monate: [12, 7], sperr_hinweis: 'Sommer und Dezember gesperrt',
    frist: '2026-12-15T18:00', urlaubstage: 30, min_wochen: 2, max_wochen: 5,
  }]);
  const e = (await umfrageVon(chef, id)).einstellungen;
  assert.equal(e.titel, 'Neu');
  assert.equal(e.max_am_stueck, 2);
  assert.deepEqual(e.gesperrte_monate, [7, 12]);
  assert.equal(e.sperr_hinweis, 'Sommer und Dezember gesperrt');
  assert.equal(e.frist_eingabe, '2026-12-15T18:00');
  assert.equal(e.urlaubstage, 30);
  assert.equal(e.min_wochen, 2);
  assert.equal(e.max_wochen, 5);
  // Frist unverändert übergeben: Sekunden bleiben erhalten
  await db.query("update urlaub.umfragen set frist = '2026-11-30 23:59:59 Europe/Berlin' where id = $1", [id]);
  await alsChef('select public.org_umfrage_speichern($1, $2)', [id, { titel: 'Neu2', frist: '2026-11-30T23:59' }]);
  const s = (await db.query("select to_char(frist at time zone 'Europe/Berlin', 'HH24:MI:SS') as t from urlaub.umfragen where id = $1", [id])).rows[0].t;
  assert.equal(s, '23:59:59');
});

test('Ungültige Einstellungen werden abgelehnt', async () => {
  const id = await neueUmfrage(chef);
  const speichern = (daten) => alsChef('select public.org_umfrage_speichern($1, $2)', [id, daten]);
  await assert.rejects(speichern({ min_wochen: 4, max_wochen: 3 }), /UNGUELTIGE_EINSTELLUNG/);
  await assert.rejects(speichern({ gesperrte_monate: [13] }), /UNGUELTIGE_EINSTELLUNG/);
  await assert.rejects(speichern({ gesperrte_monate: 'Dezember' }), /UNGUELTIGE_EINSTELLUNG/);
  await assert.rejects(speichern({ urlaubstage: 'viel' }), /UNGUELTIGE_EINSTELLUNG/);
  await assert.rejects(speichern({ titel: '' }), /UNGUELTIGE_EINSTELLUNG/);
  await assert.rejects(speichern({ frist: '' }), /FRIST_LEER/);
  await assert.rejects(speichern({ frist: 'morgen' }), /UNGUELTIGE_EINSTELLUNG/);
  await assert.rejects(speichern({ frist: 'infinity' }), /UNGUELTIGE_EINSTELLUNG/);
  await assert.rejects(speichern({ frist: '-infinity' }), /UNGUELTIGE_EINSTELLUNG/);
});

test('Grunddaten nur ohne Abgaben änderbar; Regelverstoß wird markiert', async () => {
  const id = await neueUmfrage(chef);
  await alsChef('select public.org_umfrage_speichern($1, $2)', [id, { jahr: 2028, bundesland: 'NW', arbeitstage_pro_woche: 5 }]);
  let e = (await umfrageVon(chef, id)).einstellungen;
  assert.deepEqual([e.jahr, e.bundesland, e.arbeitstage_pro_woche], [2028, 'NW', 5]);
  await alsChef('select public.org_umfrage_speichern($1, $2)', [id, { jahr: 2027, bundesland: 'BY', arbeitstage_pro_woche: 6 }]);
  await alsChef('select public.org_mitarbeiter_anlegen($1, $2)', [id, 'Paul']);
  const code = (await db.query("select code from urlaub.mitarbeiter where umfrage_id = $1 and name = 'Paul'", [id])).rows[0].code;
  await browser(db, 'select public.urlaub_speichern($1, $2::int[])', [code, [10, 11, 12]]);
  e = (await umfrageVon(chef, id)).einstellungen;
  assert.equal(e.grunddaten_aenderbar, false);
  await assert.rejects(alsChef('select public.org_umfrage_speichern($1, $2)', [id, { jahr: 2028 }]), /GRUNDDATEN_GESPERRT/);
  await alsChef('select public.org_umfrage_speichern($1, $2)', [id, { jahr: 2027, bundesland: 'BY' }]); // unverändert: erlaubt
  await alsChef('select public.org_umfrage_speichern($1, $2)', [id, { max_am_stueck: 2 }]);
  const p = (await umfrageVon(chef, id)).mitarbeiter[0];
  assert.deepEqual(p.wochen, [10, 11, 12]);
  assert.equal(p.urlaubstage, 17);
  assert.equal(p.regelverstoss, 'ZU_VIELE_AM_STUECK');
});

test('Freie Tage hinzufügen und entfernen', async () => {
  const id = await neueUmfrage(chef);
  await alsChef('select public.org_freien_tag_hinzufuegen($1, $2, $3)', [id, '2027-08-08', 'Augsburger Friedensfest']);
  await alsChef('select public.org_freien_tag_hinzufuegen($1, $2, $3)', [id, '2027-08-09', 'Betriebsruhe']);
  let u = await umfrageVon(chef, id);
  assert.deepEqual(u.freie_tage, [{ datum: '2027-08-08', name: 'Augsburger Friedensfest' }, { datum: '2027-08-09', name: 'Betriebsruhe' }]);
  assert.equal(u.kalender[31].arbeitstage, 5);
  await alsChef('select public.org_freien_tag_entfernen($1, $2)', [id, '2027-08-09']);
  u = await umfrageVon(chef, id);
  assert.equal(u.freie_tage.length, 1);
  assert.equal(u.kalender[31].arbeitstage, 6);
  await assert.rejects(alsChef('select public.org_freien_tag_hinzufuegen($1, $2, $3)', [id, '2028-01-02', 'x']), /DATUM_FALSCHES_JAHR/);
  await assert.rejects(alsChef('select public.org_freien_tag_hinzufuegen($1, $2, $3)', [id, '2027-03-03', ' ']), /NAME_LEER/);
});

test('Link erneuern und Mitarbeiter löschen', async () => {
  const id = await neueUmfrage(chef);
  await alsChef('select public.org_mitarbeiter_anlegen($1, $2)', [id, 'Lisa']);
  const vorher = (await db.query('select id, code from urlaub.mitarbeiter where umfrage_id = $1', [id])).rows[0];
  await alsChef('select public.org_link_erneuern($1)', [vorher.id]);
  const nachher = (await db.query('select code from urlaub.mitarbeiter where id = $1', [vorher.id])).rows[0].code;
  assert.notEqual(nachher, vorher.code);
  await assert.rejects(browser(db, 'select public.urlaub_laden($1)', [vorher.code]), /LINK_UNGUELTIG/);
  await alsChef('select public.org_mitarbeiter_loeschen($1)', [vorher.id]);
  assert.deepEqual((await umfrageVon(chef, id)).mitarbeiter, []);
});

test('Trennung: Eva sieht und ändert nichts von Chef', async () => {
  const id = await neueUmfrage(chef, 'Geheim');
  await alsChef('select public.org_mitarbeiter_anlegen($1, $2)', [id, 'Max']);
  const m = (await db.query('select id from urlaub.mitarbeiter where umfrage_id = $1', [id])).rows[0].id;
  const verboten = [
    ['select public.org_umfrage($1)', [id], /UMFRAGE_NICHT_GEFUNDEN/],
    ['select public.org_umfrage_speichern($1, $2)', [id, { titel: 'gehackt' }], /UMFRAGE_NICHT_GEFUNDEN/],
    ['select public.org_umfrage_loeschen($1)', [id], /UMFRAGE_NICHT_GEFUNDEN/],
    ['select public.org_mitarbeiter_anlegen($1, $2)', [id, 'Eve'], /UMFRAGE_NICHT_GEFUNDEN/],
    ['select public.org_freien_tag_hinzufuegen($1, $2, $3)', [id, '2027-05-05', 'x'], /UMFRAGE_NICHT_GEFUNDEN/],
    ['select public.org_freien_tag_entfernen($1, $2)', [id, '2027-05-05'], /UMFRAGE_NICHT_GEFUNDEN/],
    ['select public.org_mitarbeiter_loeschen($1)', [m], /MITARBEITER_NICHT_GEFUNDEN/],
    ['select public.org_link_erneuern($1)', [m], /MITARBEITER_NICHT_GEFUNDEN/],
    ['select public.org_umfrage($1)', [999999], /UMFRAGE_NICHT_GEFUNDEN/],
  ];
  for (const [sql, params, fehler] of verboten) {
    await assert.rejects(alsEva(sql, params), fehler, sql);
  }
  const evasListe = (await alsEva('select public.org_umfragen() as r')).r;
  assert.ok(!evasListe.some((x) => x.id === Number(id)));
  const u = await umfrageVon(chef, id);
  assert.equal(u.einstellungen.titel, 'Geheim');
  assert.equal(u.mitarbeiter.length, 1);
});

test('Umfrage löschen entfernt Mitarbeiter und Abgaben', async () => {
  const id = await neueUmfrage(eva, 'Weg');
  await alsEva('select public.org_mitarbeiter_anlegen($1, $2)', [id, 'Tom']);
  const code = (await db.query('select code from urlaub.mitarbeiter where umfrage_id = $1', [id])).rows[0].code;
  await browser(db, 'select public.urlaub_speichern($1, $2::int[])', [code, [5]]);
  await alsEva('select public.org_umfrage_loeschen($1)', [id]);
  await assert.rejects(browser(db, 'select public.urlaub_laden($1)', [code]), /LINK_UNGUELTIG/);
  const n = (await db.query('select count(*)::int as n from urlaub.mitarbeiter where umfrage_id = $1', [id])).rows[0].n;
  assert.equal(n, 0);
});

test('Gesperrte, unbekannte und nicht angemeldete Nutzer', async () => {
  const gesperrt = await organisator(db, 'gesperrt', { gesperrt: true });
  await assert.rejects(als(db, 'authenticated', gesperrt, 'select public.org_umfragen()'), /KEIN_ZUGRIFF/);
  await assert.rejects(als(db, 'authenticated', '33333333-3333-3333-3333-333333333333', 'select public.org_ich()'), /KEIN_ZUGRIFF/);
  await assert.rejects(als(db, 'authenticated', null, 'select public.org_ich()'), /KEIN_ZUGRIFF/);
  for (const sql of ['select public.org_ich()', 'select public.org_umfragen()',
                     "select public.org_umfrage_anlegen('x', 2027, 'BY')", 'select public.org_umfrage(1)']) {
    await assert.rejects(browser(db, sql), /permission denied/, sql);
  }
});

test('Organisator kann Tabellen nicht direkt lesen', async () => {
  for (const t of ['umfragen', 'mitarbeiter', 'organisatoren', 'einladungen']) {
    await assert.rejects(als(db, 'authenticated', chef, `select * from urlaub.${t}`), /permission denied/, t);
  }
});

test('Jahreswechsel zieht die Standard-Frist mit, eine eigene Frist bleibt', async () => {
  const speichern = (id, daten) => alsChef('select public.org_umfrage_speichern($1, $2)', [id, daten]);
  const a = await neueUmfrage(chef, 'Jahr A', 2027);
  await speichern(a, { jahr: 2028 });
  assert.equal((await umfrageVon(chef, a)).einstellungen.frist_eingabe, '2027-11-30T23:59');
  const b = await neueUmfrage(chef, 'Jahr B', 2027);
  const alt = (await umfrageVon(chef, b)).einstellungen.frist_eingabe;
  await speichern(b, { jahr: 2028, frist: alt }); // unveränderte Frist aus dem Formular
  assert.equal((await umfrageVon(chef, b)).einstellungen.frist_eingabe, '2027-11-30T23:59');
  const c = await neueUmfrage(chef, 'Jahr C', 2027);
  await speichern(c, { frist: '2026-10-20T12:00' });
  await speichern(c, { jahr: 2028 });
  assert.equal((await umfrageVon(chef, c)).einstellungen.frist_eingabe, '2026-10-20T12:00');
  const d = await neueUmfrage(chef, 'Jahr D', 2027);
  await speichern(d, { jahr: 2028, frist: '2027-05-01T10:00' });
  assert.equal((await umfrageVon(chef, d)).einstellungen.frist_eingabe, '2027-05-01T10:00');
});
