#!/usr/bin/env node
// Nothing that edits or confirms may open a browser popup, and every in-page "sheet" (the old modal) has a Back bar.
//  - no confirm() / prompt() / alert() in the app (the PWA install prompt is the browser's own and is allowed);
//  - every `.modal-backdrop > .modal` carries a <SheetBack> straight after its opening tag, so it is a page with a way out;
//  - the stylesheet that turns those into pages is loaded after the older modal rules.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, name.name);
    if (name.isDirectory()) { if (name.name !== 'node_modules' && name.name !== 'api') walk(full, out); } else if (/\.(tsx|ts)$/.test(name.name)) out.push(full);
  }
  return out;
}
const files = walk('app');
const native = [];
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');
  if (file.endsWith('install-app.tsx')) continue;
  for (const match of text.matchAll(/(?<![\w.$])(?:window\.)?(confirm|prompt|alert)\s*\(/g)) native.push(`${file}: ${match[1]}(`);
}
assert.deepEqual(native, [], `native popups are not allowed (use useAsk, ConfirmButton, TypeToConfirm or an EditorView):\n${native.join('\n')}`);

let sheets = 0;
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  const opens = [...text.matchAll(/<div className="modal-backdrop[^"]*"[^>]*><section className="modal[^"]*"[^>]*>/g)];
  for (const open of opens) {
    sheets++;
    const after = text.slice(open.index + open[0].length, open.index + open[0].length + 12);
    assert.ok(after.startsWith('<SheetBack'), `${file}: a screen that replaced a popup needs <SheetBack> right after its opening tag`);
  }
  if (opens.length) assert.ok(/import \{SheetBack\} from '\.\/ui\/sheet'/.test(text), `${file}: imports SheetBack`);
}
assert.ok(sheets >= 20, `expected to find the edit sheets, found ${sheets}`);

const layout = fs.readFileSync('app/layout.tsx', 'utf8');
const imports = [...layout.matchAll(/import '\.\/([\w/.-]+\.css)';/g)].map(m => m[1]);
assert.ok(imports.includes('ui/sheet.css'), 'layout loads ui/sheet.css');
for (const older of ['globals.css', 'video-theme.css', 'readability.css', 'localization.css', 'school-work.css']) assert.ok(imports.indexOf(older) < imports.indexOf('ui/sheet.css'), `ui/sheet.css loads after ${older}`);
const css = fs.readFileSync('app/ui/sheet.css', 'utf8');
assert.ok(/body \.modal-backdrop\{[^}]*position:fixed;inset:0/.test(css) && /background:var\(--bg/.test(css), 'a sheet covers the page with an opaque background (no dark backdrop)');
assert.ok(!/backdrop-filter:blur/.test(css), 'no blurred backdrop');
console.log(`ok: no native popups in the app; ${sheets} edit screens are pages with a Back bar`);
