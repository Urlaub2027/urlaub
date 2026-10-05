// Verwaltung: Reiter „Fragen“ – Liste, Bearbeitungsbereich und Vorschau.
// Schalter und ↑/↓ speichern sofort; Texte über „Speichern“ bzw. beim Verlassen
// des Feldes. Nach jeder Änderung wird die Umfrage neu geladen und die Liste neu
// gezeichnet; ungespeicherte Eingaben und der Fokus bleiben dabei erhalten.
// Prüfregeln und Bedingungen: admin-fragen-regeln.js.
import { $, meldung, knopf, element, fuelleJahre, fuelleLaender } from './admin-hilfe.js';
import { mitarbeiterSicht } from './formular-logik.js';
import { baueFormular } from './formular.js';
import { regelBereich, bedingungBereich } from './admin-fragen-regeln.js';

export const TYPEN = [
  ['urlaubswochen', 'Urlaubswochen'],
  ['einfach', 'Einfachauswahl'],
  ['mehrfach', 'Mehrfachauswahl'],
  ['janein', 'Ja/Nein'],
  ['skala', 'Skala'],
  ['text_kurz', 'Kurzer Text'],
  ['text_lang', 'Langer Text'],
  ['zahl', 'Zahl'],
  ['datum', 'Datum'],
  ['hinweis', 'Hinweistext'],
];
const typName = (typ) => (TYPEN.find(([t]) => t === typ) || [typ, typ])[1];

let ctx = null;            // { aufruf, fehlerAnzeigen, neuLaden }
let daten = null;          // Antwort von org_umfrage
let umfrageId = null;
let offen = null;          // ID der Frage, deren Bearbeitungsbereich offen ist
let entwuerfe = new Map(); // Schlüssel → { original, wert }: ungespeicherte Eingaben beim Neuzeichnen

// ---------------------------------------------------------------- Werkzeuge

export const kurz = (text, laenge) => {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  return t.length > laenge ? `${t.slice(0, laenge - 1)}…` : t;
};

export function option(wert, text) {
  const o = element('option', null, text);
  o.value = String(wert);
  return o;
}

export function feld(beschriftung, eingabe) {
  const label = element('label', 'feld', beschriftung);
  label.append(eingabe);
  return label;
}

const istKaestchen = (el) => el.type === 'checkbox' || el.type === 'radio';
const liesWert = (el) => (istKaestchen(el) ? String(el.checked) : el.value);
export function setzeWert(el, wert) {
  if (istKaestchen(el)) el.checked = wert === 'true';
  else el.value = wert;
}

// Kennzeichnet ein Eingabefeld, das nicht sofort speichert: Schlüssel für Fokus und
// Entwurf, gespeicherter Wert als Vergleich. Hat der Nutzer vor dem Neuzeichnen
// etwas eingegeben und ist der gespeicherte Wert seitdem gleich geblieben, wird die
// Eingabe wiederhergestellt. Bei <select> erst nach dem Befüllen aufrufen.
export function merke(el, schluessel, original) {
  const o = String(original ?? '');
  el.dataset.schluessel = schluessel;
  el.dataset.entwurf = '';
  el.dataset.original = o;
  setzeWert(el, o);
  const e = entwuerfe.get(schluessel);
  if (e && e.original === o) setzeWert(el, e.wert);
  return el;
}

export function textfeld(tag, schluessel, wert) {
  const el = document.createElement(tag);
  if (tag === 'input') el.type = 'text';
  if (tag === 'textarea') el.rows = 2;
  return merke(el, schluessel, wert);
}

// Kästchen mit Beschriftung, das bei Änderung sofort speichert.
export function schalter(schluessel, an, text, beiAenderung) {
  const label = element('label', 'schalter');
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = Boolean(an);
  box.dataset.schluessel = schluessel;
  box.addEventListener('change', () => beiAenderung(box.checked));
  label.append(box, element('span', null, text));
  return label;
}

export function pfeil(zeichen, text, schluessel, gesperrt, aktionBeiKlick) {
  const b = knopf(zeichen, 'zweitrangig klein-knopf pfeil', aktionBeiKlick);
  b.setAttribute('aria-label', text);
  b.title = text;
  b.disabled = gesperrt;
  b.dataset.schluessel = schluessel;
  return b;
}

// Nummer einer Frage in der Liste (1, 2, …).
export const nummer = (id) => (daten?.fragen || []).findIndex((f) => f.id === id) + 1;
export const frageMitId = (id) => (daten?.fragen || []).find((f) => f.id === id);

// Ruft eine Editor-Funktion auf und lädt danach neu. Bei einem Fehler wird mit den
// bisherigen Daten neu gezeichnet, damit Schalter wieder den gespeicherten Stand zeigen.
// erfolg(ergebnis) läuft vor dem Neuladen (z. B. um ein Eingabefeld zu leeren).
export async function aktion(funktion, parameter, { danach = '', erfolg = null } = {}) {
  meldung('');
  let ergebnis;
  try {
    ergebnis = await ctx.aufruf(funktion, parameter);
  } catch (fehler) {
    ctx.fehlerAnzeigen(fehler);
    // Gelöscht (z. B. in einem anderen Fenster): frisch laden, sonst nur zurückzeichnen.
    if (/^(FRAGE|OPTION|BEDINGUNG)_NICHT_GEFUNDEN$/.test(fehler.message)) await ctx.neuLaden();
    else neuZeichnen();
    return { ok: false };
  }
  if (erfolg) erfolg(ergebnis);
  await ctx.neuLaden();
  if (danach) meldung(danach);
  return { ok: true, ergebnis };
}

// ---------------------------------------------------------------- Einstieg

export function initFragen(kontext) {
  ctx = kontext;
  $('neue-frage-knopf').addEventListener('click', frageAnlegen);
  $('fragen-vorschau-knopf').addEventListener('click', () => {
    const bereich = $('fragen-vorschau');
    bereich.hidden = !bereich.hidden;
    zeichneVorschau();
    if (!bereich.hidden) bereich.scrollIntoView({ block: 'start' });
  });
}

// Nach jedem Laden aufgerufen (null = keine Umfrage, z. B. während des Ladens einer anderen).
export function zeigeFragen(neu) {
  const id = neu?.einstellungen?.id ?? null;
  if (!neu || id === null || Number(id) !== Number(umfrageId)) {
    offen = null;
    entwuerfe = new Map();
    $('fragen-vorschau').hidden = true;
    $('fragen-liste').replaceChildren();
    umfrageId = neu ? id : null;
  } else {
    sammleEntwuerfe();
  }
  daten = neu;
  zeichne();
}

function sammleEntwuerfe() {
  entwuerfe = new Map();
  for (const el of $('fragen-liste').querySelectorAll('[data-entwurf]')) {
    const wert = liesWert(el);
    if (wert !== el.dataset.original) entwuerfe.set(el.dataset.schluessel, { original: el.dataset.original, wert });
  }
}

const hatEntwurf = () => [...$('fragen-liste').querySelectorAll('[data-entwurf]')]
  .some((el) => liesWert(el) !== el.dataset.original);

export function neuZeichnen() {
  sammleEntwuerfe();
  zeichne();
}

// ---------------------------------------------------------------- Liste

function zeichne() {
  const fokus = document.activeElement?.dataset?.schluessel;
  const liste = $('fragen-liste');
  if (!daten) {
    liste.replaceChildren();
    $('neue-frage-typ').replaceChildren();
    zeichneVorschau();
    return;
  }
  const fragen = daten.fragen || [];
  if (offen !== null && !fragen.some((f) => f.id === offen)) offen = null;
  liste.replaceChildren(...(fragen.length
    ? fragen.map((f, i) => karte(f, i, fragen))
    : [element('li', 'klein', 'Noch keine Fragen. Lege unten die erste an.')]));
  entwuerfe = new Map();
  fuelleTypen(fragen);
  zeichneVorschau();
  if (fokus) liste.querySelector(`[data-schluessel="${fokus}"]`)?.focus({ preventScroll: true });
}

function fuelleTypen(fragen) {
  const select = $('neue-frage-typ');
  const vorher = select.value;
  const hatUrlaub = fragen.some((f) => f.typ === 'urlaubswochen');
  select.replaceChildren(...TYPEN.filter(([t]) => t !== 'urlaubswochen' || !hatUrlaub)
    .map(([t, name]) => option(t, name)));
  select.value = [...select.options].some((o) => o.value === vorher) ? vorher : 'einfach';
}

function karte(f, i, fragen) {
  const li = element('li', f.aktiv ? 'karte frage-karte' : 'karte frage-karte aus');
  li.dataset.frageId = String(f.id);
  li.append(element('p', 'karte-name', `${i + 1}. ${kurz(f.text, 90)}`));

  const marken = element('p', 'frage-marken');
  marken.append(element('span', 'marke', typName(f.typ)));
  if (f.regeln?.pflicht?.aktiv) marken.append(element('span', 'marke', 'Pflicht'));
  const anzahl = (f.bedingungen || []).filter((b) => b.aktiv).length;
  if (anzahl) marken.append(element('span', 'marke', `Bedingungen: ${anzahl}`));
  if (!f.aktiv) marken.append(element('span', 'marke marke-aus', 'ausgeschaltet'));
  li.append(marken);
  if (f.hat_antworten) li.append(element('p', 'klein frage-antworten', 'hat Antworten – nur ausschalten möglich'));

  const ist = offen === f.id;
  const aktionen = element('div', 'karte-aktionen');
  const sw = schalter(`f${f.id}-aktiv`, f.aktiv, 'aktiv',
    (an) => aktion('org_frage_schalten', { p_frage_id: f.id, p_aktiv: an }));
  sw.querySelector('input').setAttribute('aria-label', `Frage ${i + 1} aktiv`);
  const bearbeiten = knopf(ist ? 'Schließen' : 'Bearbeiten', 'zweitrangig klein-knopf', () => {
    if (hatEntwurf() && !window.confirm('Nicht gespeicherte Eingaben verwerfen?')) return;
    meldung('');
    offen = ist ? null : f.id;
    entwuerfe = new Map();
    zeichne();
    if (!ist) $('fragen-liste').querySelector(`[data-frage-id="${f.id}"]`)?.scrollIntoView({ block: 'nearest' });
  });
  bearbeiten.dataset.schluessel = `f${f.id}-bearbeiten`;
  bearbeiten.setAttribute('aria-expanded', String(ist));
  aktionen.append(
    sw,
    pfeil('↑', 'Nach oben', `f${f.id}-hoch`, i === 0,
      () => aktion('org_frage_verschieben', { p_frage_id: f.id, p_richtung: -1 })),
    pfeil('↓', 'Nach unten', `f${f.id}-runter`, i === fragen.length - 1,
      () => aktion('org_frage_verschieben', { p_frage_id: f.id, p_richtung: 1 })),
    bearbeiten,
  );
  if (!f.hat_antworten) {
    aktionen.append(knopf('Löschen', 'gefahr klein-knopf', () => {
      if (!window.confirm(`Frage „${kurz(f.text, 60)}“ wirklich löschen?\n\n`
        + 'Antwortmöglichkeiten, Prüfregeln und Bedingungen dieser Frage werden mitgelöscht.')) return;
      aktion('org_frage_loeschen', { p_frage_id: f.id });
    }));
  }
  li.append(aktionen);
  if (ist) li.append(editor(f, i, fragen));
  return li;
}

async function frageAnlegen() {
  if (!daten) return;
  if (hatEntwurf() && !window.confirm('Nicht gespeicherte Eingaben verwerfen?')) return;
  const r = await aktion('org_frage_anlegen', { p_umfrage_id: umfrageId, p_typ: $('neue-frage-typ').value },
    { erfolg: (id) => { offen = Number(id); entwuerfe = new Map(); } });
  if (!r.ok) return;
  const text = $('fragen-liste').querySelector(`[data-schluessel="f${offen}-text"]`);
  if (text) {
    text.closest('.frage-karte').scrollIntoView({ block: 'start' });
    text.focus({ preventScroll: true });
    text.select();
  }
}

// ---------------------------------------------------------------- Bearbeitungsbereich

function editor(f, index, fragen) {
  const box = element('div', 'frage-editor');
  box.append(grunddaten(f));
  if (f.typ === 'einfach' || f.typ === 'mehrfach') box.append(optionenBereich(f));
  const regeln = regelBereich(f);
  if (regeln) box.append(regeln);
  box.append(bedingungBereich(f, fragen.slice(0, index)));
  return box;
}

function grunddaten(f) {
  const k = (name) => `f${f.id}-${name}`;
  const form = element('form', 'editor-teil');
  form.noValidate = true;
  form.append(element('h3', null, 'Frage'));

  const typ = document.createElement('select');
  typ.append(...TYPEN.filter(([t]) => (f.typ === 'urlaubswochen' ? t === 'urlaubswochen' : t !== 'urlaubswochen'))
    .map(([t, name]) => option(t, name)));
  merke(typ, k('typ'), f.typ);
  typ.disabled = f.hat_antworten || f.typ === 'urlaubswochen';
  form.append(feld('Typ', typ));
  if (f.hat_antworten && f.typ !== 'urlaubswochen') {
    form.append(element('p', 'klein', 'Der Typ lässt sich nicht mehr ändern, weil schon Antworten vorliegen.'));
  }

  const text = textfeld('textarea', k('text'), f.text);
  form.append(feld(f.typ === 'hinweis' ? 'Hinweistext' : 'Fragetext', text));
  const hilfe = textfeld('textarea', k('hilfe'), f.hilfetext);
  form.append(feld('Hilfetext (optional)', hilfe));

  let zusatz = () => ({});
  if (f.typ === 'urlaubswochen') zusatz = urlaubsFelder(f, form, k);
  if (f.typ === 'skala') zusatz = skalaFelder(f, form, k);

  const speichern = element('button', 'editor-knopf', 'Speichern');
  speichern.type = 'submit';
  speichern.dataset.schluessel = k('speichern');
  form.append(speichern);

  form.addEventListener('submit', (ereignis) => {
    ereignis.preventDefault();
    const p = { text: text.value, hilfetext: hilfe.value, ...zusatz() };
    if (!typ.disabled && typ.value !== f.typ) {
      const optionenWeg = ['einfach', 'mehrfach'].includes(f.typ) && !['einfach', 'mehrfach'].includes(typ.value);
      if (!window.confirm(`Typ in „${typName(typ.value)}“ ändern?\n\nNicht passende Prüfregeln`
        + `${optionenWeg ? ' und die Antwortmöglichkeiten' : ''} werden dabei gelöscht.`)) return;
      p.typ = typ.value;
    }
    aktion('org_frage_speichern', { p_frage_id: f.id, p_daten: p }, { danach: 'Frage gespeichert.' });
  });
  return form;
}

function urlaubsFelder(f, form, k) {
  const uw = f.urlaubswochen || {};
  const jetzt = new Date().getFullYear();
  const jahrWert = Number(uw.jahr) || jetzt + 1;
  const jahr = document.createElement('select');
  fuelleJahre(jahr, Math.min(jahrWert, jetzt), Math.max(jahrWert, jetzt + 3), jahrWert);
  merke(jahr, k('jahr'), jahrWert);
  const land = document.createElement('select');
  fuelleLaender(land, uw.bundesland);
  merke(land, k('land'), uw.bundesland);
  const tage = document.createElement('select');
  tage.append(option(6, '6 (Montag–Samstag)'), option(5, '5 (Montag–Freitag)'));
  merke(tage, k('tage'), uw.arbeitstage_pro_woche);
  for (const s of [jahr, land, tage]) s.disabled = f.hat_antworten;
  if (f.hat_antworten) {
    form.append(element('p', 'klein', 'Jahr, Bundesland und Arbeitstage sind gesperrt, weil schon Wochen gewählt wurden.'));
  }
  const hinweis = textfeld('textarea', k('sperr'), uw.sperr_hinweis);
  form.append(feld('Jahr', jahr), feld('Bundesland (für die Feiertage)', land),
    feld('Arbeitstage pro Woche', tage), feld('Hinweis zu den gesperrten Monaten', hinweis));
  return () => ({
    sperr_hinweis: hinweis.value,
    ...(f.hat_antworten ? {} : {
      jahr: Number(jahr.value), bundesland: land.value, arbeitstage_pro_woche: Number(tage.value),
    }),
  });
}

function skalaFelder(f, form, k) {
  const s = f.skala || {};
  const zahl = (name, wert) => {
    const el = document.createElement('input');
    el.type = 'number';
    el.step = '1';
    el.inputMode = 'numeric';
    el.disabled = f.hat_antworten;
    return merke(el, k(name), wert);
  };
  const von = zahl('von', s.von);
  const bis = zahl('bis', s.bis);
  const links = textfeld('input', k('links'), s.links);
  const rechts = textfeld('input', k('rechts'), s.rechts);
  if (f.hat_antworten) {
    form.append(element('p', 'klein', '„Von“ und „bis“ sind gesperrt, weil schon Antworten vorliegen.'));
  }
  const reihe = element('div', 'editor-paar');
  reihe.append(feld('Skala von', von), feld('bis', bis));
  form.append(reihe, feld('Beschriftung links (optional)', links), feld('Beschriftung rechts (optional)', rechts));
  const zahlWert = (el) => (el.value === '' ? null : Number(el.value));
  return () => ({
    skala_links: links.value,
    skala_rechts: rechts.value,
    ...(f.hat_antworten ? {} : { skala_von: zahlWert(von), skala_bis: zahlWert(bis) }),
  });
}

function optionenBereich(f) {
  const teil = element('section', 'editor-teil');
  teil.append(element('h3', null, 'Antwortmöglichkeiten'));
  const optionen = f.optionen || [];
  if (!optionen.some((o) => o.aktiv)) {
    teil.append(element('p', 'karte-warnung',
      'Keine eingeschaltete Antwortmöglichkeit – Mitarbeiter können diese Frage nicht beantworten.'));
  }
  const liste = element('ul', 'editor-liste');
  optionen.forEach((o, i) => {
    const li = element('li', o.aktiv ? 'editor-zeile' : 'editor-zeile aus');
    const text = textfeld('input', `o${o.id}-text`, o.text);
    text.setAttribute('aria-label', `Antwort ${i + 1}`);
    // Speichern beim Verlassen des Feldes, wenn geändert.
    text.addEventListener('change', () => {
      if (text.value !== text.dataset.original) aktion('org_option_speichern', { p_option_id: o.id, p_text: text.value });
    });
    const knoepfe = element('div', 'zeile-knoepfe');
    knoepfe.append(
      schalter(`o${o.id}-aktiv`, o.aktiv, 'aktiv',
        (an) => aktion('org_option_schalten', { p_option_id: o.id, p_aktiv: an })),
      pfeil('↑', 'Nach oben', `o${o.id}-hoch`, i === 0,
        () => aktion('org_option_verschieben', { p_option_id: o.id, p_richtung: -1 })),
      pfeil('↓', 'Nach unten', `o${o.id}-runter`, i === optionen.length - 1,
        () => aktion('org_option_verschieben', { p_option_id: o.id, p_richtung: 1 })),
    );
    if (o.hat_antworten) {
      knoepfe.append(element('span', 'klein', 'hat Antworten – nur ausschalten möglich'));
    } else {
      knoepfe.append(knopf('Löschen', 'gefahr klein-knopf', () => {
        if (!window.confirm(`Antwortmöglichkeit „${kurz(o.text, 60)}“ wirklich löschen?`)) return;
        aktion('org_option_loeschen', { p_option_id: o.id });
      }));
    }
    li.append(text, knoepfe);
    liste.append(li);
  });
  teil.append(liste);

  const neu = element('form', 'neu-form');
  neu.noValidate = true;
  const eingabe = textfeld('input', `f${f.id}-option-neu`, '');
  const hinzu = element('button', null, 'Antwort hinzufügen');
  hinzu.type = 'submit';
  hinzu.dataset.schluessel = `f${f.id}-option-hinzu`;
  neu.append(feld('Neue Antwortmöglichkeit', eingabe), hinzu);
  neu.addEventListener('submit', async (ereignis) => {
    ereignis.preventDefault();
    if (!eingabe.value.trim()) {
      meldung('Bitte einen Text für die Antwortmöglichkeit eingeben.');
      return;
    }
    const r = await aktion('org_option_anlegen', { p_frage_id: f.id, p_text: eingabe.value },
      { erfolg: () => { eingabe.value = ''; } });
    if (r.ok) $('fragen-liste').querySelector(`[data-schluessel="f${f.id}-option-neu"]`)?.focus();
  });
  teil.append(neu);
  return teil;
}

// ---------------------------------------------------------------- Vorschau

function zeichneVorschau() {
  const bereich = $('fragen-vorschau');
  const knopfElement = $('fragen-vorschau-knopf');
  knopfElement.textContent = bereich.hidden ? 'Vorschau' : 'Vorschau schließen';
  knopfElement.setAttribute('aria-expanded', String(!bereich.hidden));
  const inhalt = $('fragen-vorschau-inhalt');
  if (bereich.hidden || !daten) {
    inhalt.replaceChildren();
    return;
  }
  const fragen = mitarbeiterSicht(daten.fragen, daten.kalender);
  if (!fragen.length) {
    inhalt.replaceChildren(element('p', 'klein', 'Keine eingeschaltete Frage – Mitarbeiter sähen ein leeres Formular.'));
    return;
  }
  baueFormular(inhalt, { fragen, antworten: {} }, {});
}
