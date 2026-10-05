import { rpc } from './api.js';
import {
  codeAusLink, fehlertext, zusammenfassung, istGesperrt, nachMonat, gleicheAuswahl, zeitpunkt,
  gesperrteBereiche, regelText,
} from './logik.js';

const $ = (id) => document.getElementById(id);

let code = null;
let daten = null;            // letzte Antwort der Datenbank
let auswahl = new Set();     // aktuell angehakte KWs

function zeige(bereich) {
  for (const id of ['laden', 'fehler', 'formular', 'bestaetigung']) $(id).hidden = id !== bereich;
  window.scrollTo(0, 0);
}

function zeigeFehler(fehlercode) {
  $('fehler').textContent = fehlercode === 'KEINE_VERBINDUNG'
    ? 'Keine Verbindung. Bitte prüfe dein Internet und lade die Seite neu.'
    : fehlertext(fehlercode);
  zeige('fehler');
}

function wochenText(kw) {
  const k = daten.kalender.find((x) => x.kw === kw);
  const tage = k.arbeitstage === daten.arbeitstage_pro_woche ? '' : ` · ${k.arbeitstage} Urlaubstage (${k.feiertag})`;
  return `KW ${k.kw}: ${k.von}–${k.bis}${tage}`;
}

function baueFormular() {
  const monate = $('monate');
  monate.replaceChildren();
  for (const gruppe of nachMonat(daten.kalender)) {
    const block = document.createElement('fieldset');
    block.className = 'monat';
    const titel = document.createElement('legend');
    titel.textContent = gruppe.name;
    block.append(titel);
    for (const k of gruppe.wochen) {
      const zeile = document.createElement('label');
      zeile.className = 'woche';
      const kaestchen = document.createElement('input');
      kaestchen.type = 'checkbox';
      kaestchen.value = String(k.kw);
      kaestchen.addEventListener('change', () => {
        if (kaestchen.checked) auswahl.add(k.kw); else auswahl.delete(k.kw);
        aktualisiere();
      });
      const kw = document.createElement('span');
      kw.className = 'kw';
      kw.textContent = `KW ${k.kw}`;
      const datum = document.createElement('span');
      datum.className = 'datum';
      datum.textContent = `${k.von}–${k.bis}`;
      zeile.append(kaestchen, kw, datum);
      if (k.arbeitstage !== daten.arbeitstage_pro_woche) {
        const feiertag = document.createElement('span');
        feiertag.className = 'feiertag';
        feiertag.textContent = `nur ${k.arbeitstage} Urlaubstage · ${k.feiertag}`;
        zeile.append(feiertag);
      }
      block.append(zeile);
    }
    monate.append(block);
  }
  $('regeln').textContent = regelText(daten);
  const bereiche = gesperrteBereiche(daten.kalender);
  $('gesperrt-box').hidden = bereiche.length === 0;
  $('gesperrt-liste').replaceChildren(...bereiche.map((b) => {
    const li = document.createElement('li');
    li.textContent = b.vonKw === b.bisKw ? `${b.name} (KW ${b.vonKw})` : `${b.name} (KW ${b.vonKw}–${b.bisKw})`;
    return li;
  }));
  $('sperr-hinweis').textContent = daten.sperr_hinweis;
}

function aktualisiere() {
  const z = zusammenfassung(daten.kalender, auswahl, daten.max_wochen, daten.urlaubstage);
  $('zaehler').textContent = z.text;
  for (const kaestchen of $('monate').querySelectorAll('input')) {
    const kw = Number(kaestchen.value);
    kaestchen.checked = auswahl.has(kw);
    kaestchen.disabled = istGesperrt(kw, auswahl, z.limitErreicht, daten.offen, daten.max_am_stueck);
    kaestchen.closest('label').title = kaestchen.disabled && daten.offen && !z.limitErreicht
      ? `Höchstens ${daten.max_am_stueck} Wochen am Stück` : '';
    kaestchen.closest('label').classList.toggle('gewaehlt', kaestchen.checked);
  }
  const unveraendert = gleicheAuswahl(auswahl, new Set(daten.wochen));
  $('absenden').disabled = !daten.offen || z.anzahl < daten.min_wochen || unveraendert;
  $('absenden').textContent = daten.wochen.length ? 'Änderung speichern' : 'Wünsche absenden';
  $('meldung').hidden = true;
}

function zeigeFormular() {
  auswahl = new Set(daten.wochen);
  $('status').textContent = daten.wochen.length
    ? `Deine Wünsche sind gespeichert (Stand ${zeitpunkt(daten.geaendert_am)}). Du kannst sie bis ${zeitpunkt(daten.frist)} ändern.`
    : `Du hast noch nichts abgegeben. Abgabe bis ${zeitpunkt(daten.frist)}.`;
  aktualisiere();
  zeige('formular');
}

function zeigeBestaetigung(nachSpeichern) {
  $('bestaetigung-titel').textContent = nachSpeichern
    ? `Danke, ${daten.name}! Deine Wünsche sind gespeichert:`
    : daten.wochen.length ? 'Deine Urlaubswünsche:' : 'Du hast keine Wünsche abgegeben.';
  const liste = $('bestaetigung-liste');
  liste.replaceChildren(...daten.wochen.map((kw) => {
    const li = document.createElement('li');
    li.textContent = wochenText(kw);
    return li;
  }));
  const z = zusammenfassung(daten.kalender, new Set(daten.wochen), daten.max_wochen, daten.urlaubstage);
  $('bestaetigung-stand').textContent = daten.wochen.length
    ? `${z.text}. Stand: ${zeitpunkt(daten.geaendert_am)}`
    : '';
  $('bestaetigung-frist').textContent = daten.offen
    ? `Du kannst deine Auswahl bis ${zeitpunkt(daten.frist)} ändern. Öffne dazu einfach wieder deinen Link.`
    : `Die Frist ist am ${zeitpunkt(daten.frist)} abgelaufen. Änderungen sind nicht mehr möglich.`;
  $('aendern').hidden = !daten.offen;
  zeige('bestaetigung');
}

async function absenden() {
  const knopf = $('absenden');
  knopf.disabled = true;
  knopf.textContent = 'Wird gespeichert …';
  try {
    daten = await rpc('urlaub_speichern', { p_code: code, p_wochen: [...auswahl] });
    zeigeBestaetigung(true);
  } catch (fehler) {
    if (fehler.message === 'LINK_UNGUELTIG') return zeigeFehler(fehler.message);
    if (fehler.message === 'FRIST_ABGELAUFEN') daten.offen = false;
    aktualisiere();
    $('meldung').textContent = fehler.message === 'KEINE_VERBINDUNG'
      ? 'Keine Verbindung. Deine Auswahl ist noch nicht gespeichert. Bitte versuch es noch einmal.'
      : fehlertext(fehler.message);
    $('meldung').hidden = false;
  }
}

async function start() {
  $('absenden').addEventListener('click', absenden);
  $('aendern').addEventListener('click', zeigeFormular);
  code = codeAusLink(window.location.hash);
  if (!code) return zeigeFehler('LINK_UNGUELTIG');
  try {
    daten = await rpc('urlaub_laden', { p_code: code });
  } catch (fehler) {
    return zeigeFehler(fehler.message);
  }
  $('begruessung').textContent = `Hallo ${daten.name}`;
  $('titel').textContent = daten.titel;
  document.title = daten.titel;
  baueFormular();
  if (daten.offen) zeigeFormular(); else zeigeBestaetigung(false);
}

window.addEventListener('hashchange', () => window.location.reload());
start();
