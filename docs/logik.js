// Reine Rechenlogik der Seite, ohne Browser-Abhängigkeiten (dadurch testbar).
// Die verbindlichen Prüfungen macht die Datenbank; das hier ist nur die Anzeige.

export const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli',
  'August', 'September', 'Oktober', 'November', 'Dezember'];

const FEHLERTEXTE = {
  LINK_UNGUELTIG: 'Dieser Link ist ungültig. Bitte frag nach deinem persönlichen Link.',
  FRIST_ABGELAUFEN: 'Die Frist ist abgelaufen. Änderungen sind nicht mehr möglich.',
  KEINE_WOCHE: 'Bitte wähle mindestens eine Woche.',
  UNGUELTIGE_WOCHE: 'Mindestens eine gewählte Woche ist nicht wählbar.',
  ZU_WENIGE_WOCHEN: 'Bitte wähle mehr Wochen.',
  ZU_VIELE_AM_STUECK: 'So viele Wochen am Stück sind nicht erlaubt.',
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

// Länge der Folge aufeinanderfolgender KWs, die entstünde, wenn kw dazukäme.
export function folgeLaenge(kw, auswahl) {
  let n = 1;
  for (let k = kw - 1; auswahl.has(k); k -= 1) n += 1;
  for (let k = kw + 1; auswahl.has(k); k += 1) n += 1;
  return n;
}

// Gesperrt, wenn die Frist vorbei ist, das Limit erreicht ist oder die Folge zu lang
// würde – außer das Kästchen ist schon angehakt (Abwählen bleibt immer möglich).
export function istGesperrt(kw, auswahl, limitErreicht, offen, maxAmStueck = Infinity) {
  if (!offen) return true;
  if (auswahl.has(kw)) return false;
  if (limitErreicht) return true;
  return folgeLaenge(kw, auswahl) > maxAmStueck;
}

export function nachMonat(kalender) {
  const gruppen = new Map();
  for (const k of kalender.filter((x) => !x.gesperrt)) {
    if (!gruppen.has(k.monat)) gruppen.set(k.monat, []);
    gruppen.get(k.monat).push(k);
  }
  return [...gruppen].map(([monat, wochen]) => ({ name: MONATE[monat - 1], wochen }));
}

// Gewählte KWs, die inzwischen gesperrt sind oder im Kalender fehlen.
export function gesperrteGewaehlte(kalender, wochen) {
  return wochen.filter((kw) => {
    const k = kalender.find((x) => x.kw === kw);
    return !k || k.gesperrt;
  });
}

export function gesperrteBereiche(kalender) {
  const monate = new Map();
  for (const k of kalender.filter((x) => x.gesperrt)) {
    const b = monate.get(k.monat);
    if (b) { b.vonKw = Math.min(b.vonKw, k.kw); b.bisKw = Math.max(b.bisKw, k.kw); }
    else monate.set(k.monat, { name: MONATE[k.monat - 1], vonKw: k.kw, bisKw: k.kw, monat: k.monat });
  }
  return [...monate.values()].sort((a, b) => a.vonKw - b.vonKw)
    .map(({ name, vonKw, bisKw }) => ({ name, vonKw, bisKw }));
}

export function regelText(d) {
  const basis = `mindestens ${d.min_wochen}, höchstens ${d.max_wochen} Wochen`;
  return d.max_am_stueck < d.max_wochen ? `${basis}, davon höchstens ${d.max_am_stueck} am Stück` : basis;
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
