// Verwaltung: Detailansicht einer Umfrage (Fragen, Mitarbeiter, Antworten, Einstellungen, Excel).
import {
  $, meldung, fehlerText, knopf, element, whatsappLink, kopieren, datumDeutsch, herunterladen,
} from './admin-hilfe.js';
import { namenAusText, erinnerungsText, offenListeText } from './verwaltung-logik.js';
import { zeitpunkt } from './logik.js';
import { personenZeilen, zusammenfassung, excelBlaetter } from './auswertung.js';
import { erzeugeXlsx } from './xlsx.js';
import { initFragen, zeigeFragen } from './admin-fragen.js';

let ctx = null;      // { aufruf, fehlerAnzeigen, zurueck }
let daten = null;    // Antwort von org_umfrage
let umfrageId = null;
let formularFuer = null; // Umfrage-ID, deren Werte das Einstellungsformular gerade zeigt

export function initUmfrage(kontext) {
  ctx = kontext;
  $('zurueck').addEventListener('click', () => ctx.zurueck());
  $('neu-form').addEventListener('submit', mitarbeiterAnlegen);
  $('einstellungen-form').addEventListener('submit', einstellungenSpeichern);
  $('frei-form').addEventListener('submit', freienTagHinzufuegen);
  $('excel').addEventListener('click', excelHerunterladen);
  $('sicherung-herunterladen').addEventListener('click', sicherungHerunterladen);
  $('umfrage-kopieren').addEventListener('click', umfrageKopieren);
  $('umfrage-loeschen').addEventListener('click', umfrageLoeschen);
  for (const b of document.querySelectorAll('[data-reiter]')) {
    b.addEventListener('click', () => zeigeReiter(b.dataset.reiter));
  }
  initFragen({ aufruf: ctx.aufruf, fehlerAnzeigen: ctx.fehlerAnzeigen, neuLaden: laden });
}

export async function zeigeUmfrage(id) {
  umfrageId = id;
  daten = null;
  formularFuer = null;
  for (const k of ['u-titel', 'kennzahl', 'frist-anzeige']) $(k).textContent = '';
  $('personen').replaceChildren();
  $('offen-aktionen').replaceChildren();
  $('antworten-liste').replaceChildren();
  zeigeFragen(null);
  zeigeReiter('fragen');
  await laden();
}

async function laden() {
  const angefragt = umfrageId;
  let antwort;
  try {
    antwort = await ctx.aufruf('org_umfrage', { p_umfrage_id: angefragt });
  } catch (fehler) {
    if (angefragt !== umfrageId) return;
    ctx.fehlerAnzeigen(fehler);
    if (fehler.message === 'UMFRAGE_NICHT_GEFUNDEN') ctx.zurueck();
    return;
  }
  if (angefragt !== umfrageId) return; // veraltete Antwort einer früheren Umfrage
  daten = antwort;
  zeichne();
  // Reiter wurde während des Ladens geöffnet: Formular zeigt noch eine andere Umfrage
  if (!$('reiter-einstellungen').hidden && formularFuer !== Number(umfrageId)) einstellungenFuellen();
}

// Die geladenen Daten gehören zur aktuell geöffneten Umfrage.
function datenPasst() {
  const id = daten?.einstellungen?.id;
  return Boolean(daten) && (id === undefined || Number(id) === Number(umfrageId));
}

async function aktion(funktion, parameter, danach = null) {
  meldung('');
  try {
    await ctx.aufruf(funktion, parameter);
    await laden();
    if (danach) meldung(danach);
    return true;
  } catch (fehler) {
    ctx.fehlerAnzeigen(fehler);
    return false;
  }
}

function zeigeReiter(name) {
  for (const b of document.querySelectorAll('[data-reiter]')) {
    b.setAttribute('aria-selected', String(b.dataset.reiter === name));
    $(`reiter-${b.dataset.reiter}`).hidden = b.dataset.reiter !== name;
  }
  if (name === 'einstellungen' && daten) einstellungenFuellen();
  meldung('');
}

// ---------------------------------------------------------------- Anzeige

// Jahr der Urlaubswochen-Frage (null, wenn die Umfrage keine hat).
function urlaubsJahr() {
  return daten.fragen?.find((f) => f.typ === 'urlaubswochen')?.urlaubswochen?.jahr ?? null;
}

function zeichne() {
  const e = daten.einstellungen;
  zeigeFragen(daten);
  const personen = personenZeilen(daten);
  const jahr = urlaubsJahr();
  $('u-titel').textContent = jahr ? `${e.titel} (${jahr})` : e.titel;
  $('kennzahl').textContent = `${personen.filter((p) => p.abgegeben).length} von ${personen.length} haben abgegeben`;
  $('frist-anzeige').textContent = e.offen
    ? `Abgabe möglich bis ${zeitpunkt(e.frist)}`
    : `Frist abgelaufen am ${zeitpunkt(e.frist)} – nur noch Ansehen möglich`;
  zeichnePersonen(personen);
  zeichneAntworten();
  zeichneFreieTage();
}

function zeichnePersonen(personen) {
  const e = daten.einstellungen;
  const offen = personen.filter((p) => !p.abgegeben);
  const offenAktionen = $('offen-aktionen');
  offenAktionen.replaceChildren();
  if (e.offen && offen.length) {
    const listeKnopf = knopf(`Liste „noch offen“ kopieren (${offen.length})`, 'zweitrangig klein-knopf',
      () => kopieren(offenListeText(offen.map((p) => p.name), e.titel, e.frist), listeKnopf));
    offenAktionen.append(listeKnopf);
  }
  const liste = $('personen');
  liste.replaceChildren();
  if (!personen.length) liste.append(element('li', 'klein', 'Noch keine Mitarbeiter angelegt.'));
  for (const p of personen) {
    const karte = element('li', 'karte');
    karte.append(element('p', 'karte-name', p.name));
    karte.append(element('p', p.abgegeben ? 'karte-status ok' : 'karte-status offen',
      p.abgegeben ? `Abgegeben, Stand ${p.stand}` : 'Noch nicht abgegeben'));
    for (const h of p.hinweise) karte.append(element('p', 'karte-warnung', `⚠ ${h}`));
    const aktionen = element('div', 'karte-aktionen');
    const kopierKnopf = knopf('Link kopieren', 'zweitrangig klein-knopf', () => kopieren(p.link, kopierKnopf));
    aktionen.append(
      kopierKnopf,
      whatsappLink(`Hallo ${p.name}, hier ist dein persönlicher Link für „${e.titel}“. `
        + `Bitte nicht weitergeben – über diesen Link kann man deine Wünsche ändern:\n${p.link}`),
    );
    if (!p.abgegeben && e.offen) aktionen.append(whatsappLink(erinnerungsText(p.name, e.titel, e.frist, p.link), 'Erinnern'));
    aktionen.append(
      knopf('Neuer Link', 'zweitrangig klein-knopf', () => {
        if (!window.confirm(`Neuen Link für ${p.name} erzeugen?\n\nDer bisherige Link funktioniert dann nicht mehr. `
          + 'Die bisherige Abgabe bleibt erhalten. Den neuen Link musst du erneut verschicken.')) return;
        aktion('org_link_erneuern', { p_mitarbeiter_id: p.id });
      }),
      knopf('Löschen', 'gefahr klein-knopf', () => {
        if (!window.confirm(`${p.name} wirklich löschen?\n\nDie Abgabe wird ebenfalls gelöscht und der Link funktioniert nicht mehr.`)) return;
        aktion('org_mitarbeiter_loeschen', { p_mitarbeiter_id: p.id });
      }),
    );
    karte.append(aktionen);
    liste.append(karte);
  }
}

// ---------------------------------------------------------------- Reiter „Antworten“

const ZAHL = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });
const zahl = (n) => (n === null || n === undefined ? '–' : ZAHL.format(n));

function tabelle(kopf, zeilen, klasse = 'tabelle') {
  const rahmen = element('div', 'tabelle-rahmen');
  const t = element('table', klasse);
  const thead = element('thead');
  const tr = element('tr');
  for (const k of kopf) tr.append(element('th', null, k));
  thead.append(tr);
  const tbody = element('tbody');
  tbody.append(...zeilen);
  t.append(thead, tbody);
  rahmen.append(t);
  return rahmen;
}

function zeile(werte, klasse = null) {
  const tr = element('tr', klasse);
  for (const w of werte) tr.append(element('td', null, String(w)));
  return tr;
}

function auswahlInhalt(frage, z) {
  const teile = [];
  if (frage.typ === 'skala') {
    teile.push(element('p', 'klein', z.durchschnitt === null
      ? 'Durchschnitt: –' : `Durchschnitt: ${zahl(z.durchschnitt)}`));
  }
  const s = frage.skala || {};
  const ende = (i) => (frage.typ !== 'skala' ? ''
    : i === 0 && s.links ? ` (${s.links})` : i === z.zeilen.length - 1 && s.rechts ? ` (${s.rechts})` : '');
  teile.push(tabelle(['Antwort', 'Anzahl', 'Namen'], z.zeilen.map((r, i) => zeile(
    [`${r.text}${ende(i)}${r.aktiv ? '' : ' (aus)'}`, r.anzahl, r.namen.join(', ')],
    r.aktiv ? null : 'aus',
  )), 'tabelle auswahl'));
  return teile;
}

function listeInhalt(werte) {
  const ul = element('ul', 'antwort-werte');
  ul.append(...werte.map((w) => element('li', null, `${w.name} – ${w.text}`)));
  return ul;
}

function wochenInhalt(z) {
  const max = Math.max(1, ...z.wochen.map((w) => w.anzahl));
  const teile = [tabelle(['KW', 'Zeitraum', 'Anzahl', 'Namen'], z.wochen.map((w) => zeile(
    [`KW ${w.kw}`, w.zeitraum + (w.feiertag ? ` (${w.feiertag})` : ''), w.anzahl, w.namen],
    w.anzahl > 0 && w.anzahl >= Math.max(2, max * 0.75) ? 'viel' : null,
  )))];
  if (z.tage?.length) {
    teile.push(element('h4', null, 'Einzelne Tage'),
      tabelle(['Datum', 'KW', 'Anzahl', 'Namen'], z.tage.map((t) => zeile([t.text, t.kw ? `KW ${t.kw}` : '', t.anzahl, t.namen]))));
  }
  return teile;
}

function zeichneAntworten() {
  const fragen = (daten.fragen || []).filter((f) => f.typ !== 'hinweis');
  if (!fragen.length) {
    $('antworten-liste').replaceChildren(element('p', 'klein', 'Noch keine Fragen. Lege sie im Reiter „Fragen“ an.'));
    return;
  }
  $('antworten-liste').replaceChildren(...fragen.map((f, i) => {
    const z = zusammenfassung(f, daten);
    const box = element('div', f.aktiv === false ? 'box antwort-box aus' : 'box antwort-box');
    box.append(element('h3', 'antwort-frage', `${i + 1}. ${f.text}${f.aktiv === false ? ' (aus)' : ''}`));
    box.append(element('p', 'klein', `${z.beantwortet} beantwortet`));
    if (z.art === 'auswahl') {
      box.append(...auswahlInhalt(f, z));
    } else if (z.art === 'wochen') {
      box.append(...wochenInhalt(z));
    } else if (!z.beantwortet) {
      box.append(element('p', 'klein', 'Noch keine Antworten.'));
    } else if (z.art === 'zahl') {
      box.append(
        element('p', 'klein', `Kleinster Wert: ${zahl(z.kleinster)} · größter Wert: ${zahl(z.groesster)}`
          + ` · Durchschnitt: ${zahl(z.durchschnitt)}`),
        listeInhalt(z.werte.map((w) => ({ name: w.name, text: zahl(w.wert) }))),
      );
    } else {
      box.append(listeInhalt(z.werte));
    }
    return box;
  }));
}

function einstellungenFuellen() {
  const e = daten.einstellungen;
  formularFuer = Number(e.id);
  $('e-titel').value = e.titel;
  $('e-frist').value = e.frist_eingabe;
  zeichneFreieTage();
}

function zeichneFreieTage() {
  const jahr = urlaubsJahr();
  $('freie-tage').replaceChildren(...daten.freie_tage.map((f) => {
    const li = element('li', 'karte');
    li.append(element('p', 'karte-name', `${datumDeutsch(f.datum)} – ${f.name}`));
    const aktionen = element('div', 'karte-aktionen');
    aktionen.append(knopf('Entfernen', 'gefahr klein-knopf',
      () => aktion('org_freien_tag_entfernen', { p_umfrage_id: umfrageId, p_datum: f.datum })));
    li.append(aktionen);
    return li;
  }));
  $('frei-datum').min = jahr ? `${jahr}-01-01` : '';
  $('frei-datum').max = jahr ? `${jahr}-12-31` : '';
}

// ---------------------------------------------------------------- Aktionen

async function mitarbeiterAnlegen(ereignis) {
  ereignis.preventDefault();
  const feld = $('neu-namen');
  const namen = namenAusText(feld.value);
  meldung('');
  if (!namen.length) {
    meldung(fehlerText('NAME_LEER'));
    feld.focus();
    return;
  }
  try {
    const anzahl = await ctx.aufruf('org_mitarbeiter_anlegen_liste', { p_umfrage_id: umfrageId, p_namen: namen });
    feld.value = '';
    await laden();
    meldung(anzahl === 1 ? '1 Mitarbeiter angelegt.' : `${anzahl} Mitarbeiter angelegt.`);
  } catch (fehler) {
    if (fehler.message === 'NAME_DOPPELT' && fehler.details) meldung(`„${fehler.details}“: ${fehlerText('NAME_DOPPELT')}`);
    else ctx.fehlerAnzeigen(fehler);
  }
  feld.focus();
}

async function einstellungenSpeichern(ereignis) {
  ereignis.preventDefault();
  if (!datenPasst() || formularFuer !== Number(umfrageId)) {
    meldung('Bitte warte, bis die Umfrage geladen ist.');
    return;
  }
  const p = { titel: $('e-titel').value, frist: $('e-frist').value };
  if (await aktion('org_umfrage_speichern', { p_umfrage_id: umfrageId, p_daten: p }, 'Einstellungen gespeichert.')) {
    if (datenPasst()) einstellungenFuellen(); // nur nach erfolgreichem Speichern das Formular neu füllen
  }
}

async function freienTagHinzufuegen(ereignis) {
  ereignis.preventDefault();
  const ok = await aktion('org_freien_tag_hinzufuegen', {
    p_umfrage_id: umfrageId, p_datum: $('frei-datum').value || null, p_name: $('frei-name').value,
  });
  if (ok) {
    $('frei-datum').value = '';
    $('frei-name').value = '';
  }
}

async function umfrageLoeschen() {
  if (!datenPasst()) return;
  const titel = daten?.einstellungen.titel || '';
  if (!window.confirm(`„${titel}“ mit allen Mitarbeitern und Abgaben endgültig löschen?\n\nAlle Links dieser Umfrage funktionieren danach nicht mehr.`)) return;
  meldung('');
  try {
    await ctx.aufruf('org_umfrage_loeschen', { p_umfrage_id: umfrageId });
    ctx.zurueck();
  } catch (fehler) {
    ctx.fehlerAnzeigen(fehler);
  }
}

async function umfrageKopieren() {
  if (!datenPasst()) return;
  if (!window.confirm('Kopie mit allen Fragen anlegen? Mitarbeiter und Antworten werden nicht kopiert.')) return;
  meldung('');
  const knopfKopieren = $('umfrage-kopieren');
  knopfKopieren.disabled = true;
  let neu;
  try {
    neu = await ctx.aufruf('org_umfrage_kopieren', { p_umfrage_id: umfrageId });
  } catch (fehler) {
    ctx.fehlerAnzeigen(fehler);
    return;
  } finally {
    knopfKopieren.disabled = false;
  }
  window.scrollTo(0, 0);
  await zeigeUmfrage(neu);
  if (Number(umfrageId) === Number(neu) && datenPasst()) meldung('Kopie angelegt. Du siehst jetzt die Kopie.');
}

// Dateiname aus Titel und heutigem Datum (deutsche Zeit).
function dateiBasis() {
  const heute = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date());
  const name = daten.einstellungen.titel.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'Umfrage';
  return { name, heute };
}

function excelHerunterladen() {
  if (!datenPasst()) return;
  const { name, heute } = dateiBasis();
  herunterladen(new Blob([erzeugeXlsx(excelBlaetter(daten))],
    { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${name}_Stand-${heute}.xlsx`);
}

async function sicherungHerunterladen() {
  if (!datenPasst()) return;
  meldung('');
  const { name, heute } = dateiBasis();
  try {
    const s = await ctx.aufruf('org_sicherung', { p_umfrage_id: umfrageId });
    herunterladen(new Blob([JSON.stringify(s, null, 2)], { type: 'application/json' }), `${name}_Sicherung-${heute}.json`);
  } catch (fehler) {
    ctx.fehlerAnzeigen(fehler);
  }
}
