// Reine Logik des Fragen-Formulars (ohne DOM, dadurch testbar).
// Die verbindliche Prüfung macht die Datenbank (urlaub.pruefe_antworten); hier
// wird sie nur für die Anzeige nachgebildet.
//
// Fachregel-Duplikat: sichtbareFragen/bedingungErfuellt/istLeer spiegeln
// urlaub.pruefe_antworten, urlaub.bedingung_erfuellt und urlaub.ist_leer in
// supabase/schema.sql. Änderungen dort hier nachziehen
// (tests/sichtbarkeit.test.mjs prüft beide Seiten mit denselben Fällen).
//
// Bewusster Unterschied: Die Datenbank wertet nur Antworten aus, die ihre eigene
// Prüfung bestanden haben; hier zählt jede nicht leere Antwort. Dadurch zeigt der
// Browser höchstens mehr Fragen als die Datenbank, nie weniger – eine Frage, an der
// die Datenbank einen Fehler meldet, ist also im Browser immer sichtbar.
import { fehlertext, wochenAus, tageAus, tagKurz, einzeltageAn } from './logik.js';

const ZAHL = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 10 });

const zahlText = (n) => ZAHL.format(Number(n));
const hat = (regeln, art) => regeln !== null && typeof regeln === 'object'
  && Object.prototype.hasOwnProperty.call(regeln, art) && regeln[art] !== null && regeln[art] !== undefined;

// Leer = nicht beantwortet: fehlt, null, leere Liste, Text nur aus Leerraum.
// trim() entfernt etwas mehr Leerraum als die Datenbank (z. B. geschütztes
// Leerzeichen); ein solcher Text wird dann nicht gesendet und gilt als unbeantwortet.
export function istLeer(wert) {
  if (wert === undefined || wert === null) return true;
  if (Array.isArray(wert)) return wert.length === 0;
  if (typeof wert === 'string') return wert.trim() === '';
  return false;
}

function gleich(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a === b;
  return JSON.stringify(a) === JSON.stringify(b);
}

const inListe = (liste, wert) => Array.isArray(liste) && liste.some((x) => gleich(x, wert));

// Wie urlaub.bedingung_erfuellt: gezählt wird nur eine sichtbare, beantwortete Quelle.
function bedingungErfuellt(b, gueltig) {
  const schluessel = String(b.quelle_id);
  if (!gueltig.has(schluessel)) return false;
  const v = gueltig.get(schluessel);
  const w = b.werte;
  switch (b.operator) {
    case 'ist_eine_von': return inListe(w, v);
    case 'ist_keine_von': return Array.isArray(w) && !inListe(w, v);
    case 'enthaelt_eine_von': return Array.isArray(v) && v.some((e) => inListe(w, e));
    case 'enthaelt_keine_von': return Array.isArray(v) && !v.some((e) => inListe(w, e));
    case 'ist': return gleich(v, w);
    case 'gleich': return typeof v === 'number' && typeof w === 'number' && v === w;
    case 'groesser': return typeof v === 'number' && typeof w === 'number' && v > w;
    case 'kleiner': return typeof v === 'number' && typeof w === 'number' && v < w;
    default: return false;
  }
}

// Sichtbare Fragen in Fragenreihenfolge (fragen kommt sortiert aus urlaub_laden).
// Ohne Bedingungen sichtbar; sonst "und" = alle, "oder" = mindestens eine erfüllt.
export function sichtbareFragen(fragen, antworten) {
  const sichtbar = new Set();
  const gueltig = new Map();
  const eingabe = antworten && typeof antworten === 'object' ? antworten : {};
  for (const f of fragen) {
    const bedingungen = f.bedingungen || [];
    if (bedingungen.length) {
      const erfuellt = bedingungen.map((b) => bedingungErfuellt(b, gueltig));
      const ok = f.verknuepfung === 'oder' ? erfuellt.some(Boolean) : erfuellt.every(Boolean);
      if (!ok) continue;
    }
    sichtbar.add(f.id);
    if (f.typ === 'hinweis') continue;
    const wert = eingabe[f.id];
    if (!istLeer(wert)) gueltig.set(String(f.id), wert);
  }
  return sichtbar;
}

// Nur sichtbare, beantwortete Fragen (ohne Hinweistexte) – so wie die Datenbank sie speichert.
export function antwortenZumAbsenden(fragen, antworten) {
  const sichtbar = sichtbareFragen(fragen, antworten);
  const aus = {};
  for (const f of fragen) {
    if (!sichtbar.has(f.id) || f.typ === 'hinweis') continue;
    const wert = antworten?.[f.id];
    if (!istLeer(wert)) aus[f.id] = wert;
  }
  return aus;
}

// Gemischte Listen (KW-Zahlen, Tage als Text): Zahlen zuerst, dann Texte aufsteigend.
const vergleiche = (x, y) => {
  if (typeof x !== typeof y) return typeof x === 'number' ? -1 : 1;
  if (typeof x === 'number') return x - y;
  return x < y ? -1 : x > y ? 1 : 0;
};

// Vergleichsschlüssel: gleiche Abgabe ⇔ gleicher Text (Listen sortiert, Texte getrimmt,
// wie urlaub.antwort_normalisiert).
export function antwortSchluessel(fragen, antworten) {
  const a = antwortenZumAbsenden(fragen, antworten);
  return JSON.stringify(Object.entries(a).map(([id, wert]) => {
    let w = wert;
    if (Array.isArray(w)) w = [...w].sort(vergleiche);
    else if (typeof w === 'string') w = w.trim();
    return [id, w];
  }));
}

function datumText(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso));
  return m ? `${m[3]}.${m[2]}.${m[1]}` : String(iso);
}

function optionText(frage, id) {
  const o = (frage.optionen || []).find((x) => gleich(x.id, id));
  return o ? o.text : '(entfernt)';
}

export function antwortText(frage, wert) {
  if (istLeer(wert)) return '';
  switch (frage.typ) {
    case 'einfach': return optionText(frage, wert);
    case 'mehrfach': return (Array.isArray(wert) ? wert : [wert]).map((id) => optionText(frage, id)).join(', ');
    case 'janein': return wert === true ? 'Ja' : wert === false ? 'Nein' : String(wert);
    case 'skala':
    case 'zahl': return typeof wert === 'number' ? zahlText(wert) : String(wert);
    case 'datum': return datumText(wert);
    case 'urlaubswochen': {
      const liste = Array.isArray(wert) ? wert : [wert];
      const kws = wochenAus(liste).map((kw) => `KW ${kw}`).join(', ');
      const tage = tageAus(liste).map(tagKurz).join(', ');
      return kws && tage ? `${kws} · ${tage}` : kws || tage;
    }
    default: return String(wert);
  }
}

const FEHLER = {
  PFLICHT: 'Bitte beantworte diese Frage.',
  UNGUELTIGE_ANTWORT: 'Diese Antwort ist nicht gültig. Bitte wähle oder gib sie neu ein.',
  ZU_WENIGE_ANTWORTEN: 'Du hast zu wenige ausgewählt.',
  ZU_VIELE_ANTWORTEN: 'Du hast zu viele ausgewählt.',
  ZAHL_ZU_KLEIN: 'Die Zahl ist zu klein.',
  ZAHL_ZU_GROSS: 'Die Zahl ist zu groß.',
  TEXT_ZU_LANG: 'Der Text ist zu lang.',
  DATUM_ZU_FRUEH: 'Das Datum ist zu früh.',
  DATUM_ZU_SPAET: 'Das Datum ist zu spät.',
};
const WOCHEN_FEHLER = ['UNGUELTIGE_WOCHE', 'DOPPELTE_WOCHE', 'ZU_WENIGE_WOCHEN', 'ZU_VIELE_WOCHEN',
  'ZU_VIELE_AM_STUECK', 'ZU_VIELE_TAGE', 'UNGUELTIGER_TAG', 'DOPPELTER_TAG', 'TAGE_ERST_NACH_WOCHEN',
  'TAG_ZU_VIELE_AM_STUECK'];

// Text zu einem Fehlercode pro Frage (aus dem details-Objekt von ANTWORTEN_UNGUELTIG).
export function fehlerText(code, frage = null) {
  if (code === 'PFLICHT' && frage?.typ === 'urlaubswochen') return 'Bitte wähle mindestens eine Woche.';
  if (FEHLER[code]) return FEHLER[code];
  if (WOCHEN_FEHLER.includes(code)) return fehlertext(code);
  return 'Bitte prüfe diese Antwort.';
}

const wochen = (n) => `${n} ${Number(n) === 1 ? 'Woche' : 'Wochen'}`;

function wochenHinweis(r) {
  const teile = [];
  const min = hat(r, 'min_wochen') ? Number(r.min_wochen) : null;
  const max = hat(r, 'max_wochen') ? Number(r.max_wochen) : null;
  if (min !== null && max !== null) {
    teile.push(min === max ? `Genau ${wochen(max)}` : `Mindestens ${min}, höchstens ${max} Wochen`);
  } else if (min !== null) teile.push(`Mindestens ${wochen(min)}`);
  else if (max !== null) teile.push(`Höchstens ${wochen(max)}`);
  if (hat(r, 'max_am_stueck') && (max === null || Number(r.max_am_stueck) < max)) {
    teile.push(teile.length ? `davon höchstens ${r.max_am_stueck} am Stück`
      : `Höchstens ${wochen(r.max_am_stueck)} am Stück`);
  }
  if (hat(r, 'max_urlaubstage')) {
    teile.push(teile.length ? `insgesamt höchstens ${r.max_urlaubstage} Urlaubstage`
      : `Höchstens ${r.max_urlaubstage} Urlaubstage`);
  }
  const satz = teile.length ? `${teile.join(', ')}.` : '';
  if (einzeltageAn(r) && hat(r, 'max_wochen') && hat(r, 'max_urlaubstage')) {
    return `${satz} Übrige Urlaubstage danach als einzelne Tage.`.trim();
  }
  return satz;
}

function bereich(min, max, beide, nurMin, nurMax) {
  if (min !== null && max !== null) return beide(min, max);
  if (min !== null) return nurMin(min);
  if (max !== null) return nurMax(max);
  return '';
}

// Kurzer Hinweis auf die eingeschalteten Regeln einer Frage (ohne "Pflicht").
export function regelHinweis(frage) {
  const r = frage.regeln || {};
  const wert = (art) => (hat(r, art) ? r[art] : null);
  switch (frage.typ) {
    case 'mehrfach':
      return bereich(wert('min_anzahl'), wert('max_anzahl'),
        (a, b) => (Number(a) === Number(b) ? `Bitte genau ${a} auswählen.` : `Bitte ${a} bis ${b} auswählen.`),
        (a) => `Mindestens ${a} auswählen.`,
        (b) => `Höchstens ${b} auswählen.`);
    case 'text_kurz':
    case 'text_lang':
      return hat(r, 'max_zeichen') ? `Höchstens ${r.max_zeichen} Zeichen.` : '';
    case 'zahl':
      return bereich(wert('min_zahl'), wert('max_zahl'),
        (a, b) => `Zahl zwischen ${zahlText(a)} und ${zahlText(b)}.`,
        (a) => `Mindestens ${zahlText(a)}.`,
        (b) => `Höchstens ${zahlText(b)}.`);
    case 'datum':
      return bereich(wert('fruehestens'), wert('spaetestens'),
        (a, b) => `Datum zwischen ${datumText(a)} und ${datumText(b)}.`,
        (a) => `Frühestens ${datumText(a)}.`,
        (b) => `Spätestens ${datumText(b)}.`);
    case 'urlaubswochen':
      return wochenHinweis(r);
    default:
      return '';
  }
}

export function istPflicht(frage) {
  return frage.typ !== 'hinweis' && Object.prototype.hasOwnProperty.call(frage.regeln || {}, 'pflicht');
}

// Vorschau der Verwaltung: Verwaltungs-Sicht (urlaub.frage_json(f, true)) in die
// Mitarbeiter-Sicht (urlaub.frage_json(f, false)) umwandeln – nur eingeschaltete
// Fragen, Optionen, Regeln und Bedingungen; Regeln als {art: wert}.
// Fachregel-Duplikat von urlaub.frage_json in supabase/schema.sql.
export function mitarbeiterSicht(fragen, kalender) {
  return (fragen || []).filter((f) => f.aktiv !== false).map((f) => {
    const regeln = {};
    for (const [art, r] of Object.entries(f.regeln || {})) {
      if (r && r.aktiv) regeln[art] = r.wert === undefined ? null : r.wert;
    }
    const uw = f.urlaubswochen;
    return {
      id: f.id,
      typ: f.typ,
      text: f.text,
      hilfetext: f.hilfetext,
      position: f.position,
      verknuepfung: f.verknuepfung,
      optionen: (f.optionen || []).filter((o) => o.aktiv !== false).map((o) => ({ id: o.id, text: o.text })),
      regeln,
      bedingungen: (f.bedingungen || []).filter((b) => b.aktiv !== false)
        .map((b) => ({ quelle_id: b.quelle_id, operator: b.operator, werte: b.werte })),
      skala: f.skala ?? null,
      urlaubswochen: uw ? {
        jahr: uw.jahr,
        bundesland: uw.bundesland,
        arbeitstage_pro_woche: uw.arbeitstage_pro_woche,
        sperr_hinweis: uw.sperr_hinweis,
        freie_tage: uw.freie_tage || [],
        kalender: Array.isArray(kalender) && kalender.length ? kalender : (uw.kalender || []),
      } : null,
    };
  });
}

// ---------------------------------------------------------------- Tabs
// Tabs des Formulars bei Umfragen mit Urlaubswochen-Frage (Reihenfolge fest).
export function tabZustand({ hatEinzeltage, hatZusatz, wochenVoll, rest, anzahlTage }) {
  const tabs = [{ id: 'wochen', titel: 'Urlaubswochen', gesperrt: false, hervorgehoben: false, abzeichen: '' }];
  if (hatEinzeltage) {
    const frei = wochenVoll && (rest > 0 || anzahlTage > 0);
    const offen = frei && rest > 0;
    tabs.push({ id: 'tage', titel: 'Einzelne Tage', gesperrt: !frei, hervorgehoben: offen,
      abzeichen: offen ? `${rest} übrig` : '' });
  }
  if (hatZusatz) tabs.push({ id: 'zusatz', titel: 'Zusatzfragen', gesperrt: false, hervorgehoben: false, abzeichen: '' });
  return tabs;
}

// Nächster nicht gesperrter Tab nach `aktuell`, sonst null.
export function naechsterTab(tabs, aktuell) {
  const i = tabs.findIndex((t) => t.id === aktuell);
  return tabs.slice(i + 1).find((t) => !t.gesperrt)?.id ?? null;
}

// Erster Tab (in Tab-Reihenfolge), der in `tabMitFehler` (Set von Tab-IDs) steht, sonst null.
export function ersterTabMitFehler(tabs, tabMitFehler) {
  return tabs.find((t) => tabMitFehler.has(t.id))?.id ?? null;
}
