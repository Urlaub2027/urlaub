// Baut aus der Antwort von org_umfrage die Tabellen für Anzeige und Excel-Export.
import { zeitpunkt } from './logik.js';

export const REGEL_TEXTE = {
  KEINE_WOCHE: 'keine Woche gewählt',
  UNGUELTIGE_WOCHE: 'gesperrte oder ungültige Woche',
  DOPPELTE_WOCHE: 'doppelte Woche',
  ZU_WENIGE_WOCHEN: 'zu wenige Wochen',
  ZU_VIELE_WOCHEN: 'zu viele Wochen',
  ZU_VIELE_AM_STUECK: 'zu viele Wochen am Stück',
  ZU_VIELE_TAGE: 'zu viele Urlaubstage',
};

export function regelHinweis(code) {
  return code ? `verstößt gegen aktuelle Regeln: ${REGEL_TEXTE[code] || code}` : '';
}

export function personenZeilen(daten) {
  return daten.mitarbeiter.map((m) => ({
    id: m.id,
    name: m.name,
    link: m.link,
    abgegeben: m.wochen.length > 0,
    wochen: m.wochen.map((kw) => `KW ${kw}`).join(', '),
    anzahl: m.wochen.length,
    urlaubstage: m.urlaubstage,
    stand: m.geaendert_am ? zeitpunkt(m.geaendert_am) : '',
    regelverstoss: m.regelverstoss || null,
  }));
}

export function wochenZeilen(daten) {
  return daten.kalender.filter((k) => !k.gesperrt).map((k) => {
    const namen = daten.mitarbeiter.filter((m) => m.wochen.includes(k.kw)).map((m) => m.name);
    return {
      kw: k.kw,
      zeitraum: `${k.von}–${k.bis}`,
      arbeitstage: k.arbeitstage,
      feiertag: k.feiertag || '',
      anzahl: namen.length,
      namen: namen.join(', '),
    };
  });
}

export function excelBlaetter(daten) {
  const personen = personenZeilen(daten);
  const wochen = wochenZeilen(daten);
  const offeneKw = daten.kalender.filter((k) => !k.gesperrt);
  return [
    {
      name: 'Personen',
      spalten: [
        { titel: 'Name', breite: 24 }, { titel: 'Abgegeben', breite: 11 },
        { titel: 'Gewählte KWs', breite: 40 }, { titel: 'Anzahl Wochen', breite: 15 },
        { titel: 'Urlaubstage', breite: 13 }, { titel: 'Letzte Änderung', breite: 22 },
        { titel: 'Hinweis', breite: 45 },
      ],
      zeilen: personen.map((p) => [p.name, p.abgegeben ? 'ja' : 'nein', p.wochen,
        p.abgegeben ? p.anzahl : null, p.abgegeben ? p.urlaubstage : null, p.stand,
        regelHinweis(p.regelverstoss)]),
    },
    {
      name: 'Wochen',
      spalten: [
        { titel: 'KW', breite: 6 }, { titel: 'Zeitraum', breite: 15 },
        { titel: 'Arbeitstage', breite: 12 }, { titel: 'Feiertag', breite: 22 },
        { titel: 'Anzahl', breite: 9 }, { titel: 'Namen', breite: 60 },
      ],
      zeilen: wochen.map((w) => [w.kw, w.zeitraum, w.arbeitstage, w.feiertag, w.anzahl, w.namen]),
    },
    {
      name: 'Matrix',
      fixiereSpalten: 1,
      spalten: [{ titel: 'Name', breite: 24 }, ...offeneKw.map((k) => ({ titel: `KW ${k.kw}`, breite: 7 }))],
      zeilen: [
        ...daten.mitarbeiter.map((m) => [m.name, ...offeneKw.map((k) => (m.wochen.includes(k.kw) ? 'x' : null))]),
        ['Anzahl', ...wochen.map((w) => w.anzahl)],
      ],
    },
  ];
}
