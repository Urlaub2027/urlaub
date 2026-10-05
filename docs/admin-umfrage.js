// Verwaltung: Detailansicht einer Umfrage (Mitarbeiter, Wochen, Einstellungen, Excel).
import {
  $, meldung, knopf, element, whatsappLink, kopieren, fuelleJahre, fuelleLaender, datumDeutsch,
} from './admin-hilfe.js';
import { zeitpunkt, MONATE } from './logik.js';
import { personenZeilen, wochenZeilen, excelBlaetter, regelHinweis } from './auswertung.js';
import { erzeugeXlsx } from './xlsx.js';

let ctx = null;      // { aufruf, fehlerAnzeigen, zurueck }
let daten = null;    // Antwort von org_umfrage
let umfrageId = null;

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
  $('e-monate').replaceChildren(...MONATE.map((name, i) => {
    const label = element('label', 'monat-wahl');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.value = String(i + 1);
    label.append(box, document.createTextNode(` ${name}`));
    return label;
  }));
}

export async function zeigeUmfrage(id) {
  umfrageId = id;
  daten = null;
  zeigeReiter('personen');
  await laden();
}

async function laden() {
  try {
    daten = await ctx.aufruf('org_umfrage', { p_umfrage_id: umfrageId });
  } catch (fehler) {
    ctx.fehlerAnzeigen(fehler);
    if (fehler.message === 'UMFRAGE_NICHT_GEFUNDEN') ctx.zurueck();
    return;
  }
  zeichne();
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

function zeichne() {
  const e = daten.einstellungen;
  const personen = personenZeilen(daten);
  $('u-titel').textContent = `${e.titel} (${e.jahr})`;
  $('kennzahl').textContent = `${personen.filter((p) => p.abgegeben).length} von ${personen.length} haben abgegeben`;
  $('frist-anzeige').textContent = e.offen
    ? `Abgabe möglich bis ${zeitpunkt(e.frist)}`
    : `Frist abgelaufen am ${zeitpunkt(e.frist)} – nur noch Ansehen möglich`;
  zeichnePersonen(personen);
  zeichneWochen();
  if (!$('reiter-einstellungen').hidden) einstellungenFuellen();
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
  const zeilen = wochenZeilen(daten);
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
  const jetzt = new Date().getFullYear();
  $('e-titel').value = e.titel;
  fuelleJahre($('e-jahr'), Math.min(e.jahr, jetzt), Math.max(e.jahr, jetzt + 3), e.jahr);
  fuelleLaender($('e-land'), e.bundesland);
  $('e-arbeitstage').value = String(e.arbeitstage_pro_woche);
  for (const id of ['e-jahr', 'e-land', 'e-arbeitstage']) $(id).disabled = !e.grunddaten_aenderbar;
  $('e-grunddaten-hinweis').hidden = e.grunddaten_aenderbar;
  $('e-urlaubstage').value = String(e.urlaubstage);
  $('e-min').value = String(e.min_wochen);
  $('e-max').value = String(e.max_wochen);
  $('e-stueck').value = String(e.max_am_stueck);
  for (const box of $('e-monate').querySelectorAll('input')) box.checked = e.gesperrte_monate.includes(Number(box.value));
  $('e-hinweis').value = e.sperr_hinweis;
  $('e-frist').value = e.frist_eingabe;
  $('freie-tage').replaceChildren(...daten.freie_tage.map((f) => {
    const li = element('li', 'karte');
    li.append(element('p', 'karte-name', `${datumDeutsch(f.datum)} – ${f.name}`));
    const aktionen = element('div', 'karte-aktionen');
    aktionen.append(knopf('Entfernen', 'gefahr klein-knopf',
      () => aktion('org_freien_tag_entfernen', { p_umfrage_id: umfrageId, p_datum: f.datum })));
    li.append(aktionen);
    return li;
  }));
  $('frei-datum').min = `${e.jahr}-01-01`;
  $('frei-datum').max = `${e.jahr}-12-31`;
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
  const e = daten.einstellungen;
  const p = {
    titel: $('e-titel').value,
    urlaubstage: Number($('e-urlaubstage').value),
    min_wochen: Number($('e-min').value),
    max_wochen: Number($('e-max').value),
    max_am_stueck: Number($('e-stueck').value),
    gesperrte_monate: [...$('e-monate').querySelectorAll('input:checked')].map((b) => Number(b.value)),
    sperr_hinweis: $('e-hinweis').value,
    frist: $('e-frist').value,
  };
  if (e.grunddaten_aenderbar) {
    Object.assign(p, {
      jahr: Number($('e-jahr').value),
      bundesland: $('e-land').value,
      arbeitstage_pro_woche: Number($('e-arbeitstage').value),
    });
  }
  await aktion('org_umfrage_speichern', { p_umfrage_id: umfrageId, p_daten: p }, 'Einstellungen gespeichert.');
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
  if (!daten) return;
  const blob = new Blob([erzeugeXlsx(excelBlaetter(daten))],
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
