// Auswertung einer Umfrage aus der Antwort von org_umfrage (rein, ohne DOM, dadurch testbar):
// Zusammenfassung je Frage, Zeilen je Mitarbeiter und die Blätter für den Excel-Export.
import { zeitpunkt } from './logik.js';
import { antwortText, fehlerText, istLeer } from './formular-logik.js';

const mitarbeiterVon = (daten) => daten.mitarbeiter || [];
const antwortVon = (m, frage) => m.antworten?.[frage.id];
const gleicheId = (a, b) => Number(a) === Number(b);
const alsListe = (wert) => (Array.isArray(wert) ? wert : [wert]);

// Mitarbeiter mit einer (nicht leeren) Antwort auf die Frage, in der Reihenfolge von org_umfrage.
function beantwortet(frage, daten) {
  return mitarbeiterVon(daten)
    .map((m) => ({ name: m.name, wert: antwortVon(m, frage) }))
    .filter((x) => !istLeer(x.wert));
}

function auswahl(antworten, zeilen) {
  return {
    art: 'auswahl',
    beantwortet: antworten.length,
    zeilen: zeilen.map(({ text, aktiv, passt }) => {
      const namen = antworten.filter((x) => passt(x.wert)).map((x) => x.name);
      return { text, aktiv, anzahl: namen.length, namen };
    }),
  };
}

const runde = (zahl, stellen) => Math.round(zahl * 10 ** stellen) / 10 ** stellen;
const schnitt = (zahlen) => (zahlen.length ? zahlen.reduce((s, z) => s + z, 0) / zahlen.length : null);

function wochenZeilen(frage, daten) {
  const antworten = beantwortet(frage, daten);
  return (daten.kalender || []).filter((k) => !k.gesperrt).map((k) => {
    const namen = antworten.filter((x) => alsListe(x.wert).some((kw) => gleicheId(kw, k.kw))).map((x) => x.name);
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

// Zusammenfassung der Antworten auf eine Frage; null für Hinweistexte.
export function zusammenfassung(frage, daten) {
  const antworten = beantwortet(frage, daten);
  switch (frage.typ) {
    case 'einfach':
      return auswahl(antworten, (frage.optionen || []).map((o) => ({
        text: o.text, aktiv: o.aktiv !== false, passt: (w) => gleicheId(w, o.id),
      })));
    case 'mehrfach':
      return auswahl(antworten, (frage.optionen || []).map((o) => ({
        text: o.text, aktiv: o.aktiv !== false, passt: (w) => alsListe(w).some((id) => gleicheId(id, o.id)),
      })));
    case 'janein':
      return auswahl(antworten, [
        { text: 'Ja', aktiv: true, passt: (w) => w === true },
        { text: 'Nein', aktiv: true, passt: (w) => w === false },
      ]);
    case 'skala': {
      const von = Number(frage.skala?.von ?? 1);
      const bis = Number(frage.skala?.bis ?? von);
      const stufen = Array.from({ length: Math.max(0, bis - von + 1) }, (_, i) => von + i);
      const ergebnis = auswahl(antworten, stufen.map((s) => ({
        text: String(s), aktiv: true, passt: (w) => Number(w) === s,
      })));
      const zahlen = antworten.map((x) => Number(x.wert)).filter(Number.isFinite);
      const d = schnitt(zahlen);
      return { ...ergebnis, durchschnitt: d === null ? null : runde(d, 1) };
    }
    case 'zahl': {
      const werte = antworten.map((x) => ({ name: x.name, wert: Number(x.wert) }))
        .filter((x) => Number.isFinite(x.wert));
      const zahlen = werte.map((x) => x.wert);
      return {
        art: 'zahl',
        beantwortet: antworten.length,
        kleinster: zahlen.length ? Math.min(...zahlen) : null,
        groesster: zahlen.length ? Math.max(...zahlen) : null,
        durchschnitt: schnitt(zahlen),
        werte,
      };
    }
    case 'text_kurz':
    case 'text_lang':
    case 'datum':
      return {
        art: 'liste',
        beantwortet: antworten.length,
        werte: antworten.map((x) => ({ name: x.name, text: antwortText(frage, x.wert) })),
      };
    case 'urlaubswochen':
      return { art: 'wochen', beantwortet: antworten.length, wochen: wochenZeilen(frage, daten) };
    default:
      return null;
  }
}

// „abgegeben“ = es gibt eine Abgabe (geaendert_am gesetzt), auch wenn sie leer ist.
export function personenZeilen(daten) {
  const fragen = daten.fragen || [];
  return mitarbeiterVon(daten).map((m) => {
    const verstoesse = m.verstoesse || {};
    const hinweise = [];
    for (const f of fragen) {
      const code = verstoesse[f.id];
      if (code) hinweise.push(`${f.text}: ${fehlerText(code, f)}`);
    }
    // Verstoß an einer Frage, die es nicht (mehr) gibt – sollte nicht vorkommen, aber nicht verschlucken.
    for (const [id, code] of Object.entries(verstoesse)) {
      if (code && !fragen.some((f) => gleicheId(f.id, id))) hinweise.push(`Frage ${id}: ${fehlerText(code)}`);
    }
    return {
      id: m.id,
      name: m.name,
      link: m.link,
      abgegeben: m.geaendert_am !== null && m.geaendert_am !== undefined,
      stand: m.geaendert_am ? zeitpunkt(m.geaendert_am) : '',
      hinweise,
    };
  });
}

// Zahl und Skala als Zahlzelle (Excel kann damit rechnen), sonst der Anzeigetext.
function zelle(frage, wert) {
  if (istLeer(wert)) return null;
  if ((frage.typ === 'zahl' || frage.typ === 'skala') && typeof wert === 'number') return wert;
  return antwortText(frage, wert);
}

export function excelBlaetter(daten) {
  const fragen = (daten.fragen || []).filter((f) => f.typ !== 'hinweis');
  const personen = personenZeilen(daten);
  const mitarbeiter = mitarbeiterVon(daten);
  const blaetter = [{
    name: 'Antworten',
    fixiereSpalten: 1,
    spalten: [
      { titel: 'Name', breite: 24 }, { titel: 'Abgegeben', breite: 11 }, { titel: 'Letzte Änderung', breite: 22 },
      ...fragen.map((f) => ({
        titel: f.aktiv === false ? `${f.text} (aus)` : f.text,
        breite: f.typ === 'urlaubswochen' || f.typ === 'text_lang' || f.typ === 'mehrfach' ? 40 : 24,
      })),
      { titel: 'Hinweis', breite: 50 },
    ],
    zeilen: mitarbeiter.map((m, i) => {
      const p = personen[i];
      return [p.name, p.abgegeben ? 'ja' : 'nein', p.stand,
        ...fragen.map((f) => zelle(f, antwortVon(m, f))), p.hinweise.join('; ')];
    }),
  }];

  const urlaub = fragen.find((f) => f.typ === 'urlaubswochen');
  if (!urlaub) return blaetter;
  const wochen = wochenZeilen(urlaub, daten);
  const offeneKw = (daten.kalender || []).filter((k) => !k.gesperrt);
  blaetter.push(
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
        ...mitarbeiter.map((m) => {
          const gewaehlt = istLeer(antwortVon(m, urlaub)) ? [] : alsListe(antwortVon(m, urlaub)).map(Number);
          return [m.name, ...offeneKw.map((k) => (gewaehlt.includes(k.kw) ? 'x' : null))];
        }),
        ['Anzahl', ...wochen.map((w) => w.anzahl)],
      ],
    },
  );
  return blaetter;
}
