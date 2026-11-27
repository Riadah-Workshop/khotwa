# Design kit and guided tours

One shared look for the parent portal, the administration console, the school manager dashboard and the agents.
Code: `app/ui/` (`kx.css`, `kx.tsx`, `tour.tsx`, `tour-logic.ts`, `tours.ts`).

## Look

- Every screen wraps itself in `<div className="kx-scope" data-accent="…">`. All kit styles live under
  that class, so the older screens are untouched until they are moved over.
- **Tones**: green, teal, blue, violet, amber, red, slate. A tone is four colours (soft background, text,
  button, border) and is set with `data-tone="…"` on an element. Convention: green = good/main, amber =
  needs attention or money spent, red = absent/problem/danger, blue = information, violet = settings,
  teal = people and cards, slate = neutral.
- **Components** (`kx.tsx`): `PageHead` (icon, title, description), `Card` (icon, title, description),
  `Stat` (coloured tile), `Tabs`/`TabPanel` (keyboard-accessible), `Badge`, `Notice`, `Empty`, `Meter`.
  Buttons are `kx-btn` (`is-solid`, `is-soft`, `is-small`); fields are `kx-field` with `kx-input`.
- **Icons** come from `lucide-react` (already a dependency). Icons are decoration: the text next to
  them always says the same thing, so a screen reader loses nothing.
- Layout uses logical properties (`inline-start`, `margin-inline-end`, …) so Arabic (right-to-left) and
  English share one stylesheet. Test every new screen in both languages and at phone width (390 px).
- Colours are checked by `scripts/test-ui-contrast.mjs` (WCAG AA). Changing a colour in `kx.css`
  that makes text hard to read fails that test.

## Charts

The manager dashboard draws its charts as plain HTML (no chart library), so they follow the page direction
(Arabic reads right to left), print cleanly and every figure is printed next to its bar.

- Part of a whole read at a glance: `Meter`. Ranking or comparing parts: ranked horizontal bars
  (`RankedBars` in `school-manager-dashboard.tsx`), one colour, largest first. Change over months: columns,
  with every month of the period drawn (a quiet month is an empty column, not a missing one).
- Bars are thin (10 px) and columns at most 24 px wide, with the value printed at the tip.
- The geometry and labels are in `app/manager/manager-logic.ts` and are tested by `scripts/test-manager-report.mjs`.
- Do not colour a series by rank. Attendance keeps one colour per status (present green, late amber, absent red).

## First-login tour

Each platform has a short tour (6–12 steps) that opens by itself the first time a person signs in on a
browser, can be skipped, and can be replayed with the help button in the top bar.

- Steps are plain data in `app/ui/tours.ts`: Arabic and English title and text, an icon, an optional
  `target` (`[data-tour="name"]`), and an optional `section` (the tab to open first).
- Mark the element to highlight with `data-tour="name"` (the `Card`, `Stat` and `Tabs` components take
  a `tourId` prop for this).
- In the screen: `const tour = useTour('<platform>', accountTag, ready)`, a `TourHelpButton`, and
  `<GuidedTour platform="<platform>" open={tour.open} onClose={tour.close} language={language} onSection={…}/>`.
- "Seen" is remembered in the browser (`localStorage`, one key per platform and account). Clearing site
  data or using another browser shows the tour again; nothing is stored on the server.
- `scripts/test-guided-tour.mjs` checks that every step has Arabic and English text, that every
  highlighted element exists in the files listed in `TOUR_SOURCES`, and the placement and storage logic.

## Cafeteria screens (Fushati)

The cafeteria administrator and agent screens (`app/fushati/`) use the same kit: a coloured top bar, a
cafeteria selector card, icon tabs (Overview, Cafeterias, Map and attendance, Products, **Inventory**,
Staff, Transfers, Sales and balances, **Reports**, Security), and a page heading with a one-line
description on every tab. Administrators use the teal accent and agents the green one.

- `inventory-panel.tsx` (stock cards, receive / return / waste / damage / expired / stock-count forms,
  movement history) and `reports-panel.tsx` (report picker, date range, table, totals, CSV, print) talk to
  `/api/fushati/inventory` and `/api/fushati/reports` (Phase 2 back end). Pure helpers are in
  `stock-ui.ts` and `report-ui.ts` and are tested by `scripts/test-cafeteria-ui.mjs`.
- Two tours: `cafeteria-admin` (13 steps) and `cafeteria-agent` (12 steps). Steps whose tab the person
  cannot see (for example inventory without the inventory permission, or the backup step for anyone but the
  system administrator) are skipped automatically.
- Each panel is keyed by the selected cafeteria, so switching cafeteria always reloads its own data and never
  shows another cafeteria's numbers for a moment.

## Editing without popups

Nothing that adds or changes a record opens a popup. The kit has two pieces for this (`app/ui/kx.tsx`):

- `EditorView` is a screen of its own that takes the place of the list inside the page: a Back button, a heading, the
  form, and a sticky bar with **Save** and **Cancel** at the bottom (always reachable on a phone). The page hides its
  tabs while it is open. Back with unsaved changes asks "Discard?" in place, not in a dialog.
- `ConfirmButton` is for something that cannot be undone (delete, disable, reset a password). The first press turns the
  button into "Are you sure? Yes / No" in the same place.

- `TypeToConfirm` is for the hardest-to-undo actions (delete a school or an account): the first press asks for the
  school code, email or record key to be typed again.
- The older Student Affairs screens built their forms as `.modal-backdrop > .modal`. `app/ui/sheet.css` (loaded last)
  turns every one of them into a page: an opaque full-screen layer with no dark backdrop, a sticky `<SheetBack>` bar
  (`app/ui/sheet.tsx`) at the top and the Save / Cancel footer pinned to the bottom. A new modal must start with
  `<SheetBack onClick={close}/>`; `scripts/test-no-popups.mjs` fails otherwise.
- `useAsk()` (`app/ui/ask.tsx`) is for a question that has to be asked from code ("leave without saving?", "replace the
  draft?"): a bar at the top of the page with Yes and No, No focused. It replaces `confirm()`.

So: *add or change* = an `EditorView` or a sheet (enter, save, leave); *confirm* = a `ConfirmButton` or `useAsk`; *type to
confirm* = `TypeToConfirm`; *a reason to type* (rejecting a transfer) = a field that opens in the row. The browser's
`confirm()`, `prompt()` and `alert()` are not used. Print previews and the guided tour are not editing and keep their own
layers.

## Adding a screen or a step

1. Put new text in both languages. 2. Reuse a tone and an icon that already mean the same thing elsewhere.
3. Mark the new element with `data-tour`, add the step to `tours.ts`, run `pnpm test`.
