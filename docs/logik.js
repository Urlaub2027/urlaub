// Reine Rechenlogik der Seite, ohne Browser-Abhängigkeiten (dadurch testbar).
// Die verbindlichen Prüfungen macht die Datenbank; das hier ist nur die Anzeige.

export const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli',
  'August', 'September', 'Oktober', 'November', 'Dezember'];

const FEHLERTEXTE = {
  LINK_UNGUELTIG: 'Dieser Link ist ungültig. Bitte frag nach deinem persönlichen Link.',
  FRIST_ABGELAUFEN: 'Die Frist ist abgelaufen. Änderungen sind nicht mehr möglich.',
  KEINE_WOCHE: 'Bitte wähle mindestens eine Woche.',
  UNGUELTIGE_WOCHE: 'Mindestens eine gewählte Woche ist nicht wählbar.',
  ZU_WENIGE_WOCHEN: 'Bitte wähle mehr Wochen.',
  ZU_VIELE_AM_STUECK: 'So viele Wochen am Stück sind nicht erlaubt.',
  DOPPELTE_WOCHE: 'Eine Woche wurde doppelt gewählt.',
  ZU_VIELE_WOCHEN: 'Du hast zu viele Wochen gewählt.',
  ZU_VIELE_TAGE: 'Die gewählten Wochen brauchen mehr Urlaubstage, als du hast.',
  UNGUELTIGER_TAG: 'Mindestens ein gewählter Tag ist nicht wählbar.',
  DOPPELTER_TAG: 'Ein Tag wurde doppelt gewählt.',
  TAGE_ERST_NACH_WOCHEN: 'Einzelne Tage gehen erst, wenn du alle Wochen gewählt hast.',
  TAG_ZU_VIELE_AM_STUECK: 'Ein gewählter Tag macht deinen Urlaub zu lang am Stück.',
};

// Der Code steht hinter dem # im Link. Er wird so nie an GitHub übertragen.
export function codeAusLink(hash) {
  const code = String(hash || '').replace(/^#/, '').trim().toLowerCase();
  return /^[0-9a-f]{32}$/.test(code) ? code : null;
}

export function fehlertext(code) {
  return FEHLERTEXTE[code] || 'Das hat nicht geklappt. Bitte versuch es später noch einmal.';
}

// maxWochen / urlaubstage = null: Regel ausgeschaltet, keine Grenze. anzahlTage: einzelne Tage.
export function zusammenfassung(kalender, auswahl, maxWochen, urlaubstage, anzahlTage = 0) {
  const gewaehlt = kalender.filter((k) => auswahl.has(k.kw));
  const anzahl = gewaehlt.length;
  const tage = gewaehlt.reduce((summe, k) => summe + k.arbeitstage, 0) + anzahlTage;
  const mitMax = maxWochen !== null && maxWochen !== undefined;
  const mitTagen = urlaubstage !== null && urlaubstage !== undefined;
  const wochen = mitMax
    ? `${anzahl} von ${maxWochen} Wochen gewählt`
    : `${anzahl} ${anzahl === 1 ? 'Woche' : 'Wochen'} gewählt`;
  const einzeln = anzahlTage > 0 ? ` · ${anzahlTage} ${anzahlTage === 1 ? 'einzelner Tag' : 'einzelne Tage'}` : '';
  const urlaub = mitTagen
    ? `${tage} von ${urlaubstage} Urlaubstagen`
    : `${tage} ${tage === 1 ? 'Urlaubstag' : 'Urlaubstage'}`;
  return {
    anzahl,
    tage,
    limitErreicht: mitMax && anzahl >= maxWochen,
    text: `${wochen}${einzeln} · ${urlaub}`,
  };
}

// Länge der Folge aufeinanderfolgender KWs, die entstünde, wenn kw dazukäme.
export function folgeLaenge(kw, auswahl) {
  let n = 1;
  for (let k = kw - 1; auswahl.has(k); k -= 1) n += 1;
  for (let k = kw + 1; auswahl.has(k); k += 1) n += 1;
  return n;
}

// Gesperrt, wenn die Frist vorbei ist, das Limit erreicht ist oder die Folge zu lang
// würde – außer das Kästchen ist schon angehakt (Abwählen bleibt immer möglich).
export function istGesperrt(kw, auswahl, limitErreicht, offen, maxAmStueck = Infinity) {
  if (!offen) return true;
  if (auswahl.has(kw)) return false;
  if (limitErreicht) return true;
  return folgeLaenge(kw, auswahl) > maxAmStueck;
}

export function nachMonat(kalender) {
  const gruppen = new Map();
  for (const k of kalender.filter((x) => !x.gesperrt)) {
    if (!gruppen.has(k.monat)) gruppen.set(k.monat, []);
    gruppen.get(k.monat).push(k);
  }
  return [...gruppen].map(([monat, wochen]) => ({ name: MONATE[monat - 1], wochen }));
}

// Gewählte KWs, die inzwischen gesperrt sind oder im Kalender fehlen.
export function gesperrteGewaehlte(kalender, wochen) {
  return wochen.filter((kw) => {
    const k = kalender.find((x) => x.kw === kw);
    return !k || k.gesperrt;
  });
}

// Aufeinanderfolgende gesperrte KWs als Zeiträume (von = Beginn der ersten, bis = Ende der letzten KW).
export function gesperrteZeitraeume(kalender) {
  const zeitraeume = [];
  let letzter = null;
  for (const k of [...kalender].sort((a, b) => a.kw - b.kw)) {
    if (!k.gesperrt) { letzter = null; continue; }
    if (letzter && k.kw === letzter.bisKw + 1) {
      letzter.bisKw = k.kw;
      letzter.bis = k.bis;
    } else {
      letzter = { vonKw: k.kw, bisKw: k.kw, von: k.von, bis: k.bis };
      zeitraeume.push(letzter);
    }
  }
  return zeitraeume;
}

const DATUM = new Intl.DateTimeFormat('de-DE', {
  timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit',
});

export function zeitpunkt(iso) {
  return `${DATUM.format(new Date(iso))} Uhr`;
}

// ---------------------------------------------------------------- Einzelne Tage
// Antwort der Urlaubswochen-Frage: Zahlen = KWs, Texte "YYYY-MM-DD" = einzelne Tage.
// Fachregel-Duplikat: waehlbareTage und tagSperrgrund spiegeln urlaub.waehlbare_tage und
// urlaub.tag_verlaengert_block in supabase/schema.sql. Änderungen dort nachziehen.

const DATUMSTEXT = /^\d{4}-\d{2}-\d{2}$/;
const WOCHENTAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const MS_TAG = 86400000;

export const wochenAus = (wert) => (Array.isArray(wert) ? wert.filter((x) => typeof x === 'number') : []);
export const tageAus = (wert) => (Array.isArray(wert)
  ? wert.filter((x) => typeof x === 'string' && DATUMSTEXT.test(x)) : []);
// einzeltage hat immer den Wert null – deshalb hasOwnProperty statt Wertprüfung.
export const einzeltageAn = (regeln) => Object.prototype.hasOwnProperty.call(regeln || {}, 'einzeltage');

const zeitVon = (iso) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
export const plusTage = (iso, n) => new Date(zeitVon(iso) + n * MS_TAG).toISOString().slice(0, 10);
export const wochentag = (iso) => ((new Date(zeitVon(iso)).getUTCDay() + 6) % 7) + 1;
export const tagKurz = (iso) => `${WOCHENTAGE[wochentag(iso) - 1]} ${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;
export const tagLang = (iso) => `${tagKurz(iso)}${iso.slice(0, 4)}`;

export function kwVon(kalender, iso) {
  const k = (kalender || []).find((x) => x.montag && x.montag <= iso && iso <= plusTage(x.montag, 6));
  return k ? k.kw : null;
}

export function tageKontext(uw) {
  return {
    kalender: uw?.kalender || [],
    frei: new Set((uw?.freie_tage || []).map((t) => t.datum)),
    arbeitstage: uw?.arbeitstage_pro_woche || 5,
  };
}

export function waehlbareTage(ctx, wochen) {
  const gewaehlt = new Set(wochen);
  const tage = [];
  for (const k of ctx.kalender) {
    if (k.gesperrt || gewaehlt.has(k.kw) || !k.montag) continue;
    for (let i = 0; i < ctx.arbeitstage; i += 1) {
      const datum = plusTage(k.montag, i);
      if (!ctx.frei.has(datum)) tage.push({ datum, kw: k.kw });
    }
  }
  return tage.sort((a, b) => (a.datum < b.datum ? -1 : 1));
}

// Blöcke aufeinanderfolgender gewählter KWs mit mindestens `mindestens` Wochen.
function volleBloecke(ctx, wochen, mindestens) {
  const montag = new Map(ctx.kalender.map((k) => [k.kw, k.montag]));
  const sortiert = [...new Set(wochen)].sort((a, b) => a - b);
  const bloecke = [];
  for (const kw of sortiert) {
    const letzter = bloecke[bloecke.length - 1];
    if (letzter && kw === letzter.bisKw + 1) letzter.bisKw = kw;
    else bloecke.push({ vonKw: kw, bisKw: kw });
  }
  return bloecke
    .filter((b) => b.bisKw - b.vonKw + 1 >= mindestens && montag.get(b.vonKw) && montag.get(b.bisKw))
    .map((b) => ({ ...b, anfang: montag.get(b.vonKw), ende: plusTage(montag.get(b.bisKw), 6) }));
}

export function tagSperrgrund(ctx, tag, wochen, tage, maxAmStueck) {
  if (!Number.isFinite(maxAmStueck)) return null;
  const ueberbrueckt = (d) => wochentag(d) > ctx.arbeitstage || ctx.frei.has(d) || tage.includes(d);
  for (const b of volleBloecke(ctx, wochen, maxAmStueck)) {
    let d;
    if (tag > b.ende) {
      d = plusTage(b.ende, 1);
      while (d < tag && ueberbrueckt(d)) d = plusTage(d, 1);
    } else if (tag < b.anfang) {
      d = plusTage(b.anfang, -1);
      while (d > tag && ueberbrueckt(d)) d = plusTage(d, -1);
    } else continue;
    if (d === tag) return b;
  }
  return null;
}

export function sperrText(block, maxAmStueck) {
  const kws = block.vonKw === block.bisKw ? `KW ${block.vonKw}` : `KW ${block.vonKw}–${block.bisKw}`;
  return `Nicht wählbar: würde deinen Urlaub ${kws} auf mehr als ${maxAmStueck} `
    + `${maxAmStueck === 1 ? 'Woche' : 'Wochen'} am Stück verlängern.`;
}

// Gewählte Tage, die zur Wochenauswahl nicht mehr passen, entfernen.
// grund: null (nichts entfernt), 'aus' (Regel aus), 'wochen' (nicht mehr alle Wochen), 'regel' (einzelne Tage).
export function tageBereinigen(ctx, wochen, tage, { einzeltage, maxWochen, maxTage, maxAmStueck }) {
  if (!tage.length) return { tage: [], grund: null };
  if (!einzeltage) return { tage: [], grund: 'aus' };
  if (wochen.length !== maxWochen) return { tage: [], grund: 'wochen' };
  const erlaubt = new Set(waehlbareTage(ctx, wochen).map((t) => t.datum));
  let rest = [...new Set(tage)].filter((d) => erlaubt.has(d)).sort();
  // Erst die Tage direkt am Block entfernen (ohne Brücke über andere Tage), dann neu prüfen:
  // ein entfernter Tag ist danach ein Arbeitstag und trennt die übrigen vom Block.
  for (;;) {
    const verlaengert = rest.filter((d) => tagSperrgrund(ctx, d, wochen, rest, maxAmStueck));
    if (!verlaengert.length) break;
    const direkt = rest.filter((d) => tagSperrgrund(ctx, d, wochen, [], maxAmStueck));
    rest = rest.filter((d) => !direkt.includes(d));
  }
  const kalenderTage = ctx.kalender.filter((k) => wochen.includes(k.kw)).reduce((s, k) => s + k.arbeitstage, 0);
  while (rest.length && kalenderTage + rest.length > maxTage) rest = rest.slice(0, -1);
  return { tage: rest, grund: rest.length === tage.length ? null : 'regel' };
}

// Ziel des Knopfs „Einzelne Tage wählen“: der erste freie, nicht gesperrte Tag ab der Woche der
// spätesten gewählten KW, sonst der erste im Jahr; null, wenn keiner mehr wählbar ist.
export function sprungZiel(ctx, wochen, tage, maxAmStueck) {
  const frei = waehlbareTage(ctx, wochen)
    .map((t) => t.datum)
    .filter((d) => !tage.includes(d) && !tagSperrgrund(ctx, d, wochen, tage, maxAmStueck));
  const letzte = ctx.kalender.find((k) => k.kw === Math.max(...wochen))?.montag;
  return (letzte && frei.find((d) => d >= letzte)) || frei[0] || null;
}

// Monate (1–12, aufsteigend) mit wählbaren Tagen in den Wochen direkt vor und nach gewählten
// Wochen – dort landen Resttage meist; die Tagesliste klappt sie beim ersten Anzeigen auf.
export function naheMonate(ctx, wochen) {
  const nachbarn = new Set(wochen.flatMap((kw) => [kw - 1, kw + 1]).filter((kw) => !wochen.includes(kw)));
  const monate = waehlbareTage(ctx, wochen).filter((t) => nachbarn.has(t.kw)).map((t) => Number(t.datum.slice(5, 7)));
  return [...new Set(monate)].sort((a, b) => a - b);
}

export function hinweisEntfernt(grund, maxWochen) {
  if (grund === 'wochen') {
    return `Deine einzelnen Tage wurden entfernt, weil du nicht mehr alle ${maxWochen} Wochen gewählt hast.`;
  }
  if (grund === 'aus') return 'Einzelne Tage sind in dieser Umfrage nicht mehr möglich und wurden entfernt.';
  if (grund === 'regel') {
    return 'Einzelne Tage wurden entfernt, weil sie nicht mehr wählbar sind (in einer gewählten Woche, '
      + 'zu lang am Stück oder keine Urlaubstage mehr übrig).';
  }
  return '';
}
