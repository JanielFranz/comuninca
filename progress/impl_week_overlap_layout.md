# Implementation report — Feature #18: week_overlap_layout

## Files touched

- `lib/selectors.ts` — added `computeOverlapLayout()` (pure, per-day) and
  wired it into `buildWeekData()`.
- `lib/types.ts` — `WeekBlock` gained `left: number` and `width: number`
  (CSS percentages, 0-100). `top`/`height` unchanged.
- `components/WeekView.tsx` — block's inline `style` now also sets
  `left: ${b.left}%` and `width: ${b.width}%`.
- `components/WeekView.module.css` — `.block` no longer hard-codes
  `left: 3px; right: 3px` (that fought the new inline percentages); added
  `box-sizing: border-box` and a cosmetic `margin: 0 2px` gutter instead (see
  "gutter" decision below). Added `overflow: hidden; text-overflow: ellipsis`
  to `.blockTime` (title already had these).
- `tests/unit/week-overlap.test.ts` — new, 7 tests, all pure-function
  assertions against `buildWeekData`.
- `tests/fixtures/selectors-golden.json` — every existing `WeekBlock` entry
  (14 blocks across the 6 `week/*` fixture keys) got `left: 0, width: 100`
  added mechanically via a script, not hand-edited or re-derived from
  scratch (same approach feature #16 used for `pictureUrl`).
- `progress/current.md`, `progress/impl_week_overlap_layout.md` (this file).

No other files were touched. Did not go near month view, day modal,
navigation window, `proxy.ts`, `lib/auth.ts`, any Server Action, `prisma/**`,
or `supabase/**`.

## Algorithm implemented

`computeOverlapLayout(blocks: { id, startMin, endMin }[])`, called once per
day inside `buildWeekData`'s existing per-day loop (never across days — each
day's `dayEvents` were already isolated by `getEventsForDate` before this
change, and I only inserted the packing pass between the existing
top/height computation and the final `WeekBlock` construction):

1. **Sort** the day's blocks by `startMin` ascending, tie-broken by `id`
   (string comparison) for a fully deterministic order regardless of
   upstream array order.
2. **Connected components** via union-find over the strict overlap relation
   `a.startMin < b.endMin && a.endMin > b.startMin` (touching-but-not-
   overlapping, e.g. one ends exactly when the next starts, is NOT an
   overlap). I compare every pair once (O(n²) over a single day's typically
   tiny event count) and union overlapping pairs, so a chain A-B-overlap,
   B-C-overlap, A-C-no-overlap lands in one component even though A and C
   never intersect directly — this is the case a naive pairwise
   implementation gets wrong, and it's explicitly one of the required test
   cases.
3. **Column sweep, per component** (each component's blocks kept in the
   same start-sorted order): maintain a list of "active" blocks (removing
   any whose `endMin <= currentBlock.startMin`), and assign the current
   block the lowest column index not held by a currently-active block. This
   is the standard interval-graph greedy coloring algorithm; it is optimal
   for interval graphs — the running peak of `active.length` during the
   sweep equals the graph's chromatic number (= the size of the largest
   fully-overlapping clique at any instant), so no extra columns are ever
   introduced.
4. **`totalColumns`** for a component = the peak `active.length` observed
   during that component's own sweep (not the whole day's peak — an
   unrelated, non-overlapping cluster elsewhere in the same day does not
   inflate this component's column count). Every block in the component
   gets the same `totalColumns`. `width = 100 / totalColumns`; `left =
   column * width`. A solitary, non-overlapping block is its own
   component of size 1, giving `totalColumns = 1` → `width: 100, left: 0`
   (today's implicit full-width behavior, unchanged).

I hand-traced this against every case named in the feature spec (identical
pair, triple overlap, the A/B/C chained-partial-overlap example with the
literal times from the spec, non-overlapping, touching) before writing the
tests, to make sure the algorithm — not just the tests — was correct.

## Minimum-readable-width decision (AC 3.3.14)

Chose **exact equal-percentage division always**, with CSS truncation
handling readability, over a pixel-floor/degrade strategy. Reasoning:

- This app's realistic event density is low (the seed data and the existing
  UI never show more than 2 events overlapping on a single day); a
  pixel-floor cap would add a second, harder-to-verify degrade code path for
  a case that in practice essentially never triggers.
- `.blockTitle` already had `white-space: nowrap; overflow: hidden;
  text-overflow: ellipsis` from the original prototype. I added the same
  three declarations to `.blockTime` (it previously only had
  `white-space: nowrap`, so at a narrow width its text would have been hard
  clipped by `.block`'s own `overflow: hidden` with no ellipsis). Between
  the two, both lines of text degrade gracefully at any width down to a few
  columns before becoming unreadably thin, which given the realistic event
  density above should not happen.
- The equal-percentage approach keeps the packing math exact and simple
  (no arbitrary floor constant, no partial-overlap-below-the-floor
  secondary logic to reason about or test).

I did not add a numeric floor constant. If real-world usage later shows 5+
simultaneous overlapping events on one day are common, that would be the
trigger to revisit this with a pixel-floor/partial-overlap degrade — not
before, per the "pick the simpler, more robust option unless you find a
concrete reason" guidance in the brief.

## Gutter between side-by-side cards

`left`/`width` are set as exact, gap-free tiling percentages (columns
touch edge-to-edge with no gap in the underlying math, per the spec). For
the cosmetic gap between visually adjacent cards, `.block` uses
`box-sizing: border-box` plus `margin: 0 2px` — margins sit outside an
absolutely-positioned element's declared box and only inset the *painted*
box a couple of px on each side; they don't change the `left`/`width`
percentages the packing algorithm computed, so the packing math stays
exact as required. This replaces the old `left: 3px; right: 3px` rule,
which no longer makes sense once `left`/`width` are set inline per block
(that rule was fighting the new inline percentages before this change).

## Golden-master fixture update

`tests/fixtures/selectors-golden.json` has 6 `week/*` entries (produced by
feature #14). None of the seeded events in any of those 6 scenarios overlap
another event on the same day (max 2 events per day in the fixture, e.g.
`ev10` 11am-1pm and `ev9` 6pm-8pm on 2026-07-24 — sequential, no overlap).
So every existing `WeekBlock` entry's correct new value is mechanically
`left: 0, width: 100` — the unchanged-behavior case, not a new golden-master
scenario. I wrote a small Node script (not committed, run inline) that
walked every `week/*` fixture entry's `days[].blocks[]` and added those two
fields where missing, rather than hand-editing or reconstructing the
fixture. Confirmed no fixture entry already had 3+ same-day events that
would have needed non-trivial values.

## Test results

- `bash init.sh`: exit 0.
  - ESLint: clean (4 pre-existing warnings, unrelated to this feature, 0
    errors).
  - `tsc --noEmit`: clean.
  - Vitest: **565/565 passed** (558 pre-existing + 7 new in
    `week-overlap.test.ts`; `selectors-parity.test.ts` still green with the
    updated fixture).
- `pnpm build`: succeeded (Next.js 16 production build, all routes
  compiled, static pages generated).

New tests in `tests/unit/week-overlap.test.ts` (all against `buildWeekData`,
no mocks — pure logic):

1. Identical start+end → both `width: 50`, deterministic `left: 0`/`left:
   50` tie-broken by id.
2. Triple mutual overlap → all three `width ≈ 33.33` (tolerance
   comparison), three distinct `left` values (0, 33.33, 66.67).
3. Chained partial overlaps (A 9-10, B 9:30-10:30, C 10:15-11:00, A/C don't
   intersect) → all three share `width: 50`; for every pair whose ranges DO
   intersect (A-B, B-C), their `[left, left+width]` ranges are disjoint.
4. Non-overlapping sequential events → each independently `left: 0, width:
   100`.
5. Touching-but-not-overlapping (A ends exactly when B starts) → both
   `left: 0, width: 100` (strict `<`/`>` overlap test, not `<=`/`>=`).
6. Determinism — identical input run twice produces `toEqual`-identical
   `left`/`width` arrays.
7. Mixed day — a lone non-overlapping event stays full width while a
   separate overlapping pair on the same day splits 50/50, proving clusters
   are computed independently within one day.

## NOT verified by me (explicit)

This is pure client-side layout math with no server/DB involvement, so the
main gap is the **actual visual appearance in a real browser**:

- Whether the 2px margin gutter actually looks like a clean visual gap
  between side-by-side cards, or looks too tight/too wide at real screen
  widths.
- Whether `text-overflow: ellipsis` actually engages and looks acceptable
  on `.blockTime` at genuinely narrow widths (e.g. a 3-4-way overlap), since
  I only reasoned about this, I did not render it.
- Whether each card is independently clickable in a real browser at narrow
  widths (the DOM/CSS structure should guarantee this per the reasoning in
  the brief — separate absolutely-positioned siblings, no overlay — but I
  did not click through it in a live page). I did re-check
  `WeekView.module.css` for any full-size overlay class that could swallow
  clicks meant for a neighboring card and found none — `.nowLine` is the
  only other absolutely-positioned element inside `.dayColumn`, it existed
  before this feature, is unrelated to it (draws the current-time line, not
  an event card), and only occupies a 2px-tall horizontal strip via
  `border-top` (its own `height: 0`), so it is not a plausible source of a
  full-column click-swallowing overlay.
- General visual polish (spacing, whether colors/contrast still read well
  at e.g. 33% width) — not something a unit test can confirm.

I did not run `next dev`/`next build && next start` for a manual visual
check, per the brief noting this is optional and that the leader will do
the real-browser check. Did not touch port 3000 or any other dev server.

## Review cycle 1 fix

**Defect (confirmed correct by the reviewer's citation):** the original
`.block` CSS used `position: absolute; box-sizing: border-box; margin: 0 2px`
with `left`/`width` set inline as plain percentages and no `right` declared
anywhere. Per CSS2.1 §10.3.7, when `left` and `width` are both specified and
`right` is `auto`, `right` is solved for and does not constrain layout — the
margin box's left edge sits at `left`, then `margin-left` is unpainted
space, then the **border box** (exactly `width` wide, since
`box-sizing: border-box` only affects how padding/border count inside
`width`, never margin) is painted, then `margin-right` follows *outside*
that border box. So for the right-most column of any split, where
`left% + width% = 100%` by construction (columns tile edge-to-edge with no
gap), the painted border box's right edge lands at `100% + margin-right` =
`100% + 2px` — 2px past the day column's own right edge, with no
`overflow: hidden` anywhere in the ancestor chain (`.dayColumn`/`.gridBody`/
`.wrapper`) to clip it, bleeding into the next day's column (or off the
grid entirely on the week's last day).

**Fix applied**, confined to `components/WeekView.tsx` and
`components/WeekView.module.css` only (the packing algorithm in
`lib/selectors.ts` and the golden-master fixture were not touched, per the
reviewer's instruction):

- `components/WeekView.tsx`: the block's inline style now bakes the 2px
  gutter directly into the `calc()` expressions computed from the same
  `b.left`/`b.width` percentages already produced by
  `computeOverlapLayout`:
  ```ts
  left: `calc(${b.left}% + 2px)`,
  width: `calc(${b.width}% - 4px)`,
  ```
  (2px inset from each side of the block's own `[left%, left%+width%]`
  slot, 4px removed from width total — one gutter contributed by each of
  the block's own two edges, so adjacent blocks each shrink toward their
  own center and never rely on a neighbor's margin to create the gap.)
- `components/WeekView.module.css`: removed the `margin: 0 2px` rule
  entirely from `.block` (kept `box-sizing: border-box`) and replaced the
  comment to explain the new `calc()`-based approach and why a plain
  `margin` cannot achieve it (see Defect above).

**Algebraic re-verification that the painted box never exceeds its
column's `[left%, left%+width%]` slot, for splits of every size actually
exercised by `computeOverlapLayout`:**

For any block with computed packing values `left = L%`, `width = W%`
(where, for the right-most column of an N-column split, `L + W = 100`):

- Painted left edge = `L% + 2px` → strictly inside the slot's left edge
  (`L%`) by 2px, never past it (2px ≥ 0, and `L% ≥ 0` since `L` is a
  non-negative column index times the equal-fraction width).
- Painted right edge = `(L% + 2px) + (W% - 4px)` = `L% + W% - 2px`.
  - **2-column 50/50 split** (`totalColumns = 2`): column 0 → `left:
    calc(0% + 2px)`, `width: calc(50% - 4px)`, right edge = `0 + 50 - 2 =
    48%` (inside its `[0%,50%]` slot). Column 1 (right-most) → `left:
    calc(50% + 2px)`, `width: calc(50% - 4px)`, right edge = `50 + 50 - 2 =
    98%`, i.e. **2px inside** the day column's `100%` right edge, not past
    it — this is the exact case the reviewer asked to confirm.
  - **3-column split** (`totalColumns = 3`, widths ≈33.33% each): right-most
    column has `L = 66.67`, `W = 33.33`, `L + W = 100` exactly (by
    construction of `width = 100/totalColumns`, `left = column * width`).
    Right edge = `100% - 2px` — 2px inside the day column's edge. Same
    algebra as the 2-column case since it only depends on `L + W = 100` for
    the right-most column, which holds for any `totalColumns` (the packing
    always tiles the columns to exactly fill 0-100%).
  - **General N-column split**: for the right-most column, `left = (N-1) *
    (100/N)`, `width = 100/N`, so `left + width = 100` always, and the
    painted right edge is always `100% - 2px` regardless of `N`. Every
    non-right-most column's painted right edge is `(L+W)% - 2px`, and since
    `L + W ≤ 100` for any non-right-most column (its slot ends at or before
    the next column's slot begins), its painted right edge is always
    ≤ `98%` — always inside the day column, never bleeding into a
    neighbor's slot.
  - Painted left edge for the left-most column (`L = 0`): `0% + 2px`, i.e.
    2px inside the day column's own left edge (border, per `.dayColumn`) —
    never negative, never outside.
- Minimum width sanity: `computeOverlapLayout` never produces `width < 100 /
  totalColumns` below what this repo's realistic event density would ever
  drive to an unreadable or negative post-`calc()` width (see the
  Minimum-readable-width section above — no floor logic was deemed
  necessary, and 4px subtracted from even a narrow 25% (`totalColumns = 4`)
  split still leaves a large positive width at any real day-column pixel
  width).

**Verification after the fix:**

- `bash init.sh`: exit 0 — ESLint clean (same 4 pre-existing, unrelated
  warnings, 0 errors), `tsc --noEmit` clean, **Vitest 565/565 passed**
  (unchanged — this was a CSS/inline-style-only fix, no pure-logic behavior
  changed, so no test assertions needed updating).
- `pnpm build`: succeeded (Next.js 16.2.11 production build, all 9 routes
  compiled and generated, no errors).
- Confirmed via `git diff` that only `components/WeekView.tsx` and
  `components/WeekView.module.css` changed for this fix; `lib/selectors.ts`
  and `tests/fixtures/selectors-golden.json` are untouched, per the
  reviewer's instruction.

Still NOT verified by me: the actual visual rendering in a real browser
(whether the 2px gutter now looks clean and whether the rightmost card
visibly stays inside its day column) — this requires the pending
leader/user live-browser check noted in `progress/review_week_overlap_layout.md`'s
"Pending live/manual checks" section, which the CSS-spec-level algebra above
supports but does not substitute for.
