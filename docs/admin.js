import { rpc, anmelden, erneuern } from './api.js';
import { zeitpunkt } from './logik.js';
import { personenZeilen, wochenZeilen, excelBlaetter } from './auswertung.js';
import { erzeugeXlsx } from './xlsx.js';

// Supabase verlangt eine E-Mail-Adresse. Der Kollege tippt nur den Benutzernamen;
// die Domain ist reserviert (RFC 2606) und kann keine Post empfangen.
const LOGIN_DOMAIN = 'example.com';
const SITZUNG = 'urlaub-admin-sitzung';

const ADMIN_FEHLER = {
  KEIN_ADMIN: 'Dieses Konto hat keine Admin-Rechte.',
  NAME_LEER: 'Bitte einen Namen eingeben.',
  NAME_DOPPELT: 'Diesen Namen gibt es schon. Bitte unterscheide ihn, z. B. „Anna K.“ und „Anna M.“.',
  HINWEIS_LEER: 'Bitte einen Hinweis für den Dezember eingeben.',
  KEINE_VERBINDUNG: 'Keine Verbindung. Bitte prüfe dein Internet.',
};

const $ = (id) => document.getElementById(id);
let daten = null;

// ---------------------------------------------------------------- Sitzung

function sitzungLesen() {
  try { return JSON.parse(sessionStorage.getItem(SITZUNG)); } catch { return null; }
}

function sitzungSpeichern(antwort) {
  const sitzung = {
    token: antwort.access_token,
    refresh: antwort.refresh_token,
    ablauf: Date.now() + (antwort.expires_in || 3600) * 1000,
  };
  try { sessionStorage.setItem(SITZUNG, JSON.stringify(sitzung)); } catch { /* nur für diese Seite */ }
  return sitzung;
}

function sitzungLoeschen() {
  try { sessionStorage.removeItem(SITZUNG); } catch { /* egal */ }
}

let sitzung = null;

async function gueltigesToken() {
  if (!sitzung) throw new Error('NICHT_ANGEMELDET');
  if (Date.now() > sitzung.ablauf - 60_000) {
    try {
      sitzung = sitzungSpeichern(await erneuern(sitzung.refresh));
    } catch {
      throw new Error('NICHT_ANGEMELDET');
    }
  }
  return sitzung.token;
}

async function adminRpc(funktion, parameter) {
  try {
    return await rpc(funktion, parameter, await gueltigesToken());
  } catch (fehler) {
    if (fehler.message === 'NICHT_ANGEMELDET' || fehler.status === 401 || fehler.message === 'KEIN_ADMIN') {
      abmelden(fehler.message === 'KEIN_ADMIN'
        ? ADMIN_FEHLER.KEIN_ADMIN
        : 'Deine Anmeldung ist abgelaufen. Bitte melde dich neu an.');
    }
    throw fehler;
  }
}

// ---------------------------------------------------------------- Anzeige

function meldung(text, element = $('meldung')) {
  element.textContent = text || '';
  element.hidden = !text;
}

function fehlerAnzeigen(fehler) {
  if (fehler.message === 'NICHT_ANGEMELDET' || fehler.message === 'KEIN_ADMIN' || fehler.status === 401) return;
  meldung(ADMIN_FEHLER[fehler.message] || 'Das hat nicht geklappt. Bitte versuch es noch einmal.');
}

function knopf(text, klasse, aktion) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = text;
  b.className = klasse;
  b.addEventListener('click', aktion);
  return b;
}

function whatsappLink(p) {
  const text = `Hallo ${p.name}, hier ist dein persönlicher Link für deine Urlaubswünsche 2027. `
    + `Bitte nicht weitergeben – über diesen Link kann man deine Wünsche ändern:\n${p.link}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

function zeichnePersonen() {
  const liste = $('personen');
  liste.replaceChildren();
  const personen = personenZeilen(daten);
  if (!personen.length) {
    const leer = document.createElement('li');
    leer.className = 'klein';
    leer.textContent = 'Noch keine Mitarbeiter angelegt.';
    liste.append(leer);
  }
  for (const p of personen) {
    const karte = document.createElement('li');
    karte.className = 'karte';
    const name = document.createElement('p');
    name.className = 'karte-name';
    name.textContent = p.name;
    const status = document.createElement('p');
    status.className = p.abgegeben ? 'karte-status ok' : 'karte-status offen';
    status.textContent = p.abgegeben
      ? `${p.wochen} · ${p.urlaubstage} Urlaubstage · Stand ${p.stand}`
      : 'Noch nicht abgegeben';
    const aktionen = document.createElement('div');
    aktionen.className = 'karte-aktionen';
    const whatsapp = document.createElement('a');
    whatsapp.className = 'knopf-link';
    whatsapp.href = whatsappLink(p);
    whatsapp.target = '_blank';
    whatsapp.rel = 'noopener noreferrer';
    whatsapp.textContent = 'WhatsApp';
    aktionen.append(
      knopf('Link kopieren', 'zweitrangig klein-knopf', async (e) => {
        try {
          await navigator.clipboard.writeText(p.link);
          e.target.textContent = 'Kopiert ✓';
          setTimeout(() => { e.target.textContent = 'Link kopieren'; }, 2000);
        } catch {
          window.prompt('Link zum Kopieren:', p.link);
        }
      }),
      whatsapp,
      knopf('Neuer Link', 'zweitrangig klein-knopf', () => linkErneuern(p)),
      knopf('Löschen', 'gefahr klein-knopf', () => loeschen(p)),
    );
    karte.append(name, status, aktionen);
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
      const td = document.createElement('td');
      td.textContent = String(wert);
      tr.append(td);
    }
    return tr;
  }));
}

function zeichne() {
  const personen = personenZeilen(daten);
  const abgegeben = personen.filter((p) => p.abgegeben).length;
  $('kennzahl').textContent = `${abgegeben} von ${personen.length} haben abgegeben`;
  const e = daten.einstellungen;
  $('frist-anzeige').textContent = e.offen
    ? `Abgabe möglich bis ${zeitpunkt(e.frist)}`
    : `Frist abgelaufen am ${zeitpunkt(e.frist)} – nur noch Ansehen möglich`;
  zeichnePersonen();
  zeichneWochen();
}

async function laden() {
  daten = await adminRpc('admin_uebersicht');
  zeichne();
}

// ---------------------------------------------------------------- Aktionen

async function anlegen(ereignis) {
  ereignis.preventDefault();
  const feld = $('neu-name');
  meldung('');
  try {
    await adminRpc('admin_mitarbeiter_anlegen', { p_name: feld.value });
    feld.value = '';
    await laden();
  } catch (fehler) {
    fehlerAnzeigen(fehler);
  }
  feld.focus();
}

async function linkErneuern(p) {
  if (!window.confirm(`Neuen Link für ${p.name} erzeugen?\n\nDer bisherige Link funktioniert dann nicht mehr. `
    + 'Die bisherige Abgabe bleibt erhalten. Den neuen Link musst du erneut verschicken.')) return;
  meldung('');
  try {
    await adminRpc('admin_link_erneuern', { p_id: p.id });
    await laden();
  } catch (fehler) {
    fehlerAnzeigen(fehler);
  }
}

async function loeschen(p) {
  if (!window.confirm(`${p.name} wirklich löschen?\n\nDie Abgabe wird ebenfalls gelöscht und der Link funktioniert nicht mehr.`)) return;
  meldung('');
  try {
    await adminRpc('admin_mitarbeiter_loeschen', { p_id: p.id });
    await laden();
  } catch (fehler) {
    fehlerAnzeigen(fehler);
  }
}

async function einstellungenSpeichern(ereignis) {
  ereignis.preventDefault();
  meldung('');
  try {
    await adminRpc('admin_einstellungen_speichern', {
      p_frist: $('frist').value, p_dezember_hinweis: $('dezember-hinweis').value,
    });
    await laden();
    meldung('Einstellungen gespeichert.');
  } catch (fehler) {
    fehlerAnzeigen(fehler);
  }
}

function excelHerunterladen() {
  const blob = new Blob([erzeugeXlsx(excelBlaetter(daten))],
    { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const heute = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date());
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `Urlaubswuensche-2027_Stand-${heute}.xlsx`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

function zeigeReiter(name) {
  for (const b of document.querySelectorAll('[data-reiter]')) {
    b.setAttribute('aria-selected', String(b.dataset.reiter === name));
    $(`reiter-${b.dataset.reiter}`).hidden = b.dataset.reiter !== name;
  }
  if (name === 'einstellungen' && daten) {
    $('frist').value = daten.einstellungen.frist_eingabe;
    $('dezember-hinweis').value = daten.einstellungen.dezember_hinweis;
  }
  meldung('');
}

// ---------------------------------------------------------------- Anmeldung

function zeigeLogin(text) {
  $('verwaltung').hidden = true;
  $('abmelden').hidden = true;
  $('login').hidden = false;
  meldung(text, $('login-meldung'));
  $('login-name').focus();
}

async function zeigeVerwaltung() {
  $('login').hidden = true;
  $('verwaltung').hidden = false;
  $('abmelden').hidden = false;
  zeigeReiter('personen');
  try {
    await laden();
  } catch (fehler) {
    fehlerAnzeigen(fehler);
  }
}

function abmelden(text) {
  sitzung = null;
  daten = null;
  sitzungLoeschen();
  $('personen').replaceChildren();
  $('wochen').replaceChildren();
  zeigeLogin(typeof text === 'string' ? text : '');
}

async function login(ereignis) {
  ereignis.preventDefault();
  const name = $('login-name').value.trim().toLowerCase();
  const passwort = $('login-passwort').value;
  if (!name || !passwort) return meldung('Bitte Benutzername und Passwort eingeben.', $('login-meldung'));
  const email = name.includes('@') ? name : `${name}@${LOGIN_DOMAIN}`;
  $('login-knopf').disabled = true;
  try {
    sitzung = sitzungSpeichern(await anmelden(email, passwort));
    $('login-passwort').value = '';
    meldung('', $('login-meldung'));
    await zeigeVerwaltung();
  } catch (fehler) {
    meldung(fehler.status === 429
      ? 'Zu viele Versuche. Bitte warte einige Minuten.'
      : fehler.message === 'KEINE_VERBINDUNG'
        ? ADMIN_FEHLER.KEINE_VERBINDUNG
        : 'Benutzername oder Passwort ist falsch.', $('login-meldung'));
  } finally {
    $('login-knopf').disabled = false;
  }
}

function start() {
  $('login-form').addEventListener('submit', login);
  $('abmelden').addEventListener('click', () => abmelden(''));
  $('neu-form').addEventListener('submit', anlegen);
  $('einstellungen-form').addEventListener('submit', einstellungenSpeichern);
  $('excel').addEventListener('click', excelHerunterladen);
  for (const b of document.querySelectorAll('[data-reiter]')) {
    b.addEventListener('click', () => zeigeReiter(b.dataset.reiter));
  }
  sitzung = sitzungLesen();
  if (sitzung) zeigeVerwaltung(); else zeigeLogin('');
}

start();
