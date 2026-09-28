# Review — feature 18 week_overlap_layout

**Verdict:** APPROVED

**Cycle:** 2 of 2 (final). Cycle 1 was CHANGES_REQUESTED for one defect (the
`.block` margin gutter bled 2px past the day column's right edge on the
rightmost column of any multi-column split). That defect is fixed in this
cycle; everything else verified in cycle 1 (algorithm correctness, fixture
correctness, layering/hygiene) is unchanged and re-confirmed below by mtime.

## What changed since cycle 1

`components/WeekView.tsx:52-53` now sets:
```ts
left: `calc(${b.left}% + 2px)`,
width: `calc(${b.width}% - 4px)`,
```
and `components/WeekView.module.css`'s `.block` no longer has `margin: 0 2px`
(removed entirely; `box-sizing: border-box` kept). Confirmed via mtime that
**only** `components/WeekView.tsx` and `components/WeekView.module.css`
changed (both `17:06:4x`, `2026-09-27`); `lib/selectors.ts`, `lib/types.ts`,
`tests/unit/week-overlap.test.ts`, and `tests/fixtures/selectors-golden.json`
all still carry their cycle-1 timestamps (`16:54:10`–`16:56:05`), i.e.
untouched. `git status --short` shows exactly `components/WeekView.module.css`,
`components/WeekView.tsx`, `lib/selectors.ts` as modified relative to HEAD —
the `lib/selectors.ts` entry is pre-existing (unchanged content since cycle 1,
confirmed by identical mtime `16:54:37`); it shows as modified only because
this whole feature is still uncommitted relative to the base branch, not
because it changed in this cycle.

## Re-verified algebra (executed reasoning, both 2- and 3-column cases, generalized)

With `margin` removed and no `margin-left`/`margin-right` (default 0), and
`right` still unset (`auto`), the absolutely-positioned box's algorithm
(CSS2.1 §10.3.7, left+width specified, right auto) now places the **margin
box** (== border box, since margin is 0) left edge directly at the `calc()`
value:

- Border box left edge = `left% + 2px`
- Border box width = `width% - 4px` (border-box sizing, so this is the full
  painted width)
- Border box right edge = `left% + 2px + width% - 4px = left% + width% - 2px`

For any column `c` of `N` in an exact tiling (`left = c/N·100`,
`width = 100/N`, so `left+width` for column `c` is `(c+1)/N·100`):

- **2-column split** (`N=2`): col 0 → `[0+2px, 50%-2px]`; col 1 →
  `[50%+2px, 100%-2px]`. Rightmost edge = **100% − 2px** (inside the
  boundary, not outside as in cycle 1's `100% + 2px`). Gap between the two
  painted boxes = 4px (2px+2px), no overlap. Leftmost edge = **+2px** (not
  negative).
- **3-column split** (`N=3`): col 0 → `[2px, 33.33%-2px]`; col 1 →
  `[33.33%+2px, 66.67%-2px]`; col 2 → `[66.67%+2px, 100%-2px]`. Same
  pattern: every internal gap is 4px, rightmost edge is `100%-2px`, leftmost
  is `+2px`. No overlap between adjacent columns, no overflow past either
  boundary.
- **General case**: for column `c` of `N`, right edge = `(c+1)/N·100 - 2px`.
  At `c=N-1` (last column) this is `100% - 2px < 100%` for any `N ≥ 1` — the
  fix generalizes to any column count because it's a fixed ±2px inset
  applied uniformly on top of the unchanged exact-tiling percentages from
  `lib/selectors.ts` (which I re-confirmed is byte-unchanged since cycle 1 by
  mtime — the packing math itself was never in question). Left edge at
  `c=0` is `0% + 2px > 0`, never negative for any `N`.

This closes the cycle-1 defect: the rightmost card's painted box is now
strictly inside `[0, 100%]` of its day column, so it cannot bleed into the
next day's column.

## Stray-overflow check (`min-width`, etc.)

Grepped `components/WeekView.module.css` for `min-width`/`max-width`/
`min-height`: no matches. `.block` has no width constraint other than the
inline `calc()` value, so nothing can force it wider than
`width% - 4px` regardless of column count. (At very high column counts this
`calc()` could in principle yield a very narrow or even sub-zero pixel width
before the percentage term dominates, but that's the same realistic-density
minimum-readable-width simplification already accepted in cycle 1 — not a
regression introduced by this fix, and not newly in scope for this cycle.)

## Re-run verification (executed this cycle)

- `bash init.sh` → exit 0. ESLint: 0 errors, 4 pre-existing unrelated
  warnings (same as cycle 1: `app/layout.tsx`, `AddEventModal.tsx`,
  `usersQuery.ts`, `selectors-parity.test.ts`). `tsc --noEmit`: clean.
  Vitest: **565/565 passed** (21 test files) — unchanged from cycle 1, as
  expected for a pure CSS/inline-style fix with no logic change.
- `pnpm build` → succeeded (Next.js 16.2.11, Turbopack, all 9 routes
  compiled and generated), no new warnings.

## Carried forward from cycle 1 (still holds, re-confirmed by mtime/content, not re-derived from scratch)

- `computeOverlapLayout` (`lib/selectors.ts:155-231`) connected-components +
  greedy column sweep: correct, traced by hand and by executed probe in
  cycle 1 against identical pair, triple overlap, the spec's chained A/B/C
  example, the A/B/C/D chain, and three adversarial cases (containment,
  hub-and-spoke, two-identical+bridge+tail) — all collision-free for every
  truly-overlapping pair, `totalColumns` genuinely shared per component.
  Strict `<`/`>` overlap comparison confirmed (not `<=`/`>=`).
- Golden-master fixture (`tests/fixtures/selectors-golden.json`): untouched
  this cycle (mtime identical to cycle 1); previously verified every
  `week/*` block's `top`/`height` against the seed-data formula and
  confirmed from actual seed event times that no fixture day has real
  overlaps, so every added `{left:0,width:100}` is correct.
- Click safety: `.hourLine` remains non-positioned (normal flow), `.block`
  remains the only positioned, clickable element per event, no `z-index`
  anywhere in the file, no shared overlay — unchanged from cycle 1.
- Layering/hygiene: no `any`, no `console.*` in any touched file;
  `lib/actions/*`, `prisma/**`, `proxy.ts`, `lib/auth.ts` untouched (mtime
  isolation re-confirmed: `lib/actions/*` all at/before `16:33:16`, this
  feature's files all `16:54:10` or later); `git status --short
  prisma/migrations` empty.

## Checkpoints

- C1: [x] Harness files, rules, specs, agents all present; `bash init.sh`
  exits 0.
- C2: [x] Exactly one feature `in_progress` (id 18); `depends_on: [14]` is
  `done`.
- C3: [x] The cycle-1 gutter-overflow defect is fixed (see algebra above);
  layering otherwise holds (pure selector, no DB/auth/Server Action touched
  this cycle or in cycle 1).
- C4: [x] `pnpm test` → 565/565 green; `tsc --noEmit` clean; `pnpm lint`
  clean (0 errors); no Supabase/DB involved (this feature has none).
- C5: [x] No suspicious untracked files added; only the feature's listed
  files plus progress notes changed.

## Required changes

None.

## Observations (non-blocking, carried from cycle 1, unchanged)

- `tests/unit/week-overlap.test.ts:157-167` (determinism test) only reruns
  the same input order rather than also checking a shuffled copy of the
  same events; the code's total sort key (`startMin` then `id`) makes this
  very unlikely to mask a bug, so still non-blocking.
- The greedy sweep sometimes reuses columns for non-overlapping members of
  the same component (e.g. A/C in the chained case) rather than spreading
  them out — tight/optimal packing, explicitly allowed by the design
  decision, not a bug.

## Pending live/manual checks (leader/user, real browser)

Not verifiable by unit tests or static reasoning — the leader/user should
still confirm these in a real render (`next build && next start -p 3300`,
stopped afterward, or the leader's own dev server on 3000 — do not start a
second `next dev`):

1. **Visual gutter appearance**: does the new calc()-based 4px gap between
   side-by-side cards look clean at real day-column widths, and does the
   rightmost card visibly stay inside its day's column with no bleed into
   the next day (this cycle's fix is now provably correct at the CSS-spec
   level, but the leader should still eyeball it once).
2. **Truncation engaging**: with 3-4+ simultaneous overlapping events, does
   `.blockTitle`/`.blockTime`'s `text-overflow: ellipsis` actually engage
   and remain legible, per AC 3.3.14.
3. **Click-through**: with two or more side-by-side cards on screen,
   clicking each one opens only that card's own detail modal (AC 3.3.15) —
   confirm no misclick lands on a neighboring card.
4. General visual polish (spacing, color/contrast legibility at ~33% or
   narrower widths) — not testable outside a browser.
