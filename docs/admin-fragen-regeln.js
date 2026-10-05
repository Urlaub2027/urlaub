// Verwaltung, Reiter „Fragen“: Prüfregeln und Bedingungen im Bearbeitungsbereich.
// Teil von admin-fragen.js (gemeinsame Werkzeuge kommen von dort).
//
// Fachregel-Duplikat: REGELN spiegelt urlaub.erlaubte_regeln, OPERATOREN spiegelt
// urlaub.bedingung_werte (supabase/schema.sql). Die Datenbank prüft verbindlich.
import { meldung, knopf, element } from './admin-hilfe.js';
import { MONATE } from './logik.js';
import {
  aktion, merke, setzeWert, schalter, option, feld, kurz, nummer, frageMitId, kalenderVon, neuZeichnen,
} from './admin-fragen.js';

const REGELN = {
  urlaubswochen: ['pflicht', 'min_wochen', 'max_wochen', 'max_am_stueck', 'max_urlaubstage', 'gesperrte_monate',
    'gesperrte_wochen'],
  einfach: ['pflicht'],
  janein: ['pflicht'],
  skala: ['pflicht'],
  mehrfach: ['pflicht', 'min_anzahl', 'max_anzahl'],
  text_kurz: ['pflicht', 'max_zeichen'],
  text_lang: ['pflicht', 'max_zeichen'],
  zahl: ['pflicht', 'min_zahl', 'max_zahl'],
  datum: ['pflicht', 'fruehestens', 'spaetestens'],
  hinweis: [],
};

const REGEL_TEXT = {
  pflicht: 'Pflichtfrage',
  min_anzahl: 'Mindestens auswählen',
  max_anzahl: 'Höchstens auswählen',
  max_zeichen: 'Höchstens Zeichen',
  min_zahl: 'Kleinste Zahl',
  max_zahl: 'Größte Zahl',
  fruehestens: 'Frühestens',
  spaetestens: 'Spätestens',
  min_wochen: 'Mindestens Wochen',
  max_wochen: 'Höchstens Wochen',
  max_am_stueck: 'Höchstens Wochen am Stück',
  max_urlaubstage: 'Höchstens Urlaubstage',
  gesperrte_monate: 'Gesperrte Monate',
  gesperrte_wochen: 'Gesperrte Wochen',
};

const GANZZAHL = ['min_anzahl', 'max_anzahl', 'max_zeichen', 'min_wochen', 'max_wochen', 'max_am_stueck',
  'max_urlaubstage'];
const DATUM = ['fruehestens', 'spaetestens'];

const VERGLEICH = [['gleich', 'gleich'], ['groesser', 'größer als'], ['kleiner', 'kleiner als']];
const OPERATOREN = {
  einfach: [['ist_eine_von', 'ist eine von'], ['ist_keine_von', 'ist keine von']],
  mehrfach: [['enthaelt_eine_von', 'enthält eine von'], ['enthaelt_keine_von', 'enthält keine von']],
  janein: [['ist', 'ist']],
  skala: VERGLEICH,
  zahl: VERGLEICH,
};

// ---------------------------------------------------------------- Prüfregeln

// null, wenn der Typ keine Regeln kennt (Hinweistext).
export function regelBereich(f) {
  const arten = REGELN[f.typ] || [];
  if (!arten.length) return null;
  const teil = element('section', 'editor-teil');
  teil.append(element('h3', null, 'Prüfregeln'),
    element('p', 'klein', 'Eingeschaltete Regeln prüft die Datenbank beim Absenden. Änderungen werden sofort gespeichert.'));
  const liste = element('div', 'regeln');
  for (const art of arten) liste.append(regelZeile(f, art));
  teil.append(liste);
  return teil;
}

function regelZeile(f, art) {
  const r = f.regeln?.[art]; // { wert, aktiv } oder undefined (noch nie gesetzt)
  const zeile = element('div', 'regel-zeile');
  const schluessel = `r${f.id}-${art}`;
  const setzen = (wert, aktiv) => aktion('org_regel_setzen', { p_frage_id: f.id, p_art: art, p_wert: wert, p_aktiv: aktiv });

  if (art === 'pflicht') {
    zeile.append(schalter(schluessel, r?.aktiv, REGEL_TEXT[art], (an) => setzen(null, an)));
    return zeile;
  }

  if (art === 'gesperrte_monate') {
    const gewaehlt = new Set(Array.isArray(r?.wert) ? r.wert.map(Number) : []);
    const raster = element('div', 'monate-raster');
    raster.setAttribute('role', 'group');
    raster.setAttribute('aria-label', REGEL_TEXT[art]);
    const liste = () => [...raster.querySelectorAll('input:checked')].map((b) => Number(b.value));
    const sw = schalter(schluessel, r?.aktiv, REGEL_TEXT[art], (an) => setzen(liste(), an));
    const swBox = sw.querySelector('input');
    MONATE.forEach((name, i) => {
      const label = element('label', 'monat-wahl');
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.value = String(i + 1);
      box.checked = gewaehlt.has(i + 1);
      box.dataset.schluessel = `${schluessel}-${i + 1}`;
      // Erste Auswahl bei einer noch nie gesetzten Regel schaltet sie ein.
      box.addEventListener('change', () => setzen(liste(), swBox.checked || !r));
      label.append(box, document.createTextNode(` ${name}`));
      raster.append(label);
    });
    zeile.classList.add('regel-monate');
    zeile.append(sw, raster);
    return zeile;
  }

  if (art === 'gesperrte_wochen') {
    const gewaehlt = new Set(Array.isArray(r?.wert) ? r.wert.map(Number) : []);
    const raster = element('div', 'monate-raster wochen-raster');
    raster.setAttribute('role', 'group');
    raster.setAttribute('aria-label', REGEL_TEXT[art]);
    const liste = () => [...raster.querySelectorAll('input:checked')].map((b) => Number(b.value));
    const sw = schalter(schluessel, r?.aktiv, REGEL_TEXT[art], (an) => setzen(liste(), an));
    const swBox = sw.querySelector('input');
    // Jahreswochen (52 oder 53) aus dem Kalender der Umfrage.
    for (const k of kalenderVon()) {
      const label = element('label', 'monat-wahl');
      label.title = `${k.von}–${k.bis}`;
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.value = String(k.kw);
      box.checked = gewaehlt.has(k.kw);
      box.dataset.schluessel = `${schluessel}-${k.kw}`;
      box.addEventListener('change', () => setzen(liste(), swBox.checked || !r));
      label.append(box, document.createTextNode(` KW ${k.kw}`));
      raster.append(label);
    }
    zeile.classList.add('regel-monate');
    zeile.append(sw, raster);
    return zeile;
  }

  const datum = DATUM.includes(art);
  const ganz = GANZZAHL.includes(art);
  const eingabe = document.createElement('input');
  eingabe.type = datum ? 'date' : 'number';
  if (!datum) {
    eingabe.step = ganz ? '1' : 'any';
    eingabe.inputMode = ganz ? 'numeric' : 'decimal';
    if (ganz) eingabe.min = art === 'max_zeichen' ? '1' : '0';
  }
  merke(eingabe, `${schluessel}-wert`, r ? r.wert : '');
  eingabe.setAttribute('aria-label', `${REGEL_TEXT[art]}: Wert`);
  // Leeres oder unlesbares Feld (type=number liefert dann '') = kein Wert.
  const lies = () => {
    if (eingabe.value === '') return null;
    return datum ? eingabe.value : Number(eingabe.value);
  };
  const sw = schalter(schluessel, r?.aktiv, REGEL_TEXT[art], (an) => {
    const wert = lies() ?? (r ? r.wert : null);
    if (wert === null) {
      meldung('Bitte zuerst einen Wert eintragen.');
      neuZeichnen();
      return;
    }
    setzen(wert, an);
  });
  const swBox = sw.querySelector('input');
  // Speichern beim Verlassen des Feldes; ein erster Wert schaltet die Regel ein.
  eingabe.addEventListener('change', () => {
    const wert = lies();
    if (wert === null) {
      if (r) meldung('Bitte einen Wert eintragen oder die Regel ausschalten.');
      return;
    }
    setzen(wert, swBox.checked || !r);
  });
  zeile.append(sw, eingabe);
  return zeile;
}

// ---------------------------------------------------------------- Bedingungen

// frueher: alle Fragen vor dieser (in Listenreihenfolge).
export function bedingungBereich(f, frueher) {
  const teil = element('section', 'editor-teil');
  teil.append(element('h3', null, 'Bedingungen'),
    element('p', 'klein', 'Die Frage wird nur angezeigt, wenn die Bedingungen zutreffen. '
      + 'Ohne eingeschaltete Bedingung wird sie immer angezeigt.'));
  const bedingungen = f.bedingungen || [];
  if (bedingungen.length) {
    const verknuepfung = document.createElement('select');
    verknuepfung.append(option('und', 'Alle Bedingungen müssen zutreffen (und)'),
      option('oder', 'Eine Bedingung reicht (oder)'));
    verknuepfung.value = f.verknuepfung === 'oder' ? 'oder' : 'und';
    verknuepfung.dataset.schluessel = `f${f.id}-verknuepfung`;
    verknuepfung.addEventListener('change', () => aktion('org_frage_speichern',
      { p_frage_id: f.id, p_daten: { verknuepfung: verknuepfung.value } }));
    teil.append(feld('Verknüpfung', verknuepfung));
    const liste = element('ul', 'editor-liste');
    for (const b of bedingungen) liste.append(bedingungZeile(b));
    teil.append(liste);
  }
  const quellen = frueher.filter((q) => OPERATOREN[q.typ]);
  if (quellen.length) {
    teil.append(neueBedingung(f, quellen));
  } else {
    teil.append(element('p', 'klein', 'Eine Bedingung braucht eine frühere Frage vom Typ Einfachauswahl, '
      + 'Mehrfachauswahl, Ja/Nein, Skala oder Zahl. Davor steht keine solche Frage.'));
  }
  return teil;
}

const frageName = (q) => `${nummer(q.id)}. ${kurz(q.text, 50)}${q.aktiv ? '' : ' (aus)'}`;

function operatorAuswahl(q, schluessel, aktuell) {
  const sel = document.createElement('select');
  sel.append(...OPERATOREN[q.typ].map(([wert, text]) => option(wert, text)));
  sel.setAttribute('aria-label', 'Vergleich');
  const passend = OPERATOREN[q.typ].some(([wert]) => wert === aktuell);
  return merke(sel, `${schluessel}-op`, passend ? aktuell : OPERATOREN[q.typ][0][0]);
}

// Eingabe des Vergleichswerts je Quelltyp. lies() liefert undefined, wenn er fehlt.
function wertEingabe(q, schluessel, werte) {
  if (q.typ === 'einfach' || q.typ === 'mehrfach') {
    const gewaehlt = new Set((Array.isArray(werte) ? werte : []).map(String));
    const box = element('div', 'bedingung-werte');
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', 'Antwortmöglichkeiten');
    const kaestchen = (q.optionen || []).map((o) => {
      const label = element('label', 'monat-wahl');
      const c = document.createElement('input');
      c.type = 'checkbox';
      c.value = String(o.id);
      merke(c, `${schluessel}-o${o.id}`, String(gewaehlt.has(String(o.id))));
      label.append(c, document.createTextNode(` ${o.text}${o.aktiv ? '' : ' (aus)'}`));
      box.append(label);
      return c;
    });
    if (!kaestchen.length) box.append(element('span', 'klein', 'Diese Frage hat keine Antwortmöglichkeiten.'));
    return {
      teile: [box],
      fehlt: 'Bitte mindestens eine Antwortmöglichkeit ankreuzen.',
      lies: () => {
        const w = kaestchen.filter((c) => c.checked).map((c) => Number(c.value));
        return w.length ? w : undefined;
      },
    };
  }
  if (q.typ === 'janein') {
    const sel = document.createElement('select');
    sel.append(option('true', 'Ja'), option('false', 'Nein'));
    sel.setAttribute('aria-label', 'Wert');
    merke(sel, `${schluessel}-janein`, typeof werte === 'boolean' ? String(werte) : 'true');
    return { teile: [sel], fehlt: '', lies: () => sel.value === 'true' };
  }
  const zahl = document.createElement('input');
  zahl.type = 'number';
  zahl.step = q.typ === 'skala' ? '1' : 'any';
  zahl.inputMode = 'decimal';
  zahl.setAttribute('aria-label', 'Zahl');
  if (q.typ === 'skala' && q.skala) {
    zahl.min = String(q.skala.von);
    zahl.max = String(q.skala.bis);
  }
  merke(zahl, `${schluessel}-zahl`, typeof werte === 'number' ? werte : '');
  return {
    teile: [zahl],
    fehlt: 'Bitte eine Zahl eintragen.',
    lies: () => (zahl.value === '' ? undefined : Number(zahl.value)),
  };
}

function bedingungZeile(b) {
  const li = element('li', b.aktiv ? 'editor-zeile' : 'editor-zeile aus');
  const s = `b${b.id}`;
  const q = frageMitId(b.quelle_id);
  const entfernen = knopf('Entfernen', 'gefahr klein-knopf',
    () => aktion('org_bedingung_loeschen', { p_bedingung_id: b.id }));
  entfernen.dataset.schluessel = `${s}-entfernen`;
  const sw = schalter(`${s}-aktiv`, b.aktiv, 'aktiv',
    (an) => aktion('org_bedingung_schalten', { p_bedingung_id: b.id, p_aktiv: an }));
  const knoepfe = element('div', 'zeile-knoepfe');
  if (!q || !OPERATOREN[q.typ]) {
    knoepfe.append(sw, entfernen);
    li.append(element('p', 'karte-warnung', 'Bedingung mit einer Frage, die es so nicht mehr gibt.'), knoepfe);
    return li;
  }
  const satz = element('div', 'bedingung-satz');
  const op = operatorAuswahl(q, s, b.operator);
  const wert = wertEingabe(q, s, b.werte);
  satz.append(element('span', 'bedingung-wenn', `Wenn „${frageName(q)}“`), op, ...wert.teile);
  const speichern = knopf('Speichern', 'klein-knopf', () => {
    const w = wert.lies();
    if (w === undefined) {
      meldung(wert.fehlt);
      return;
    }
    aktion('org_bedingung_speichern', { p_bedingung_id: b.id, p_operator: op.value, p_werte: w },
      { danach: 'Bedingung gespeichert.' });
  });
  speichern.dataset.schluessel = `${s}-speichern`;
  knoepfe.append(speichern, sw, entfernen);
  li.append(satz, knoepfe);
  return li;
}

function neueBedingung(f, quellen) {
  const s = `bneu${f.id}`;
  const box = element('div', 'editor-zeile bedingung-neu');
  box.append(element('p', 'bedingung-titel', 'Bedingung hinzufügen'));
  const quelle = document.createElement('select');
  quelle.setAttribute('aria-label', 'Frage');
  quelle.append(...quellen.map((q) => option(q.id, frageName(q))));
  merke(quelle, `${s}-quelle`, quellen[quellen.length - 1].id); // Vorgabe: die Frage direkt davor
  const satz = element('div', 'bedingung-satz');
  let op;
  let wert;
  const aufbauen = () => {
    const q = quellen.find((x) => String(x.id) === quelle.value) || quellen[quellen.length - 1];
    op = operatorAuswahl(q, `${s}-q${q.id}`, undefined);
    wert = wertEingabe(q, `${s}-q${q.id}`, undefined);
    satz.replaceChildren(element('span', 'bedingung-wenn', 'Wenn'), quelle, op, ...wert.teile);
  };
  quelle.addEventListener('change', aufbauen);
  aufbauen();
  const hinzu = knopf('Bedingung hinzufügen', 'klein-knopf', () => {
    const w = wert.lies();
    if (w === undefined) {
      meldung(wert.fehlt);
      return;
    }
    aktion('org_bedingung_anlegen', {
      p_frage_id: f.id, p_quelle_id: Number(quelle.value), p_operator: op.value, p_werte: w,
    }, {
      // Formular nach dem Anlegen leeren (sonst käme die Eingabe als Entwurf zurück).
      erfolg: () => { for (const el of box.querySelectorAll('[data-entwurf]')) setzeWert(el, el.dataset.original); },
    });
  });
  hinzu.dataset.schluessel = `${s}-hinzu`;
  box.append(satz, hinzu);
  return box;
}
