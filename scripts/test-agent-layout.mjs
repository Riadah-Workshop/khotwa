#!/usr/bin/env node
// The Student Affairs agent's frame (app/ui/agent-shell.css and the markup in app/dashboard.tsx): the work starts at the
// top of the screen, the guided tour still finds what it points at, nothing outside the agent app is restyled, and
// printing is untouched.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync('app/ui/agent-shell.css', 'utf8');
const dashboard = fs.readFileSync('app/dashboard.tsx', 'utf8');
const hub = fs.readFileSync('app/services-hub.tsx', 'utf8');
const layout = fs.readFileSync('app/layout.tsx', 'utf8');
const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');

// --- the stylesheet is for the screen and for the agent app only -------------------------------------------------
{
  assert.ok(bare.trim().startsWith('@media screen{'), 'every rule sits inside @media screen so printing keeps the older rules');
  let depth = 0, top = 0;
  for (const ch of bare) { if (ch === '{') { if (depth === 0) top++; depth++; } else if (ch === '}') depth--; }
  assert.equal(depth, 0, 'braces are balanced');
  assert.equal(top, 1, 'a single @media screen block, so no rule can slip outside it');
  // Every selector starts from .app-shell (only the agent dashboard has one), so no other screen can change.
  const selectors = bare.replace(/@media[^{]*\{/g, '{').split('}').map(chunk => chunk.split('{')[0].trim()).filter(Boolean);
  for (const group of selectors) {
    for (const one of group.split(',').map(x => x.trim()).filter(Boolean)) {
      assert.ok(/^\.app-shell\b/.test(one), `selector "${one}" does not start from .app-shell, so it could change another screen`);
    }
  }
  assert.ok(!/!important/.test(bare), 'no !important: the file wins by coming last, and so can be overridden');
  assert.ok(!/\bbody\b|\bhtml\b/.test(bare.replace(/font-family[^;]*/g, '')), 'no rule on body or html');
}
{
  const order = ['./iphone-compatibility.css', './ui/sheet.css', './ui/action-menu.css', './ui/agent-shell.css'].map(name => layout.indexOf(`import '${name}'`));
  assert.ok(order.every(i => i >= 0), 'layout.tsx imports the sheet, the menu and the agent shell stylesheets');
  assert.ok(order.every((i, n) => n === 0 || i > order[n - 1]), 'agent-shell.css is imported last, after every older stylesheet, so it only has to say what is different');
}

// --- the work starts at the top: what the frame is made of --------------------------------------------------------
{
  assert.ok(/\.app-shell \.school-clock \.luxury-clock-face\{display:none\}|\.school-clock \.luxury-clock-face\{display:none\}/.test(bare), 'the date and time are a pill, not a banner with a dial');
  assert.ok(/--shell-head:64px/.test(bare), 'the header is one slim row');
  assert.ok(/\.app-shell \.section-services\{position:sticky/.test(bare), 'the section tabs stay in view on a desktop screen');
  assert.ok(/@media\(max-width:760px\)\{[\s\S]*\.app-shell \.sidebar\{display:none\}/.test(bare), 'on a phone the side block is gone (the bottom bar takes over)');
  assert.ok(/\.app-shell \.top-actions>\*\{display:none\}[\s\S]*\.top-menu\{display:inline-grid\}/.test(bare), 'on a phone the tools collapse into the three-dot menu');
  assert.ok(/overflow-x:auto/.test(bare), 'the section tabs scroll sideways on a phone instead of wrapping into rows');
  assert.ok(/--workspace-font-scale/.test(bare), 'text sizes follow the agent text-size setting');
}

// --- the markup keeps the parts the guided tour and the rest of the app rely on --------------------------------------
{
  for (const tour of ['agent-tools', 'agent-subnav', 'agent-groups', 'agent-all-services', 'agent-new-case']) {
    assert.ok(dashboard.includes(`data-tour="${tour}"`), `dashboard.tsx lost the tour target ${tour}`);
  }
  for (const tour of ['agent-search', 'agent-favorites', 'agent-categories']) assert.ok(hub.includes(`data-tour="${tour}"`), `services-hub.tsx lost the tour target ${tour}`);
  assert.ok(/className="top-menu"/.test(dashboard), 'the header has the phone menu');
  const menu = dashboard.slice(dashboard.indexOf('className="top-menu"'), dashboard.indexOf('<SchoolClock/>'));
  for (const wanted of ["go('settings')", 'load()', 'tour.start()', 'setLanguage(', "href:'/logout'"]) assert.ok(menu.includes(wanted), `the phone menu lost: ${wanted}`);
  assert.ok(/<nav aria-label=\{ui\('التنقل داخل '\)\+currentGroup\.label\} data-tour="agent-subnav">/.test(dashboard), 'the section tabs keep their label');
  assert.ok(!/className="welcome"/.test(dashboard), 'the home page no longer opens with a banner');
  const home = dashboard.slice(dashboard.indexOf("{tab==='home'&&<>"), dashboard.indexOf("{(tab==='search'||tab==='students')"));
  assert.ok(/className="stats home-stats"/.test(home) && /<button type="button" className="stat"/.test(home), 'the four counts on the home page are buttons that open the list');
  assert.ok(/home-queue/.test(home) && /open\.slice\(0,5\)/.test(home), 'the home page shows what is waiting for follow-up');
  for (const target of ["'students'", "'today'", "'follow'", "'honor'"]) assert.ok(home.includes(target), `a home count should open ${target}`);
}

// --- English: every new line of text has a translation ---------------------------------------------------------------
{
  const dict = fs.readFileSync('lib/ui-translations.ts', 'utf8');
  for (const word of ['ملخص يومك', 'القائمة', 'المزيد من الإجراءات', 'لا توجد حالات تنتظر المتابعة.', 'خروج', 'إدارة المدارس']) {
    assert.ok(dict.includes(`'${word}'`) || dict.includes(`"${word}"`), `no English for: ${word}`);
  }
}

console.log('ok: agent layout');
