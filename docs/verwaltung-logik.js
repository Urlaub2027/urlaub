// Reine Hilfslogik der Verwaltung (ohne DOM): Vorlagen, Namenslisten, Erinnerungstexte,
// Wach-Status. Die Vorlagen-Namen spiegeln urlaub.vorlage_anwenden in supabase/schema.sql.
import { zeitpunkt } from './logik.js';

export const VORLAGEN = [
  { name: 'urlaub', titel: 'Urlaubswünsche', mitJahr: true },
  { name: 'leer', titel: 'Leer', mitJahr: false },
  { name: 'schicht', titel: 'Schicht- und Verfügbarkeitswünsche', mitJahr: false },
  { name: 'feier', titel: 'Weihnachtsfeier', mitJahr: false },
];

// Titel, wenn das Feld leer bleibt.
export function vorlagenTitel(name, jahr, heute = new Date()) {
  if (name === 'urlaub') return `Urlaubswünsche ${jahr}`;
  if (name === 'schicht') return 'Schicht- und Verfügbarkeitswünsche';
  if (name === 'feier') return `Weihnachtsfeier ${heute.getFullYear()}`;
  return 'Neue Umfrage';
}

// Ein Name pro Zeile; Leerraum an den Enden und leere Zeilen fallen weg.
export function namenAusText(text) {
  return String(text ?? '').split(/\r?\n/).map((z) => z.trim()).filter(Boolean);
}

export function erinnerungsText(name, titel, frist, link) {
  return `Hallo ${name}, kurze Erinnerung: Bitte trag deine Antworten für „${titel}“ bis ${zeitpunkt(frist)} ein. `
    + `Dein persönlicher Link (bitte nicht weitergeben):\n${link}`;
}

// Nur Namen, ohne Links – zum Posten in eine Gruppe.
export function offenListeText(namen, titel, frist) {
  return `Noch nicht abgegeben – „${titel}“ (Frist ${zeitpunkt(frist)}):\n${namen.join('\n')}`;
}

const TAG = 24 * 60 * 60 * 1000;
const PAUSE = 'Supabase pausiert die Datenbank nach etwa 7 Tagen ohne Nutzung – siehe Anleitung, Abschnitt „Probleme“.';

// Lebenszeichen der Wach-Automatik (null = noch nie). Ab 3 Tagen ohne Lebenszeichen: Warnung.
export function wachStatus(zeit, jetzt = new Date()) {
  if (!zeit) return { warnung: true, text: `⚠ Die Wach-Automatik hat sich noch nicht gemeldet. ${PAUSE}` };
  const tage = Math.floor((jetzt - new Date(zeit)) / TAG);
  if (tage >= 3) {
    return { warnung: true, text: `⚠ Die Wach-Automatik hat sich seit ${tage} Tagen nicht gemeldet. ${PAUSE}` };
  }
  return { warnung: false, text: `Wach-Automatik: zuletzt ${zeitpunkt(zeit)}` };
}
