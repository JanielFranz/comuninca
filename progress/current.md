# Current Session

> Cleared when each session closes; its summary moves to `history.md`. While
> working, **keep this updated in real time**, not at the end.

- **Feature in progress:** _none_
- **Date:** _—_

## Plan

_—_

## Log

_—_

## Environment notes

- pnpm 11.x (11.9.0 now). Next 16.2.11 (`proxy.ts`). Hosted Supabase only. Server clock for "today" is America/Lima.
- pnpm 11.9 blocks all commands on an undecided build-script entry in `pnpm-workspace.yaml` (`allowBuilds`); a new dependency with an install script will need an explicit true/false there. `esbuild` is `true`.
- Next 16.2.11 refuses a second `next dev` in the same repo directory regardless of port; reuse the running one or use `next start` on another port.
- User asked to work through #17-#20; all four done and live-verified. Stopped here per instruction.
