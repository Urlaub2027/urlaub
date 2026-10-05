// Baut Umfragen aus einer kompakten Beschreibung direkt in PGlite (als Superuser).
// Beschreibung: { titel?, fragen: [{ key, typ, text?, aktiv?, verknuepfung?, optionen?: [key | {key, aktiv}],
//   regeln?: {art: wert | {wert, aktiv}}, bedingungen?: [{quelle, operator, werte, aktiv?}], skala?: {von, bis},
//   jahr?, bundesland? }] }
export async function baueUmfrage(db, organisatorId, beschreibung, { frist = "now() + interval '1 day'" } = {}) {
  const r = await db.query(
    `insert into urlaub.umfragen (organisator_id, titel, frist) values ($1, $2, ${frist}) returning id`,
    [organisatorId, beschreibung.titel || 'Testumfrage']);
  const umfrageId = r.rows[0].id;
  const ids = {};
  const optionen = {};
  const typen = {};
  let position = 0;
  for (const f of beschreibung.fragen) {
    position += 1;
    let frageId;
    if (f.typ === 'urlaubswochen') {
      frageId = (await db.query('select urlaub.standard_urlaubsfrage($1, $2, $3) as id',
        [umfrageId, f.jahr || 2027, f.bundesland || 'BY'])).rows[0].id;
      await db.query('update urlaub.fragen set position = $2, aktiv = $3 where id = $1', [frageId, position, f.aktiv !== false]);
    } else {
      frageId = (await db.query(
        `insert into urlaub.fragen (umfrage_id, position, typ, text, aktiv, verknuepfung, skala_von, skala_bis)
         values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
        [umfrageId, position, f.typ, f.text || f.key, f.aktiv !== false, f.verknuepfung || 'und',
          f.typ === 'skala' ? (f.skala?.von ?? 1) : null, f.typ === 'skala' ? (f.skala?.bis ?? 5) : null])).rows[0].id;
    }
    ids[f.key] = frageId;
    typen[f.key] = f.typ;
    optionen[f.key] = {};
    let p = 0;
    for (const o of f.optionen || []) {
      p += 1;
      const [key, aktiv] = typeof o === 'string' ? [o, true] : [o.key, o.aktiv !== false];
      optionen[f.key][key] = (await db.query(
        'insert into urlaub.optionen (frage_id, position, text, aktiv) values ($1, $2, $3, $4) returning id',
        [frageId, p, key, aktiv])).rows[0].id;
    }
    for (const [art, angabe] of Object.entries(f.regeln || {})) {
      const { wert, aktiv } = angabe !== null && typeof angabe === 'object' && !Array.isArray(angabe) && 'wert' in angabe
        ? { wert: angabe.wert, aktiv: angabe.aktiv !== false } : { wert: angabe, aktiv: true };
      await db.query(
        `insert into urlaub.regeln (frage_id, art, wert, aktiv) values ($1, $2, $3, $4)
         on conflict (frage_id, art) do update set wert = excluded.wert, aktiv = excluded.aktiv`,
        [frageId, art, JSON.stringify(wert ?? null), aktiv]);
    }
    for (const b of f.bedingungen || []) {
      const werte = ['einfach', 'mehrfach'].includes(typen[b.quelle]) ? b.werte.map((k) => optionen[b.quelle][k]) : b.werte;
      await db.query(
        'insert into urlaub.bedingungen (frage_id, quelle_id, operator, werte, aktiv) values ($1, $2, $3, $4, $5)',
        [frageId, ids[b.quelle], b.operator, JSON.stringify(werte), b.aktiv !== false]);
    }
  }
  return { umfrageId, ids, optionen, typen };
}

// {key: wert} mit Options-Schlüsseln → {"<frage_id>": wert} mit Options-IDs.
export function mitIds(bau, antworten) {
  const aus = {};
  for (const [key, wert] of Object.entries(antworten)) {
    let w = wert;
    if (bau.typen[key] === 'einfach' && typeof wert === 'string') w = bau.optionen[key][wert];
    if (bau.typen[key] === 'mehrfach' && Array.isArray(wert)) {
      w = wert.map((k) => (typeof k === 'string' ? bau.optionen[key][k] : k));
    }
    aus[String(bau.ids[key])] = w;
  }
  return aus;
}

// Frage-IDs → Schlüssel (Reihenfolge bleibt).
export function schluessel(bau, ids) {
  const rueck = Object.fromEntries(Object.entries(bau.ids).map(([k, v]) => [String(v), k]));
  return ids.map((id) => rueck[String(id)]);
}

// Wartet auf einen Fehler und liefert Meldung und Fehler pro Frage (Schlüssel statt IDs).
export async function fehlerVon(bau, versprechen) {
  try {
    await versprechen;
  } catch (e) {
    const roh = e.detail ? JSON.parse(e.detail) : null;
    const fehler = roh && Object.fromEntries(Object.entries(roh).map(([id, code]) => [schluessel(bau, [id])[0], code]));
    return { message: e.message, fehler };
  }
  throw new Error('Es wurde ein Fehler erwartet');
}
