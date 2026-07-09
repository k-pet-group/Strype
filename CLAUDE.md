# Strype — notes for Claude Code

Strype (https://strype.org) is a frame-based Python editor that runs entirely
client-side, built with Vue. Maintained by the K-PET group at King's College
London. See [README.md](README.md) for build/run basics.

## Key commands

- `npm run serve:python` — run a local dev server (standard/Python platform).
- `npm run build:python` — production build.
- `npm run lint:check` / `npm run type:check` — ESLint / vue-tsc.
- `npm run test:cypress` — full Cypress suite (spins up dev server + asset
  server itself via `start-server-and-test`).
- `npm run test:playwright` — full Playwright suite (same pattern).
- Single Playwright file: `SPEC=tests/playwright/e2e/<name>.spec.ts npm run test:playwright`
- Single Cypress file: open the Cypress runner (`npx cypress open`) against
  the already-running dev server, or filter via `cypress-split` env vars.

## Test layout

- `tests/cypress/e2e/*.cy.ts` + `tests/cypress/support/*.ts` — Cypress specs
  and shared helpers.
- `tests/playwright/e2e/*.spec.ts` + `tests/playwright/support/*.ts` —
  Playwright specs and shared helpers.
- `tests/unit` — Vitest unit tests (not part of the initiative below).

## Active initiative: de-flaking the e2e suites

There is an ongoing effort to remove hard-coded timeouts (`cy.wait(1234)`,
`page.waitForTimeout(1234)`) from the Cypress/Playwright suites and replace
them with waits on an actual observable condition. This is a large,
multi-session task — full plan, conversion recipes, and file-by-file
progress tracking live in **[docs/claude-improve-testing/](docs/claude-improve-testing/)**.

If you're picking this task back up, read `docs/claude-improve-testing/PLAN.md`
first, then `PROGRESS.md` to see what's already done, then `RECIPES.md` for
the conversion patterns already worked out for this codebase. Update
`PROGRESS.md` as you go so the next session (possibly on a different
machine) can resume without re-deriving anything.
