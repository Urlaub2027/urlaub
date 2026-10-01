// Testet supabase/schema.sql in einer lokalen Postgres-Instanz (PGlite).
// Die Supabase-Rollen und deren Standardrechte werden nachgebildet, damit der
// Zugriffstest dieselbe Ausgangslage hat wie ein echtes Supabase-Projekt.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const SCHEMA = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');

let db;
let annaCode;
let benCode;

before(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  `);
  await db.exec(SCHEMA);
  await db.exec(SCHEMA); // erneutes Ausführen muss unschädlich sein
  const r = await db.query(
    "insert into urlaub.mitarbeiter (name) values ('Anna'), ('Ben') returning name, code");
  annaCode = r.rows.find((x) => x.name === 'Anna').code;
  benCode = r.rows.find((x) => x.name === 'Ben').code;
});

// Ruft eine Funktion so auf, wie es der Browser-Schlüssel tut (Rolle anon).
async function alsBrowser(sql, params = []) {
  await db.exec('set role anon');
  try {
    return (await db.query(sql, params)).rows;
  } finally {
    await db.exec('reset role');
  }
}

const laden = async (code) =>
  (await alsBrowser('select public.urlaub_laden($1) as r', [code]))[0].r;
const speichern = async (code, wochen) =>
  (await alsBrowser('select public.urlaub_speichern($1, $2::int[]) as r', [code, wochen]))[0].r;

async function setzeFrist(ausdruck) {
  await db.exec(`update urlaub.einstellungen set frist = ${ausdruck}`);
}

test('Code wird automatisch erzeugt: 32 Hex-Zeichen, pro Person verschieden', () => {
  assert.match(annaCode, /^[0-9a-f]{32}$/);
  assert.notEqual(annaCode, benCode);
});

test('Laden liefert Name, leere Wahl und Kalender KW 1–47', async () => {
  const r = await laden(annaCode);
  assert.equal(r.name, 'Anna');
  assert.deepEqual(r.wochen, []);
  assert.equal(r.kalender.length, 47);
  assert.deepEqual(r.kalender[0], {
    kw: 1, von: '04.01.', bis: '10.01.', monat: 1, arbeitstage: 5, feiertag: 'Heilige Drei Könige',
  });
  assert.equal(r.kalender[46].von, '22.11.');
  assert.equal(r.kalender[46].bis, '28.11.');
  assert.equal(r.max_wochen, 6);
  assert.equal(r.urlaubstage, 36);
});

test('Feiertagswochen kosten 5 Tage, Sonntags-Feiertage zählen nicht', async () => {
  const { kalender } = await laden(annaCode);
  const fuenf = kalender.filter((k) => k.arbeitstage === 5).map((k) => k.kw);
  assert.deepEqual(fuenf, [1, 12, 13, 17, 18, 20, 21, 44]);
  assert.ok(kalender.every((k) => k.arbeitstage === 5 || k.arbeitstage === 6));
  assert.equal(kalender[31].kw, 32); // Mariä Himmelfahrt (So 15.08.)
  assert.equal(kalender[31].arbeitstage, 6);
});

test('Gültige Abgabe wird gespeichert und sortiert zurückgegeben', async () => {
  await setzeFrist("now() + interval '1 day'");
  const r = await speichern(annaCode, [30, 12, 2]);
  assert.deepEqual(r.wochen, [2, 12, 30]);
  assert.ok(r.geaendert_am);
  assert.deepEqual((await laden(annaCode)).wochen, [2, 12, 30]);
});

test('Ändern einer Abgabe überschreibt sie, es bleibt ein Eintrag', async () => {
  await setzeFrist("now() + interval '1 day'");
  await speichern(annaCode, [1, 2, 3, 4, 5, 6]);
  const r = await speichern(annaCode, [40]);
  assert.deepEqual(r.wochen, [40]);
  const anzahl = await db.query(
    "select count(*)::int as n from urlaub.abgaben a join urlaub.mitarbeiter m on m.id = a.mitarbeiter_id where m.name = 'Anna'");
  assert.equal(anzahl.rows[0].n, 1);
});

test('6 Wochen sind erlaubt, 7 Wochen werden abgelehnt', async () => {
  await setzeFrist("now() + interval '1 day'");
  await speichern(benCode, [1, 12, 13, 17, 18, 20]);
  await assert.rejects(speichern(benCode, [1, 12, 13, 17, 18, 20, 21]), /ZU_VIELE_WOCHEN/);
  assert.deepEqual((await laden(benCode)).wochen, [1, 12, 13, 17, 18, 20]);
});

test('KW 48, KW 0 und leere Wahl werden abgelehnt', async () => {
  await setzeFrist("now() + interval '1 day'");
  await assert.rejects(speichern(benCode, [48]), /UNGUELTIGE_WOCHE/);
  await assert.rejects(speichern(benCode, [5, 52]), /UNGUELTIGE_WOCHE/);
  await assert.rejects(speichern(benCode, [0]), /UNGUELTIGE_WOCHE/);
  await assert.rejects(speichern(benCode, [5, null]), /UNGUELTIGE_WOCHE/);
  await assert.rejects(speichern(benCode, []), /KEINE_WOCHE/);
  await assert.rejects(speichern(benCode, null), /KEINE_WOCHE/);
  await assert.rejects(speichern(benCode, [5, 5]), /DOPPELTE_WOCHE/);
});

test('Falscher Code wird beim Laden und Speichern abgelehnt', async () => {
  await setzeFrist("now() + interval '1 day'");
  await assert.rejects(laden('0'.repeat(32)), /LINK_UNGUELTIG/);
  await assert.rejects(laden(''), /LINK_UNGUELTIG/);
  await assert.rejects(laden(null), /LINK_UNGUELTIG/);
  await assert.rejects(speichern('0'.repeat(32), [5]), /LINK_UNGUELTIG/);
});

test('Nach der Frist: Speichern abgelehnt, Ansehen weiter möglich', async () => {
  await setzeFrist("now() + interval '1 day'");
  await speichern(annaCode, [10, 11]);
  await setzeFrist("now() - interval '1 second'");
  await assert.rejects(speichern(annaCode, [12]), /FRIST_ABGELAUFEN/);
  const r = await laden(annaCode);
  assert.equal(r.offen, false);
  assert.deepEqual(r.wochen, [10, 11]);
  await setzeFrist("now() + interval '1 day'");
});

test('Tagesgrenze wird in der Datenbank geprüft', async () => {
  await setzeFrist("now() + interval '1 day'");
  await db.exec('update urlaub.einstellungen set max_wochen = 7');
  try {
    // 7 Feiertagswochen = 35 Tage: erlaubt. 6 × 6 + 5 = 41 Tage: abgelehnt.
    const r = await speichern(benCode, [1, 12, 13, 17, 18, 20, 21]);
    assert.equal(r.wochen.length, 7);
    await assert.rejects(speichern(benCode, [2, 3, 4, 5, 6, 7, 12]), /ZU_VIELE_TAGE/);
  } finally {
    await db.exec('update urlaub.einstellungen set max_wochen = 6');
  }
});

test('Browser-Schlüssel kann Tabellen und Ansichten nicht lesen oder beschreiben', async () => {
  for (const ziel of ['mitarbeiter', 'abgaben', 'einstellungen', 'feiertage',
                      'links', 'auswertung_personen', 'auswertung_wochen', 'kalender']) {
    await assert.rejects(alsBrowser(`select * from urlaub.${ziel}`), /permission denied/, ziel);
  }
  await assert.rejects(
    alsBrowser("insert into urlaub.mitarbeiter (name) values ('Eve')"), /permission denied/);
  await assert.rejects(
    alsBrowser("update urlaub.einstellungen set frist = now() + interval '1 year'"), /permission denied/);
  await assert.rejects(alsBrowser('select urlaub.antwort(1)'), /permission denied/);
});

test('Laden mit einem Code liefert nur die eigenen Daten', async () => {
  const r = await laden(benCode);
  assert.equal(r.name, 'Ben');
  assert.ok(!JSON.stringify(r).includes('Anna'));
  assert.ok(!JSON.stringify(r).includes(annaCode));
  assert.ok(!('code' in r));
});

test('Angemeldete Rolle (authenticated) hat ebenfalls keinen Zugriff', async () => {
  await db.exec('set role authenticated');
  try {
    await assert.rejects(db.query('select * from urlaub.abgaben'), /permission denied/);
    await assert.rejects(db.query('select public.urlaub_laden($1)', [annaCode]), /permission denied/);
  } finally {
    await db.exec('reset role');
  }
});

test('Auswertungs-Ansichten für das Dashboard', async () => {
  await setzeFrist("now() + interval '1 day'");
  await db.query("insert into urlaub.mitarbeiter (name) values ('Carla')");
  await speichern(annaCode, [12, 30]);
  await speichern(benCode, [30]);

  const personen = (await db.query('select * from urlaub.auswertung_personen')).rows;
  assert.deepEqual(personen.map((p) => [p.name, p.abgegeben, p.wochen, p.anzahl_wochen, p.urlaubstage]), [
    ['Anna', 'ja', 'KW 12, KW 30', 2, 11],
    ['Ben', 'ja', 'KW 30', 1, 6],
    ['Carla', 'nein', null, null, null],
  ]);
  assert.match(personen[0].letzte_aenderung, /^\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}$/);

  const wochen = (await db.query('select * from urlaub.auswertung_wochen')).rows;
  assert.equal(wochen.length, 47);
  const kw30 = wochen.find((w) => w.kw === 30);
  assert.equal(kw30.anzahl, 2);
  assert.equal(kw30.namen, 'Anna, Ben');
  assert.equal(kw30.zeitraum, '26.07.–01.08.');
  assert.equal(wochen.find((w) => w.kw === 31).anzahl, 0);

  const links = (await db.query('select * from urlaub.links')).rows;
  assert.equal(links.length, 3);
  assert.equal(links[0].link, `https://DEIN-GITHUB-NAME.github.io/urlaub-2027/#${annaCode}`);
});
