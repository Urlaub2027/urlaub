// Verwaltung: Detailansicht einer Umfrage (Fragen, Mitarbeiter, Wochen, Einstellungen, Excel).
import {
  $, meldung, knopf, element, whatsappLink, kopieren, datumDeutsch,
} from './admin-hilfe.js';
import { zeitpunkt } from './logik.js';
import { personenZeilen, wochenZeilen, excelBlaetter, regelHinweis } from './auswertung.js';
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
  $('wochen').replaceChildren();
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

// Übergang bis zur neuen Auswertung (Task 6): auswertung.js erwartet noch die alte
// Form mit wochen/urlaubstage/regelverstoss je Mitarbeiter. Wird aus den Antworten
// auf die Urlaubswochen-Frage abgeleitet.
function alteForm() {
  const frage = daten.fragen?.find((f) => f.typ === 'urlaubswochen');
  const tage = new Map((daten.kalender || []).map((k) => [k.kw, k.arbeitstage]));
  return {
    ...daten,
    kalender: daten.kalender || [],
    mitarbeiter: (daten.mitarbeiter || []).map((m) => {
      const antwort = frage ? m.antworten?.[frage.id] : null;
      const wochen = Array.isArray(antwort) ? antwort.map(Number) : [];
      return {
        ...m,
        wochen,
        urlaubstage: wochen.reduce((summe, kw) => summe + (tage.get(kw) || 0), 0),
        regelverstoss: frage ? m.verstoesse?.[frage.id] || null : null,
      };
    }),
  };
}

function zeichne() {
  const e = daten.einstellungen;
  zeigeFragen(daten); // zuerst: der Fragen-Reiter hängt nicht an der Übergangs-Auswertung
  const personen = personenZeilen(alteForm());
  const jahr = urlaubsJahr();
  $('u-titel').textContent = jahr ? `${e.titel} (${jahr})` : e.titel;
  $('kennzahl').textContent = `${personen.filter((p) => p.abgegeben).length} von ${personen.length} haben abgegeben`;
  $('frist-anzeige').textContent = e.offen
    ? `Abgabe möglich bis ${zeitpunkt(e.frist)}`
    : `Frist abgelaufen am ${zeitpunkt(e.frist)} – nur noch Ansehen möglich`;
  zeichnePersonen(personen);
  zeichneWochen();
  zeichneFreieTage();
}

function zeichnePersonen(personen) {
  const liste = $('personen');
  liste.replaceChildren();
  if (!personen.length) liste.append(element('li', 'klein', 'Noch keine Mitarbeiter angelegt.'));
  for (const p of personen) {
    const karte = element('li', 'karte');
    karte.append(element('p', 'karte-name', p.name));
    karte.append(element('p', p.abgegeben ? 'karte-status ok' : 'karte-status offen', p.abgegeben
      ? `${p.wochen} · ${p.urlaubstage} Urlaubstage · Stand ${p.stand}`
      : 'Noch nicht abgegeben'));
    if (p.regelverstoss) karte.append(element('p', 'karte-warnung', `⚠ ${regelHinweis(p.regelverstoss)}`));
    const aktionen = element('div', 'karte-aktionen');
    const kopierKnopf = knopf('Link kopieren', 'zweitrangig klein-knopf', () => kopieren(p.link, kopierKnopf));
    aktionen.append(
      kopierKnopf,
      whatsappLink(`Hallo ${p.name}, hier ist dein persönlicher Link für „${daten.einstellungen.titel}“. `
        + `Bitte nicht weitergeben – über diesen Link kann man deine Wünsche ändern:\n${p.link}`),
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

function zeichneWochen() {
  const zeilen = wochenZeilen(alteForm());
  const max = Math.max(1, ...zeilen.map((w) => w.anzahl));
  $('wochen').replaceChildren(...zeilen.map((w) => {
    const tr = document.createElement('tr');
    if (w.anzahl > 0 && w.anzahl >= Math.max(2, max * 0.75)) tr.className = 'viel';
    for (const wert of [`KW ${w.kw}`, w.zeitraum + (w.feiertag ? ` (${w.feiertag})` : ''), w.anzahl, w.namen]) {
      tr.append(element('td', null, String(wert)));
    }
    return tr;
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
  const feld = $('neu-name');
  if (await aktion('org_mitarbeiter_anlegen', { p_umfrage_id: umfrageId, p_name: feld.value })) feld.value = '';
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

function excelHerunterladen() {
  if (!datenPasst()) return;
  const blob = new Blob([erzeugeXlsx(excelBlaetter(alteForm()))],
    { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const heute = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date());
  const name = daten.einstellungen.titel.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'Umfrage';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${name}_Stand-${heute}.xlsx`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}
