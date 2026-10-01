// Baut aus der Admin-Übersicht die Tabellen für Anzeige und Excel-Export.
import { zeitpunkt } from './logik.js';

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
  }));
}

export function wochenZeilen(daten) {
  return daten.kalender.map((k) => {
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
  return [
    {
      name: 'Personen',
      spalten: [
        { titel: 'Name', breite: 24 }, { titel: 'Abgegeben', breite: 11 },
        { titel: 'Gewählte KWs', breite: 40 }, { titel: 'Anzahl Wochen', breite: 15 },
        { titel: 'Urlaubstage', breite: 13 }, { titel: 'Letzte Änderung', breite: 22 },
      ],
      zeilen: personen.map((p) => [p.name, p.abgegeben ? 'ja' : 'nein', p.wochen,
        p.abgegeben ? p.anzahl : null, p.abgegeben ? p.urlaubstage : null, p.stand]),
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
      spalten: [{ titel: 'Name', breite: 24 },
        ...daten.kalender.map((k) => ({ titel: `KW ${k.kw}`, breite: 7 }))],
      zeilen: [
        ...daten.mitarbeiter.map((m) => [m.name,
          ...daten.kalender.map((k) => (m.wochen.includes(k.kw) ? 'x' : null))]),
        ['Anzahl', ...wochen.map((w) => w.anzahl)],
      ],
    },
  ];
}
