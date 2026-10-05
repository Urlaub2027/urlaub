// Baut das Fragen-Formular der Mitarbeiter-Seite (nur DOM, nur textContent).
// Die Logik (Sichtbarkeit, Texte) steckt in formular-logik.js.
import {
  sichtbareFragen, fehlerText, regelHinweis, istPflicht, istLeer,
} from './formular-logik.js';
import {
  zusammenfassung, istGesperrt, nachMonat, gesperrteZeitraeume, gesperrteGewaehlte,
} from './logik.js';

function el(tag, klasse, text) {
  const e = document.createElement(tag);
  if (klasse) e.className = klasse;
  if (text !== undefined && text !== null) e.textContent = text;
  return e;
}

const zahlRegel = (regeln, art) => (regeln && regeln[art] !== undefined && regeln[art] !== null
  ? Number(regeln[art]) : null);

// Eine Zeile "Kästchen/Knopf + Beschriftung".
function wahlZeile(typ, name, wert, text, klasse = 'wahl') {
  const zeile = el('label', klasse);
  const eingabe = document.createElement('input');
  eingabe.type = typ;
  eingabe.name = name;
  eingabe.value = String(wert);
  zeile.append(eingabe, el('span', 'wahl-text', text));
  return { zeile, eingabe };
}

export function baueFormular(container, daten, { nurLesen = false, beiAenderung = () => {} } = {}) {
  const fragen = daten.fragen || [];
  const werte = {};
  const bloecke = new Map();       // id → { frage, feld, fehler, aktualisiere() }

  for (const f of fragen) {
    const gespeichert = daten.antworten?.[f.id];
    if (!istLeer(gespeichert)) werte[f.id] = Array.isArray(gespeichert) ? [...gespeichert] : gespeichert;
  }

  function geaendert(f, wert) {
    if (istLeer(wert)) delete werte[f.id]; else werte[f.id] = wert;
    const b = bloecke.get(f.id);
    b.fehler.hidden = true;
    b.feld.classList.remove('hat-fehler');
    sichtbarkeitAktualisieren();
    beiAenderung();
  }

  // ---------------------------------------------------------------- Eingaben je Typ

  // Radio-Buttons (einfach, janein, skala). "Auswahl löschen", wenn keine Pflicht.
  function radios(f, eintraege, klasse = 'wahl') {
    const box = el('div', klasse === 'skala-wert' ? 'skala-werte' : 'wahlen');
    const knoepfe = eintraege.map(({ wert, text }) => {
      const { zeile, eingabe } = wahlZeile('radio', `frage-${f.id}`, String(wert), text, klasse);
      eingabe.checked = werte[f.id] !== undefined && String(werte[f.id]) === String(wert);
      eingabe.disabled = nurLesen;
      eingabe.addEventListener('change', () => {
        if (eingabe.checked) geaendert(f, wert);
        aktualisiere();
      });
      box.append(zeile);
      return eingabe;
    });
    const leeren = el('button', 'frage-leeren', 'Auswahl löschen');
    leeren.type = 'button';
    leeren.addEventListener('click', () => {
      for (const k of knoepfe) k.checked = false;
      geaendert(f, undefined);
      aktualisiere();
    });
    function aktualisiere() {
      leeren.hidden = nurLesen || istPflicht(f) || werte[f.id] === undefined;
    }
    aktualisiere();
    return { teile: [box, leeren], aktualisiere };
  }

  function einfach(f) {
    return radios(f, (f.optionen || []).map((o) => ({ wert: o.id, text: o.text })));
  }

  function janein(f) {
    return radios(f, [{ wert: true, text: 'Ja' }, { wert: false, text: 'Nein' }]);
  }

  function skala(f) {
    const s = f.skala || {};
    const von = Number(s.von ?? 1);
    const bis = Number(s.bis ?? 5);
    const eintraege = [];
    for (let n = von; n <= bis; n += 1) eintraege.push({ wert: n, text: String(n) });
    const { teile, aktualisiere } = radios(f, eintraege, 'skala-wert');
    const reihe = el('div', 'skala');
    if (s.links) reihe.append(el('span', 'skala-ende skala-links', s.links));
    reihe.append(teile[0]);
    if (s.rechts) reihe.append(el('span', 'skala-ende skala-rechts', s.rechts));
    return { teile: [reihe, teile[1]], aktualisiere };
  }

  function mehrfach(f) {
    const box = el('div', 'wahlen');
    const max = zahlRegel(f.regeln, 'max_anzahl');
    const kaestchen = (f.optionen || []).map((o) => {
      const { zeile, eingabe } = wahlZeile('checkbox', `frage-${f.id}`, String(o.id), o.text);
      eingabe.addEventListener('change', () => {
        const gewaehlt = new Set(werte[f.id] || []);
        if (eingabe.checked) gewaehlt.add(o.id); else gewaehlt.delete(o.id);
        geaendert(f, [...gewaehlt].sort((a, b) => a - b));
        aktualisiere();
      });
      box.append(zeile);
      return { eingabe, id: o.id };
    });
    function aktualisiere() {
      const gewaehlt = new Set(werte[f.id] || []);
      const voll = max !== null && gewaehlt.size >= max;
      for (const { eingabe, id } of kaestchen) {
        eingabe.checked = gewaehlt.has(id);
        // Abwählen geht immer; Neues nur bis zur Höchstzahl.
        eingabe.disabled = nurLesen || (voll && !eingabe.checked);
      }
    }
    aktualisiere();
    return { teile: [box], aktualisiere };
  }

  function feldEingabe(f, eingabe, lesen) {
    eingabe.className = 'eingabe';
    eingabe.id = `eingabe-${f.id}`;
    eingabe.disabled = nurLesen;
    eingabe.addEventListener('input', () => geaendert(f, lesen()));
    return { teile: [eingabe], aktualisiere() {} };
  }

  function zahl(f) {
    const eingabe = document.createElement('input');
    eingabe.type = 'number';
    eingabe.step = 'any';
    eingabe.inputMode = 'decimal';
    const min = zahlRegel(f.regeln, 'min_zahl');
    const max = zahlRegel(f.regeln, 'max_zahl');
    if (min !== null) eingabe.min = String(min);
    if (max !== null) eingabe.max = String(max);
    if (typeof werte[f.id] === 'number') eingabe.value = String(werte[f.id]);
    // Unlesbare Eingabe liefert value === '' und gilt damit als unbeantwortet.
    return feldEingabe(f, eingabe, () => (eingabe.value === '' ? undefined : Number(eingabe.value)));
  }

  function datum(f) {
    const eingabe = document.createElement('input');
    eingabe.type = 'date';
    if (f.regeln?.fruehestens) eingabe.min = f.regeln.fruehestens;
    if (f.regeln?.spaetestens) eingabe.max = f.regeln.spaetestens;
    if (typeof werte[f.id] === 'string') eingabe.value = werte[f.id];
    return feldEingabe(f, eingabe, () => (eingabe.value === '' ? undefined : eingabe.value));
  }

  function text(f, lang) {
    const eingabe = document.createElement(lang ? 'textarea' : 'input');
    if (lang) eingabe.rows = 4; else eingabe.type = 'text';
    const grenze = lang ? 5000 : 200;
    const maxZeichen = zahlRegel(f.regeln, 'max_zeichen');
    eingabe.maxLength = maxZeichen !== null ? Math.min(grenze, maxZeichen) : grenze;
    if (typeof werte[f.id] === 'string') eingabe.value = werte[f.id];
    return feldEingabe(f, eingabe, () => eingabe.value);
  }

  // Bisherige Wochenauswahl: Monatsgruppen, Feiertage, gesperrte Bereiche, Zähler.
  function urlaubswochen(f) {
    const uw = f.urlaubswochen || {};
    const kalender = uw.kalender || [];
    const r = f.regeln || {};
    const maxWochen = zahlRegel(r, 'max_wochen');
    const maxTage = zahlRegel(r, 'max_urlaubstage');
    const maxAmStueck = zahlRegel(r, 'max_am_stueck') ?? Infinity;
    // Gespeicherte Wochen, die inzwischen gesperrt sind, fallen aus der Auswahl.
    const entfernt = gesperrteGewaehlte(kalender, werte[f.id] || []);
    if (entfernt.length) {
      const rest = (werte[f.id] || []).filter((kw) => !entfernt.includes(kw));
      if (rest.length) werte[f.id] = rest; else delete werte[f.id];
    }

    const erklaerung = el('p', 'erklaerung',
      'Die Wochen müssen nicht zusammenhängen. Es sind Wünsche, keine Genehmigungen.');
    const zaehler = el('p', 'zaehler');
    zaehler.setAttribute('aria-live', 'polite');
    const monate = el('div', 'monate');
    for (const gruppe of nachMonat(kalender)) {
      const block = el('fieldset', 'monat');
      block.append(el('legend', null, gruppe.name));
      for (const k of gruppe.wochen) {
        const zeile = el('label', 'woche');
        const kaestchen = document.createElement('input');
        kaestchen.type = 'checkbox';
        kaestchen.value = String(k.kw);
        kaestchen.addEventListener('change', () => {
          const auswahl = new Set(werte[f.id] || []);
          if (kaestchen.checked) auswahl.add(k.kw); else auswahl.delete(k.kw);
          geaendert(f, [...auswahl].sort((a, b) => a - b));
          aktualisiere();
        });
        zeile.append(kaestchen, el('span', 'kw', `KW ${k.kw}`), el('span', 'datum', `${k.von}–${k.bis}`));
        if (k.arbeitstage !== uw.arbeitstage_pro_woche) {
          zeile.append(el('span', 'feiertag', `nur ${k.arbeitstage} Urlaubstage · ${k.feiertag}`));
        }
        block.append(zeile);
      }
      monate.append(block);
    }

    const teile = [erklaerung, zaehler, monate];
    const bereiche = gesperrteZeitraeume(kalender);
    if (bereiche.length) {
      const box = el('section', 'box box-gesperrt');
      const liste = el('ul', 'liste');
      liste.append(...bereiche.map((b) => el('li', null,
        b.vonKw === b.bisKw ? `KW ${b.vonKw} (${b.von}–${b.bis})` : `KW ${b.vonKw}–${b.bisKw} (${b.von}–${b.bis})`)));
      box.append(el('h3', null, 'Nicht wählbar'), liste);
      if (uw.sperr_hinweis) box.append(el('p', null, uw.sperr_hinweis));
      teile.push(box);
    }

    function aktualisiere() {
      const auswahl = new Set(werte[f.id] || []);
      const z = zusammenfassung(kalender, auswahl, maxWochen, maxTage);
      zaehler.textContent = z.text;
      for (const kaestchen of monate.querySelectorAll('input')) {
        const kw = Number(kaestchen.value);
        kaestchen.checked = auswahl.has(kw);
        kaestchen.disabled = istGesperrt(kw, auswahl, z.limitErreicht, !nurLesen, maxAmStueck);
        const zeile = kaestchen.closest('label');
        zeile.title = kaestchen.disabled && !nurLesen && !z.limitErreicht
          ? `Höchstens ${maxAmStueck} ${maxAmStueck === 1 ? 'Woche' : 'Wochen'} am Stück` : '';
        zeile.classList.toggle('gewaehlt', kaestchen.checked);
      }
    }
    aktualisiere();
    return { teile, aktualisiere };
  }

  const BAUER = {
    einfach,
    janein,
    skala,
    mehrfach,
    zahl,
    datum,
    text_kurz: (f) => text(f, false),
    text_lang: (f) => text(f, true),
    urlaubswochen,
  };

  // ---------------------------------------------------------------- Aufbau

  container.replaceChildren();
  if (fragen.some(istPflicht)) {
    container.append(el('p', 'klein pflicht-hinweis', 'Fragen mit * müssen beantwortet werden.'));
  }
  for (const f of fragen) {
    const feld = el('fieldset', f.typ === 'hinweis' ? 'frage frage-hinweis' : `frage frage-${f.typ}`);
    feld.id = `frage-${f.id}`;
    const legende = el('legend', 'frage-text', f.text);
    if (istPflicht(f)) legende.append(el('span', 'pflicht', ' *'));
    feld.append(legende);
    if (f.hilfetext) feld.append(el('p', 'frage-hilfe', f.hilfetext));
    const regel = regelHinweis(f);
    if (regel) feld.append(el('p', 'frage-regel', regel));
    const bauer = BAUER[f.typ];
    const teil = bauer ? bauer(f) : { teile: [], aktualisiere() {} };
    feld.append(...teil.teile);
    const fehler = el('p', 'frage-fehler');
    fehler.setAttribute('role', 'alert');
    fehler.hidden = true;
    feld.append(fehler);
    container.append(feld);
    bloecke.set(f.id, { frage: f, feld, fehler, aktualisiere: teil.aktualisiere });
  }

  function sichtbarkeitAktualisieren() {
    const sichtbar = sichtbareFragen(fragen, werte);
    for (const [id, b] of bloecke) b.feld.hidden = !sichtbar.has(id);
  }

  function zeigeFehler(fehler) {
    for (const [id, b] of bloecke) {
      const code = fehler ? fehler[id] : undefined;
      b.fehler.textContent = code ? fehlerText(code, b.frage) : '';
      b.fehler.hidden = !code;
      b.feld.classList.toggle('hat-fehler', Boolean(code));
    }
  }

  function antworten() {
    const kopie = {};
    for (const [id, wert] of Object.entries(werte)) kopie[id] = Array.isArray(wert) ? [...wert] : wert;
    return kopie;
  }

  sichtbarkeitAktualisieren();
  return { antworten, zeigeFehler, sichtbarkeitAktualisieren };
}
