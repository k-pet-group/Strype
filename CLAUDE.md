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

## Past initiative: de-flaking the e2e suites (paused, 2026-07-15)

There was an effort to remove hard-coded timeouts (`cy.wait(1234)`,
`page.waitForTimeout(1234)`) from the Cypress/Playwright suites and replace
them with waits on an actual observable condition. It's paused, not
finished — CI has been green recently, but per the tracking table roughly
20 of ~35 spec files were still unconverted (including all of
`autocomplete-*.cy.ts`, `structured-expressions-navigation.spec.ts`,
`description-fields.spec.ts`, `frame-selection-manipulation.spec.ts`, and
several `load-save-*` files), and CI-tuning work (macOS worker/job
splitting, timeout adjustments, resource-usage logging for hang diagnosis)
was still ongoing, when work stopped.

The working docs (`PLAN.md`, `PROGRESS.md`, `RECIPES.md`,
`WEBKIT_STOP_INVESTIGATION.md`) were removed from the repo at commit
`e5c91b29` (the last commit where they're present). To resurrect them:

```
git checkout e5c91b29 -- docs/claude-improve-testing
```

`PROGRESS.md`'s file-by-file table and dated log are the best starting
point for resuming — they record what's converted, what's deliberately
left alone and why, and several real product bugs found along the way.
`WEBKIT_STOP_INVESTIGATION.md` is also still cited by path (as of that same
commit) three times — twice in `.github/workflows/run-playwright-tests.yml`
(the isolated single-worker WebKit job, and the resource-monitor step) and
once in `playwright.config.ts` (the macOS worker-count comment) — check
those comments still match if this work resumes and the file's restored.
