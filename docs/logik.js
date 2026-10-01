// Reine Rechenlogik der Seite, ohne Browser-Abhängigkeiten (dadurch testbar).
// Die verbindlichen Prüfungen macht die Datenbank; das hier ist nur die Anzeige.

export const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli',
  'August', 'September', 'Oktober', 'November', 'Dezember'];

const FEHLERTEXTE = {
  LINK_UNGUELTIG: 'Dieser Link ist ungültig. Bitte frag nach deinem persönlichen Link.',
  FRIST_ABGELAUFEN: 'Die Frist ist abgelaufen. Änderungen sind nicht mehr möglich.',
  KEINE_WOCHE: 'Bitte wähle mindestens eine Woche.',
  UNGUELTIGE_WOCHE: 'Es sind nur die Kalenderwochen 1 bis 47 wählbar.',
  DOPPELTE_WOCHE: 'Eine Woche wurde doppelt gewählt.',
  ZU_VIELE_WOCHEN: 'Du hast zu viele Wochen gewählt.',
  ZU_VIELE_TAGE: 'Die gewählten Wochen brauchen mehr Urlaubstage, als du hast.',
};

// Der Code steht hinter dem # im Link. Er wird so nie an GitHub übertragen.
export function codeAusLink(hash) {
  const code = String(hash || '').replace(/^#/, '').trim().toLowerCase();
  return /^[0-9a-f]{32}$/.test(code) ? code : null;
}

export function fehlertext(code) {
  return FEHLERTEXTE[code] || 'Das hat nicht geklappt. Bitte versuch es später noch einmal.';
}

export function zusammenfassung(kalender, auswahl, maxWochen, urlaubstage) {
  const gewaehlt = kalender.filter((k) => auswahl.has(k.kw));
  const tage = gewaehlt.reduce((summe, k) => summe + k.arbeitstage, 0);
  return {
    anzahl: gewaehlt.length,
    tage,
    limitErreicht: gewaehlt.length >= maxWochen,
    text: `${gewaehlt.length} von ${maxWochen} Wochen gewählt · ${tage} von ${urlaubstage} Urlaubstagen`,
  };
}

// Ein Kästchen ist gesperrt, wenn die Frist vorbei ist oder das Limit erreicht
// ist und es nicht schon angehakt ist (Abwählen bleibt immer möglich).
export function istGesperrt(kw, auswahl, limitErreicht, offen) {
  if (!offen) return true;
  return limitErreicht && !auswahl.has(kw);
}

export function nachMonat(kalender) {
  const gruppen = new Map();
  for (const k of kalender) {
    if (!gruppen.has(k.monat)) gruppen.set(k.monat, []);
    gruppen.get(k.monat).push(k);
  }
  return [...gruppen].map(([monat, wochen]) => ({ name: MONATE[monat - 1], wochen }));
}

export function gleicheAuswahl(a, b) {
  return a.size === b.size && [...a].every((kw) => b.has(kw));
}

const DATUM = new Intl.DateTimeFormat('de-DE', {
  timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit',
});

export function zeitpunkt(iso) {
  return `${DATUM.format(new Date(iso))} Uhr`;
}
