#!/usr/bin/env node
// The three-dot menu: where the list opens (app/ui/action-menu-logic.ts), how the keys move, that every colour pair is
// readable, and that the component keeps the things a keyboard and a screen reader need.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

function load(file) {
  const exports = {};
  new Function('exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES5}}).outputText)(exports);
  return exports;
}
const m = load('app/ui/action-menu-logic.ts');
const box = (top, left, size = 40) => ({top, left, bottom: top + size, right: left + size});
const view = {width: 1000, height: 800};
const menu = {width: 220, height: 200};

// --- where the list opens ---------------------------------------------------------------------------------
{
  // Arabic page, button at the far left of a row: the list's left edge is the button's left edge and it grows to the right.
  const rtl = m.placeMenu(box(100, 20), menu, view, true);
  assert.equal(rtl.left, 20);
  assert.equal(rtl.top, 100 + 40 + 6, 'below the button, with a small gap');
  assert.equal(rtl.above, false);
  // English page, button at the far right: the list's right edge is the button's right edge and it grows to the left.
  const ltr = m.placeMenu(box(100, 940), menu, view, false);
  assert.equal(ltr.left, 940 + 40 - 220);
  // Never outside the window, on either side.
  assert.equal(m.placeMenu(box(100, 2), menu, view, false).left, 8, 'pushed in from the left edge');
  assert.equal(m.placeMenu(box(100, 990), menu, view, true).left, 1000 - 220 - 8, 'pushed in from the right edge');
}
{
  // Near the bottom: opens above when that is where the room is.
  const flipped = m.placeMenu(box(740, 500), menu, view, true);
  assert.equal(flipped.above, true);
  assert.equal(flipped.top, 740 - 6 - 200);
  assert.ok(flipped.top >= 8);
  // Plenty of room below: stays below even if there is more above.
  assert.equal(m.placeMenu(box(300, 500), menu, view, true).above, false);
  // Too tall for either side: takes the roomier side and scrolls.
  const tall = m.placeMenu(box(400, 500), {width: 220, height: 900}, view, true);
  assert.ok(tall.maxHeight >= 120 && tall.maxHeight < 900);
  assert.ok(tall.top >= 8);
  // A list wider than a phone is squeezed to fit with the margins.
  const phone = m.placeMenu(box(100, 330), {width: 500, height: 100}, {width: 390, height: 800}, true);
  assert.equal(phone.left, 8);
}

// --- the keys -----------------------------------------------------------------------------------------------
{
  const usable = [true, false, true, true];
  assert.equal(m.nextIndex(-1, 'ArrowDown', usable), 0, 'first press goes to the first row');
  assert.equal(m.nextIndex(0, 'ArrowDown', usable), 2, 'a row that cannot be used is skipped');
  assert.equal(m.nextIndex(3, 'ArrowDown', usable), 0, 'wraps from the end to the start');
  assert.equal(m.nextIndex(0, 'ArrowUp', usable), 3, 'wraps from the start to the end');
  assert.equal(m.nextIndex(2, 'ArrowUp', usable), 0);
  assert.equal(m.nextIndex(2, 'Home', usable), 0);
  assert.equal(m.nextIndex(0, 'End', usable), 3);
  assert.equal(m.nextIndex(1, 'x', usable), 1, 'another key does not move');
  assert.equal(m.nextIndex(-1, 'ArrowDown', [false, false]), -1, 'nothing can be used');
  assert.equal(m.nextIndex(-1, 'Home', []), -1);
}

// --- what is shown ------------------------------------------------------------------------------------------
{
  const list = [{label: 'a', hidden: true}, {label: 'b', separatorBefore: true}, {label: 'c', separatorBefore: true}];
  const shown = m.visibleActions(list);
  assert.deepEqual(shown.map(x => x.label), ['b', 'c']);
  assert.equal(shown[0].separatorBefore, false, 'a divider is not drawn above the first row');
  assert.equal(shown[1].separatorBefore, true);
  assert.equal(list[1].separatorBefore, true, 'the list passed in is not changed');
  assert.equal(m.menuIsEmpty([{hidden: true}, {hidden: true}]), true, 'every row hidden: no button at all');
  assert.equal(m.menuIsEmpty([]), true);
  assert.equal(m.menuIsEmpty([{hidden: true}, {}]), false);
}
{
  assert.equal(m.typedMatches('KH-12', 'KH-12'), true);
  assert.equal(m.typedMatches('  KH-12 ', 'KH-12'), true);
  assert.equal(m.typedMatches('kh-12', 'KH-12'), false, 'letters must match');
  assert.equal(m.typedMatches('', ''), false, 'nothing expected means nothing can be confirmed by typing');
}

// --- colours: every text/background pair in action-menu.css is readable (WCAG AA) ------------------------------
{
  const luminance = hex => { const c = i => { const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * c(0) + 0.7152 * c(1) + 0.0722 * c(2); };
  const ratio = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
  const pairs = [
    ['row text on the list', '#17332b', '#ffffff'], ['row text on hover', '#17332b', '#eaf3ee'],
    ['red row on the list', '#9b1c1c', '#ffffff'], ['red row on hover', '#9b1c1c', '#fde8e8'],
    ['amber row on the list', '#7a4800', '#ffffff'], ['amber row on hover', '#7a4800', '#fdf0d8'],
    ['blue row on the list', '#1c4a8c', '#ffffff'], ['blue row on hover', '#1c4a8c', '#e5eefb'],
    ['dots on the button', '#35514a', '#ffffff'], ['dots on the open button', '#35514a', '#e1eee7'],
    ['Yes button', '#ffffff', '#c53030'], ['Yes button (amber)', '#ffffff', '#a95a05'], ['Yes button (blue)', '#ffffff', '#2563a8'], ['Yes button (green)', '#ffffff', '#13775a'], ['Yes button (slate)', '#ffffff', '#475569'],
    ['typed word chip', '#394655', '#edf0f3'], ['row icon', '#4f6159', '#ffffff'],
  ];
  const css = fs.readFileSync('app/ui/action-menu.css', 'utf8');
  for (const [label, fg, bg] of pairs) {
    assert.ok(ratio(fg, bg) >= 4.5, `${label}: ${fg} on ${bg} is only ${ratio(fg, bg).toFixed(2)}:1`);
    assert.ok(css.toLowerCase().includes(fg.toLowerCase()) || css.toLowerCase().includes(bg.toLowerCase()), `${label}: neither colour appears in action-menu.css, so this check no longer matches the stylesheet`);
  }
}

// --- the component keeps what a keyboard and a screen reader need ---------------------------------------------
{
  const src = fs.readFileSync('app/ui/action-menu.tsx', 'utf8');
  for (const [what, pattern] of [
    ['a menu role on the list', /role="menu"/], ['menu item roles', /role: 'menuitem'/], ['aria-haspopup on the button', /aria-haspopup="menu"/],
    ['aria-expanded on the button', /aria-expanded=\{open\}/], ['a label on the button', /aria-label=\{label\}/], ['Escape closes', /event\.key === 'Escape'/],
    ['the list is drawn into <body>', /createPortal\([\s\S]*document\.body\)/], ['it closes when something else is pressed', /pointerdown/],
    ['it closes when the window scrolls', /'scroll'/], ['no button when there is nothing to offer', /menuIsEmpty\(actions\)\) return null/],
    ['the question has a "No" that is focused', /autoFocus=\{!confirm\.expected\}/], ['typing the word again is supported', /typedMatches\(typed, confirm\.expected\)/],
  ]) assert.ok(pattern.test(src), `action-menu.tsx lost: ${what}`);
  assert.ok(!/\b(confirm|prompt|alert)\(/.test(src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')), 'the menu must not use browser popups');
  const layout = fs.readFileSync('app/layout.tsx', 'utf8');
  assert.ok(layout.includes("import './ui/action-menu.css'"), 'layout.tsx must load action-menu.css');
}

// --- where the menu is used: a row of Edit / Delete buttons must not come back --------------------------------------
{
  const read = f => fs.readFileSync(f, 'utf8');
  const uses = ['app/fushati/fushati-dashboard.tsx', 'app/fushati/menu-panel.tsx', 'app/admin/admin-console.tsx', 'app/dashboard.tsx', 'app/late-overview.tsx', 'app/student-movements.tsx', 'app/scheduled-followups.tsx', 'app/evidence-portfolio.tsx', 'app/reply-templates.tsx', 'app/student-evaluation.tsx'];
  for (const f of uses) assert.ok(/<ActionMenu\b/.test(read(f)), `${f} should use the three-dot menu for its row actions`);

  const cafe = read('app/fushati/fushati-dashboard.tsx');
  assert.ok(!/ConfirmButton/.test(cafe), 'cafeteria and staff rows: Disable / Delete / Reset password are menu rows, not ConfirmButtons in the row');
  assert.ok(!/cfm-rowbtns/.test(cafe), 'cafeteria and staff rows no longer have a row of buttons');

  const con = read('app/admin/admin-console.tsx');
  assert.ok(!/ConfirmButton/.test(con), 'console rows: "send access link" is a menu row that asks inside the menu');
  assert.equal((con.match(/<TypeToConfirm\b/g) || []).length, 1, 'only the standalone "delete a parent account" card keeps its own type-to-confirm; school, user and record deletes type inside the menu');
  assert.ok(/expected: s\.code/.test(con) && /expected: u\.email/.test(con), 'deleting a school / account still needs its code / email typed again');

  const agent = read('app/dashboard.tsx');
  const card = agent.slice(agent.indexOf('function caseCard('), agent.indexOf('function empty('));
  assert.ok(/<ActionMenu\b/.test(card), 'the case card keeps Edit / Delete / evidence / print in the menu');
  assert.ok(!/className="ghost danger"/.test(card), 'the case card has no Delete button of its own');
  assert.ok(!/onClick=\{\(\)=>editCase\(c\)\}><Pencil/.test(card.replace(/onSelect:\(\)=>editCase\(c\)/g, '')), 'the case card has no Edit button of its own');
  assert.ok(!/className="icon-button" title=\{ui\("تعديل"\)\}/.test(agent), 'the student list has no loose Edit icon button');
  assert.ok(/hidden:!mainAdmin/.test(card), 'only the main administrator is offered Delete on a case');
  assert.ok(/confirm:\{message:ui\(s\.active\?'أرشفة الطالب/.test(agent), 'archiving a student asks inside the menu');

  // Anything destructive in a menu asks first, inside the menu.
  for (const f of uses) {
    const src = read(f);
    for (const m of src.matchAll(/tone:\s*'red'[^\n]*/g)) {
      const row = src.slice(m.index, m.index + 900);
      if (/Delete|حذف|delete/.test(row.slice(0, 400)) && !/confirm:/.test(row) && !/hidden:!mainAdmin,disabled:busy,onSelect:\(\)=>setDeleteCase\(c\)/.test(row)) {
        assert.fail(`${f}: a red (destructive) menu row near "${row.slice(0, 80).replace(/\n/g, ' ')}" has no confirm`);
      }
    }
  }
}

console.log('ok: three-dot menu logic, colours, component and usage checks');
