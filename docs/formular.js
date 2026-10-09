// Baut das Fragen-Formular der Mitarbeiter-Seite (nur DOM, nur textContent).
// Die Logik (Sichtbarkeit, Texte) steckt in formular-logik.js.
import {
  sichtbareFragen, fehlerText, regelHinweis, istPflicht, istLeer, tabZustand, naechsterTab, ersterTabMitFehler,
} from './formular-logik.js';
import {
  zusammenfassung, istGesperrt, nachMonat, gesperrteZeitraeume, gesperrteGewaehlte, MONATE,
  wochenAus, tageAus, einzeltageAn, tagKurz, tageKontext, waehlbareTage, tagSperrgrund, sperrText,
  tageBereinigen, hinweisEntfernt,
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

export function baueFormular(container, daten,
  { nurLesen = false, beiAenderung = () => {}, beiTabwechsel = () => {} } = {}) {
  const fragen = daten.fragen || [];
  const werte = {};
  const bloecke = new Map();       // id → { frage, feld, fehler, aktualisiere(), tab }
  // Tabs (nur mit Urlaubswochen-Frage): urlaubswochen() meldet seinen Stand, der Aufbau setzt die Funktionen.
  let tabStand = null;
  let tabsFertig = false;          // erst danach darf beiTabwechsel laufen (app.js kennt das Formular sonst noch nicht)
  let tabsZeichnen = () => {};
  let zeigeTab = () => {};

  for (const f of fragen) {
    const gespeichert = daten.antworten?.[f.id];
    if (!istLeer(gespeichert)) werte[f.id] = Array.isArray(gespeichert) ? [...gespeichert] : gespeichert;
  }

  function geaendert(f, wert) {
    if (istLeer(wert)) delete werte[f.id]; else werte[f.id] = wert;
    const b = bloecke.get(f.id);
    b.fehler.hidden = true;
    b.feld.classList.remove('hat-fehler');
    tabsZeichnen();
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

  // Wochenauswahl: Monatsgruppen, Feiertage, gesperrte Bereiche, Zähler; danach einzelne Tage.
  function urlaubswochen(f) {
    const uw = f.urlaubswochen || {};
    const kalender = uw.kalender || [];
    const ctx = tageKontext(uw);
    const r = f.regeln || {};
    const maxWochen = zahlRegel(r, 'max_wochen');
    const maxTage = zahlRegel(r, 'max_urlaubstage');
    const maxAmStueck = zahlRegel(r, 'max_am_stueck') ?? Infinity;
    const grenzen = { einzeltage: einzeltageAn(r) && maxWochen !== null && maxTage !== null, maxWochen, maxTage, maxAmStueck };
    const wochenVon = () => wochenAus(werte[f.id]);
    const tageVon = () => tageAus(werte[f.id]);
    const hinweis = el('p', 'klein tage-hinweis');
    hinweis.setAttribute('aria-live', 'polite');

    // Gespeicherte Wochen, die inzwischen gesperrt sind, und unpassende Tage fallen aus der Auswahl.
    // (Hier direkt in werte, nicht über geaendert(): der Block ist noch nicht registriert.)
    const entfernt = gesperrteGewaehlte(kalender, wochenVon());
    const wochenStart = wochenVon().filter((kw) => !entfernt.includes(kw));
    const start = tageBereinigen(ctx, wochenStart, tageVon(), grenzen);
    const anfang = [...wochenStart, ...start.tage];
    if (anfang.length) werte[f.id] = anfang; else delete werte[f.id];
    hinweis.textContent = hinweisEntfernt(start.grund, maxWochen);

    const erklaerung = el('p', 'erklaerung',
      'Die Wochen müssen nicht zusammenhängen. Es sind Wünsche, keine Genehmigungen.');
    // Zähler läuft beim Scrollen mit; die zweite Zeile führt zum Tab „Einzelne Tage“.
    const zaehler = el('div', 'zaehler');
    const zaehlerText = el('p', null);
    zaehlerText.setAttribute('aria-live', 'polite');
    const sprung = el('p', 'tage-sprung');
    const sprungText = el('span', null);
    const sprungKnopf = el('button', 'klein-knopf', 'Weiter zu den einzelnen Tagen');
    sprungKnopf.type = 'button';
    sprung.append(sprungText, sprungKnopf);
    sprung.hidden = true;
    zaehler.append(zaehlerText, sprung);
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
          const auswahl = new Set(wochenVon());
          if (kaestchen.checked) auswahl.add(k.kw); else auswahl.delete(k.kw);
          const wochen = [...auswahl].sort((a, b) => a - b);
          const b = tageBereinigen(ctx, wochen, tageVon(), grenzen);
          hinweis.textContent = hinweisEntfernt(b.grund, maxWochen);
          geaendert(f, [...wochen, ...b.tage]);
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

    // Inhalt des Tabs „Einzelne Tage“ (der Tab-Titel ersetzt eine eigene Überschrift).
    const tageBox = el('section', 'einzeltage');
    const tageText = el('p', null);
    const tageMonate = el('div', 'monate');
    tageBox.append(tageText, tageMonate);
    tageBox.hidden = true;
    sprungKnopf.addEventListener('click', () => zeigeTab('tage', true));

    const teile = [erklaerung, zaehler, hinweis, monate];
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

    // Tage je Monat, eingeklappt.
    function zeichneTage(wochen, tage, rest) {
      const gruppen = new Map();
      for (const t of waehlbareTage(ctx, wochen)) {
        const monat = Number(t.datum.slice(5, 7));
        if (!gruppen.has(monat)) gruppen.set(monat, []);
        gruppen.get(monat).push(t);
      }
      // Offene Monate und Fokus merken: Die Liste wird neu gebaut, soll aber nicht springen.
      const offen = new Set([...tageMonate.querySelectorAll('details[open]')].map((d) => d.dataset.monat));
      const fokus = tageMonate.contains(document.activeElement) ? document.activeElement.value : null;
      tageMonate.replaceChildren(...[...gruppen].map(([monat, liste]) => {
        const auf = document.createElement('details');
        auf.className = 'monat';
        auf.dataset.monat = String(monat);
        // Alles startet zugeklappt; offen ist nur, was der Nutzer (oder der Sprungknopf) geöffnet hat.
        auf.open = offen.has(String(monat));
        auf.append(el('summary', null, MONATE[monat - 1]));
        for (const t of liste) {
          const zeile = el('label', 'woche');
          const kaestchen = document.createElement('input');
          kaestchen.type = 'checkbox';
          kaestchen.value = t.datum;
          kaestchen.checked = tage.includes(t.datum);
          const block = kaestchen.checked ? null : tagSperrgrund(ctx, t.datum, wochen, tage, maxAmStueck);
          kaestchen.disabled = nurLesen || (!kaestchen.checked && (rest <= 0 || Boolean(block)));
          kaestchen.addEventListener('change', () => {
            const neu = kaestchen.checked ? [...tageVon(), t.datum] : tageVon().filter((d) => d !== t.datum);
            hinweis.textContent = '';
            geaendert(f, [...wochenVon(), ...neu.sort()]);
            aktualisiere();
          });
          zeile.append(kaestchen, el('span', 'kw', tagKurz(t.datum)), el('span', 'datum', `KW ${t.kw}`));
          if (block) zeile.append(el('span', 'sperrgrund', sperrText(block, maxAmStueck)));
          zeile.classList.toggle('gewaehlt', kaestchen.checked);
          auf.append(zeile);
        }
        return auf;
      }));
      if (fokus) tageMonate.querySelector(`input[value="${fokus}"]`)?.focus();
    }

    function aktualisiere() {
      const wochen = wochenVon();
      const tage = tageVon();
      const auswahl = new Set(wochen);
      const z = zusammenfassung(kalender, auswahl, maxWochen, maxTage, tage.length);
      zaehlerText.textContent = z.text;
      for (const kaestchen of monate.querySelectorAll('input')) {
        const kw = Number(kaestchen.value);
        kaestchen.checked = auswahl.has(kw);
        kaestchen.disabled = istGesperrt(kw, auswahl, z.limitErreicht, !nurLesen, maxAmStueck);
        const zeile = kaestchen.closest('label');
        zeile.title = kaestchen.disabled && !nurLesen && !z.limitErreicht
          ? `Höchstens ${maxAmStueck} ${maxAmStueck === 1 ? 'Woche' : 'Wochen'} am Stück` : '';
        zeile.classList.toggle('gewaehlt', kaestchen.checked);
      }
      const rest = grenzen.einzeltage ? maxTage - z.tage : 0;
      tageBox.hidden = !grenzen.einzeltage || wochen.length !== maxWochen || (rest <= 0 && !tage.length);
      if (!tageBox.hidden) {
        tageText.textContent = rest > 0
          ? `Du hast noch ${rest} ${rest === 1 ? 'Urlaubstag' : 'Urlaubstage'} übrig. Du kannst sie als einzelne Tage wählen.`
          : 'Alle Urlaubstage sind verplant.';
        zeichneTage(wochen, tage, rest);
      }
      sprung.hidden = tageBox.hidden || rest <= 0 || nurLesen;
      sprungText.textContent = `Noch ${rest} ${rest === 1 ? 'Urlaubstag' : 'Urlaubstage'} übrig → `;
      tabStand = { hatEinzeltage: grenzen.einzeltage, wochenVoll: grenzen.einzeltage && wochen.length === maxWochen,
        rest, anzahlTage: tage.length };
      tabsZeichnen();
      if (tabsFertig) beiTabwechsel();   // Tab-Stand geändert → Leistenknopf neu beschriften
    }
    aktualisiere();
    return { teile, aktualisiere, tageTeil: grenzen.einzeltage ? tageBox : null };
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
  // Mit Urlaubswochen-Frage: Tabs „Urlaubswochen“, „Einzelne Tage“, „Zusatzfragen“ (übrige Fragen).
  const mitTabs = fragen.some((f) => f.typ === 'urlaubswochen');
  const tabBereiche = { wochen: el('div', 'tab-bereich'), tage: el('div', 'tab-bereich'), zusatz: el('div', 'tab-bereich') };
  let tageTeil = null;
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
    if (teil.tageTeil) tageTeil = teil.tageTeil;
    const fehler = el('p', 'frage-fehler');
    fehler.setAttribute('role', 'alert');
    fehler.hidden = true;
    feld.append(fehler);
    const tab = f.typ === 'urlaubswochen' ? 'wochen' : 'zusatz';
    (mitTabs ? tabBereiche[tab] : container).append(feld);
    bloecke.set(f.id, { frage: f, feld, fehler, aktualisiere: teil.aktualisiere, tab });
  }

  let tabs = null;
  if (mitTabs) {
    if (tageTeil) tabBereiche.tage.append(tageTeil);
    const hatZusatz = fragen.some((f) => f.typ !== 'urlaubswochen');
    const stand = () => tabZustand({
      hatEinzeltage: Boolean(tabStand?.hatEinzeltage && tageTeil), hatZusatz,
      wochenVoll: Boolean(tabStand?.wochenVoll), rest: tabStand?.rest ?? 0, anzahlTage: tabStand?.anzahlTage ?? 0,
    });
    const fehlerTabs = () => new Set([...bloecke.values()]
      .filter((b) => b.feld.classList.contains('hat-fehler')).map((b) => b.tab));
    const leiste = el('div', 'tab-leiste');
    leiste.setAttribute('role', 'tablist');
    const knoepfe = {};
    let aktuell = 'wochen';
    let tageGesperrt = true;
    for (const [id, bereich] of Object.entries(tabBereiche)) {
      bereich.id = `tab-bereich-${id}`;
      bereich.setAttribute('role', 'tabpanel');
      bereich.setAttribute('aria-labelledby', `tab-${id}`);
      const knopf = el('button', 'tab');
      knopf.type = 'button';
      knopf.id = `tab-${id}`;
      knopf.setAttribute('role', 'tab');
      knopf.setAttribute('aria-controls', bereich.id);
      knopf.addEventListener('click', () => {
        if (knopf.getAttribute('aria-disabled') !== 'true') zeigeTab(id, true);
      });
      knopf.addEventListener('animationend', () => knopf.classList.remove('aufleuchten'));
      knoepfe[id] = knopf;
    }
    // Pfeiltasten links/rechts wechseln zwischen freien Tabs.
    leiste.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const frei = stand().filter((t) => !t.gesperrt).map((t) => t.id);
      const i = frei.indexOf(aktuell);
      const ziel = frei[(i + (e.key === 'ArrowRight' ? 1 : frei.length - 1)) % frei.length];
      zeigeTab(ziel, false);
      knoepfe[ziel].focus();
      e.preventDefault();
    });

    tabsZeichnen = () => {
      const liste = stand();
      const mitFehler = fehlerTabs();
      // Gesperrter oder weggefallener Tab: zurück zu den Wochen.
      if (liste.find((t) => t.id === aktuell)?.gesperrt !== false) aktuell = 'wochen';
      leiste.replaceChildren(...liste.map((t) => {
        const k = knoepfe[t.id];
        k.replaceChildren(document.createTextNode(t.titel));
        if (t.abzeichen) k.append(el('span', 'tab-abzeichen', t.abzeichen));
        k.setAttribute('aria-selected', String(t.id === aktuell));
        k.setAttribute('aria-disabled', String(t.gesperrt));
        k.tabIndex = t.id === aktuell ? 0 : -1;
        k.classList.toggle('hervorgehoben', t.hervorgehoben);
        k.classList.toggle('hat-fehler', mitFehler.has(t.id));
        if (t.id === 'tage') {
          // Einmal aufleuchten, wenn der Tab frei wird (kein Dauerblinken).
          if (tageGesperrt && !t.gesperrt && t.hervorgehoben) k.classList.add('aufleuchten');
          tageGesperrt = t.gesperrt;
        }
        return k;
      }));
      for (const [id, bereich] of Object.entries(tabBereiche)) bereich.hidden = id !== aktuell;
    };
    zeigeTab = (id, scrollen) => {
      aktuell = id;
      tabsZeichnen();
      if (scrollen) leiste.scrollIntoView({ behavior: 'smooth', block: 'start' });
      beiTabwechsel();
    };
    container.append(leiste, tabBereiche.wochen, tabBereiche.tage, tabBereiche.zusatz);
    tabsZeichnen();
    tabsFertig = true;
    tabs = {
      weiter() {
        const ziel = naechsterTab(stand(), aktuell);
        if (ziel) zeigeTab(ziel, true);
      },
      istLetzter: () => naechsterTab(stand(), aktuell) === null,
      zeigeFehlerTab() {
        const ziel = ersterTabMitFehler(stand(), fehlerTabs());
        if (ziel && ziel !== aktuell) zeigeTab(ziel, false); else tabsZeichnen();
      },
    };
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
    tabs?.zeigeFehlerTab();
  }

  function antworten() {
    const kopie = {};
    for (const [id, wert] of Object.entries(werte)) kopie[id] = Array.isArray(wert) ? [...wert] : wert;
    return kopie;
  }

  sichtbarkeitAktualisieren();
  return { antworten, zeigeFehler, sichtbarkeitAktualisieren, tabs };
}
