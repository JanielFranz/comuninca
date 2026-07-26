# Implementation Report — Feature #5: `ci_verify_pipeline`

## Date

2026-07-25

## Files touched

| File                       | Action   | Notes                                                                                                         |
| -------------------------- | -------- | ------------------------------------------------------------------------------------------------------------- |
| `.github/workflows/ci.yml` | Created  | Verify job: checkout → pnpm setup → install → prisma validate/generate → lint → prettier → tsc → test → build |
| `package.json`             | Modified | Added `test`, `format:check`, `format` scripts; changed `lint` from `next lint` to `eslint .`                 |
| `eslint.config.mjs`        | Created  | ESLint 9 flat config extending `eslint-config-next` (Next.js core-web-vitals rules)                           |
| `.prettierrc`              | Created  | Prettier config: `semi: false`, `singleQuote: false`, `tabWidth: 2`, `trailingComma: "all"`                   |
| `.prettierignore`          | Created  | Ignores `.next`, `node_modules`, `pnpm-lock.yaml`, `prisma/migrations`, `WorkTree`                            |
| `pnpm-workspace.yaml`      | Modified | Fixed `unrs-resolver: true` (was placeholder text)                                                            |

Additionally, `pnpm format` reformatted all existing source files to match the new Prettier config. Only formatting changes (trailing commas, semicolons, quotes) — no logic changes.

## Decisions

1. **ESLint: `eslint` v9 + `eslint-config-next` instead of `next lint`.** Next.js 16 removed the `next lint` subcommand from the CLI. The `eslint-config-next` package provides the same ruleset as a flat-config-compatible ESLint plugin. ESLint 9 was chosen over ESLint 10 because `eslint-plugin-react` 7.x (required by `eslint-config-next`) is incompatible with ESLint 10's `context.getFilename()` removal.

2. **`--passWithNoTests` for vitest.** Since no test files exist yet (they'll come in feature #18), the test script uses `vitest run --passWithNoTests` so CI doesn't fail on an empty test suite.

3. **`WorkTree` in `.prettierignore`.** The git worktree directory contains merge-conflicted files that would break Prettier check. Excluding it keeps the format check clean.

4. **`pnpm-workspace.yaml` fix.** The `unrs-resolver` entry had placeholder text `"set this to true or false"` preventing the eslint dependency from building.

## Verification evidence

All commands pass locally:

```
pnpm exec prisma validate  →  The schema is valid 🚀
pnpm lint                  →  ESLint clean (0 errors, 2 warnings)
pnpm exec prettier --check . →  All matched files use Prettier code style!
pnpm exec tsc --noEmit     →  TypeScript typecheck clean
pnpm test                  →  No test files found, exiting with code 0
pnpm build                 →  Compiled successfully in 2.9s
bash init.sh               →  [OK] Environment ready. You can start working. (exit 0)
```

### Acceptance criteria mapping

| AC                                                                | Status      | Evidence                                                    |
| ----------------------------------------------------------------- | ----------- | ----------------------------------------------------------- |
| The verify workflow runs on a PR and is green                     | ✅ Ready    | CI YAML matches Blueprint §7; all steps verify locally      |
| A failing lint, typecheck, unit-test, or build step blocks the PR | ✅ Designed | Each step is a separate `run:` — any failure exits non-zero |

CI YAML triggers on `push: [main]` + `pull_request: [main]` with 9 sequential steps, each blocking on failure. The `vitest` step uses `--passWithNoTests` for the current "no tests" state (test files arrive in feature #18, and the flag ensures CI doesn't fail prematurely).

## Deviations from feature spec

- **`"lint": "eslint ."` instead of `"lint": "next lint"`.** Next.js 16 CLI no longer has a `lint` subcommand. The same `eslint-config-next` ruleset is used via `eslint.config.mjs`.
- **`.eslintrc.json` → `eslint.config.mjs`.** ESLint 9+ uses flat config. The feature spec's `.eslintrc.json` format is ESLint 8 legacy.
- **`devDependencies` added:** `eslint` and `eslint-config-next` (required for `eslint` to work without Next.js CLI).
