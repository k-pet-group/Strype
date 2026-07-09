# Progress tracking

Snapshot taken 2026-07-09 with:

```
rg '\.wait\(\s*\d|waitForTimeout\(\s*\d' tests
```

729 occurrences across 42 files. Counts are hard-coded numeric waits only —
`cy.wait("@alias")` (waiting on a network intercept) is already correct
practice and is **not** counted or in scope.

Re-run the command above before resuming, since counts will drift as the
conversion progresses and as specs change for unrelated reasons. Check a box
and add a one-line note when a file is done; if some waits in a file were
deliberately kept, say why instead of checking it off as fully done.

## Shared support/helper files (do these first — see PLAN.md)

| Done | File | Waits (snapshot) | Notes |
|---|---|---|---|
| [ ] | `tests/playwright/support/editor.ts` | 5 | keypress/paste helpers, see RECIPES.md |
| [ ] | `tests/playwright/support/loading-saving.ts` | 4 | |
| [ ] | `tests/playwright/support/dividers.ts` | 3 | drag-settle waits, see RECIPES.md |
| [ ] | `tests/cypress/support/paste-test-support.ts` | 5 | paste/save/load round trip, see RECIPES.md |
| [ ] | `tests/cypress/support/expression-test-support.ts` | 3 | |
| [ ] | `tests/cypress/support/autocomplete-test-support.ts` | 3 | |
| [ ] | `tests/cypress/support/param-prompt-support.ts` | 3 | |
| [ ] | `tests/cypress/support/load-save-support.ts` | 1 | |

## Spec files (descending count — see PLAN.md for why this order)

| Done | File | Waits (snapshot) | Notes |
|---|---|---|---|
| [ ] | `tests/playwright/e2e/rename-identifiers.spec.ts` | 139 | |
| [ ] | `tests/playwright/e2e/match-statement.spec.ts` | 105 | |
| [ ] | `tests/playwright/e2e/graphics.spec.ts` | 41 | |
| [ ] | `tests/playwright/e2e/structured-expressions.spec.ts` | 35 | |
| [ ] | `tests/playwright/e2e/structured-expressions-media.spec.ts` | 32 | |
| [ ] | `tests/cypress/e2e/autocomplete-modules.cy.ts` | 32 | |
| [ ] | `tests/playwright/e2e/structured-expressions-navigation.spec.ts` | 31 | |
| [ ] | `tests/cypress/e2e/autocomplete-graphics-libs.cy.ts` | 29 | |
| [ ] | `tests/cypress/e2e/media-literals.cy.ts` | 29 | |
| [ ] | `tests/playwright/e2e/description-fields.spec.ts` | 27 | |
| [ ] | `tests/playwright/e2e/load-save-random.spec.ts` | 23 | |
| [ ] | `tests/playwright/e2e/load-save-dividers.spec.ts` | 21 | uses dividers.ts helper above |
| [ ] | `tests/cypress/e2e/autocomplete-user-defined.cy.ts` | 21 | |
| [ ] | `tests/playwright/e2e/structured-expressions-selection.spec.ts` | 16 | |
| [ ] | `tests/cypress/e2e/autocomplete.cy.ts` | 15 | |
| [ ] | `tests/cypress/e2e/translation.cy.ts` | 13 | |
| [ ] | `tests/playwright/e2e/structured-expressions-copy-paste.spec.ts` | 12 | |
| [ ] | `tests/playwright/e2e/frame-selection-manipulation.spec.ts` | 10 | |
| [ ] | `tests/playwright/e2e/storage-model.spec.ts` | 9 | |
| [ ] | `tests/cypress/e2e/autocomplete-more.cy.ts` | 8 | |
| [ ] | `tests/playwright/e2e/slot-errors.spec.ts` | 7 | |
| [ ] | `tests/playwright/e2e/scroll-into-view.spec.ts` | 7 | |
| [ ] | `tests/playwright/e2e/load-save-frozen-collapsed.spec.ts` | 7 | |
| [ ] | `tests/cypress/e2e/paste-python.cy.ts` | 7 | uses paste-test-support.ts helper above |
| [ ] | `tests/cypress/e2e/basics.cy.ts` | 6 | |
| [ ] | `tests/playwright/e2e/load-save-demos-books.spec.ts` | 5 | |
| [ ] | `tests/playwright/e2e/console-execution.spec.ts` | 3 | |
| [ ] | `tests/cypress/e2e/graphics.cy.ts` | 3 | |
| [x] | `tests/playwright/e2e/load-save-share.spec.ts` | 2 | Converted both, see Log |
| [ ] | `tests/cypress/e2e/load-save-share.cy.ts` | 2 | |
| [ ] | `tests/cypress/e2e/load-save.cy.ts` | 2 | |
| [ ] | `tests/cypress/e2e/structured-expressions-selection.cy.ts` | 1 | |
| [ ] | `tests/cypress/e2e/demos.cy.ts` | 1 | |
| [ ] | `tests/cypress/e2e/paste-python-misc.cy.ts` | 1 | |

## CI findings (from last 20 runs of each workflow, pulled 2026-07-09)

Pulled via `gh run list`/`gh api .../jobs` against `k-pet-group/Strype` (see
PLAN.md's CI section for why local runs don't show this). Not a full
investigation — good enough to steer priority, worth re-checking with more
runs/deeper log parsing later.

- **Playwright is where the flakiness actually lives, not Cypress.** Of the
  last 20 Playwright runs, **15 failed**, 1 was cancelled, 4 succeeded. Of
  the last 20 Cypress runs, **0 failed** (19 succeeded, 1 cancelled). Point
  the initiative's effort at `tests/playwright/*` first — see PLAN.md's
  ordering, but treat this as the top-level priority signal above it.
- **Shards 2 and 3 are both the slowest and the flakiest**, across both OS.
  Job-level stats across the 20 runs (`test (os, shard)`):

  | Job | Runs | Failures | Avg duration | Max duration |
  |---|---|---|---|---|
  | macos, shard 1 | 20 | 3 | 29 min | 37 min |
  | macos, shard 2 | 20 | 8 | 80 min | 118 min |
  | **macos, shard 3** | 20 | **14** | **76 min** | **124 min** |
  | ubuntu, shard 1 | 20 | 4 | 29 min | 34 min |
  | ubuntu, shard 2 | 20 | 3 | 66 min | 87 min |
  | ubuntu, shard 3 | 20 | 10 | 59 min | 76 min |

  Playwright's `--shard=N/3` splits spec files by count, not duration, so
  the heaviest spec files (`rename-identifiers.spec.ts`, 139 waits;
  `match-statement.spec.ts`, 105; the `structured-expressions*.spec.ts`
  family) likely landed together in shards 2/3. This means the biggest
  wait-count files in the table below (already first in line by that
  ordering) are also disproportionately the ones driving CI pain — the two
  prioritizations agree, which is a good sign.
- **Failures cluster, they don't isolate.** One sampled run (macOS, shard 2)
  had `2 failed / 26 flaky / 479 passed` in a single job — dozens of
  unrelated spec files (`console-execution`, `frame-selection-manipulation`,
  `graphics`, `load-save-frozen-collapsed`, `load-save-random`,
  `load-save-share`, `media-literal-edit`, `rename-identifiers`,
  `storage-model`, `structured-expressions-copy-paste`,
  `structured-expressions-navigation`) all needed a retry in the same run.
  That pattern — many unrelated tests wobbling together in one job — is
  more consistent with a CPU-starved runner (see PLAN.md's CI section) than
  with several independently-broken waits, and is exactly what "wait for
  the right condition, not a clock" should fix.
- **One named recurring flake worth a direct look**:
  `console-execution.spec.ts` → "Check console prints don't queue up after
  stopping" (the 30-second variant) failed 3 times including after 2
  retries in one sampled job — it's plausible this one is a genuine timing
  assertion (not just an arbitrary wait) that needs rethinking rather than
  a simple wait→condition swap.
- **Cypress's slowest specs**, from the durations `cypress-split` already
  records at `tests/cypress/timings/timings-python.json` (real recorded
  run times, no CI log parsing needed — reuse this file directly instead of
  re-deriving timings from logs):
  `structured-expressions-brackets.cy.ts` (840s),
  `param-prompts-user-defined.cy.ts` (600s),
  `param-prompts-objects-graphics.cy.ts` / `paste-python.cy.ts` (570s),
  `graphics.cy.ts` (540s), `param-prompts-python-library.cy.ts` (490s).
  None of these showed up as flaky in the 20-run sample, consistent with
  "Cypress isn't the problem" above.

**Net effect on ordering:** within the spec-file table below, treat
Playwright files — especially any that tend to land in shard 2/3 — as
higher priority than the raw wait-count ordering alone would suggest, and
treat Cypress files as lower urgency than Playwright files of a similar
wait-count.

## Log

Add a dated entry each session summarising what was converted, any new
pattern discovered (worth folding back into RECIPES.md), and any waits
deliberately left in place with a reason.

- 2026-07-09 — Planning only. Wrote PLAN.md, RECIPES.md, this file, and the
  root CLAUDE.md pointer. No conversions done yet.
- 2026-07-09 — Set up `gh` CLI access to `k-pet-group/Strype` and did a
  quick pass (not exhaustive) over the last 20 runs of each e2e workflow —
  see "CI findings" above. Headline: Playwright accounts for essentially
  all the flakiness (15/20 runs failed vs 0/20 for Cypress), concentrated
  in shards 2/3 on both OSes. Worth a deeper pass later (more runs, full
  per-test flaky-frequency counts) once conversions are underway.
- 2026-07-09 — First real conversion, done as a practice run (picked for
  small size, not by the time-savings ordering above):
  `tests/playwright/e2e/load-save-share.spec.ts`, both waits.
  - `waitForTimeout(1000)` after clicking `#shareMethodSnapshotButton`
    (waiting for the share link to land on the clipboard) → replaced with
    `expect.poll(() => page.evaluate("navigator.clipboard.readText()")).not.toBe("<empty>")`.
    Traced the handler (`Menu.vue`'s `copySnapshotLink`) — the clipboard
    write is fire-and-forget (promise not awaited) with no DOM signal tied
    to completion, so polling the clipboard's own content is the only
    faithful replacement.
  - `waitForTimeout(2000)` after clicking "New project" → replaced with
    `page.waitForURL(/\?new_project/)` + `page.waitForSelector("body")`,
    and bumped the existing `expect(...).toHaveCount(2)` assertion right
    after it to `{ timeout: 20000 }`. Traced this handler too
    (`App.vue`'s `onHideModalDlg`) — "New project" does a full
    `window.location.href` reload, not an in-place state reset, so the
    real completion signal is the navigation, and the post-reload mount
    genuinely can take a while.
  - **Reproduction was essential here** — this is a case the "before
    converting, set the wait to 0 and try to break it" step in PLAN.md
    was written for. At CPU throttle rate=6 (via CDP), zeroing both waits
    passed 5/5 with no failure, which looked like both waits were simply
    unnecessary. Only at rate=20 did the second wait's removal fail
    reliably (8/8), with `.frame-header` count stuck at 0 — the reload
    hadn't finished mounting inside the default 5s `expect` timeout. The
    fix isn't "remove the wait", it's "wait for the real signal
    (navigation) and give the follow-up assertion realistic headroom",
    since a full page reload is genuinely slower than the DOM changes this
    initiative's other waits are standing in for.
  - Note for later CDP-throttling attempts: the CDP session's
    `Emulation.setCPUThrottlingRate` doesn't survive a full page
    navigation — it has to be re-armed via a fresh `newCDPSession(page)`
    call after any `page.goto`/navigation if you want throttling to keep
    applying afterwards.
  - Verified: 8/8 passes at CPU throttle rate=20 (same rate that reliably
    broke the pre-fix version), plus 3/3 at normal speed and a full
    8-fixture run of the file at normal speed. `eslint` clean.
  - Ran via local dev server (`npm run serve:python:testing`) with
    `BASE_URL=http://localhost:8081/editor/ SPEC=tests/playwright/e2e/load-save-share.spec.ts
    npx playwright test --project=chromium` — much faster to iterate with
    than the full `npm run test:playwright` (which rebuilds a production
    bundle every run).
