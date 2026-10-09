import './design.js';
import { rpc } from './api.js';
import {
  codeAusLink, fehlertext, zusammenfassung, zeitpunkt, gesperrteGewaehlte, wochenAus, tageAus, tagLang,
} from './logik.js';
import {
  sichtbareFragen, antwortenZumAbsenden, antwortSchluessel, antwortText, istLeer,
} from './formular-logik.js';
import { baueFormular } from './formular.js';

const $ = (id) => document.getElementById(id);

let code = null;
let daten = null;         // letzte Antwort der Datenbank
let formular = null;      // { antworten, zeigeFehler, sichtbarkeitAktualisieren }
let gespeichert = '';     // Vergleichsschlüssel der gespeicherten Antworten

function zeige(bereich) {
  for (const id of ['laden', 'fehler', 'formular', 'bestaetigung']) $(id).hidden = id !== bereich;
  window.scrollTo(0, 0);
}

function zeigeFehlerSeite(fehlercode) {
  $('fehler').textContent = fehlercode === 'KEINE_VERBINDUNG'
    ? 'Keine Verbindung. Bitte prüfe dein Internet und lade die Seite neu.'
    : fehlertext(fehlercode);
  zeige('fehler');
}

const urlaubsfrage = () => daten.fragen.find((f) => f.typ === 'urlaubswochen') || null;

// Gespeicherte Wochen, die inzwischen in einem gesperrten Zeitraum liegen.
function entfernteWochen() {
  const f = urlaubsfrage();
  const gewaehlt = f ? daten.antworten?.[f.id] : null;
  return Array.isArray(gewaehlt) ? gesperrteGewaehlte(f.urlaubswochen?.kalender || [], wochenAus(gewaehlt)) : [];
}

function wochenText(f, kw) {
  const uw = f.urlaubswochen || {};
  const k = (uw.kalender || []).find((x) => x.kw === kw);
  if (!k) return `KW ${kw} · nicht mehr wählbar`;
  const tage = k.arbeitstage === uw.arbeitstage_pro_woche ? '' : ` · ${k.arbeitstage} Urlaubstage (${k.feiertag})`;
  return `KW ${k.kw}: ${k.von}–${k.bis}${tage}${k.gesperrt ? ' · inzwischen gesperrt' : ''}`;
}

function baue(nurLesen, antworten = daten.antworten) {
  formular = baueFormular($('fragen'), { ...daten, antworten }, { nurLesen, beiAenderung: aktualisiere });
}

function aktualisiere() {
  // Ohne bisherige Abgabe darf auch "leer" abgesendet werden (die Datenbank meldet Pflichtfragen).
  const unveraendert = Boolean(daten.geaendert_am)
    && antwortSchluessel(daten.fragen, formular.antworten()) === gespeichert;
  $('absenden').disabled = !daten.offen || unveraendert;
  $('absenden').textContent = daten.geaendert_am ? 'Änderung speichern' : 'Antworten absenden';
  $('meldung').hidden = true;
}

function zeigeFormular() {
  baue(!daten.offen);
  const entfernt = entfernteWochen();
  let status = daten.geaendert_am
    ? `Deine Antworten sind gespeichert (Stand ${zeitpunkt(daten.geaendert_am)}). Du kannst sie bis ${zeitpunkt(daten.frist)} ändern.`
    : `Du hast noch nichts abgegeben. Abgabe bis ${zeitpunkt(daten.frist)}.`;
  if (entfernt.length) {
    const liste = entfernt.map((kw) => `KW ${kw}`).join(', ');
    status += entfernt.length === 1
      ? ` ${liste} liegt inzwischen in einem gesperrten Zeitraum und wurde aus deiner Auswahl entfernt. Bitte speichere deine Antworten neu.`
      : ` ${liste} liegen inzwischen in einem gesperrten Zeitraum und wurden aus deiner Auswahl entfernt. Bitte speichere deine Antworten neu.`;
  }
  $('status').textContent = status;
  aktualisiere();
  zeige('formular');
}

function zeigeBestaetigung(nachSpeichern) {
  const sichtbar = sichtbareFragen(daten.fragen, daten.antworten);
  const beantwortet = daten.fragen.filter((f) => f.typ !== 'hinweis' && sichtbar.has(f.id)
    && !istLeer(daten.antworten?.[f.id]));
  $('bestaetigung-titel').textContent = nachSpeichern
    ? `Danke, ${daten.name}! Deine Antworten sind gespeichert:`
    : daten.geaendert_am ? 'Deine Antworten:' : 'Du hast noch nichts abgegeben.';
  const liste = $('bestaetigung-liste');
  liste.replaceChildren(...beantwortet.map((f) => {
    const wert = daten.antworten[f.id];
    const li = document.createElement('li');
    // Urlaubswochen: statt "KW 3, KW 12" je Woche eine Zeile mit Datum und Feiertagen.
    const mitWochen = f.typ === 'urlaubswochen' && Array.isArray(wert);
    li.textContent = mitWochen ? `${f.text}:` : `${f.text}: ${antwortText(f, wert)}`;
    if (mitWochen) {
      const wochen = document.createElement('ul');
      wochen.className = 'liste';
      wochen.append(
        ...wochenAus(wert).map((kw) => {
          const w = document.createElement('li');
          w.textContent = wochenText(f, kw);
          return w;
        }),
        ...tageAus(wert).map((d) => {
          const w = document.createElement('li');
          w.textContent = `Einzelner Tag: ${tagLang(d)}`;
          return w;
        }),
      );
      li.append(wochen);
    }
    return li;
  }));
  liste.hidden = beantwortet.length === 0;
  const stand = [];
  const uf = urlaubsfrage();
  if (uf && beantwortet.includes(uf)) {
    const wert = daten.antworten[uf.id];
    stand.push(zusammenfassung(uf.urlaubswochen?.kalender || [], new Set(wochenAus(wert)),
      uf.regeln?.max_wochen ?? null, uf.regeln?.max_urlaubstage ?? null, tageAus(wert).length).text);
  }
  if (daten.geaendert_am) stand.push(`Stand: ${zeitpunkt(daten.geaendert_am)}`);
  $('bestaetigung-stand').textContent = stand.join('. ');
  $('bestaetigung-frist').textContent = daten.offen
    ? `Du kannst deine Antworten bis ${zeitpunkt(daten.frist)} ändern. Öffne dazu einfach wieder deinen Link.`
    : `Die Frist ist am ${zeitpunkt(daten.frist)} abgelaufen. Änderungen sind nicht mehr möglich.`;
  $('aendern').hidden = !daten.offen;
  zeige('bestaetigung');
}

// Fehler pro Frage anzeigen, zur ersten springen; liefert den Text für die Leiste.
function markiereFehler(details) {
  let fehler = null;
  try {
    fehler = typeof details === 'string' ? JSON.parse(details) : details;
  } catch {
    fehler = null;
  }
  if (!fehler || typeof fehler !== 'object') return 'Bitte prüfe deine Antworten.';
  formular.zeigeFehler(fehler);
  const sichtbar = (id) => {
    const feld = $(`frage-${id}`);
    return Boolean(feld) && !feld.hidden;
  };
  const erste = daten.fragen.find((f) => fehler[f.id] && sichtbar(f.id));
  if (erste) {
    const feld = $(`frage-${erste.id}`);
    feld.scrollIntoView({ behavior: 'smooth', block: 'start' });
    feld.querySelector('input:not(:disabled), textarea:not(:disabled)')?.focus({ preventScroll: true });
  }
  // Fehler an einer Frage, die hier fehlt oder verborgen ist: Umfrage wurde inzwischen geändert.
  if (Object.keys(fehler).some((id) => !sichtbar(id))) {
    return 'Die Umfrage wurde inzwischen geändert. Bitte lade die Seite neu und prüfe deine Antworten.';
  }
  return 'Bitte prüfe die markierten Fragen.';
}

async function absenden() {
  const knopf = $('absenden');
  knopf.disabled = true;
  knopf.textContent = 'Wird gespeichert …';
  formular.zeigeFehler(null);
  try {
    daten = await rpc('umfrage_absenden', {
      p_code: code,
      p_antworten: antwortenZumAbsenden(daten.fragen, formular.antworten()),
    });
    gespeichert = antwortSchluessel(daten.fragen, daten.antworten);
    zeigeBestaetigung(true);
  } catch (fehler) {
    if (fehler.message === 'LINK_UNGUELTIG') return zeigeFehlerSeite(fehler.message);
    let meldung;
    if (fehler.message === 'FRIST_ABGELAUFEN') {
      daten.offen = false;
      baue(true, formular.antworten());   // Eingaben sichtbar lassen, aber sperren
      meldung = fehlertext(fehler.message);
    } else if (fehler.message === 'ANTWORTEN_UNGUELTIG') {
      meldung = markiereFehler(fehler.details);
    } else if (fehler.message === 'KEINE_VERBINDUNG') {
      meldung = 'Keine Verbindung. Deine Antworten sind noch nicht gespeichert. Bitte versuch es noch einmal.';
    } else {
      meldung = fehlertext(fehler.message);
    }
    aktualisiere();
    $('meldung').textContent = meldung;
    $('meldung').hidden = false;
  }
}

async function start() {
  $('absenden').addEventListener('click', absenden);
  $('aendern').addEventListener('click', zeigeFormular);
  code = codeAusLink(window.location.hash);
  if (!code) return zeigeFehlerSeite('LINK_UNGUELTIG');
  try {
    daten = await rpc('urlaub_laden', { p_code: code });
  } catch (fehler) {
    return zeigeFehlerSeite(fehler.message);
  }
  gespeichert = antwortSchluessel(daten.fragen, daten.antworten);
  $('begruessung').textContent = `Hallo ${daten.name}`;
  $('titel').textContent = daten.titel;
  document.title = daten.titel;
  if (daten.offen) zeigeFormular(); else zeigeBestaetigung(false);
}

window.addEventListener('hashchange', () => window.location.reload());
start();
