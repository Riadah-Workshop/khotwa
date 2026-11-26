#!/usr/bin/env node
// Guided first-login tours: the logic that decides when and where the tour shows,
// and the tour texts themselves (every step in Arabic and English, every highlighted
// element really present in the screen it belongs to).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

function load(file) {
  const exports = {};
  new Function('exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS}}).outputText)(exports);
  return exports;
}
const logic = load('app/ui/tour-logic.ts');
const tours = load('app/ui/tours.ts');

// --- storage: shown once per platform and per account -----------------------------------
const memory = () => { const m = new Map(); return {getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => void m.set(k, String(v)), removeItem: (k) => void m.delete(k)}; };
const a = logic.tourStorageKey('parent', 'abc123');
assert.notEqual(a, logic.tourStorageKey('parent', 'zzz999'), 'two accounts on one phone must not share the "seen" flag');
assert.notEqual(a, logic.tourStorageKey('admin', 'abc123'), 'each platform has its own tour');
assert.equal(a, logic.tourStorageKey('parent', 'abc123'), 'the key is stable');
assert.ok(!/[\s<>"']/.test(logic.tourStorageKey('parent', ' a b"<script>')), 'odd account text cannot break the key');
{
  const storage = memory();
  assert.equal(logic.tourSeen(storage, a), false, 'a new account has not seen the tour');
  logic.markTourSeen(storage, a);
  assert.equal(logic.tourSeen(storage, a), true, 'after finishing or skipping it is not shown again');
  assert.equal(logic.tourSeen(storage, logic.tourStorageKey('parent', 'other')), false, 'another account still sees it');
}
{
  const broken = {getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() {}};
  assert.equal(logic.tourSeen(broken, a), true, 'blocked storage must not show the tour on every page load');
  assert.doesNotThrow(() => logic.markTourSeen(broken, a));
  assert.equal(logic.tourSeen(null, a), true);
}
assert.equal(logic.accountTag('+966500000000'), logic.accountTag(' +966500000000 '));
assert.notEqual(logic.accountTag('+966500000000'), logic.accountTag('+966500000001'));
assert.ok(!logic.accountTag('+966500000000').includes('966'), 'the identifier itself is not put into the page');
assert.equal(logic.accountTag(''), '');

// --- stepping and keys -----------------------------------------------------------------------
assert.equal(logic.clampStep(-3, 5), 0);
assert.equal(logic.clampStep(99, 5), 4);
assert.equal(logic.clampStep(2.7, 5), 2);
assert.equal(logic.clampStep(NaN, 5), 0);
assert.equal(logic.clampStep(3, 0), 0);
assert.equal(logic.keyDirection('ArrowLeft', true), 'next', 'in Arabic the left arrow goes forward');
assert.equal(logic.keyDirection('ArrowRight', true), 'prev');
assert.equal(logic.keyDirection('ArrowRight', false), 'next');
assert.equal(logic.keyDirection('ArrowLeft', false), 'prev');
assert.equal(logic.keyDirection('Enter', false), null);

// --- where the card goes: always on screen, never on top of what it explains ---------------------
let seed = 12345;
const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
const overlaps = (r, b) => r.left < b.left + b.width && r.left + r.width > b.left && r.top < b.top + b.height && r.top + r.height > b.top;
let placedBeside = 0;
for (let i = 0; i < 4000; i++) {
  const viewport = {width: 320 + Math.floor(random() * 1400), height: 480 + Math.floor(random() * 700)};
  const card = {width: 300 + Math.floor(random() * 100), height: 150 + Math.floor(random() * 120)};
  const width = 20 + Math.floor(random() * viewport.width * 0.8), height = 20 + Math.floor(random() * viewport.height * 0.5);
  const target = {left: Math.floor(random() * (viewport.width - width)), top: Math.floor(random() * (viewport.height - height)), width, height};
  const spot = logic.placeCard(target, card, viewport);
  const rect = {left: spot.left, top: spot.top, width: card.width, height: card.height};
  if (viewport.width >= card.width + 24) assert.ok(rect.left >= 0 && rect.left + rect.width <= viewport.width, `card leaves the screen sideways ${JSON.stringify({viewport, card, target, spot})}`);
  if (viewport.height >= card.height + 24) assert.ok(rect.top >= 0 && rect.top + rect.height <= viewport.height, `card leaves the screen vertically ${JSON.stringify({viewport, card, target, spot})}`);
  const centred = logic.placeCard(null, card, viewport);
  if (spot.top !== centred.top || spot.left !== centred.left) { placedBeside++; assert.ok(!overlaps(rect, target), `card covers the highlighted element ${JSON.stringify({viewport, card, target, spot})}`); }
}
assert.ok(placedBeside > 1500, 'most placements should be next to the target, not the centred fallback');
{
  const centred = logic.placeCard(null, {width: 380, height: 200}, {width: 1000, height: 800});
  assert.deepEqual(centred, {top: 300, left: 310}, 'no target: centred');
  const below = logic.placeCard({left: 100, top: 100, width: 200, height: 50}, {width: 380, height: 200}, {width: 1000, height: 800});
  assert.ok(below.top >= 150, 'room below: the card goes below');
  const above = logic.placeCard({left: 100, top: 600, width: 200, height: 50}, {width: 380, height: 200}, {width: 1000, height: 800});
  assert.ok(above.top + 200 <= 600, 'no room below: the card goes above');
  const spot = logic.spotlightBox({left: 2, top: 2, width: 100, height: 40}, {width: 500, height: 500});
  assert.ok(spot.left >= 0 && spot.top >= 0, 'the spotlight is kept on screen');
}

// --- the tours themselves -----------------------------------------------------------------------
const iconNames = [...fs.readFileSync('app/ui/tour.tsx', 'utf8').matchAll(/^\s*(?:([a-z]+): <[A-Za-z0-9]+ size=\{22\}\/>,?\s*)+/gm)].length ? [...fs.readFileSync('app/ui/tour.tsx', 'utf8').matchAll(/\b([a-z]+): <[A-Za-z0-9]+ size=\{22\}\/>/g)].map(m => m[1]) : [];
assert.ok(iconNames.length >= 15, 'could not read the icon table of tour.tsx');
const arabic = /[؀-ۿ]/, latin = /[A-Za-z]{3}/;
let steps = 0;
for (const platform of Object.keys(tours.TOURS)) {
  const list = tours.TOURS[platform];
  assert.ok(tours.TOUR_PLATFORMS.includes(platform), `${platform} is not a known platform`);
  assert.ok(list.length >= 3 && list.length <= 14, `${platform}: a tour should have 3 to 14 steps, has ${list.length}`);
  assert.equal(new Set(list.map(s => s.id)).size, list.length, `${platform}: duplicate step ids`);
  assert.equal(list[0].target, undefined, `${platform}: the first step is a welcome, shown in the middle`);
  const sources = tours.TOUR_SOURCES[platform];
  assert.ok(sources && sources.length, `${platform}: TOUR_SOURCES must name the files that hold its highlighted elements`);
  const text = sources.map(file => fs.readFileSync(file, 'utf8')).join('\n');
  for (const step of list) {
    steps++;
    const where = `${platform}/${step.id}`;
    for (const language of ['ar', 'en']) {
      assert.ok(step.title[language] && step.title[language].trim().length >= 3, `${where}: empty ${language} title`);
      assert.ok(step.body[language] && step.body[language].trim().length >= 20, `${where}: empty ${language} text`);
      assert.ok(step.body[language].length <= 330, `${where}: ${language} text is too long for the card (${step.body[language].length})`);
    }
    assert.ok(arabic.test(step.title.ar + step.body.ar), `${where}: the Arabic text has no Arabic letters`);
    assert.ok(latin.test(step.title.en + step.body.en) && !arabic.test(step.title.en + step.body.en), `${where}: the English text is not English`);
    assert.ok(iconNames.includes(step.icon), `${where}: icon "${step.icon}" is not in the icon table of tour.tsx`);
    if (step.target) {
      const match = /^\[data-tour="([a-z0-9-]+)"\]$/.exec(step.target);
      assert.ok(match, `${where}: target must look like [data-tour="name"]`);
      const name = match[1];
      assert.ok(text.includes(`data-tour="${name}"`) || text.includes(`tourId="${name}"`), `${where}: nothing in ${sources.join(', ')} is marked data-tour="${name}"`);
    }
  }
}
assert.ok(steps >= 6, 'at least the parent tour must exist');
console.log(`ok: tour logic and ${steps} steps in ${Object.keys(tours.TOURS).length} tour(s)`);
