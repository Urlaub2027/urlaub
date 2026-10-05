import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DESIGNS, designFuer } from '../docs/design.js';

test('Drei Designs in fester Reihenfolge', () => {
  assert.deepEqual(DESIGNS.map((d) => d.name), ['freundlich', 'normal', 'dunkel']);
  assert.deepEqual(DESIGNS.map((d) => d.titel), ['Freundlich', 'Normal', 'Dunkel']);
});

test('Gespeicherte Wahl gewinnt, sonst Geräteeinstellung', () => {
  assert.equal(designFuer('freundlich', true), 'freundlich');
  assert.equal(designFuer('dunkel', false), 'dunkel');
  assert.equal(designFuer(null, true), 'dunkel');
  assert.equal(designFuer(null, false), 'normal');
  assert.equal(designFuer('quatsch', false), 'normal');
});

test('Stylesheet definiert alle Farbvariablen für jedes Design', () => {
  const css = readFileSync(new URL('../docs/style.css', import.meta.url), 'utf8');
  const variablen = [...css.match(/:root \{([^}]*)\}/)[1].matchAll(/--([a-z-]+):/g)].map((m) => m[1]);
  assert.ok(variablen.length >= 14);
  for (const name of ['freundlich', 'dunkel']) {
    const block = css.match(new RegExp(`:root\\[data-design="${name}"\\] \\{([^}]*)\\}`));
    assert.ok(block, `Block für ${name} fehlt`);
    for (const v of variablen) assert.match(block[1], new RegExp(`--${v}:`), `${name}: --${v}`);
  }
});
