#!/usr/bin/env bash
# init.sh — environment + harness sanity check for the Comuninca repo.
# Must finish with exit code 0 before any work session starts, and again
# before any feature is declared `done`.
#
#   SKIP_TESTS=1 bash init.sh   # skip lint/typecheck/tests (CI runs them separately)

set -u
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; NC='\033[0m'
ok()   { printf "${GREEN}[OK]${NC}   %s\n" "$1"; }
warn() { printf "${YELLOW}[WARN]${NC} %s\n" "$1"; }
fail() { printf "${RED}[FAIL]${NC} %s\n" "$1"; }

EXIT_CODE=0

echo "── 1. Checking environment ─────────────────────────────"

if ! command -v node >/dev/null 2>&1; then
  fail "Node.js is not installed or not on PATH."
  exit 1
fi
ok "node -> $(node --version)"

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt 20 ]; then
  fail "Node >= 20 is required (Next.js 16 / React 19)."
  EXIT_CODE=1
else
  ok "Node version compatible"
fi

if command -v pnpm >/dev/null 2>&1; then
  ok "pnpm -> $(pnpm --version)"
else
  fail "pnpm is not installed — all tooling runs through pnpm (https://pnpm.io). Try: corepack enable pnpm"
  EXIT_CODE=1
fi

echo ""
echo "── 2. Checking harness files ───────────────────────────"

for f in AGENTS.md CHECKPOINTS.md feature_list.json opencode.json \
         progress/current.md progress/history.md \
         docs/user-stories.md docs/technical-blueprint.md \
         .opencode/agent/leader.md .opencode/agent/implementer.md .opencode/agent/reviewer.md \
         .opencode/rules/architecture.md .opencode/rules/conventions.md .opencode/rules/verification.md; do
  if [ ! -f "$f" ]; then
    fail "Missing harness file: $f"
    EXIT_CODE=1
  else
    ok "Exists $f"
  fi
done

if node -e 'JSON.parse(require("fs").readFileSync("opencode.json","utf8"))' 2>/dev/null; then
  ok "opencode.json is valid JSON"
else
  fail "opencode.json is not valid JSON"
  EXIT_CODE=1
fi

echo ""
echo "── 3. Validating feature_list.json ─────────────────────"

node -e '
const fs = require("fs");
let data;
try { data = JSON.parse(fs.readFileSync("feature_list.json", "utf8")); }
catch (e) { console.log("[FAIL] feature_list.json is not valid JSON: " + e.message); process.exit(1); }

const features = data.features || [];
const valid = new Set((data.rules && data.rules.valid_status) || ["pending","in_progress","done","blocked"]);
const ids = features.map(f => f.id);
const byId = Object.fromEntries(features.map(f => [f.id, f]));
const errors = [];

if (ids.length !== new Set(ids).size) errors.push("Duplicate feature ids");

const inProgress = features.filter(f => f.status === "in_progress").map(f => f.id);
if (inProgress.length > 1) errors.push(inProgress.length + " features in_progress (max 1): " + inProgress.join(", "));

for (const f of features) {
  if (!valid.has(f.status)) errors.push("Feature " + f.id + ": invalid status " + f.status);
  for (const dep of (f.depends_on || [])) {
    if (!(dep in byId)) errors.push("Feature " + f.id + ": depends_on references unknown id " + dep);
    else if (dep === f.id) errors.push("Feature " + f.id + ": depends on itself");
  }
  if (f.status === "in_progress" || f.status === "done") {
    const notDone = (f.depends_on || []).filter(d => !(byId[d] && byId[d].status === "done"));
    if (notDone.length) errors.push("Feature " + f.id + " is " + f.status + " but dependencies " + notDone.join(", ") + " are not done");
  }
}

if (errors.length) { for (const e of errors) console.log("[FAIL] " + e); process.exit(1); }
const done = features.filter(f => f.status === "done").length;
console.log("[OK]   feature_list.json valid (" + features.length + " features, " + done + " done, " + inProgress.length + " in progress)");
'
if [ $? -ne 0 ]; then EXIT_CODE=1; fi

echo ""
echo "── 4. Checking dependencies ────────────────────────────"

if [ ! -d "node_modules" ]; then
  fail "node_modules/ missing — run: pnpm install"
  EXIT_CODE=1
else
  ok "node_modules present"
fi

echo ""
echo "── 5. Lint · typecheck · tests ─────────────────────────"

if [ "${SKIP_TESTS:-0}" = "1" ]; then
  warn "SKIP_TESTS=1 — lint/typecheck/test execution delegated to the caller (CI)."
elif [ ! -d "node_modules" ]; then
  warn "Skipping checks until dependencies are installed."
else
  # ESLint is configured by feature #5 (ci_verify_pipeline). Until then the
  # repo's "lint" script (next lint) may not run on Next 16 — skip with a warn
  # instead of failing the gate.
  if ls eslint.config.* >/dev/null 2>&1 || ls .eslintrc* >/dev/null 2>&1; then
    if pnpm lint; then ok "ESLint clean"; else fail "ESLint reported problems"; EXIT_CODE=1; fi
  else
    warn "No ESLint config yet (feature #5) — skipping lint."
  fi

  if pnpm exec tsc --noEmit; then ok "TypeScript typecheck clean"; else fail "TypeScript errors"; EXIT_CODE=1; fi

  # Vitest arrives with feature #5, Playwright with #22. Run the suite only
  # once a test script AND test files exist.
  HAS_TEST_SCRIPT=$(node -e 'const s=(require("./package.json").scripts)||{};process.stdout.write(s.test?"1":"0")')
  if [ "$HAS_TEST_SCRIPT" = "1" ] && [ -d "tests" ] && [ -n "$(find tests -name '*.test.*' -print -quit 2>/dev/null)" ]; then
    if pnpm test; then ok "Vitest suite green"; else fail "Test suite is red"; EXIT_CODE=1; fi
  else
    warn "No test script/files yet (features #5/#18+) — skipping tests."
  fi
fi

echo ""
echo "── 6. Review ───────────────────────────────────────────"

if [ $EXIT_CODE -eq 0 ]; then
  ok "Environment ready. You can start working."
else
  fail "Environment not ready. Resolve all errors before continuing."
fi

exit $EXIT_CODE
