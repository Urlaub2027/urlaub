# Formular in Tabs – Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das Mitarbeiter-Formular einer Umfrage mit Urlaubswochen-Frage zeigt Tabs „Urlaubswochen“, „Einzelne Tage“, „Zusatzfragen“ und führt per „Weiter →“ Schritt für Schritt zum Absenden.

**Architecture:** Reine Tab-Logik (welche Tabs, gesperrt, hervorgehoben, Weiter-Ziel, Fehler-Tab) in `docs/formular-logik.js`, getestet. `docs/formular.js` verteilt die unveränderten Fragenblöcke auf Tab-Bereiche und meldet Tabwechsel; `docs/app.js` macht aus dem Leistenknopf „Weiter →“ oder „Absenden“.

**Tech Stack:** Vanilla-JS-Module ohne Build, `node --test`, PGlite für den Browser-Test-Harness.

**Spec:** `spezifikation/2026-10-09-formular-tabs-design.md`

## Global Constraints

- Arbeitsverzeichnis: `C:\Users\dtn\Documents\Urlaubsvertretung-zugeklappt` (Branch `formular-tabs`). Tests: `npm test`.
- Nicht committete Vorarbeit im Worktree gehört dazu: Monate der Tagesliste starten zugeklappt, `naheMonate` entfernt.
- Tabs nur bei Umfragen mit (aktiver) Urlaubswochen-Frage; sonst Formular unverändert.
- Tab-Titel wörtlich: „Urlaubswochen“, „Einzelne Tage“, „Zusatzfragen“. Abzeichen: „N übrig“.
- Leistenknopf: „Weiter →“ solange ein späterer, nicht gesperrter Tab existiert (und nicht nur lesen); sonst wie heute „Antworten absenden“ / „Änderung speichern“.
- Zähler-Knopf in Tab 1: „Weiter zu den einzelnen Tagen“.
- Kein Dauerblinken; einmaliges Aufleuchten ~1 s beim Freischalten, nicht bei `prefers-reduced-motion: reduce`.
- Rollen: `tablist`, `tab` (`aria-selected`, `aria-controls`, `aria-disabled`), `tabpanel`; Pfeiltasten links/rechts zwischen freien Tabs.
- Datenbank, Auswertung, Excel bleiben unverändert.

## Review Focus

1. Fehler beim Absenden an einer Frage in einem nicht sichtbaren Tab: Ansicht muss in diesen Tab wechseln, bevor `app.js` zur Frage scrollt (Task 1 `ersterTabMitFehler`, Task 2 Browser-Test).
2. Woche in Tab 1 abgewählt, während „Einzelne Tage“ frei war: Tab wird gesperrt; stand man darin, zurück zu Tab 1 (Task 1 Test „gesperrt“, Task 2 Browser-Test).
3. Umfrage ohne Urlaubswochen-Frage oder mit ausgeschalteter Urlaubswochen-Frage: keine Tabs, Knopf „Absenden“ wie bisher (Task 2 Browser-Test).
4. Frist abgelaufen (nur lesen): kein „Weiter“ (Task 2 `app.js`-Bedingung, Browser-Test nicht möglich ohne Fristablauf – im Code prüfen).
5. Vorschau in der Verwaltung ohne Leiste: Tabs per Klick nutzbar (Task 2 Code-Durchsicht; Vorschau ruft `baueFormular` ohne Optionen).

---

### Task 1: Tab-Logik

**Files:**
- Modify: `docs/formular-logik.js`, `docs/logik.js` (`sprungZiel` entfernen), `docs/formular.js` (Import `sprungZiel` entfernen erst in Task 2)
- Test: `tests/formular-logik.test.mjs`, `tests/logik.test.mjs` (Test „Sprungziel“ entfernen)

**Interfaces:**
- Produces:
  - `tabZustand({ hatEinzeltage, hatZusatz, wochenVoll, rest, anzahlTage }) → [{ id: 'wochen'|'tage'|'zusatz', titel, gesperrt, hervorgehoben, abzeichen }]`
  - `naechsterTab(tabs, aktuell) → id | null` (nächster nicht gesperrter Tab nach `aktuell`)
  - `ersterTabMitFehler(tabs, tabMitFehler) → id | null` (`tabMitFehler`: Set von Tab-IDs; Reihenfolge der Tabs entscheidet)

- [ ] **Step 1: Failing tests** in `tests/formular-logik.test.mjs` (Import um `tabZustand, naechsterTab, ersterTabMitFehler` ergänzen):

```js
test('Tabs: welche es gibt, gesperrt, hervorgehoben', () => {
  const basis = { hatEinzeltage: true, hatZusatz: true, wochenVoll: false, rest: 3, anzahlTage: 0 };
  const ids = (t) => t.map((x) => x.id);
  assert.deepEqual(ids(tabZustand(basis)), ['wochen', 'tage', 'zusatz']);
  assert.deepEqual(ids(tabZustand({ ...basis, hatEinzeltage: false })), ['wochen', 'zusatz']);
  assert.deepEqual(ids(tabZustand({ ...basis, hatZusatz: false })), ['wochen', 'tage']);
  assert.deepEqual(tabZustand(basis).map((x) => x.titel), ['Urlaubswochen', 'Einzelne Tage', 'Zusatzfragen']);
  const tage = (e) => tabZustand({ ...basis, ...e })[1];
  assert.deepEqual([tage({}).gesperrt, tage({}).hervorgehoben, tage({}).abzeichen], [true, false, '']);
  assert.deepEqual([tage({ wochenVoll: true }).gesperrt, tage({ wochenVoll: true }).hervorgehoben,
    tage({ wochenVoll: true }).abzeichen], [false, true, '3 übrig']);
  // Alles verplant, aber Tage gewählt: frei, nicht hervorgehoben.
  const verplant = tage({ wochenVoll: true, rest: 0, anzahlTage: 3 });
  assert.deepEqual([verplant.gesperrt, verplant.hervorgehoben, verplant.abzeichen], [false, false, '']);
  // Keine Tage übrig und keine gewählt (Wochen ohne Feiertage): gesperrt.
  assert.equal(tage({ wochenVoll: true, rest: 0, anzahlTage: 0 }).gesperrt, true);
});

test('Tabs: Weiter-Ziel und Fehler-Tab', () => {
  const t = (e) => tabZustand({ hatEinzeltage: true, hatZusatz: true, wochenVoll: false, rest: 3, anzahlTage: 0, ...e });
  assert.equal(naechsterTab(t({}), 'wochen'), 'zusatz');             // Tage gesperrt → überspringen
  assert.equal(naechsterTab(t({ wochenVoll: true }), 'wochen'), 'tage');
  assert.equal(naechsterTab(t({ wochenVoll: true }), 'tage'), 'zusatz');
  assert.equal(naechsterTab(t({}), 'zusatz'), null);
  assert.equal(naechsterTab(tabZustand({ hatEinzeltage: false, hatZusatz: false, wochenVoll: true, rest: 0, anzahlTage: 0 }), 'wochen'), null);
  assert.equal(ersterTabMitFehler(t({}), new Set(['zusatz', 'wochen'])), 'wochen');
  assert.equal(ersterTabMitFehler(t({}), new Set(['zusatz'])), 'zusatz');
  assert.equal(ersterTabMitFehler(t({}), new Set()), null);
});
```

In `tests/logik.test.mjs` den Test „Sprungziel: …“ und den Import `sprungZiel` entfernen.

- [ ] **Step 2: Laufen lassen** – `node --test tests/formular-logik.test.mjs` → FAIL (Exporte fehlen).

- [ ] **Step 3: Implementieren** – am Ende von `docs/formular-logik.js`:

```js
// ---------------------------------------------------------------- Tabs
// Tabs des Formulars bei Umfragen mit Urlaubswochen-Frage (Reihenfolge fest).
export function tabZustand({ hatEinzeltage, hatZusatz, wochenVoll, rest, anzahlTage }) {
  const tabs = [{ id: 'wochen', titel: 'Urlaubswochen', gesperrt: false, hervorgehoben: false, abzeichen: '' }];
  if (hatEinzeltage) {
    const frei = wochenVoll && (rest > 0 || anzahlTage > 0);
    const offen = frei && rest > 0;
    tabs.push({ id: 'tage', titel: 'Einzelne Tage', gesperrt: !frei, hervorgehoben: offen,
      abzeichen: offen ? `${rest} übrig` : '' });
  }
  if (hatZusatz) tabs.push({ id: 'zusatz', titel: 'Zusatzfragen', gesperrt: false, hervorgehoben: false, abzeichen: '' });
  return tabs;
}

export function naechsterTab(tabs, aktuell) {
  const i = tabs.findIndex((t) => t.id === aktuell);
  return tabs.slice(i + 1).find((t) => !t.gesperrt)?.id ?? null;
}

export function ersterTabMitFehler(tabs, tabMitFehler) {
  return tabs.find((t) => tabMitFehler.has(t.id))?.id ?? null;
}
```

In `docs/logik.js` die Funktion `sprungZiel` samt Kommentar entfernen.

- [ ] **Step 4:** `npm test` → grün (formular.js importiert `sprungZiel` noch; Node-Tests importieren formular.js nicht – trotzdem in Task 2 sofort entfernen).

- [ ] **Step 5: Commit** – zusammen mit der Vorarbeit (zugeklappte Monate):

```bash
git add docs/formular-logik.js docs/logik.js docs/formular.js tests/formular-logik.test.mjs tests/logik.test.mjs
git commit -m "Tabs: reine Tab-Logik; Tagesliste startet zugeklappt"
```

---

### Task 2: Tabs im Formular, Leistenknopf, CSS

**Files:**
- Modify: `docs/formular.js` (`urlaubswochen()`, Aufbau-Teil ab „Aufbau“, Rückgabe), `docs/app.js` (`aktualisiere`, Klick auf `#absenden`, `formular`-Kommentar), `docs/style.css`

**Interfaces:**
- Consumes (Task 1): `tabZustand`, `naechsterTab`, `ersterTabMitFehler`.
- Produces: `baueFormular(container, daten, { nurLesen, beiAenderung, beiTabwechsel })` gibt zusätzlich `tabs` zurück: `null` ohne Urlaubswochen-Frage, sonst `{ weiter(): void, istLetzter(): boolean }`.

- [ ] **Step 1: `urlaubswochen(f)` umbauen.**
  - `sprungZiel` aus dem Import entfernen; Knopf-Text „Weiter zu den einzelnen Tagen“; Klick ruft `zeigeTab('tage', true)` (Funktion aus dem Aufbau-Teil, über Closure erreichbar, siehe Step 2).
  - Überschrift `h3 'Einzelne Tage'` und Fokus-Logik des alten Sprungs entfernen (der Tab-Titel ersetzt die Überschrift); `tageBox` Klasse `einzeltage` (ohne `box`).
  - `tageBox` **nicht** mehr in `teile`; Rückgabe `{ teile, aktualisiere, tageTeil: grenzen.einzeltage ? tageBox : null }`.
  - Am Ende von `aktualisiere()` den Tab-Stand melden:

```js
      tabStand = { hatEinzeltage: grenzen.einzeltage, wochenVoll: grenzen.einzeltage && wochen.length === maxWochen,
        rest, anzahlTage: tage.length };
      tabsZeichnen();
```

    (`tabStand` und `tabsZeichnen` sind im äußeren `baueFormular` deklariert; `tabsZeichnen` tut nichts, solange die Tabs noch nicht gebaut sind.)
  - `sprung.hidden = tageBox.hidden || rest <= 0 || nurLesen;` bleibt.

- [ ] **Step 2: Aufbau mit Tabs.** Im Teil „Aufbau“: Die Fragenblöcke werden wie bisher gebaut, aber in ein Ziel je Tab gehängt. Code (ersetzt die Schleife und ergänzt Funktionen):

```js
  let tabStand = null;          // von urlaubswochen() gemeldet
  let tabsZeichnen = () => {};  // wird gesetzt, sobald die Tabs gebaut sind
  let zeigeTab = () => {};

  container.replaceChildren();
  if (fragen.some(istPflicht)) {
    container.append(el('p', 'klein pflicht-hinweis', 'Fragen mit * müssen beantwortet werden.'));
  }
  const mitTabs = fragen.some((f) => f.typ === 'urlaubswochen');
  const bereiche = { wochen: el('div', 'tab-bereich'), tage: el('div', 'tab-bereich'), zusatz: el('div', 'tab-bereich') };
  let tageTeil = null;
  for (const f of fragen) {
    // … Feld bauen wie bisher (feld, legende, hilfe, regel, bauer, fehler) …
    if (teil.tageTeil) tageTeil = teil.tageTeil;
    const ziel = !mitTabs ? container : f.typ === 'urlaubswochen' ? bereiche.wochen : bereiche.zusatz;
    ziel.append(feld);
    bloecke.set(f.id, { frage: f, feld, fehler, aktualisiere: teil.aktualisiere,
      tab: f.typ === 'urlaubswochen' ? 'wochen' : 'zusatz' });
  }

  let tabs = null;
  if (mitTabs) {
    if (tageTeil) bereiche.tage.append(tageTeil);
    const hatZusatz = fragen.some((f) => f.typ !== 'urlaubswochen');
    const leiste = el('div', 'tab-leiste');
    leiste.setAttribute('role', 'tablist');
    const knoepfe = {};
    let aktuell = 'wochen';
    let warGesperrt = true;
    for (const [id, bereich] of Object.entries(bereiche)) {
      bereich.id = `tab-bereich-${id}`;
      bereich.setAttribute('role', 'tabpanel');
      bereich.setAttribute('aria-labelledby', `tab-${id}`);
      const knopf = el('button', 'tab');
      knopf.type = 'button';
      knopf.id = `tab-${id}`;
      knopf.setAttribute('role', 'tab');
      knopf.setAttribute('aria-controls', bereich.id);
      knopf.addEventListener('click', () => { if (knopf.getAttribute('aria-disabled') !== 'true') zeigeTab(id, true); });
      knopf.addEventListener('animationend', () => knopf.classList.remove('aufleuchten'));
      knoepfe[id] = knopf;
    }
    // Pfeiltasten zwischen freien Tabs.
    leiste.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const frei = stand().filter((t) => !t.gesperrt).map((t) => t.id);
      const i = frei.indexOf(aktuell);
      const ziel = frei[(i + (e.key === 'ArrowRight' ? 1 : frei.length - 1)) % frei.length];
      zeigeTab(ziel, false);
      knoepfe[ziel].focus();
      e.preventDefault();
    });
    const stand = () => tabZustand({ hatEinzeltage: Boolean(tabStand?.hatEinzeltage && tageTeil), hatZusatz,
      wochenVoll: Boolean(tabStand?.wochenVoll), rest: tabStand?.rest ?? 0, anzahlTage: tabStand?.anzahlTage ?? 0 });

    tabsZeichnen = () => {
      const liste = stand();
      const fehlerTabs = new Set([...bloecke.values()].filter((b) => b.feld.classList.contains('hat-fehler')).map((b) => b.tab));
      if (liste.find((t) => t.id === aktuell)?.gesperrt !== false) aktuell = 'wochen';
      leiste.replaceChildren(...liste.map((t) => {
        const k = knoepfe[t.id];
        k.replaceChildren(document.createTextNode(t.titel));
        if (t.abzeichen) k.append(el('span', 'tab-abzeichen', t.abzeichen));
        k.setAttribute('aria-selected', String(t.id === aktuell));
        k.setAttribute('aria-disabled', String(t.gesperrt));
        k.tabIndex = t.id === aktuell ? 0 : -1;
        k.classList.toggle('hervorgehoben', t.hervorgehoben);
        k.classList.toggle('hat-fehler', fehlerTabs.has(t.id));
        if (t.id === 'tage') {
          if (warGesperrt && !t.gesperrt && t.hervorgehoben) k.classList.add('aufleuchten');
          warGesperrt = t.gesperrt;
        }
        return k;
      }));
      for (const [id, bereich] of Object.entries(bereiche)) {
        bereich.hidden = id !== aktuell || !liste.some((t) => t.id === id);
      }
    };
    zeigeTab = (id, scrollen) => {
      aktuell = id;
      tabsZeichnen();
      if (scrollen) leiste.scrollIntoView({ behavior: 'smooth', block: 'start' });
      beiTabwechsel();
    };
    container.append(leiste, bereiche.wochen, bereiche.tage, bereiche.zusatz);
    tabsZeichnen();
    tabs = {
      weiter() { const n = naechsterTab(stand(), aktuell); if (n) zeigeTab(n, true); },
      istLetzter() { return naechsterTab(stand(), aktuell) === null; },
      zeigeFehlerTab() {
        const fehlerTabs = new Set([...bloecke.values()].filter((b) => b.feld.classList.contains('hat-fehler')).map((b) => b.tab));
        const ziel = ersterTabMitFehler(stand(), fehlerTabs);
        if (ziel) zeigeTab(ziel, false); else tabsZeichnen();
      },
    };
  }
```

  - Signatur: `baueFormular(container, daten, { nurLesen = false, beiAenderung = () => {}, beiTabwechsel = () => {} } = {})`.
  - `urlaubswochen()` läuft innerhalb der Schleife vor dem Bau der Tabs; deshalb ruft sein erstes `aktualisiere()` das leere `tabsZeichnen` – gewollt; nach dem Bau zeichnet `tabsZeichnen()` mit dem gemeldeten `tabStand`.
  - `zeigeTab('tage', true)` im Zähler-Knopf: über die äußere Variable `zeigeTab`, Aufruf erst beim Klick → zu dem Zeitpunkt gesetzt.
  - `zeigeFehler(fehler)`: nach der bestehenden Schleife `tabs?.zeigeFehlerTab();`
  - `geaendert(f, wert)`: nach `b.feld.classList.remove('hat-fehler')` → `tabsZeichnen();` (rote Markierung verschwindet).
  - Rückgabe: `return { antworten, zeigeFehler, sichtbarkeitAktualisieren, tabs };` (`tabs.zeigeFehlerTab` ist intern, schadet aber nicht).

- [ ] **Step 3: `docs/app.js`.**

```js
function weiterStattAbsenden() {
  return Boolean(formular?.tabs) && daten.offen && !formular.tabs.istLetzter();
}

function baue(nurLesen, antworten = daten.antworten) {
  formular = baueFormular($('fragen'), { ...daten, antworten },
    { nurLesen, beiAenderung: aktualisiere, beiTabwechsel: aktualisiere });
}

function aktualisiere() {
  const weiter = weiterStattAbsenden();
  const unveraendert = Boolean(daten.geaendert_am)
    && antwortSchluessel(daten.fragen, formular.antworten()) === gespeichert;
  $('absenden').disabled = weiter ? false : (!daten.offen || unveraendert);
  $('absenden').textContent = weiter ? 'Weiter →' : (daten.geaendert_am ? 'Änderung speichern' : 'Antworten absenden');
  $('meldung').hidden = true;
}
```

  In `start()`: `$('absenden').addEventListener('click', () => (weiterStattAbsenden() ? formular.tabs.weiter() : absenden()));`
  Kommentar bei `let formular` um `tabs` ergänzen.
  **Achtung:** `aktualisiere()` blendet `#meldung` aus – beim Tabwechsel nach einer Fehlermeldung verschwindet sie; die rote Tab-Markierung bleibt. Gewollt.

- [ ] **Step 4: CSS** am Ende des Fragen-Formular-Abschnitts in `docs/style.css`:

```css
.tab-leiste { display: flex; gap: 6px; flex-wrap: wrap; margin: 0 0 12px; scroll-margin-top: 8px; }
button.tab {
  width: auto; min-height: 40px; padding: 0 14px; font-size: 0.95rem;
  background: var(--flaeche); color: var(--text); border: 1px solid var(--rand);
}
button.tab[aria-selected="true"] { background: var(--gewaehlt); border-color: var(--akzent); }
button.tab[aria-disabled="true"] { opacity: 0.45; cursor: not-allowed; }
button.tab.hervorgehoben { border-color: var(--akzent); box-shadow: 0 0 0 2px var(--akzent) inset; }
button.tab.hat-fehler { border-color: var(--fehler-rand); color: var(--fehler-rand); }
.tab-abzeichen { margin-left: 6px; padding: 1px 7px; border-radius: 999px; background: var(--akzent);
  color: var(--akzent-text); font-size: 0.8rem; }
button.tab.aufleuchten { animation: aufleuchten 1s ease-out 1; }
@keyframes aufleuchten { 0% { box-shadow: 0 0 0 0 var(--akzent); } 50% { box-shadow: 0 0 0 8px transparent; } 100% { box-shadow: 0 0 0 2px var(--akzent) inset; } }
@media (prefers-reduced-motion: reduce) { button.tab.aufleuchten { animation: none; } }
```

  Die Variablen `--flaeche`, `--text`, `--rand`, `--gewaehlt`, `--akzent`, `--akzent-text`, `--fehler-rand` vorher in `style.css` nachprüfen (alle drei Designs).

- [ ] **Step 5:** `npm test` → grün; Modul-Import-Check: `node -e "import('./docs/formular.js').then(()=>console.log('ok'))"`.

- [ ] **Step 6: Browser-Test** mit Wegwerf-Harness außerhalb des Repos (PGlite + `docs/`, wie zuvor): Umfrage A = Urlaubswochen mit `einzeltage` + Pflicht-Ja/Nein-Frage; Umfrage B = nur Ja/Nein-Frage. Prüfen:
  1. A: Tabs „Urlaubswochen“, „Einzelne Tage“ (gesperrt), „Zusatzfragen“; Leiste „Weiter →“.
  2. 6 Wochen mit Resttagen → Tab 2 frei, hervorgehoben, Abzeichen „3 übrig“; Zähler-Knopf „Weiter zu den einzelnen Tagen“ wechselt.
  3. In Tab 2 Monate zugeklappt; Tag wählen → Abzeichen „2 übrig“.
  4. Weiter → Tab 3; Leiste „Antworten absenden“; ohne Antwort absenden → Pflichtfehler, Tab 3 rot markiert.
  5. Zu Tab 1, Woche abwählen → Tab 2 gesperrt; Absenden-Versuch aus Tab 3 bleibt korrekt.
  6. Pfeiltasten in der Tab-Leiste überspringen den gesperrten Tab.
  7. B: keine Tabs, Leiste „Antworten absenden“.

- [ ] **Step 7: Commit**

```bash
git add docs/formular.js docs/app.js docs/style.css
git commit -m "Tabs im Mitarbeiter-Formular: Urlaubswochen, Einzelne Tage, Zusatzfragen"
```

---

### Task 3: Anleitung

**Files:** Modify: `ANLEITUNG.md`

- [ ] **Step 1:** Im Abschnitt zur Mitarbeiter-Seite bzw. zu „Einzelne Tage nach den Wochen erlauben“ ergänzen: „Bei Umfragen mit Urlaubswochen ist das Formular in Tabs geteilt: „Urlaubswochen“, „Einzelne Tage“ (frei, sobald alle Wochen gewählt sind und Tage übrig bleiben) und „Zusatzfragen“ (übrige Fragen). Unten führt „Weiter →“ Schritt für Schritt bis zum Absenden.“
- [ ] **Step 2:** `npm test`; Commit `git commit -am "Anleitung: Tabs im Formular"`.
