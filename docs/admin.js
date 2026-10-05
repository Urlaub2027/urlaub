import './design.js';
// Verwaltung: Anmeldung, Registrierung über Einladung, Umfrageliste, Konto, Organisatoren.
import {
  $, meldung, fehlerText, knopf, element, whatsappLink, kopieren, fuelleJahre, fuelleLaender, landName,
} from './admin-hilfe.js';
import * as sitzung from './sitzung.js';
import { rpc, registrieren, passwortAendern } from './api.js';
import { zeitpunkt } from './logik.js';
import { initUmfrage, zeigeUmfrage } from './admin-umfrage.js';
import { VORLAGEN, vorlagenTitel, wachStatus } from './verwaltung-logik.js';

const ANSICHTEN = ['login', 'registrieren', 'liste', 'umfrage', 'konto', 'organisatoren'];
const BENUTZERNAME = /^(?=.{2,30}$)[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
let ich = null;
let einladungsCode = null;

function zeigeAnsicht(name) {
  for (const a of ANSICHTEN) $(`ansicht-${a}`).hidden = a !== name;
  $('navigation').hidden = !ich;
  window.scrollTo(0, 0);
}

// Ruft eine org_/haupt_-Funktion auf. Abgelaufene Anmeldung oder fehlende Rechte → Login.
async function aufruf(funktion, parameter) {
  try {
    return await sitzung.orgRpc(funktion, parameter);
  } catch (fehler) {
    if (fehler.message === 'NICHT_ANGEMELDET' || fehler.status === 401 || fehler.message === 'KEIN_ZUGRIFF') {
      abmelden(fehler.message === 'KEIN_ZUGRIFF'
        ? fehlerText('KEIN_ZUGRIFF')
        : 'Deine Anmeldung ist abgelaufen. Bitte melde dich neu an.');
      fehler.behandelt = true;
    }
    throw fehler;
  }
}

function fehlerAnzeigen(fehler) {
  if (!fehler.behandelt) meldung(fehlerText(fehler.message));
}

// ---------------------------------------------------------------- Anmeldung

function abmelden(text = '') {
  sitzung.logout();
  ich = null;
  $('wer').textContent = 'Verwaltung';
  zeigeAnsicht('login');
  meldung(text);
  $('login-name').focus();
}

async function nachLogin() {
  try {
    ich = await aufruf('org_ich');
  } catch (fehler) {
    fehlerAnzeigen(fehler);
    return;
  }
  $('wer').textContent = `Angemeldet als ${ich.anzeigename}`;
  $('nav-organisatoren').hidden = !ich.ist_hauptadmin;
  await zeigeListe();
}

async function login(ereignis) {
  ereignis.preventDefault();
  meldung('');
  const name = $('login-name').value;
  const passwort = $('login-passwort').value;
  if (!name.trim() || !passwort) return meldung('Bitte Benutzername und Passwort eingeben.');
  $('login-knopf').disabled = true;
  try {
    await sitzung.login(name, passwort);
    $('login-passwort').value = '';
    await nachLogin();
  } catch (fehler) {
    meldung(fehler.status === 429 ? 'Zu viele Versuche. Bitte warte einige Minuten.'
      : fehler.message === 'KEINE_VERBINDUNG' ? fehlerText('KEINE_VERBINDUNG')
        : 'Benutzername oder Passwort ist falsch.');
  } finally {
    $('login-knopf').disabled = false;
  }
}

// ---------------------------------------------------------------- Registrierung

async function zeigeRegistrierung(code) {
  einladungsCode = code;
  zeigeAnsicht('registrieren');
  try {
    const r = await rpc('einladung_pruefen', { p_code: code });
    if (!r.gueltig) {
      $('reg-form').hidden = true;
      meldung('Dieser Einladungslink ist ungültig, abgelaufen oder wurde schon benutzt. Bitte frag nach einem neuen.');
      return;
    }
    $('reg-einladung').textContent = `Eingeladen von ${r.eingeladen_von}.`;
  } catch (fehler) {
    meldung(fehlerText(fehler.message));
  }
}

async function registrierenAbsenden(ereignis) {
  ereignis.preventDefault();
  meldung('');
  const anzeigename = $('reg-anzeigename').value.trim();
  const name = $('reg-name').value.trim().toLowerCase();
  const passwort = $('reg-passwort').value;
  if (!anzeigename) return meldung('Bitte deinen Namen eingeben.');
  if (!BENUTZERNAME.test(name)) {
    return meldung('Der Benutzername darf nur Kleinbuchstaben, Ziffern, Punkt und Bindestrich enthalten, muss mit Buchstabe oder Ziffer beginnen und enden, darf keine zwei Trenner hintereinander haben (2–30 Zeichen).');
  }
  if (passwort.length < 10) return meldung('Das Passwort muss mindestens 10 Zeichen lang sein.');
  if (passwort !== $('reg-passwort2').value) return meldung('Die beiden Passwörter stimmen nicht überein.');
  $('reg-knopf').disabled = true;
  try {
    await registrieren(sitzung.emailFuer(name), passwort, { einladung: einladungsCode, anzeigename });
    window.history.replaceState(null, '', window.location.pathname);
    einladungsCode = null;
    try {
      await sitzung.login(name, passwort);
    } catch {
      // Konto existiert, Einladung ist verbraucht: nur die Anmeldung muss wiederholt werden.
      zeigeAnsicht('login');
      meldung('Registrierung erfolgreich. Bitte melde dich jetzt mit deinem Benutzernamen an.');
      return;
    }
    await nachLogin();
  } catch (fehler) {
    const m = fehler.message;
    meldung(m === 'user_already_exists' || m === 'email_exists'
      ? 'Diesen Benutzernamen gibt es schon. Bitte wähle einen anderen.'
      : m === 'weak_password' ? 'Das Passwort ist zu schwach. Bitte wähle ein längeres.'
        : m === 'KEINE_VERBINDUNG' ? fehlerText('KEINE_VERBINDUNG')
          : m === 'email_address_invalid'
            ? 'Dieser Benutzername wird vom Anmeldedienst nicht akzeptiert. Bitte wähle einen anderen.'
            : m === 'signup_disabled' || /Signups not allowed/i.test(m)
              ? 'Die Registrierung ist im Moment abgeschaltet. Bitte wende dich an den Hauptadmin.'
              : fehler.status === 500
                ? 'Registrierung abgelehnt: Die Einladung ist ungültig, abgelaufen oder schon benutzt – oder der Benutzername ist vergeben. Bitte frag nach einem neuen Einladungslink.'
                : 'Registrierung fehlgeschlagen. Die Einladung ist eventuell abgelaufen oder schon benutzt.');
  } finally {
    $('reg-knopf').disabled = false;
  }
}

// ---------------------------------------------------------------- Umfrageliste

async function zeigeListe() {
  meldung('');
  zeigeAnsicht('liste');
  let umfragen;
  try {
    umfragen = await aufruf('org_umfragen');
  } catch (fehler) {
    fehlerAnzeigen(fehler);
    return;
  }
  // Lebenszeichen der Wach-Automatik; ein Fehler hier blendet nur die Zeile aus.
  aufruf('org_lebenszeichen').then(zeigeWachStatus, () => { $('wach-status').hidden = true; });
  const liste = $('umfragen');
  liste.replaceChildren();
  if (!umfragen.length) liste.append(element('li', 'klein', 'Noch keine Umfrage. Lege oben die erste an.'));
  for (const u of umfragen) {
    const karte = element('li', 'karte');
    const frist = u.offen ? `Frist ${zeitpunkt(u.frist)}` : 'Frist abgelaufen';
    // Jahr und Bundesland gibt es nur mit einer Frage „Urlaubswochen“.
    const status = [u.jahr ?? null, u.bundesland ? landName(u.bundesland) : null,
      `${u.abgegeben} von ${u.mitarbeiter} haben abgegeben`, frist].filter((t) => t !== null);
    const aktionen = element('div', 'karte-aktionen');
    aktionen.append(knopf('Öffnen', 'klein-knopf', () => oeffneUmfrage(u.id)));
    karte.append(
      element('p', 'karte-name', u.titel),
      element('p', 'karte-status', status.join(' · ')),
      aktionen,
    );
    liste.append(karte);
  }
}

function zeigeWachStatus(zeit) {
  const s = wachStatus(zeit);
  const p = $('wach-status');
  p.className = s.warnung ? 'karte-warnung' : 'klein';
  p.textContent = s.text;
  p.hidden = false;
}

function vorlageGeaendert() {
  const vorlage = $('neu-vorlage').value;
  $('neu-urlaub-felder').hidden = !VORLAGEN.find((v) => v.name === vorlage)?.mitJahr;
  $('neu-titel').placeholder = vorlagenTitel(vorlage, Number($('neu-jahr').value));
}

const MAX_SICHERUNG = 5 * 1024 * 1024;

async function sicherungEinspielen() {
  meldung('');
  const datei = $('sicherung-datei').files[0];
  if (!datei) return meldung('Bitte zuerst eine Sicherungsdatei auswählen.');
  if (datei.size > MAX_SICHERUNG) return meldung('Die Datei ist zu groß für eine Sicherung (höchstens 5 MB).');
  let daten;
  try {
    daten = JSON.parse(await datei.text());
  } catch {
    return meldung(fehlerText('SICHERUNG_UNGUELTIG'));
  }
  if (!window.confirm('Aus dieser Sicherung eine neue Umfrage anlegen?')) return;
  const knopfEinspielen = $('sicherung-einspielen');
  knopfEinspielen.disabled = true;
  let r;
  try {
    r = await aufruf('org_sicherung_einspielen', { p_daten: daten });
  } catch (fehler) {
    fehlerAnzeigen(fehler);
    return;
  } finally {
    knopfEinspielen.disabled = false;
  }
  $('sicherung-datei').value = '';
  await oeffneUmfrage(r.id);
  meldung(r.neue_links
    ? `Sicherung eingespielt. ${r.neue_links} Mitarbeiter haben einen neuen Link bekommen, weil ihr alter Link noch zu einer bestehenden Umfrage gehört – bitte neu verschicken.`
    : 'Sicherung eingespielt.');
}

async function oeffneUmfrage(id) {
  meldung('');
  zeigeAnsicht('umfrage');
  await zeigeUmfrage(id);
}

async function umfrageAnlegen(ereignis) {
  ereignis.preventDefault();
  meldung('');
  const vorlage = $('neu-vorlage').value;
  const mitJahr = Boolean(VORLAGEN.find((v) => v.name === vorlage)?.mitJahr);
  const jahr = Number($('neu-jahr').value);
  try {
    const id = await aufruf('org_umfrage_anlegen', {
      p_titel: $('neu-titel').value.trim() || vorlagenTitel(vorlage, jahr),
      p_vorlage: vorlage,
      p_jahr: mitJahr ? jahr : null,
      p_bundesland: mitJahr ? $('neu-land').value : null,
    });
    $('neu-titel').value = '';
    await oeffneUmfrage(id);
  } catch (fehler) {
    fehlerAnzeigen(fehler);
  }
}

// ---------------------------------------------------------------- Konto

function zeigeKonto() {
  meldung('');
  $('einladung-ergebnis').hidden = true;
  zeigeAnsicht('konto');
}

async function einladen() {
  meldung('');
  try {
    const r = await aufruf('org_einladung_erstellen');
    $('einladung-link').textContent = `${r.link} (gültig bis ${zeitpunkt(r.gueltig_bis)})`;
    const kopierKnopf = knopf('Link kopieren', 'zweitrangig klein-knopf', () => kopieren(r.link, kopierKnopf));
    $('einladung-aktionen').replaceChildren(kopierKnopf, whatsappLink(
      `Hallo, hier ist deine Einladung als Organisator für die Urlaubsumfragen. Der Link ist 7 Tage gültig und nur einmal verwendbar:\n${r.link}`));
    $('einladung-ergebnis').hidden = false;
  } catch (fehler) {
    fehlerAnzeigen(fehler);
  }
}

async function passwortAendernAbsenden(ereignis) {
  ereignis.preventDefault();
  meldung('');
  const passwort = $('pw-neu').value;
  if (passwort.length < 10) return meldung('Das Passwort muss mindestens 10 Zeichen lang sein.');
  if (passwort !== $('pw-neu2').value) return meldung('Die beiden Passwörter stimmen nicht überein.');
  try {
    await passwortAendern(await sitzung.token(), passwort);
    $('pw-neu').value = '';
    $('pw-neu2').value = '';
    meldung('Passwort geändert.');
  } catch (fehler) {
    meldung(fehler.message === 'same_password' ? 'Das ist schon dein aktuelles Passwort.'
      : fehler.message === 'weak_password' ? 'Das Passwort ist zu schwach. Bitte wähle ein längeres.'
        : fehlerText(fehler.message));
  }
}

// ---------------------------------------------------------------- Organisatoren (Hauptadmin)

async function zeigeOrganisatoren() {
  meldung('');
  zeigeAnsicht('organisatoren');
  let liste;
  try {
    liste = await aufruf('haupt_organisatoren');
  } catch (fehler) {
    fehlerAnzeigen(fehler);
    return;
  }
  $('organisatoren').replaceChildren(...liste.map((o) => {
    const karte = element('li', 'karte');
    const rolle = o.ist_hauptadmin ? ' · Hauptadmin' : '';
    const status = [`${o.anzahl_umfragen} Umfrage(n)`, `eingeladen von ${o.eingeladen_von || '–'}`,
      `seit ${zeitpunkt(o.angelegt_am)}`].join(' · ');
    karte.append(
      element('p', 'karte-name', `${o.anzeigename} (${o.benutzername})${rolle}`),
      element('p', o.gesperrt ? 'karte-status offen' : 'karte-status', o.gesperrt ? `GESPERRT · ${status}` : status),
    );
    if (!o.ich && !o.ist_hauptadmin) {
      const aktionen = element('div', 'karte-aktionen');
      aktionen.append(knopf(o.gesperrt ? 'Entsperren' : 'Sperren',
        o.gesperrt ? 'zweitrangig klein-knopf' : 'gefahr klein-knopf', async () => {
          if (!o.gesperrt && !window.confirm(`${o.anzeigename} sperren?\n\nDie Person kann sich dann nicht mehr anmelden. Ihre Umfragen und Mitarbeiter-Links bleiben bestehen.`)) return;
          try {
            await aufruf('haupt_sperren', { p_user_id: o.user_id, p_gesperrt: !o.gesperrt });
            await zeigeOrganisatoren();
          } catch (fehler) {
            fehlerAnzeigen(fehler);
          }
        }));
      karte.append(aktionen);
    }
    return karte;
  }));
}

// ---------------------------------------------------------------- Start

function start() {
  const jetzt = new Date().getFullYear();
  fuelleJahre($('neu-jahr'), jetzt, jetzt + 3, jetzt + 1);
  fuelleLaender($('neu-land'), 'BY');
  $('neu-vorlage').replaceChildren(...VORLAGEN.map((v) => {
    const o = element('option', null, v.titel);
    o.value = v.name;
    return o;
  }));
  $('neu-vorlage').addEventListener('change', vorlageGeaendert);
  $('neu-jahr').addEventListener('change', vorlageGeaendert);
  vorlageGeaendert();

  $('login-form').addEventListener('submit', login);
  $('reg-form').addEventListener('submit', registrierenAbsenden);
  $('neu-umfrage-form').addEventListener('submit', umfrageAnlegen);
  $('einladen').addEventListener('click', einladen);
  $('sicherung-einspielen').addEventListener('click', sicherungEinspielen);
  $('passwort-form').addEventListener('submit', passwortAendernAbsenden);
  $('abmelden').addEventListener('click', () => abmelden(''));
  for (const b of document.querySelectorAll('[data-ziel]')) {
    b.addEventListener('click', () => {
      if (b.dataset.ziel === 'liste') zeigeListe();
      if (b.dataset.ziel === 'konto') zeigeKonto();
      if (b.dataset.ziel === 'organisatoren') zeigeOrganisatoren();
    });
  }
  initUmfrage({ aufruf, fehlerAnzeigen, zurueck: zeigeListe });

  const einladung = window.location.hash.match(/einladung=([0-9a-f]{32})/);
  if (einladung) {
    sitzung.logout();
    zeigeRegistrierung(einladung[1]);
  } else if (sitzung.istAngemeldet()) {
    nachLogin();
  } else {
    abmelden('');
  }
}

start();
