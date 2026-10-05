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
const umfrageVon = async (wer, id) => (await als(db, 'authenticated', wer, 'select public.org_umfrage($1) as r', [id]))[0].r;
async function neueUmfrage(wer, titel = 'Team A', jahr = 2027, land = 'BY') {
  return (await als(db, 'authenticated', wer, 'select public.org_umfrage_anlegen($1, $2, $3) as id', [titel, jahr, land]))[0].id;
}

test('org_ich liefert eigenes Profil', async () => {
  assert.deepEqual((await alsChef('select public.org_ich() as r')).r,
    { anzeigename: 'chef', benutzername: 'chef', ist_hauptadmin: true });
});

test('Umfrage anlegen: Standard-Frage „Urlaubswochen“ mit eingeschalteten Regeln', async () => {
  const id = await neueUmfrage(chef, '  Team A  ');
  const e = (await umfrageVon(chef, id)).einstellungen;
  assert.equal(e.titel, 'Team A');
  assert.equal(e.frist_eingabe, '2026-11-30T23:59');
  const f = (await db.query('select * from urlaub.fragen where umfrage_id = $1', [id])).rows;
  assert.equal(f.length, 1);
  assert.deepEqual([f[0].typ, f[0].jahr, f[0].bundesland, f[0].arbeitstage_pro_woche, f[0].aktiv],
    ['urlaubswochen', 2027, 'BY', 6, true]);
  const regeln = Object.fromEntries((await db.query('select art, wert, aktiv from urlaub.regeln where frage_id = $1', [f[0].id]))
    .rows.map((r) => [r.art, [r.wert, r.aktiv]]));
  assert.deepEqual(regeln, {
    pflicht: [null, true], min_wochen: [1, true], max_wochen: [6, true], max_am_stueck: [3, true],
    max_urlaubstage: [36, true], gesperrte_monate: [[12], true],
  });
  const liste = (await alsChef('select public.org_umfragen() as r')).r;
  const eintrag = liste.find((x) => x.id === Number(id));
  assert.deepEqual([eintrag.jahr, eintrag.bundesland, eintrag.mitarbeiter, eintrag.abgegeben], [2027, 'BY', 0, 0]);
});

test('Ungültige Angaben beim Anlegen', async () => {
  await assert.rejects(neueUmfrage(chef, '   '), /TITEL_LEER/);
  await assert.rejects(neueUmfrage(chef, 'X', 2027, 'XX'), /UNGUELTIGE_EINSTELLUNG/);
  await assert.rejects(neueUmfrage(chef, 'X', 1999), /UNGUELTIGE_EINSTELLUNG/);
  await assert.rejects(neueUmfrage(chef, 'X', null), /UNGUELTIGE_EINSTELLUNG/);
});

test('Einstellungen der Umfrage: nur Titel und Frist', async () => {
  const id = await neueUmfrage(chef);
  const speichern = (d) => alsChef('select public.org_umfrage_speichern($1, $2)', [id, d]);
  await speichern({ titel: 'Neu', frist: '2026-12-15T18:00' });
  let e = (await umfrageVon(chef, id)).einstellungen;
  assert.deepEqual([e.titel, e.frist_eingabe], ['Neu', '2026-12-15T18:00']);
  await db.query("update urlaub.umfragen set frist = '2026-11-30 23:59:59 Europe/Berlin' where id = $1", [id]);
  await speichern({ titel: 'Neu2', frist: '2026-11-30T23:59' });
  const s = (await db.query("select to_char(frist at time zone 'Europe/Berlin', 'HH24:MI:SS') as t from urlaub.umfragen where id = $1", [id])).rows[0].t;
  assert.equal(s, '23:59:59');
  await assert.rejects(speichern({ titel: '' }), /UNGUELTIGE_EINSTELLUNG/);
  await assert.rejects(speichern({ frist: '' }), /FRIST_LEER/);
  await assert.rejects(speichern({ frist: 'morgen' }), /UNGUELTIGE_EINSTELLUNG/);
  await assert.rejects(speichern({ frist: 'infinity' }), /UNGUELTIGE_EINSTELLUNG/);
  e = (await umfrageVon(chef, id)).einstellungen;
  assert.equal(e.titel, 'Neu2');
});

test('Mitarbeiter anlegen: Name je Umfrage eindeutig', async () => {
  const a = await neueUmfrage(chef, 'A');
  const b = await neueUmfrage(chef, 'B');
  await alsChef('select public.org_mitarbeiter_anlegen($1, $2)', [a, 'Anna']);
  await assert.rejects(alsChef('select public.org_mitarbeiter_anlegen($1, $2)', [a, ' anna ']), /NAME_DOPPELT/);
  await assert.rejects(alsChef('select public.org_mitarbeiter_anlegen($1, $2)', [a, '  ']), /NAME_LEER/);
  await alsChef('select public.org_mitarbeiter_anlegen($1, $2)', [b, 'Anna']);
  const u = await umfrageVon(chef, a);
  assert.equal(u.mitarbeiter.length, 1);
  assert.match(u.mitarbeiter[0].link, /^https:\/\/urlaub2027\.github\.io\/urlaub\/#[0-9a-f]{32}$/);
});

test('Freie Tage: Jahr kommt aus der Urlaubswochen-Frage', async () => {
  const id = await neueUmfrage(chef);
  await alsChef('select public.org_freien_tag_hinzufuegen($1, $2, $3)', [id, '2027-08-09', 'Betriebsruhe']);
  assert.deepEqual((await umfrageVon(chef, id)).freie_tage, [{ datum: '2027-08-09', name: 'Betriebsruhe' }]);
  await assert.rejects(alsChef('select public.org_freien_tag_hinzufuegen($1, $2, $3)', [id, '2028-01-02', 'x']), /DATUM_FALSCHES_JAHR/);
  await alsChef('select public.org_freien_tag_entfernen($1, $2)', [id, '2027-08-09']);
  assert.deepEqual((await umfrageVon(chef, id)).freie_tage, []);
});

test('Link erneuern und Mitarbeiter löschen', async () => {
  const id = await neueUmfrage(chef);
  await alsChef('select public.org_mitarbeiter_anlegen($1, $2)', [id, 'Lisa']);
  const vorher = (await db.query('select id, code from urlaub.mitarbeiter where umfrage_id = $1', [id])).rows[0];
  await alsChef('select public.org_link_erneuern($1)', [vorher.id]);
  const nachher = (await db.query('select code from urlaub.mitarbeiter where id = $1', [vorher.id])).rows[0].code;
  assert.notEqual(nachher, vorher.code);
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
    ['select public.org_mitarbeiter_loeschen($1)', [m], /MITARBEITER_NICHT_GEFUNDEN/],
    ['select public.org_link_erneuern($1)', [m], /MITARBEITER_NICHT_GEFUNDEN/],
  ];
  for (const [sql, params, fehler] of verboten) await assert.rejects(alsEva(sql, params), fehler, sql);
  assert.ok(!(await alsEva('select public.org_umfragen() as r')).r.some((x) => x.id === Number(id)));
});

test('Gesperrte, unbekannte und nicht angemeldete Nutzer', async () => {
  const gesperrt = await organisator(db, 'gesperrt', { gesperrt: true });
  await assert.rejects(als(db, 'authenticated', gesperrt, 'select public.org_umfragen()'), /KEIN_ZUGRIFF/);
  await assert.rejects(als(db, 'authenticated', null, 'select public.org_ich()'), /KEIN_ZUGRIFF/);
  for (const sql of ['select public.org_ich()', 'select public.org_umfragen()', "select public.org_umfrage_anlegen('x', 2027, 'BY')"]) {
    await assert.rejects(browser(db, sql), /permission denied/, sql);
  }
});

test('Organisator kann Tabellen nicht direkt lesen', async () => {
  for (const t of ['umfragen', 'fragen', 'optionen', 'regeln', 'bedingungen', 'antworten', 'antwort_optionen', 'mitarbeiter']) {
    await assert.rejects(als(db, 'authenticated', chef, `select * from urlaub.${t}`), /permission denied/, t);
  }
});

async function beantworteteUmfrage() {
  const id = await neueUmfrage(chef, 'Löschen');
  await alsChef('select public.org_mitarbeiter_anlegen($1, $2)', [id, 'Anna']);
  const m = (await db.query('select id from urlaub.mitarbeiter where umfrage_id = $1', [id])).rows[0].id;
  const uf = (await db.query("select id from urlaub.fragen where umfrage_id = $1 and typ = 'urlaubswochen'", [id])).rows[0].id;
  const ja = (await db.query(
    "insert into urlaub.fragen (umfrage_id, position, typ, text) values ($1, 2, 'janein', 'Ja?') returning id", [id])).rows[0].id;
  const abh = (await db.query(
    "insert into urlaub.fragen (umfrage_id, position, typ, text) values ($1, 3, 'text_kurz', 'Warum?') returning id", [id])).rows[0].id;
  await db.query("insert into urlaub.antworten (mitarbeiter_id, frage_id, wert) values ($1, $2, '[1,2]'), ($1, $3, 'true')", [m, uf, ja]);
  await db.query("insert into urlaub.bedingungen (frage_id, quelle_id, operator, werte) values ($1, $2, 'ist', 'true')", [abh, ja]);
  return { id, m, uf };
}

test('Umfrage mit Antworten und Bedingungen lässt sich löschen', async () => {
  const { id } = await beantworteteUmfrage();
  await alsChef('select public.org_umfrage_loeschen($1)', [id]);
  for (const sql of [
    'select count(*)::int as n from urlaub.fragen where umfrage_id = $1',
    'select count(*)::int as n from urlaub.mitarbeiter where umfrage_id = $1',
    'select count(*)::int as n from urlaub.antworten a join urlaub.mitarbeiter m on m.id = a.mitarbeiter_id where m.umfrage_id = $1',
  ]) assert.equal((await db.query(sql, [id])).rows[0].n, 0, sql);
  assert.equal((await db.query('select count(*)::int as n from urlaub.bedingungen')).rows[0].n, 0);
});

test('Beantwortete Frage lässt sich einzeln nicht löschen', async () => {
  const { uf } = await beantworteteUmfrage();
  await assert.rejects(db.query('delete from urlaub.fragen where id = $1', [uf]), /foreign key/);
});
