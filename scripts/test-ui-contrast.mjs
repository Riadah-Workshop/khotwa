#!/usr/bin/env node
// The design kit (app/ui/kx.css) colours text and buttons from pairs of colours.
// This checks every pair against WCAG AA (4.5:1 for normal text) so a colour
// change that makes text hard to read fails here instead of on a phone in sunlight.
import {readFileSync} from 'node:fs';

const css = readFileSync('app/ui/kx.css', 'utf8');
const vars = {};
for (const m of css.matchAll(/--kx-([a-z]+)-(bg|ink|solid|line):(#[0-9a-fA-F]{6})/g)) {
  (vars[m[1]] ||= {})[m[2]] = m[3];
}
const tones = Object.keys(vars);
let failures = 0;
let checks = 0;

function luminance(hex) {
  const channel = (i) => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}
function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
function expect(label, foreground, background, minimum = 4.5) {
  checks++;
  const value = ratio(foreground, background);
  if (value < minimum) {
    failures++;
    console.error(`FAIL ${label}: ${foreground} on ${background} is ${value.toFixed(2)}:1, needs ${minimum}:1`);
  }
}

if (tones.length < 7) {
  console.error(`FAIL expected at least 7 tones in app/ui/kx.css, found ${tones.length}`);
  process.exit(1);
}
for (const tone of tones) {
  const t = vars[tone];
  for (const key of ['bg', 'ink', 'solid', 'line']) {
    if (!t[key]) { failures++; console.error(`FAIL tone ${tone} has no -${key} colour`); }
  }
  if (!t.bg || !t.ink || !t.solid) continue;
  expect(`${tone}: text on soft background`, t.ink, t.bg);
  expect(`${tone}: text on white`, t.ink, '#ffffff');
  expect(`${tone}: white text on button colour`, '#ffffff', t.solid);
  expect(`${tone}: button colour as text on white (ghost buttons)`, t.solid, '#ffffff', 3);
}
// Body text and muted text on the page and card backgrounds.
const body = {text: css.match(/--kx-text:(#[0-9a-f]{6})/i)?.[1], muted: css.match(/--kx-muted:(#[0-9a-f]{6})/i)?.[1], page: css.match(/--kx-page:(#[0-9a-f]{6})/i)?.[1]};
for (const [name, value] of Object.entries(body)) if (!value) { failures++; console.error(`FAIL --kx-${name} is missing`); }
if (body.text && body.page && body.muted) {
  expect('body text on page', body.text, body.page);
  expect('muted text on page', body.muted, body.page);
  expect('muted text on white', body.muted, '#ffffff');
}
if (failures) { console.error(`${failures} contrast problem(s) in ${checks} checks`); process.exit(1); }
console.log(`ok: ${checks} colour pairs are readable (${tones.join(', ')})`);
