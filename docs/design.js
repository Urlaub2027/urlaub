// Farbdesign der Seite: Freundlich, Normal oder Dunkel. Die Wahl liegt nur im Browser
// (localStorage); ohne Wahl gilt die Einstellung des Geräts (hell → Normal, dunkel → Dunkel).
export const DESIGNS = [
  { name: 'freundlich', titel: 'Freundlich' },
  { name: 'normal', titel: 'Normal' },
  { name: 'dunkel', titel: 'Dunkel' },
];

const SCHLUESSEL = 'urlaub-design';

export function designFuer(gespeichert, dunkelBevorzugt) {
  if (DESIGNS.some((d) => d.name === gespeichert)) return gespeichert;
  return dunkelBevorzugt ? 'dunkel' : 'normal';
}

function gespeichertesDesign() {
  try { return localStorage.getItem(SCHLUESSEL); } catch { return null; }
}

function geraetDunkel() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
}

function anwenden(name) {
  document.documentElement.dataset.design = name;
}

// Auswahlfeld im Seitenkopf: <select id="design-wahl">.
export function initDesign() {
  anwenden(designFuer(gespeichertesDesign(), geraetDunkel()));
  const auswahl = document.getElementById('design-wahl');
  if (!auswahl) return;
  auswahl.replaceChildren(...DESIGNS.map((d) => {
    const o = document.createElement('option');
    o.value = d.name;
    o.textContent = d.titel;
    return o;
  }));
  auswahl.value = document.documentElement.dataset.design;
  auswahl.addEventListener('change', () => {
    anwenden(auswahl.value);
    try { localStorage.setItem(SCHLUESSEL, auswahl.value); } catch { /* nur für diese Sitzung */ }
  });
}

if (typeof document !== 'undefined') initDesign();
