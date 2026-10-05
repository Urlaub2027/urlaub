// Gemeinsame Helfer der Verwaltung.
export const $ = (id) => document.getElementById(id);

export const BUNDESLAENDER = [
  ['BW', 'Baden-Württemberg'], ['BY', 'Bayern'], ['BE', 'Berlin'], ['BB', 'Brandenburg'],
  ['HB', 'Bremen'], ['HH', 'Hamburg'], ['HE', 'Hessen'], ['MV', 'Mecklenburg-Vorpommern'],
  ['NI', 'Niedersachsen'], ['NW', 'Nordrhein-Westfalen'], ['RP', 'Rheinland-Pfalz'], ['SL', 'Saarland'],
  ['SN', 'Sachsen'], ['ST', 'Sachsen-Anhalt'], ['SH', 'Schleswig-Holstein'], ['TH', 'Thüringen'],
];

export const landName = (kuerzel) => (BUNDESLAENDER.find(([k]) => k === kuerzel) || [kuerzel, kuerzel])[1];

const FEHLER = {
  KEIN_ZUGRIFF: 'Dieses Konto hat keinen Zugriff (mehr).',
  UMFRAGE_NICHT_GEFUNDEN: 'Diese Umfrage gibt es nicht (mehr).',
  MITARBEITER_NICHT_GEFUNDEN: 'Diesen Mitarbeiter gibt es nicht (mehr).',
  NAME_LEER: 'Bitte einen Namen eingeben.',
  NAME_DOPPELT: 'Diesen Namen gibt es in dieser Umfrage schon. Bitte unterscheide ihn, z. B. „Anna K.“ und „Anna M.“.',
  TITEL_LEER: 'Bitte einen Titel eingeben.',
  FRIST_LEER: 'Bitte eine Frist mit Datum und Uhrzeit eingeben.',
  GRUNDDATEN_GESPERRT: 'Jahr, Bundesland und Arbeitstage lassen sich nicht mehr ändern, weil schon Wünsche abgegeben wurden.',
  UNGUELTIGE_EINSTELLUNG: 'Mindestens eine Angabe ist ungültig. Bitte prüfe die Zahlen (z. B. „mindestens“ nicht größer als „höchstens“).',
  DATUM_FALSCHES_JAHR: 'Das Datum muss im Jahr der Umfrage liegen.',
  NICHT_SELBST: 'Du kannst dich nicht selbst sperren.',
  HAUPTADMIN_NICHT_SPERRBAR: 'Hauptadmins können nicht gesperrt werden.',
  NICHT_GEFUNDEN: 'Nicht gefunden.',
  KEINE_VERBINDUNG: 'Keine Verbindung. Bitte prüfe dein Internet.',
};

export function fehlerText(code) {
  return FEHLER[code] || 'Das hat nicht geklappt. Bitte versuch es noch einmal.';
}

export function meldung(text) {
  const m = $('meldung');
  m.textContent = text || '';
  m.hidden = !text;
  if (text) m.scrollIntoView({ block: 'nearest' });
}

export function knopf(text, klasse, aktion) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = text;
  b.className = klasse;
  b.addEventListener('click', aktion);
  return b;
}

export function element(tag, klasse, text) {
  const e = document.createElement(tag);
  if (klasse) e.className = klasse;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function whatsappLink(text) {
  const a = element('a', 'knopf-link', 'WhatsApp');
  a.href = `https://wa.me/?text=${encodeURIComponent(text)}`;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  return a;
}

export async function kopieren(text, knopfElement) {
  try {
    await navigator.clipboard.writeText(text);
    const vorher = knopfElement.textContent;
    knopfElement.textContent = 'Kopiert ✓';
    setTimeout(() => { knopfElement.textContent = vorher; }, 2000);
  } catch {
    window.prompt('Zum Kopieren:', text);
  }
}

export function fuelleJahre(select, von, bis, gewaehlt) {
  select.replaceChildren(...Array.from({ length: bis - von + 1 }, (_, i) => {
    const o = element('option', null, String(von + i));
    o.value = String(von + i);
    o.selected = von + i === gewaehlt;
    return o;
  }));
}

export function fuelleLaender(select, gewaehlt) {
  select.replaceChildren(...BUNDESLAENDER.map(([kuerzel, name]) => {
    const o = element('option', null, name);
    o.value = kuerzel;
    o.selected = kuerzel === gewaehlt;
    return o;
  }));
}

export function datumDeutsch(iso) {
  const [j, m, t] = String(iso).slice(0, 10).split('-');
  return `${t}.${m}.${j}`;
}
