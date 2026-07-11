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
| [x] | `tests/playwright/support/editor.ts` | 5 | Converted all (6 incl. one non-literal), added prod nextTick hook, see Log |
| [x] | `tests/playwright/support/loading-saving.ts` | 4 | Converted all 4; one had a real CI-caught bug, fixed 2026-07-10 -- see Log |
| [x] | `tests/playwright/support/dividers.ts` | 3 | Converted all 3, see Log |
| [x] | `tests/cypress/support/paste-test-support.ts` | 5 | Converted all 5, see Log |
| [x] | `tests/cypress/support/expression-test-support.ts` | 3 | Converted all 3, see Log |
| [x] | `tests/cypress/support/autocomplete-test-support.ts` | 3 | Converted all 3, see Log |
| [x] | `tests/cypress/support/param-prompt-support.ts` | 3 | Converted all 3, see Log |
| [x] | `tests/cypress/support/load-save-support.ts` | 1 | Converted, see Log |

## Spec files (descending count — see PLAN.md for why this order)

| Done | File | Waits (snapshot) | Notes |
|---|---|---|---|
| [x] | `tests/playwright/e2e/rename-identifiers.spec.ts` | 139 | Converted 138/139; 1 deliberately kept (waiting to prove a popup does NOT appear) -- see Log |
| [x] | `tests/playwright/e2e/match-statement.spec.ts` | 105 | Converted all 105, see Log |
| [x] | `tests/playwright/e2e/graphics.spec.ts` | 41 | Converted 40/41; 1 deliberately kept (waiting for an exception to manifest, not a state) -- see Log |
| [x] | `tests/playwright/e2e/structured-expressions.spec.ts` | 35 | Converted all 35; found+fixed a real bug in the shared waitForEditorSettled() helper along the way -- see Log |
| [x] | `tests/playwright/e2e/structured-expressions-media.spec.ts` | 32 | Converted all 32 (Chromium skipped entirely in this file; validated firefox+webkit), see Log |
| [ ] | `tests/cypress/e2e/autocomplete-modules.cy.ts` | 32 | |
| [ ] | `tests/playwright/e2e/structured-expressions-navigation.spec.ts` | 31 | |
| [ ] | `tests/cypress/e2e/autocomplete-graphics-libs.cy.ts` | 29 | |
| [ ] | `tests/cypress/e2e/media-literals.cy.ts` | 29 | |
| [ ] | `tests/playwright/e2e/description-fields.spec.ts` | 27 | |
| [x] | `tests/playwright/e2e/load-save-random.spec.ts` | 23 | Converted all 23; found+fixed a real app bug (stale setTimeout in Menu.vue) that was causing most of this file's flakiness -- see Log. Remaining flakiness is content-generation edge cases in the fuzzer, not waits -- see Log |
| [ ] | `tests/playwright/e2e/load-save-dividers.spec.ts` | 21 | uses dividers.ts helper above |
| [ ] | `tests/cypress/e2e/autocomplete-user-defined.cy.ts` | 21 | |
| [x] | `tests/playwright/e2e/structured-expressions-selection.spec.ts` | 16 | Converted all 16, see Log |
| [ ] | `tests/cypress/e2e/autocomplete.cy.ts` | 15 | |
| [ ] | `tests/cypress/e2e/translation.cy.ts` | 13 | |
| [x] | `tests/playwright/e2e/structured-expressions-copy-paste.spec.ts` | 12 | Converted all 12 call sites (67 generated test cases), see Log |
| [ ] | `tests/playwright/e2e/frame-selection-manipulation.spec.ts` | 10 | |
| [x] | `tests/playwright/e2e/storage-model.spec.ts` | 9 | Converted 6/9; 3 kept as deliberate real-time waits (no exposed completion signal, or negative-assertion timing) -- see Log |
| [ ] | `tests/cypress/e2e/autocomplete-more.cy.ts` | 8 | |
| [x] | `tests/playwright/e2e/slot-errors.spec.ts` | 7 | Converted all 7, see Log |
| [ ] | `tests/playwright/e2e/scroll-into-view.spec.ts` | 7 | |
| [x] | `tests/playwright/e2e/load-save-frozen-collapsed.spec.ts` | 7 | Converted all 7, see Log |
| [ ] | `tests/cypress/e2e/paste-python.cy.ts` | 7 | uses paste-test-support.ts helper above |
| [ ] | `tests/cypress/e2e/basics.cy.ts` | 6 | |
| [x] | `tests/playwright/e2e/load-save-demos-books.spec.ts` | 5 | Converted all 5, see Log |
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
- **CORRECTED 2026-07-10, then confirmed directly from CI logs the same
  day** (was wrong below until now — thanks to a sharp catch from Neil):
  the 3 Playwright shards are **not** a file-count split.
  `playwright.config.ts` declares exactly 3 projects, in this order:
  `chromium`, `firefox`, `webkit`, all running the identical file set, and
  CI's `--shard=N/3` has no `--project` filter. Playwright shards a single
  combined (project, file) list built in project-declaration order, so with
  3 equal-sized projects and 3 shards, the boundaries land exactly on
  project boundaries: **shard 1 = all of chromium, shard 2 = all of
  firefox, shard 3 = all of webkit.** See PLAN.md's CI section for the
  fuller reasoning. Initially this was only inferred from the config (`gh`
  wasn't installed in that session); once Neil installed `gh` and logged
  in, pulled job logs directly (`gh api
  repos/k-pet-group/Strype/actions/jobs/<id>/logs`) and grepped for
  `[chromium]`/`[firefox]`/`[webkit]` markers across two separate runs on
  both OSes — every shard-1 job logged only `[chromium]`, every shard-2
  only `[firefox]`, every shard-3 only `[webkit]`, no exceptions. Treat
  this as settled, not just inferred.
- **Shards 2 and 3 are both the slowest and the flakiest**, across both OS
  — i.e. it's **Firefox and WebKit that are slower and flakier than
  Chromium**, not any particular set of spec files. Job-level stats across
  the 20 runs (`test (os, shard)`):

  | Job | Browser | Runs | Failures | Avg duration | Max duration |
  |---|---|---|---|---|---|
  | macos, shard 1 | chromium | 20 | 3 | 29 min | 37 min |
  | macos, shard 2 | firefox | 20 | 8 | 80 min | 118 min |
  | **macos, shard 3** | **webkit** | 20 | **14** | **76 min** | **124 min** |
  | ubuntu, shard 1 | chromium | 20 | 4 | 29 min | 34 min |
  | ubuntu, shard 2 | firefox | 20 | 3 | 66 min | 87 min |
  | ubuntu, shard 3 | webkit | 20 | 10 | 59 min | 76 min |

  Chromium is both fastest and most reliable on both OSes; WebKit is worst
  on both; Firefox is in between (slow on both, but its failure count is
  inconsistent between OSes — worth more samples). **This invalidates the
  old "biggest wait-count files land in shard 2/3" reasoning below** — every
  spec file runs in every shard (once per browser), so there's no file-level
  signal here, only a browser-level one. The wait-count-based file ordering
  in the table below still stands on its own merits (bigger files still
  waste more wall-clock per run, and a Playwright-vs-Cypress split is still
  the right first cut), it just isn't *additionally* weighted by shard
  number the way the note below used to claim.
- **Failures cluster, they don't isolate.** One sampled run (macOS, shard 2
  — i.e. a **Firefox** job) had `2 failed / 26 flaky / 479 passed` in a
  single job — dozens of unrelated spec files (`console-execution`,
  `frame-selection-manipulation`, `graphics`, `load-save-frozen-collapsed`,
  `load-save-random`, `load-save-share`, `media-literal-edit`,
  `rename-identifiers`, `storage-model`, `structured-expressions-copy-paste`,
  `structured-expressions-navigation`) all needed a retry in the same run.
  That pattern — many unrelated tests wobbling together in one Firefox job —
  is more consistent with a CPU-starved runner (see PLAN.md's CI section)
  than with several independently-broken waits, and is exactly what "wait
  for the right condition, not a clock" should fix. It may also mean
  Firefox/WebKit specifically deserve a closer look for browser-specific
  timing assumptions once the easy conversions are done.
- **One named recurring flake worth a direct look**:
  `console-execution.spec.ts` → "Check console prints don't queue up after
  stopping" (the 30-second variant) failed 3 times including after 2
  retries in one sampled job — it's plausible this one is a genuine timing
  assertion (not just an arbitrary wait) that needs rethinking rather than
  a simple wait→condition swap.
  **RESOLVED 2026-07-10**, see dated log entry below — this was a real bug
  in `terminateAndRestartPyodide()`/the async-request throttle, not a test
  problem, so no wait→condition rewrite was needed here.
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

**Net effect on ordering:** within the spec-file table below, treat all
Playwright files as higher priority than Cypress files of a similar
wait-count (Playwright is where the flakiness actually is). The earlier
"and especially files landing in shard 2/3" refinement was based on the
now-corrected wrong shard assumption above and no longer applies — there's
no per-file shard signal, only a per-browser one (Firefox/WebKit run
slower and flakier than Chromium, uniformly across all files).

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
- 2026-07-09 — Second conversion, following the priority order this time
  (shared helper before spec files, and this one is also the natural
  next step since `load-save-share.spec.ts` already calls into it):
  `tests/playwright/support/loading-saving.ts`, all 4 waits (`load()`
  and `save()`). Used first as a caller of this helper, so already had
  a validated repro/throttle setup to reuse. Used against 15 callers
  across the Playwright suite.
  - `load()` wait #1 (2000ms after clicking "Load project", before
    checking for a "discard changes" confirmation): traced to
    `Menu.vue`'s `openLoadProjectModal()` — the confirmation dialog
    (`#save-on-load-project-modal-dlg`) only shows if the project has
    unsaved changes, so it may legitimately never appear. Replaced with
    a bounded `locator.waitFor({state:"visible", timeout:5000})` that
    resolves to `false` (not an error) if the dialog never shows, instead
    of always sleeping 2s then doing a single un-retried `.count()`
    check. Narrowed the selector from a global `button.btn-secondary`
    to one scoped to the dialog's own id, since the global one also
    matches an unrelated button in `APIDiscovery.vue`.
  - `load()` wait #2 (5000ms after `fileChooser.setFiles()`, waiting for
    the load to finish): **this one had a trap.** The obvious signal —
    `Menu.vue`'s own progress overlay (`.app-progress-container`) — turned
    out to be misleading: `selectedFile()` hides the overlay as soon as
    the file has been *read*, not once the new state has actually been
    *applied* (`onFileLoaded()` runs inside a separate, un-awaited
    `.then()` off the state-application promise). Waiting on the overlay
    disappearing would have converted one race into a subtler one.
    Instead, traced through to `onFileLoaded()` (`Menu.vue:1391`), which
    sets `appStore.projectName` — this is only reached once the state is
    genuinely in place, and mirrors into a visible `.project-name` label
    (`Commands.vue`'s `projectName` computed). Replaced with
    `expect(page.locator(".project-name")).toHaveText(expectedProjectName)`,
    deriving the expected name from the loaded file's basename
    (`path.basename(filepath, path.extname(filepath))`), matching the
    app's own `noExtFileName` logic.
  - `save()` wait #3 (1000ms after opening the hamburger menu, before
    clicking "Save"): the menu's slide-open is a real animated
    transition (`vue3-burger-menu`'s `<Slide>`, ~0.5s CSS transition),
    but Playwright's own actionability check on the subsequent `.click()`
    already waits for the target to be visible and stable — dropped
    entirely, no replacement needed.
  - `save()` wait #4 (1000ms after clicking "Save", before interacting
    with the save dialog): the dialog (`ModalDlg`) renders with
    `no-animation`, so `.fill()`'s and `.click()`'s own auto-wait on the
    dialog's elements is already sufficient — dropped entirely.
  - Found and deliberately did **not** chase: manually reproducing
    "load while the project has unsaved changes" (to test wait #1's
    discard-dialog branch directly) hung identically with both the
    original and converted code, via a throwaway one-off test. Since no
    existing spec in the repo actually calls `load()` in that state
    (all current callers either just came from `save()`, which clears
    the modified flag, or load from a fresh page), this looks like a
    pre-existing product-code quirk in the discard→reopen modal chain,
    not a regression from this conversion — out of scope here, but worth
    a follow-up if this codepath ever gets real test coverage.
  - Verified: 8/8 `load-save-share.spec.ts` passes at CPU throttle
    rate=15 (up from the practice run's rate=20, since this round tests
    both `load()` and `save()` together and total runtime scales with
    throttle rate), plus normal-speed runs of the same file and three
    `load-save-random.spec.ts` cases on Firefox (that file skips
    Chromium for an unrelated, pre-existing reason — see its own
    `beforeEach`). `eslint` clean.
- 2026-07-09/10 — Third conversion, following the priority order:
  `tests/playwright/support/editor.ts`. This is the highest-leverage file
  in the whole initiative — it's the keypress/paste helper used across
  most of the Playwright suite, including the biggest spec files
  (`rename-identifiers.spec.ts` 139 waits, `match-statement.spec.ts` 105,
  the `structured-expressions*.spec.ts` family) — but also the trickiest,
  and took real investigation before landing on a solid fix. It also
  ended up including a production code change (discussed with and
  approved by the user first, since it's exactly the case PLAN.md flags
  for a check-in).
  - **What the waits were guarding, and why a naive fix would have been
    wrong**: instrumented a live typing session with a MutationObserver
    on `data-slot-cursor`/`data-slot-focus-id` (custom attributes on
    `#editor` that mirror the store's focus/cursor state — see
    `App.vue:39,245-252`). Found the settle time after a keystroke
    varies from ~10ms (plain characters) to 300ms+ (structural
    characters that trigger frame restructuring). Concretely: typing
    "=" into a function-call frame converts it to a variable-assignment
    frame via a genuine, deliberate `setTimeout(..., 300)` in
    `LabelSlotsStructure.vue` (likely so typing "==" doesn't briefly
    convert on the first "="). Similar real (non-reactivity) timers
    exist elsewhere in the editor: `LabelSlotsStructure.vue` ~200ms
    (refocus-check after blur) and `LabelSlot.vue` 1000ms (delayed
    backspace-frame-deletion, presumably to avoid accidental deletion on
    rapid repeated backspaces). None of these are expressible as "wait
    for Vue to flush" — a `nextTick()`-only fix (the initial plan) was
    empirically proven insufficient: awaiting `nextTick()` twice (even
    with an extra macrotask flush for a zero-delay `setTimeout` also
    found in the same conversion function) still returned before the
    real 300ms timer fired, confirmed by re-checking the DOM 500ms later
    and finding it had changed *after* our wait had already resolved.
  - **Fix**: added a small test-only hook,
    `WINDOW_STRYPE_NEXTTICK_PROPNAME` (`src/helpers/sharedIdCssWithTests.ts`)
    / `window[...] = nextTick` (`src/main.ts`), following the exact
    precedent of the existing `WINDOW_STRYPE_HTMLIDS_PROPNAME`/
    `WINDOW_STRYPE_SCSSVARS_PROPNAME` test hooks in the same file. Then
    built `waitForEditorSettled(page, timeoutMs=4000)` in `editor.ts`:
    first flushes reactivity (nextTick, a macrotask turn, nextTick again
    — fast path, a few ms for ordinary keystrokes), then polls
    `data-slot-focus-id` + `data-slot-cursor` + `.frame-div` count until
    all three stop changing, bounded by `timeoutMs`. This one helper
    replaced every wait in the file: `typeIndividually()` (per
    character), `doPagePaste()`, `doTextHomeEndKeyPress()`, `pressN()`
    (when `enforceWaitBetween`), and both waits in `enterCode()` (the
    post-backspace one also switched to explicitly asserting
    `.frame-div` count reaches 0, rather than just settling generically).
  - Also converted the 6th, non-numeric-literal wait in this file
    (`typeIndividually`'s `timeout` parameter, default 75 — not caught by
    the initiative's counting regex since it's not a numeric literal at
    the call site) since it's the exact same pattern as the other 5.
    Updated its one external caller
    (`load-save-random.spec.ts:224`) that passed an explicit `100`,
    since that value meant something different under the old semantics
    (ms between chars) than the new one (settle-poll bound).
  - This was a three-step process, not a one-shot fix — worth recording
    since it's a good example of the "before/after" verification loop in
    PLAN.md paying off: first tried nextTick-only (checked with the user
    before adding the prod hook at all), empirically found it
    insufficient via the MutationObserver instrument, then checked with
    the user again on how to handle genuine debounce timers before
    building the hybrid poll. Each step was validated against the *actual
    running app*, not assumed from reading the source.
  - Verified extremely broadly given the blast radius: 306 tests passed
    across 9 spec files exercising all 5 converted functions —
    `structured-expressions-selection.spec.ts` (103),
    `structured-expressions-media.spec.ts` (9, Firefox — Chromium skips
    this file for an unrelated clipboard-permissions reason),
    `structured-expressions-copy-paste.spec.ts` (67),
    `rename-identifiers.spec.ts` (21, full file — the single biggest
    beneficiary),`console-execution.spec.ts` (29, including the
    previously-flagged flaky "30 seconds" variant from the CI findings
    above), `package-installation.spec.ts` (7, needed the
    `test:cypress:serve-assets` asset server on :8089 running locally —
    easy to miss since the failure otherwise looks like a genuine
    regression), `graphics.spec.ts` (29), `structured-expressions.spec.ts`
    (10, the file most directly exercising the funccall/varassign
    restructuring path this investigation was about), and
    `description-fields.spec.ts` (21). Also re-ran
    `structured-expressions.spec.ts` under CPU throttle rate=15,
    `--repeat-each=3` (30/30 passed) to confirm the poll-based settle
    survives slow conditions, not just fast local ones. `eslint` and
    `vue-tsc --noEmit` both clean.
- 2026-07-10 — Fourth conversion, next in the shared-helper priority list:
  `tests/playwright/support/dividers.ts` (the drag-a-splitter helpers,
  used by `load-save-dividers.spec.ts` and `graphics.spec.ts`). This one
  had two distinct real bugs hiding behind the original 6-second blind
  sleep, both only found by empirical instrumentation, not by reading the
  code:
  - **`dragDividerTo`'s drag itself**: instrumented the splitter's
    bounding box during a live drag and found `splitpanes` (the 3rd-party
    library backing these dividers) updates pane sizes synchronously on
    `mousemove` — no settling delay at all, confirmed on both a vertical
    and a horizontal splitter. Replaced the 3 fixed sleeps with a single
    `expect.poll` waiting for the position to move away from its start
    (checking both x and y, since a horizontal splitter's meaningful
    movement is in y and a vertical one's is in x).
  - **`getSplitterPos` grabbing a position too early**: found via a real
    test failure (not anticipated in advance) that right after switching
    to the "expanded Python execution area" view, the divider's bounding
    box can briefly — or, in one case, stably — report a degenerate
    position, because the pane sizing is driven by a computed getter
    (`App.vue`'s `expandedPEAOverlaySplitterPane2Size`) that can itself
    trigger a further reactive update via `nextTick`. Fixed by requiring
    two consecutive reads to agree before trusting the position, rather
    than trusting the first read.
  - **A third, more fundamental discovery**: for one specific test
    (`load-save-dividers.spec.ts` → "Saves main and secondary divider
    state in second mode"), the code/sidebar splitter gets compressed to
    an ~100px-tall sliver at the top of the screen (screenshot from the
    failing run confirmed this visually) once the Python execution area
    is expanded to fill most of the viewport. In that state the
    splitter's bounding box is genuinely, stably degenerate — yet the
    drag still works, because `splitpanes`' resize logic operates on the
    mouse's pixel delta, not on the splitter's own rendered geometry. This
    meant the "wait for position to change" check needed to be
    **best-effort, not a hard requirement** — wrapped the poll in a
    bounded 2s timeout with `.catch(() => {})` so a legitimately-static
    splitter doesn't fail the whole drag.
  - Confirmed both bugs were genuinely new (not something the original
    fixed-wait code happened to dodge) by reverting to the original
    `dividers.ts` via `git stash` and re-running the exact same failing
    test — it passed unmodified, proving the 6-second sleep really was
    masking these two races, not that they were unrelated flakes.
  - Verified: full `load-save-dividers.spec.ts` (7 tests, 1 correctly
    skipped for an unrelated pre-existing Chromium/hover limitation, all
    passing including the tricky "second mode" test which alone takes
    ~2.4 minutes due to that file's own separate large fixed waits —
    out of scope for this pass, tracked as that file's own row below),
    re-ran the "second mode" test `--repeat-each=2` to confirm it's
    reliably passing rather than lucky, and the 3 `graphics.spec.ts`
    tests that use `dragDividerTo`. `eslint` clean. Did not throttle-test
    this one (mouse-driven drag isn't obviously slowed by CPU throttling
    the way rendering/script work is, and the two real bugs found here
    were state/timing bugs independent of raw speed) — worth doing if
    this file misbehaves in CI despite the above.
  - **Also fixed, unrelated to the waits initiative**: corrected a wrong
    assumption in the "CI findings" section above and in PLAN.md — the 3
    Playwright shards are not a file-count split, they align exactly with
    the 3 browser projects (shard 1 = chromium, 2 = firefox, 3 = webkit).
    Caught by Neil spotting it didn't look right; see the CI findings
    section for the corrected analysis and what it changes (the "files
    landing in shard 2/3" prioritization no longer applies — there's no
    per-file shard signal, only "Firefox/WebKit are slower and flakier
    than Chromium" as a browser-level one). Confirmed directly from CI job
    logs later the same day once Neil installed and authenticated `gh` —
    see the "CORRECTED 2026-07-10" bullet in CI findings above.
- 2026-07-10 — **Real CI run validated the `editor.ts`/`loading-saving.ts`
  conversions and found one genuine bug**, plus gave a clean read on
  everything else. Neil pushed the committed `editor.ts`/`loading-saving.ts`
  work to his fork and ran the full CI matrix
  (`neilccbrown/Strype`, run 29071880285).
  - **macOS/chromium** (job 86294889588): 454 passed, 7 flaky (recovered
    on retry), 1 genuine failure
    (`structured-expressions-selection.spec.ts` → "Shift-Home..." →
    "Tests selecting and deleting in a+c"). Root-caused and fixed — see
    below.
  - **ubuntu/webkit** (job 86294889612): 341 passed, 120 flaky, 1 genuine
    failure (`storage-model.spec.ts` → "Load several states, save some
    (2nd: true), then load new one"). This one was a **real, confirmed bug
    in my `save()` conversion**, not a pre-existing issue — see below. The
    120-flaky count on WebKit is consistent with the CI findings above
    (WebKit is the slowest/flakiest browser); didn't chase these
    individually given they all self-healed via CI's retries=3 and none
    pointed at code I'd touched.
  - **ubuntu/chromium**: passed clean.
  - **Bug #1 — genuine pre-existing gap, exposed by less slack elsewhere**:
    `structured-expressions-selection.spec.ts`'s "Shift-Home... a+c" test
    has a bare `page.keyboard.press("ArrowLeft")` with **no** wait before
    the following `doTextHomeEndKeyPress(page, false, true)` (Shift+Home).
    Its near-identical sibling test one `describe` block down
    ("Shift-End... a+c") has the *exact* same bare-press pattern but
    **does** have an explicit `page.waitForTimeout(200)` after it — this
    looks like a plain oversight in the original test, just never
    triggered before because other parts of the test had enough slack to
    mask it. My faster/more-precise `editor.ts` waits removed that
    accidental slack. Fixed by importing `waitForEditorSettled` into the
    spec file and calling it after the two bare `ArrowLeft` presses in
    the "Shift-Home" describe block (both instances, only one of which
    had actually been observed failing). This is a spec-file change (not
    the shared-helper file itself), but directly caused by validating the
    helper conversion, so fixed in place rather than deferred to that
    file's own future conversion pass.
  - **Bug #2 — a real, previously-undiscovered race in my `save()`
    conversion, found and fixed the same way as the editor.ts debounce
    timers**: `storage-model.spec.ts` saves several projects with custom
    names (`save(page, true, "Project 1")` etc.) then checks those names
    appear in a "recent projects" list. It failed with the saved name
    showing as the *default* project name instead of the custom one.
    Traced to `Menu.vue`'s `onStrypeMenuShownModalDlg`: it has a genuine
    `setTimeout(..., 500)` that sets `#saveStrypeFileNameInput`'s default
    value and focuses it, *~500ms after the dialog is shown*. My
    conversion's `page.fill(...)` (no wait beforehand, since the dialog
    itself has no animation) usually races **ahead** of that timer — so
    the fill happens first, then the 500ms timer fires and silently
    overwrites it back to the default name. Confirmed with hard
    empirical evidence: instrumented the input's value every 100ms after
    filling it and watched it read back "MyCustomName" up to +455ms, then
    "My project" (the default) from +564ms onward, in every one of 5/5
    repeated runs — a clean, ~100%-reproducible race on a fast local
    machine (didn't even need CPU throttling, unlike most of the other
    races in this initiative, since the fill in the broken code has zero
    wait before it and the 500ms timer is fixed real time). Fixed by
    waiting for the *real* completion signal instead of guessing a
    duration: the app's own setup code calls `.focus()` on the input as
    its last action, so wait for that focus event (bounded to 3s as a
    backstop) before filling in the custom name — this guarantees the
    fill always lands *after* the app's own default-population code has
    already run, however long that takes. Re-verified with the same
    100ms-interval instrumentation: value stays as "MyCustomName" through
    every check across 3/3 repeated runs. Then re-ran the actual
    `storage-model.spec.ts` tests end-to-end: 17/17 passing, and much
    faster than before (~23s vs. the 1-2.5 minutes each attempt took in
    the CI log, since the removed fixed waits were mostly pure overhead
    once the race is closed properly).
  - **Lesson for future conversions**: a `.fill()`/`.click()` racing ahead
    of a value-setting `setTimeout` is a distinct failure mode from the
    "read state too early" races found elsewhere in this initiative — it
    fails *silently* (no error, no timeout, just a wrong-but-plausible
    final value) and doesn't reliably reproduce under CPU throttling the
    way rendering-bound races do, since the race is against a fixed
    real-time timer, not throttleable script work. When converting a
    "click open a dialog, immediately fill an input" pattern, check
    whether the app has any deferred (`setTimeout`) logic that also
    touches that same input, not just whether the dialog itself animates.
- 2026-07-10 — Fifth/sixth conversions: first two **Cypress** shared
  helpers, `tests/cypress/support/paste-test-support.ts` (5 waits) and
  `tests/cypress/support/load-save-support.ts` (1 wait) — same app, same
  Menu.vue/App.vue mechanics already reverse-engineered for the Playwright
  helpers, just translated to Cypress idioms (`.should()`'s built-in
  retry-until-pass instead of `expect.poll`/manual loops).
  - Added `waitForEditorSettled()` and `waitForProjectNameOrTimeout()` to
    `tests/cypress/support/test-support.ts`, mirroring
    `tests/playwright/support/editor.ts`'s `waitForEditorSettled` and
    `loading-saving.ts`'s `.project-name` wait. The stability-poll pattern
    translates cleanly to Cypress: since `.should(callback)` retries the
    *same* callback closure until it stops throwing, a `let lastState`
    variable captured in that closure persists across retries exactly like
    the manual poll loop did in Playwright — no sleep loop needed.
  - `paste-test-support.ts`'s save-dialog wait hit the **exact same
    `Menu.vue` setTimeout(...,500) filename-clobber bug already found and
    fixed in Playwright's `save()`** (see the loading-saving.ts entry
    above) — same root cause, same fix (wait for the input to receive
    focus before filling), confirming this wasn't a one-off.
  - **New Cypress-specific pitfall, not present in the Playwright
    equivalent**: the first attempt at the focus-wait
    (`expect(document.activeElement).to.eq($el[0])`) failed consistently,
    even with a generous timeout. Root cause: `document` referenced bare
    in a Cypress spec file's `.should()` callback resolves to the *test
    runner's* document, not the AUT's — Cypress does not rebind the global
    `document` the way it's easy to assume. Fixed by using
    `$el[0].ownerDocument.activeElement` instead, which is always correct
    regardless of which context evaluates the callback. Worth remembering
    for any future Cypress conversion that needs to check DOM focus state.
  - **Second Cypress-specific pitfall**: the best-effort
    `waitForProjectNameOrTimeout` (needed because
    `testRoundTripImportAndDownload` is used by both successful-import
    tests, where the name changes, and deliberately-invalid-import tests,
    where the app rejects the load and the name never changes) first used
    a plain `cy.window().then(...)` wrapping a bounded internal Promise —
    but Cypress's own default command timeout for `.then()` is 4000ms,
    shorter than the internal 10000ms bound, so Cypress killed the command
    before the internal wait ever got a chance to resolve on its own.
    Fixed by passing `{timeout: ...}` explicitly to `.then()`. Once that
    was fixed, a **second, subtler bug** surfaced: `pythonToFrames.ts`
    auto-dismisses its parse-error message after exactly `10000`ms
    (`showMessage(msg, 10000)`), and the wait's original 10000ms default
    bound was racing almost exactly against that same duration — sometimes
    winning, sometimes not. Reduced the default bound to 5000ms (comfortable
    margin under the message's 10s auto-dismiss, while still generous for
    the successful-import case, which settles in low single-digit seconds).
    Both bugs were only found by actually reading the specific
    `AssertionError`/`CypressError` text from real Cypress runs, not by
    reasoning about the code alone — another data point for "run it and
    read the actual failure" over "review the diff and hope."
  - Verified: `paste-python.cy.ts` (the single slowest Cypress spec in the
    suite, 570s in the last known-good timing) — full file, 51/51 passing,
    now **3 minutes instead of ~6-7** (multiple full runs during
    debugging, all consistent). `paste-python-mixed.cy.ts` (heavy user of
    the `.spy`/custom-name save path), full file, 18/18 passing, twice.
    `load-save.cy.ts` (uses `load-save-support.ts`'s `loadFile`), 2/2
    passing. `eslint` and `vue-tsc --noEmit` both clean throughout.
- 2026-07-10 — First **spec file** conversion (as opposed to a shared
  helper): `tests/playwright/e2e/structured-expressions-selection.spec.ts`
  (16 waits). Chosen because it was already partially touched (the
  CI-caught `ArrowLeft` fix lives here) and, as expected, turned out to be
  a fast, low-risk conversion: all 16 waits were the same "settle after a
  keystroke/paste before reading state" pattern `waitForEditorSettled()`
  (from `editor.ts`, already imported in this file) was built for — no new
  investigation needed, just apply the existing helper.
  - Also closed one more latent gap of the same shape as the CI-caught
    `ArrowLeft` bug while in there: `testSelectionThenDelete` pressed
    `Delete` and then called `assertStateOfIfFrame` (a one-shot DOM
    snapshot, no built-in retry) with **no wait in between at all**. Added
    a `waitForEditorSettled()` call there too, on the same reasoning as
    the CI fix — this is exactly the class of gap that only shows up under
    real contention, not on a fast local machine.
  - Removed one wait entirely as pure redundancy: `testSelection` had a
    standalone 100ms wait between the selection-building loops and typing
    the replacement text, but every code path into that point already
    ends with a `waitForEditorSettled()` call from the preceding loop (or
    from `doTextHomeEndKeyPress`, which also settles internally) — so the
    extra wait was dead weight even before conversion.
  - Verified unusually broadly given how mechanical the conversion was:
    full file, all 103 tests, on **all three browsers** — chromium
    (1.2min), firefox (1.7min), webkit (1.6min) — plus a CPU throttle
    rate=15 run on chromium (103/103, 8.5min). `eslint` and `vue-tsc
    --noEmit` both clean.
  - Process note: started the dev server via the harness's own
    `run_in_background` this time (instead of the earlier `(cmd &)`
    shell-backgrounding pattern) specifically so it could be stopped with
    `TaskStop` by task ID afterwards, rather than a raw PID or a
    pattern-matched `pkill` — confirmed no lingering `vite` process
    afterwards. Worth doing this way from now on for any future session's
    dev server.
- 2026-07-10 — **All shared support/helper files are now converted** (both
  Playwright and Cypress) — the last three Cypress ones,
  `expression-test-support.ts`, `autocomplete-test-support.ts`, and
  `param-prompt-support.ts` (3 waits each, 9 total), all had a genuinely
  duplicated `withSelection` function (each file's own copy, same body,
  same "We need a delay to make sure last DOM update has occurred"
  comment) plus a near-identical `withFrameId`/`withAC`. All mapped
  directly onto `waitForEditorSettled()` (already built for
  `paste-test-support.ts` last time) — no new investigation needed for 8
  of the 9 waits, just apply the existing helper.
  - The 9th, `checkAutocompleteSorted`'s `cy.wait(1000)` (comment: *"The
    autocomplete only updates after 500ms"*), needed real investigation:
    grepped the whole autocompletion codebase and `AutoCompletion.vue` for
    a debounce/setTimeout and found **none** — the comment appears to be
    stale/inaccurate (possibly describing an older implementation).
    Since `waitForEditorSettled()` only tracks `#editor`'s own attributes
    and `.frame-div` count, not the autocomplete popup's content, it
    can't cover this one. Added a second, autocomplete-specific stability
    helper inline in `autocomplete-test-support.ts` (same
    two-consecutive-reads pattern, targeting the popup container's text
    content) rather than guessing at a duration.
  - Strategy note for whoever picks up the next batch: this file family
    (three nearly-identical Cypress support files with the same
    duplicated helpers) is a good example of "look for the same pattern
    copy-pasted elsewhere" being worth a quick check before converting a
    file in isolation — the plan's own "shared support/helper files" list
    already made this file family adjacent, but it was the near-identical
    function *bodies*, not just proximity in the todo list, that made the
    conversion fast here.
  - Verified extremely broadly, including the two heaviest specs in the
    entire Cypress suite: `structured-expressions-brackets.cy.ts`
    (67 tests, was **840s → now 3min**), `param-prompts-user-defined.cy.ts`
    (54 tests, was **600s → now 5min**), and
    `param-prompts-python-library.cy.ts` (42 tests, was **490s → now
    5min**) — all passing, all dramatically faster, confirming the
    removed waits were close to pure dead weight. Plus
    `structured-expressions.cy.ts` (62), `structured-expressions-selection.cy.ts`
    (23), `autocomplete.cy.ts` (27, exercises `checkAutocompleteSorted`),
    `autocomplete-modules.cy.ts` (15, exercises `checkAutocompleteSorted`
    17 times), and `param-prompts.cy.ts` (64) — 354 tests total across 8
    spec files, zero failures. `eslint` and `vue-tsc --noEmit` both clean.
  - **Shared support/helper files phase of the plan is now complete** —
    every file in that table is checked off. Next up per the plan's
    ordering is the spec-files table, biggest-count-first (tempered by
    the Playwright-vs-Cypress and browser-flakiness priority notes in the
    CI findings section above).
- 2026-07-10 — `tests/playwright/e2e/structured-expressions.spec.ts` (35
  waits) — the file that specifically exercises the funccall↔varassign
  restructuring. Expected this to be as mechanical as the last conversion
  (every wait followed a keystroke/paste, exactly the
  `waitForEditorSettled()` pattern) — did a blanket `sed` swap of all 35,
  and it **wasn't** that simple: 4 tests failed immediately.
  - **Found and fixed a real, previously-undetected bug in the shared
    `waitForEditorSettled()` helper itself** (both the Playwright version
    in `editor.ts` and the Cypress port in `test-support.ts`) — not
    specific to this file, a genuine gap in the helper every prior
    conversion had been relying on. The "two consecutive matching reads =
    settled" heuristic doesn't distinguish "genuinely done" from "sitting
    in a known transient placeholder state that's about to change" —
    and the funccall→varassign conversion's blank-focus placeholder
    (`data-slot-focus-id=""`, set synchronously *before* the 300ms
    debounce is scheduled — see `LabelSlotsStructure.vue`) is exactly
    that: stable-looking for the *entire* 300ms window, easily satisfying
    "two matching reads" long before the real final state arrives.
    Confirmed with a live instrumented poll (readings every 30ms): blank
    from +126ms to +336ms (stable well before that), but the real final
    state didn't land until +378ms — so the old helper was provably
    returning ~200ms early on this exact case.
  - **Why this hadn't surfaced before**: every earlier validation that
    exercised this specific "type = to convert a frame" scenario had
    still been protected by a fixed wait that hadn't been converted yet
    (this file's own 1000ms waits, until this session) — so
    `waitForEditorSettled()` was never actually the thing standing between
    the keystroke and the assertion for *this specific case*, despite
    being exercised successfully in dozens of other scenarios (including
    an explicit CPU-throttle stress run of this very file, which only
    passed because the file's own waits hadn't been touched yet at the
    time). A good reminder that "this helper has passed N times" doesn't
    mean "this helper is correct for every case it's used for" — it means
    "correct for the cases actually exercised so far."
  - **The fix, and why it isn't as simple as "never trust a blank
    reading"**: frame-level pastes (`doPagePaste`'s frame-caret path, used
    by `enterCode()`) can *legitimately* end with a blank focus (a frame
    caret, not a slot) as their real final state — so blank can't just be
    rejected outright without breaking that case. Settled on requiring
    more consecutive stable reads specifically when blank (15 in
    Playwright, ~450ms of confirmed quiet; 30 in the Cypress port, a more
    conservative guess since Cypress's retry cadence isn't precisely
    known and no current Cypress spec exercises this exact scenario to
    validate against) versus just 1 when focus is on a real slot — so the
    fast path for ordinary keystrokes (the overwhelming majority of calls)
    is untouched, and only the specific transient-blank case pays the
    extra, bounded cost.
  - Verified the fix directly: same live-instrumented-poll technique,
    confirmed the 4 originally-failing tests now pass; then 50/50 across
    5 repeats on chromium, 10/10 on firefox and webkit, and 50/50 under
    CPU throttle rate=20 with `--repeat-each=5` (this time genuinely
    exercising the fixed logic, unlike the earlier throttle run).
  - Re-checked for regressions in files that already used the *old*
    helper, since this is a shared dependency: `console-execution.spec.ts`
    (29/29, uses `enterCode()`'s legitimately-blank frame-caret path --
    confirmed no meaningful slowdown), `structured-expressions-selection.spec.ts`
    (103/103), and on the Cypress side `paste-python.cy.ts` (59/59),
    `autocomplete.cy.ts` (27/27), `param-prompts.cy.ts` (64/64) — all
    clean, no regressions from the stricter blank-state handling.
  - `eslint` and `vue-tsc --noEmit` both clean throughout.

- **2026-07-10**: Converted `tests/playwright/e2e/graphics.spec.ts` (40 of
  41 waits).
  - **New mechanism**: unlike prior conversions, there's no dedicated test
    hook for "the graphics canvas just redrew" -- turtle/strype.graphics
    drawing happens inside a running Python program with no JS-side signal
    of its own. Found that `redrawCanvas()` in `PythonExecutionArea.vue`
    does one incidental, unconditional DOM write on every actual redraw:
    it sets `#pythonGraphicsCanvas`'s `data-scale` attribute (even to the
    same value if unchanged). A `MutationObserver` on that attribute gives
    a reliable "redraw happened" proxy signal. Added
    `setupGraphicsRedrawObserver(page)` / `waitForGraphicsSettled(page)` to
    `tests/playwright/support/execution.ts`.
  - Confirmed via code reading (not just guessing) that matplotlib images
    go through the *same* path: `python-execution.ts`'s `matplotlib_img`
    callback adds the rendered figure as a sprite via
    `spriteManager.addSprite`, which is the same sprite-based redraw
    mechanism turtle/strype.graphics actors use -- so the one mechanism
    covers all three graphics backends in this file, including the
    matplotlib click-response test's redraw-after-click wait.
  - Also confirmed `#pythonGraphicsCanvas` is always present in the DOM
    (`v-show`, not `v-if`, in `PythonExecutionArea.vue`), so
    `setupGraphicsRedrawObserver` is safe to call before the graphics tab
    has ever been switched to.
  - **Real bug found on first full local run**: 4 tests failed with
    the graphics area showing ~86-99% pixel diff against baseline -- the
    screenshots showed Python genuinely running (Stop button visible) but
    the canvas still black/untouched. Root cause was the same class of
    defect as the `waitForEditorSettled` blank-placeholder bug above:
    `waitForGraphicsSettled`'s "N consecutive equal reads = settled" logic
    was fooled by a redraw count that was stable *at zero* -- i.e. stable
    because nothing had been drawn yet, not because drawing had finished.
    This only showed up in tests where the assertion follows immediately
    after the first wait post-run-click, with no other action beforehand
    to accidentally paper over it (e.g. the mouse-input test's later
    waits, downstream of several real clicks, happened to have
    accumulated enough incidental wall-clock time to mask the same bug).
    Fixed by requiring at least one non-zero redraw count before trusting
    stability, in addition to the existing "3 consecutive equal reads"
    check.
  - Removed the 3 pre-existing 20-second layout-toggle waits in the
    "large view" tests entirely (not replaced), on the reasoning that
    `dividers.ts`'s `dragDividerTo`/`getSplitterPos` (already made
    stability-polling-based in an earlier session) makes them redundant.
    Empirically confirmed safe: all 3 tests pass, including under
    `--repeat-each=2`.
  - Left one wait deliberately unconverted ("Test get_clicked_actor
    doesn't throw an exception"): it's giving a potential exception time
    to *manifest*, not waiting for a specific state to be reached, so
    there's no observable condition to replace it with. Added a comment
    explaining the distinction.
  - Verified: full file, chromium, `--repeat-each=2` (64/64 passing,
    including the previously-black-canvas tests and the newly-converted
    matplotlib click test). Did not yet run firefox/webkit locally (the
    turtle/strype.graphics `describe` blocks already skip those browsers
    for known WebGL-on-CI reasons; the matplotlib and get_key tests do run
    cross-browser and are worth a CI check).
  - `eslint` and `vue-tsc --noEmit` both clean.

- **2026-07-10**: Fixed a real CI-caught bug in the Cypress port of
  `waitForEditorSettled()` (`tests/cypress/support/test-support.ts`),
  found while reviewing CI run
  [29089030905](https://github.com/neilccbrown/Strype/actions/runs/29089030905)
  (flagged by Neil) for the "Fixed an issue with waiting for blank
  placeholders" commit.
  - `Build-And-Run-Tests (microbit, ubuntu-latest, 1)` failed on
    `paste-python.cy.ts` → "Allows pasting fixture file with main code"
    with `AssertionError: ... editor state should stabilise: expected 18
    to be at least 30`. This is exactly the case flagged as an open risk
    in the previous log entry: the Cypress port's blank-state threshold of
    30 was an untested guess, and this large multi-statement paste was
    the first real exercise of it.
  - **Root cause**: the Cypress port relied on `.should()`'s own retry
    mechanism to re-run the check repeatedly, but `.should()`'s retry
    cadence is *not* a fixed wall-clock interval -- it slows down when the
    page is busy (e.g. re-rendering a large frame tree after pasting a
    big file). So "30 consecutive stable reads" needed far more than 30 ×
    (nominal interval) of real time on a loaded page, and blew through the
    10-second outer timeout even though the state had genuinely
    stabilised. The Playwright port never had this problem because it
    drives its own fixed `page.waitForTimeout(30)` loop directly, so its
    cadence isn't affected by page load.
  - **Fix**: rewrote the Cypress version to drive its own fixed-interval
    `setTimeout` poll (30ms, matching Playwright) inside a
    `cy.window().then()`-wrapped `Cypress.Promise`, instead of relying on
    `.should()`'s retry. Also switched the blank-state threshold from the
    untested guess of 30 down to 15, matching the Playwright port's
    now-validated value, since both ports poll at the same 30ms cadence.
    On timeout it rejects with an equivalent diagnostic message to
    preserve the old "editor state should stabilise" failure clarity.
  - **Second bug caught immediately after, before this ever reached
    CI**: first attempt at the fix put the `{timeout: timeoutMs + 5000}`
    override on `cy.window()` instead of the subsequent `.then()` --
    exactly the same mistake documented in the `waitForProjectNameOrTimeout`
    fix earlier in this initiative (`.then()` has its own independent
    4000ms default command timeout). Caught locally before commit: the
    fixed spec still failed, now with `CypressError: cy.then() timed out
    after waiting 4000ms`. Fixed by moving the timeout override onto
    `.then()` itself.
  - Verified: `paste-python.cy.ts` alone (59/59, including the
    previously-failing test), then a broader spot-check across the other
    Cypress spec files that exercise this shared helper --
    `structured-expressions.cy.ts` (62/62), `autocomplete.cy.ts` (27/27),
    `param-prompts.cy.ts` (64/64) -- all clean, no regressions.
  - `eslint` and `vue-tsc --noEmit` both clean.
  - Also reviewed the other CI failures from the same run
    (`29089030935`, Playwright): macOS+firefox shard had 1 genuine
    failure (`graphics.spec.ts` → "Test get_clicked_actor returns the
    right item", a `load()` timeout on `data-graph.spy` that repeated
    across 3 of 4 attempts) plus 20 flaky-but-passing-on-retry tests
    spanning many unrelated spec files. Given this predates the
    `graphics.spec.ts` conversion above (that work was still uncommitted
    local changes at the time this CI run executed) and is isolated to
    one test on the already-documented-as-flaky macOS+firefox
    combination, treating this as baseline CI noise rather than a new
    regression -- worth re-checking specifically on macOS+firefox once
    the `graphics.spec.ts` changes above are committed and a fresh CI run
    is available.

- **2026-07-10**: Converted `tests/playwright/e2e/rename-identifiers.spec.ts`
  (138 of 139 waits) -- the single largest remaining file.
  - Almost every wait in this file followed one of three shapes, which
    needed to be told apart per occurrence (not just per test), since a
    generic "convert everything to `waitForEditorSettled`" pass would have
    been wrong for two of the three:
    1. Ordinary navigation/typing mid-sequence (the majority) →
       `waitForEditorSettled(page)`.
    2. The wait immediately before triggering the rename (pressing
       `Ctrl+R`, clicking the rename button, or performing an action meant
       to dismiss/interact with the popup) → needs the popup itself,
       not just editor state, since losing focus triggers an *async*
       eligibility check (`checkAndShowRenameIdentifiersPopup` in
       `LabelSlotsStructure.vue`, which awaits a code-wide search for other
       uses of the identifier) before the popup appears.
    3. The wait immediately after triggering the rename, before
       checking/saving the result → wait for the popup to close
       (`renameIdentifiers()` synchronously mutates the store and hides
       the popup in one go, so this also confirms the mutation landed).
    Also deleted several waits entirely as genuinely redundant: right
    after a `pressN(key, n, true)(page)` call, which already waits for
    the editor to settle after *every* press including the last one via
    its own `enforceWaitBetween` flag, and right before `doPagePaste()`,
    which settles at its own end -- an explicit wait between two
    already-self-settling calls added nothing.
  - Kept exactly one wait as a deliberate fixed delay ("Module name
    (before as: should NOT change"): this test asserts the popup should
    **not** appear, so there's no positive state to poll for -- same
    reasoning as the deliberately-kept wait in `graphics.spec.ts`'s
    exception test. Added a comment explaining why.
  - **Real regression found under validation, WebKit-only**: first full
    run passed on chromium and firefox (`--repeat-each=3`, 63+63 clean)
    but repeatedly failed 7-14 out of 21 tests on WebKit alone (even at
    `--workers=1`, ruling out resource contention), always with the same
    symptom: `expect(renameButton).toBeHidden()` timing out after
    `Ctrl+R` -- the popup never closed. Confirmed via `git stash` that
    the *original* fixed-wait code did not reproduce this on WebKit, so
    this was a real regression introduced by the conversion, not
    pre-existing flakiness.
  - **Root cause**: `App.vue`'s global keydown handler only actually
    dispatches the rename action for `Ctrl+R` when
    `document.querySelector(".popover.show:has(.<popover class>)")`
    matches -- i.e. it requires Bootstrap's `.show` class to have been
    added to the popover's *ancestor* element, which happens on a fade-in
    transition *after* the button inside it first becomes visible. My
    replacement wait (`expect(renameButton).toBeVisible()`, checking only
    the button) could resolve during that gap and fire `Ctrl+R` before
    the app was ready to handle it -- a real, always-present race that
    the original fixed 400ms wait happened to comfortably outlast on
    every browser, and that only WebKit's transition timing exposed.
  - **Fix**: added a second locator, `openedPopoverLocator`, matching the
    app's exact guard condition (`.popover.show:has(...)`), and used it
    (instead of `renameButton`) specifically for the wait immediately
    preceding every `Ctrl+R` press (15 sites) -- the button-click and
    popup-dismissal paths don't go through this guard, so those keep
    using the plain `renameButton` visibility check.
  - Verified: chromium+firefox `--repeat-each=3` (63/63 before the WebKit
    fix, unaffected by it), WebKit alone `--repeat-each=2 --workers=1`
    (0/42 → 42/42 after the fix), then the full file across all 3
    browsers together (63/63). Full-file runtime dropped from what would
    have been several minutes of fixed waits to well under a minute per
    browser.
  - `eslint` and `vue-tsc --noEmit` both clean.

- **2026-07-10**: Converted `tests/playwright/e2e/match-statement.spec.ts`
  (all 105 waits). Unlike the two files above, every wait here was the
  same simple shape (uniform 200ms, always "wait after a keypress/typed
  text before the next action," no popups or async eligibility checks
  involved) -- straightforward bulk conversion to `waitForEditorSettled`,
  plus deleting one redundant wait immediately after a
  `pressN(..., true)(page)` call (same reasoning as in
  `rename-identifiers.spec.ts`: it already settles after every press).
  Verified: full file across all 3 browsers (27/27), chromium
  `--repeat-each=3` (27/27). `eslint` and `vue-tsc --noEmit` both clean.

- **2026-07-10**: Converted `tests/playwright/e2e/structured-expressions-media.spec.ts`
  (all 32 waits). This file is skipped entirely on Chromium (headless
  Chromium blocks non-text clipboard writes) and carries its own
  disclaimer that these clipboard tests "have a habit of passing from
  Playwright but failing in real life" -- so validation for this file
  means firefox+webkit only, not the usual chromium-first pass.
  - Ordinary "wait after keypress" waits → `waitForEditorSettled`, as
    usual. Also deleted several waits that were genuinely redundant
    because the preceding call already settles internally:
    `doTextHomeEndKeyPress`, `typeIndividually`, and `doPagePaste` (all
    in `editor.ts`) each already await `waitForEditorSettled` themselves,
    so an explicit wait immediately after one of these added nothing.
  - Two more specific signal replacements, since this file waits on
    things `waitForEditorSettled` doesn't track:
    - Around `Ctrl+C`: writing to the OS clipboard is an async step
      outside the page with no page-side signal to poll, so instead of
      guessing a fixed delay before reading it back, switched to
      `expect.poll(() => page.evaluate("navigator.clipboard.readText()"))`
      (or `.read()` for item count) -- this succeeds as soon as the
      write actually lands instead of after a fixed guess, and fails
      clearly if it never does.
    - The "Can take a moment to decode the image" wait before checking
      cursor focus after pasting an image: replaced with
      `page.waitForFunction(() => img.complete && img.naturalWidth > 0)`
      on the pasted `img[data-code^='load_image']` element -- the actual
      decode-completion signal, rather than a blind 2-second guess.
  - Verified: firefox+webkit (Chromium doesn't run this file) full file
    (20/20), then `--repeat-each=3` (60/60). `eslint` and
    `vue-tsc --noEmit` both clean.

- **2026-07-10**: Reviewed CI run
  [29108401961](https://github.com/neilccbrown/Strype/actions/runs/29108401961)
  (commit `9837e863`, flagged by Neil -- "a lot on Linux/WebKit are
  flaky") to check which failures/flakes were in files already converted
  this session vs still-to-do. Tallied failure/flaky occurrences by spec
  file across all 6 jobs:
  - Confirmed the WebKit jobs were the clear outliers: macOS+WebKit (2
    failed, 14 flaky) and especially Linux+WebKit (0 failed but **130
    flaky**, vs 3-9 flaky on the other 4 jobs).
  - `structured-expressions-selection.spec.ts` (66 occurrences) and
    `structured-expressions-copy-paste.spec.ts` (49 occurrences)
    dominated the Linux+WebKit flaky count. The former is converted
    (mine), the latter was not at the time. Both showed the *same*
    symptom -- a test finding stale content from a *different* prior
    test (e.g. the untouched default-project text) -- which, combined
    with the fact `copy-paste` wasn't touched by me yet, points to a
    `beforeEach`/page-navigation-level race on that runner rather than
    something wrong with either file's individual wait conversions.
    Treating this as most likely a noisy/contended runner that specific
    run, not a regression -- worth confirming on the next CI run now
    that `copy-paste` is also converted.
  - **Real, recurring issue, not attributable to my conversions**:
    `graphics.spec.ts` → "Test get_clicked_actor returns the right item"
    failed (final, not flaky) on macOS+Firefox and flaked on Linux+WebKit,
    both times with the identical signature: `loading-saving.ts`'s
    `load()` stuck for 30s waiting for `.project-name` to read
    `"data-graph"`, staying on `"My project"` throughout -- yet on one
    retry that got further, the *file content* had clearly loaded (the
    console showed the loaded program's own output). This is now the
    same signature recurring across 3 browser/OS combinations over two
    separate CI runs -- Neil's hypothesis is a real app-level bug (the
    project name label not updating even when the load itself succeeded),
    not test timing. **Logged in PLAN.md's new "Known suspected app bug"
    section and deliberately NOT fixed here** -- Neil wants it kept out
    of this PR to stay focused on the wait-conversion work; it'll be a
    separate investigation.
  - Possible real regression, lower confidence: `match-statement.spec.ts`
    had 2 tests on Linux+WebKit come back with **zero** match/case
    content saved, as if none of the setup keystrokes registered --
    worse than ordinary flakiness. Hypothesis: removing the fixed 200ms
    wait after pressing "m" (which creates the match frame) may let
    typing race ahead of the frame's initial render specifically on
    Linux's WebKit build, which I have no way to test locally (only
    validated macOS WebKit, which passed cleanly). Not yet reproduced or
    fixed -- flagged for a future session with access to a Linux
    environment, or by watching whether it recurs on the next CI run.
  - Per Neil's direction: picked the next file to convert by **actual CI
    flakiness impact** (tallied above) rather than by the original static
    wait-count table, since a file with a smaller raw wait count can
    still dominate CI noise once its parameterised test-case count is
    factored in. That's what led to `structured-expressions-copy-paste.spec.ts`
    (see next entry below) instead of the next-highest row in the table above.

- **2026-07-10**: Converted `tests/playwright/e2e/structured-expressions-copy-paste.spec.ts`
  (all 12 call sites, generating 67 parameterised test cases -- the
  highest-impact untouched file in the CI run reviewed above). Same
  shape as `structured-expressions-selection.spec.ts`: ordinary waits →
  `waitForEditorSettled`; the clipboard-write wait around `Ctrl+C`/`Ctrl+X`
  → `expect.poll` on the clipboard read (same fix as
  `structured-expressions-media.spec.ts`), simplified further here since
  the poll already proves the clipboard equals `expectedClipboard`, so
  the `CUT_REPASTE` branch reuses that constant directly instead of doing
  a second clipboard read. Also deleted a wait between the last selection
  keystroke and the next action that was redundant once that keystroke's
  own loop iteration already ends in a settle.
  - Verified: full file across all 3 browsers (201/201 = 67 cases × 3),
    chromium `--repeat-each=3` (201/201), chromium under CDP 4x CPU
    throttle (67/67) given this file's history of being the worst
    flakiness offender in real CI. `eslint` and `vue-tsc --noEmit` both
    clean.

- **2026-07-11**: Converted `tests/playwright/e2e/load-save-random.spec.ts`
  (all 23 waits) -- the next-highest untouched file by CI flakiness
  impact (19 occurrences in the run reviewed the day before). This one
  had two genuinely different problems mixed together, and separating
  them mattered:
  - **Ordinary wait conversion** (as usual): `waitForEditorSettled` for
    keypress-settle waits; deleted the redundant wait right after
    `save()` in `testSpecific` (its own internal `page.waitForEvent`
    already guarantees the download landed) and the redundant wait
    before context-menu clicks in `disablePrev`/`enterFrame` (the
    subsequent `getByRole("menuitem", ...).click()` already waits for
    it -- the `@imengyu/vue3-context-menu` library only does a 0.1-0.2s
    opacity fade, confirmed in its bundled CSS, which doesn't trip
    Playwright's position/size-based stability check the way an
    animated *slide* would).
  - **`newProject()`'s two `page.waitForTimeout(2000)` calls (opening the
    main menu, clicking "New project")**: these turned out to be masking
    a real, reproducible app-interaction bug, not just slow rendering.
    First pass removed them outright (reasoning: `vue3-burger-menu`'s
    open is a plain `v-if`, and `click()` already waits for actionability)
    -- this was wrong, and it took three iterations to find out why:
    1. Local validation surfaced the *real* problem hard: nearly every
       "Enters, saves and loads specific frames" test (not just the
       fuzzer) hung for the full 180-240s test timeout on
       `page.click("#newProjectLink")`, logging "element is not stable"
       then "element was detached from the DOM, retrying" -- forever.
    2. First hypothesis (wrong): the burger menu's slide-open transition
       (confirmed 0.5s, JS-driven, in the library's bundled CSS) was
       remounting DOM during the animation. Added a position-stability
       poll before clicking, mirroring `dividers.ts`'s technique. This
       made things *worse* (81 failed vs 56) and didn't touch the
       symptom at all -- proof the animation wasn't the actual cause.
    3. Second hypothesis (also wrong): the click triggers a page reload
       (`window.location.href` in `resetStrypeProject`, App.vue) and
       Menu.vue's handler synchronously unmounts the link
       (`showMenu=false`) right after, so `click()`'s own post-action
       wait was racing the teardown. Added `noWaitAfter: true`. Still
       failed identically -- proof this wasn't post-click at all: a
       trace inspection (`npx playwright show-trace`, then parsing
       `0-trace.trace` directly) showed the hang happening during the
       *pre*-click actionability wait, before any click had even fired.
    4. Root cause, confirmed by direct reproduction (a throwaway spec
       that called the app's real `save()`, then instrumented every
       `click`/`focusin`/`focusout`/`mousedown` on `document` before
       opening the menu): the menu opens successfully, then
       **auto-closes itself within ~300ms with no further interaction**,
       only when this runs right after `save()`. The instrumentation
       caught the actual trigger directly -- a spurious `click` event on
       `#saveStrypeFileNameInput` (the *already-closed* Save dialog's
       filename input) firing on its own, ~270-280ms after the menu was
       opened. Traced to `Menu.vue`'s `onStrypeMenuShownModalDlg`: when
       the Save dialog is shown, it schedules a `setTimeout(..., 500)`
       that calls `.focus()` and `.click()` on the filename input (a
       deliberate, self-documented workaround for a Bootstrap focus
       quirk). That timeout was never cancelled if the dialog closed
       before it fired -- which `save()`'s automated fill-and-click flow
       always does well within 500ms -- so it fires later regardless,
       against a stale/hidden input, and the spurious `.click()` trips
       `App.vue`'s `handleWholeEditorMouseDown` (closes the menu on any
       mousedown in the editor area), closing whatever menu happens to
       be open at that moment.
    5. This is a genuine, if narrow, **application bug** (Neil confirmed
       via direct discussion): a real user saving quickly (finishing the
       dialog in under 500ms) and then reopening the menu in that same
       window would hit the same silent, unexplained menu-closing
       behaviour. Fixed at the source in `src/components/Menu.vue`:
       store the `setTimeout` handle (`saveDialogFocusTimeoutId`) and
       `clearTimeout` it in `onStrypeMenuHideModalDlg` if the save dialog
       closes before it fires. Confirmed via the same instrumented repro
       that the spurious click no longer fires after the app fix.
  - Since the app bug is fixed at the root, the test-side workaround
    (retrying the menu-open) was rolled back to a single attempt, per
    Neil's steer once the root cause was confirmed and fixed -- no point
    keeping defensive retry logic for a race that can no longer happen.
    `noWaitAfter: true` on the click is still needed and kept: it's an
    unrelated issue (the click handler synchronously unmounts the link
    it was just clicked on, right after scheduling the page reload,
    which otherwise races Playwright's own post-click actionability
    wait) -- confirmed independently via the trace inspection in step 3
    above, nothing to do with the stale-timeout bug.
  - This bug (both the app-level stale timeout and the test-level hang
    it caused) is very likely responsible for a large share of this
    file's historical CI flakiness on its own: it made *every* call to
    `newProject()` following a `save()` (i.e. every single test in the
    file, fuzzer or not) liable to hang for its full 180-240s timeout.
  - Verified end to end with the app fix + simplified (non-retry) test
    code: `-g "For\+if"` alone went from timing out at 240s to passing
    in 24s. Full "Enters, saves and loads specific frames" describe
    block (42 tests, previously riddled with timeouts): 42/42 passing in
    5.3 minutes. Full file including the "Tests random entry" fuzzer,
    firefox+webkit (Chromium is skipped in this file already): 0 failed
    / 8 flaky / 86 passed in 14.1 minutes; repeated: 0 failed / 7 flaky
    / 87 passed in 14.1 minutes; after the app fix + simplification:
    0 failed / 10 flaky / 84 passed in 15.6 minutes, then 0 failed / 7
    flaky / 87 passed in 13.7 minutes -- consistently 0 hard failures
    across every run, remaining flakiness confined to the separate
    autocomplete-interference issue below. Compare to before this
    session's fix: the same scope routinely took 1.2-2.3 *hours* and
    failed 56-81 tests.
  - **Separately, and only partially addressed**: reviewing failure logs
    at Neil's request surfaced a second, unrelated class of flakiness --
    the fuzzer's `genRandomString`/`genRandomExpression` generate raw
    identifier-like text, which can trigger the app's autocomplete
    dropdown. While it's open, `LabelSlot.vue`'s `handleUpDown` consumes
    ArrowUp/ArrowDown to navigate the dropdown instead of the editor,
    which can leave the frame cursor somewhere `enterFrame` doesn't
    expect (`checkFrameXorTextCursor` failures: "expected numFrameCursors
    1, received 0"). Confirmed via `LabelSlot.vue`'s own keydown handling
    that only Arrow/Enter/Escape/Tab are consumed while showing, and
    confirmed circumstantially by two pre-existing patches in the
    generator itself (`is  not` → `is not`, `> >` collapsing) for the
    exact same class of "generated content gets reinterpreted by the
    editor" problem. Added `dismissAutocompleteIfShowing()`, called after
    typing each slot's content -- checks for
    `.<acPopupContainerClassName>:visible` and only presses Escape when
    it's actually open (pressing Escape when autocomplete is *not*
    showing has its own side effect: `LabelSlot.vue`'s `onEscKeyUp` blurs
    the slot entirely in that case, per its own code, which would trade
    one source of cursor confusion for another). This measurably reduced
    but did not eliminate the class of failure -- the remaining flaky
    entries in the fuzzer are a mix of this (only guarded at one call
    site) and genuine occasional slowness on very large generated frames.
    Given the fuzzer's content space is open-ended, treating this as a
    partial mitigation rather than a complete fix; noted here rather than
    chased to zero today.
  - `eslint` and `vue-tsc --noEmit` both clean.

- **2026-07-11**: Converted `tests/playwright/e2e/slot-errors.spec.ts`
  (all 7 waits). Picked over `console-execution.spec.ts` (tied at 7 CI
  occurrences) because a quick check of that file's actual CI failures
  showed 5/7 were the already-documented "Firefox slow to reinitialise"
  Pyodide-loading baseline (not wait-timing, not fixable by conversion),
  whereas `slot-errors.spec.ts`'s failures (`element(s) not found` on a
  slot ID) looked like genuine timing issues in the file's own waits.
  - Ordinary conversions: the per-keypress waits inside
    `checkErrorAfterExitingSlot`'s loop and the "No error on function
    descriptions" test → `waitForEditorSettled`. Deleted (not converted)
    the two waits that sat directly before a `toContainClass`/
    `not.toContainClass` assertion -- Playwright's own assertion retry
    (default 5s) already covers exactly this "wait for a class to
    appear" case, so an explicit wait first was redundant regardless of
    whether the underlying error-validation is synchronous or debounced.
  - Verified: full file, firefox+webkit (file skips Chromium, pre-existing
    and unrelated -- a documented Mac+Chromium-only quirk with comment
    frame exit behaviour), 14/14. WebKit `--repeat-each=5` (35/35), since
    that's where this file's CI flakiness was concentrated. `eslint` and
    `vue-tsc --noEmit` both clean.

- **2026-07-11**: Converted `tests/playwright/e2e/storage-model.spec.ts`
  (6 of 9 waits; 3 kept deliberately). This file tests cross-tab/cross-
  reload storage behaviour with multiple browser contexts and pages, so
  several waits genuinely aren't page-state-observable in the usual way:
  - Deleted 4 waits sitting directly after `save(page, true, ...)`
    (the modal-showing path) -- confirmed via the same repro technique
    used for the `load-save-random.spec.ts` Menu.vue investigation that
    the save modal is already fully closed by the time `save()` returns,
    so these were pure guesses with nothing left to wait for. Also
    deleted 2 more sitting directly before an assertion that already
    retries (`assertStartingPlus`/`assertRecentStatesShowing`).
  - Kept 2 waits after `save(page, false)` (the no-modal quick-resave
    path), immediately before a page close or a menu interaction:
    `save()` only waits for the browser's `download` event, but the
    autosave write to IndexedDB/localStorage this test actually cares
    about is a separate async operation with no exposed completion
    signal -- genuinely can't observe it from the test side, so these
    stay as deliberate real-time waits (comment updated to explain why,
    replacing the vaguer original "Give it a moment to update the
    state").
  - Kept 1 wait immediately before a *negative* assertion
    (`not.toBeVisible()` on the message banner) -- relying on the
    assertion's own retry would pass trivially before the banner had a
    chance to (wrongly) appear, so this needs to stay a real-time wait
    by design (same reasoning as similar cases in `graphics.spec.ts` and
    `rename-identifiers.spec.ts` earlier this session).
  - **Validation detour**: first full-file run showed 16/51 failing with
    `page.goto: Could not connect to the server` / `NS_ERROR_CONNECTION_REFUSED`
    on Firefox+WebKit only, reproducing identically across a dev-server
    restart and `--workers=1`, including on tests this session never
    touched (e.g. "Check dialog doesn't show on fresh project", which
    fails at its very first `page.goto`, before any of this file's code
    runs) -- ruled out as anything to do with these wait changes. Root
    cause: `closePage()` navigates to `http://localhost:8089/` as a
    Firefox/WebKit-specific workaround for `.close()` not behaving, and
    that asset server (`npm run test:cypress:serve-assets`) was never
    started this session -- earlier files in this session's queue didn't
    exercise `closePage()`, so the gap went unnoticed until now. Started
    it and reran: 51/51, twice.
  - `eslint` and `vue-tsc --noEmit` both clean.

- **2026-07-11**: Converted `tests/playwright/e2e/load-save-demos-books.spec.ts`
  (all 5 waits) -- picked as a small, quick file to close out the
  session on. Waits before opening the burger menu and clicking through
  the Book dialog (menu → "Book..." → chapter → example) were all
  deleted, relying on `click()`'s own actionability wait, matching the
  already-established finding that this app's `ModalDlg`s render with no
  animation and the one component that does animate (the burger menu)
  doesn't gate the *link inside it* on that animation. The wait before
  `save()` after double-clicking to load the "fireworks" example was
  replaced with the same `.project-name`-equals-expected signal
  `loading-saving.ts`'s `load()` already uses -- traced the book-loading
  path in `Menu.vue` (`selectedProject.projectFile.then(...)`) and
  confirmed it's genuinely async and converges on the same project-name
  update mechanism as a regular file load. The wait before `save()` in
  the paste variant was deleted, since `doPagePaste` already settles
  internally (including through a large multi-frame paste's frame count
  changing while it renders).
  - Verified: full file, all 3 browsers (18/18), chromium
    `--repeat-each=3` (18/18). `eslint` and `vue-tsc --noEmit` both
    clean.

- **2026-07-11**: Converted `tests/playwright/e2e/load-save-frozen-collapsed.spec.ts`
  (all 7 waits) -- picked as a small file (7 waits) with genuine CI
  flakiness history (flagged in the 2026-07-10 CI review: "Freeze Beta
  part-folded", "Freeze top1 then cycle its visibility with toggle").
  - 5 of the 7 waits were all the identical "Wait a moment for errors to
    be checked" pattern, before deliberately attempting an action that
    should be *refused* because the frame has a syntax error. Replaced
    with a new `waitForErrorDetected()` helper that waits for
    `Menu.vue`'s `.error-count-span` to become visible (that element's
    parent is `v-if="errorCount > 0"`, so its visibility is a direct,
    real signal that the app has actually registered the error) --
    rather than guessing 2000ms and hoping the syntax check had finished
    by then.
  - The remaining 2 (in "Freezing prevents focusing the text slots with
    clicking") were converted to `waitForEditorSettled`. First attempt
    also added a new `checkFrameXorTextCursor(page, true)` assertion
    after the click, reasoning it would make the test more precise --
    this was a mistake caught by validation: it failed consistently
    across all 3 browsers, and the screenshot/root-cause showed why --
    clicking a *frozen* frame's text can still create a native browser
    selection point even though the app correctly blocks entering edit
    mode and shows a frame cursor instead, so both a "text cursor" and a
    "frame cursor" can legitimately coexist in this one specific case.
    `checkFrameXorTextCursor`'s XOR invariant doesn't hold here, and the
    original test never claimed it did -- reverted to just the settle
    wait, since asserting something the original author never verified
    (however reasonable it seemed) risked encoding a wrong assumption
    about app behaviour into the test.
  - Verified: full file, all 3 browsers (81/81), full file
    `--repeat-each=3` (243/243). `eslint` and `vue-tsc --noEmit` both
    clean.

- **2026-07-11**: Reviewed CI run
  [29149105784](https://github.com/neilccbrown/Strype/actions/runs/29149105784)
  (Playwright) /
  [29149105785](https://github.com/neilccbrown/Strype/actions/runs/29149105785)
  (Cypress), commit `95d96483` -- the first real CI run since the
  2026-07-10 review, covering everything up to and including
  `load-save-random.spec.ts` (the `slot-errors`/`storage-model`/
  `load-save-demos-books`/`load-save-frozen-collapsed` conversions came
  after this commit and aren't covered yet). Jobs: macOS+chromium and
  macOS+webkit failed; ubuntu (all 3 shards) and macOS+firefox passed;
  Cypress python-ubuntu shard 2 failed.
  - **Two real, unresolved bugs in helpers this session already touched
    and believed fixed** -- both now written up in detail in PLAN.md's
    "Known suspected app bugs and unresolved test-helper bugs" section
    rather than repeated here:
    1. `waitForGraphicsSettled` (`execution.ts`) fails deterministically
       (identical 86.64% pixel diff across all 4 attempts, not flaky) for
       `graphics.spec.ts` tests whose Python code is an ongoing
       `while True: ... pace(N)` loop -- the "3 consecutive unchanged
       redraw counts" completion signal can never actually trigger while
       such a loop keeps running, so the function always silently falls
       through to its 15s timeout. Affects every loop-driven test in the
       file, not just the one that failed outright here.
    2. The Cypress `waitForEditorSettled` fix from 2026-07-10 is
       confirmedly live (the error message format proves it) but still
       insufficient: `paste-python.cy.ts`'s large (92-frame) paste test
       got stuck at 8 consecutive stable reads (need 15) within the 10s
       budget -- the self-driven `setTimeout(check, 30)` loop can't
       actually maintain a ~30ms cadence when heavy DOM re-rendering
       blocks the same main thread the poll runs on, unlike the
       Playwright port which polls from Node, out-of-process.
  - Both deliberately left unfixed per Neil's request to update the plan
    first -- see PLAN.md for the reasoning on why each needs a proper
    redesign rather than a quick numeric tweak.
  - Everything else in the failure/flaky lists was either noise in files
    not yet converted this session (`console-execution.spec.ts`'s
    already-documented Firefox/Pyodide-slow-load pattern,
    `structured-expressions-navigation.spec.ts`, one `match-statement.spec.ts`
    flake) or a pre-existing flake in the *old*, not-yet-converted
    version of `load-save-demos-books.spec.ts` (that file's conversion
    postdates this CI run's commit, so it can't be related to it).

- **2026-07-11**: Fixed both helper bugs logged above, at Neil's request
  to go ahead and try.
  - **`waitForGraphicsSettled` (`tests/playwright/support/execution.ts`)**:
    added a fallback completion condition alongside the existing
    stability check, specifically for tests whose Python code is an
    ongoing `while True: ... pace(N)` loop (where the redraw count never
    stabilises by design, so "3 consecutive unchanged reads" can never
    fire). The fallback: once at least 5 redraws have landed *and* at
    least 500ms of wall-clock time has passed since the first one, treat
    that as settled even though the count is still changing. This only
    engages once real redraws are actually happening -- it doesn't touch
    the existing `cur > 0` guard from the 2026-07-10 fix -- and
    single-draw callers (turtle square, matplotlib) still hit the faster
    stability path first in the common case, since it's checked before
    the fallback on every iteration.
    - Verified: full `graphics.spec.ts`, chromium (32/32). Then, since
      the original failure was CI-specific (never reproduced locally
      un-throttled), added a temporary CDP 4x CPU throttle
      (`Emulation.setCPUThrottlingRate`) to the file's `beforeEach` --
      the best available local proxy for a slower/loaded CI runner -- and
      re-ran: the failing test plus its five "shared with turtle"
      siblings (6/6), then the failing test alone with
      `--repeat-each=3` (3/3). Removed the temporary throttle code
      afterwards (confirmed via `git diff` showing no `TEMP`/
      `CPUThrottling` lines left). `eslint` and `vue-tsc --noEmit` both
      clean.
  - **Cypress `waitForEditorSettled` (`tests/cypress/support/test-support.ts`)**:
    replaced the "N consecutive stable reads" counter with wall-clock
    time tracking -- record the timestamp (`stableSince`) whenever the
    observed state *changes*, and require `Date.now() - stableSince` to
    reach the needed duration (450ms when blank, 0 when not) rather than
    counting how many poll iterations happened to land during that
    window. This is a direct fix for the diagnosed root cause: Cypress's
    poll runs on the same main thread as the app's own rendering, so a
    "fixed" `setTimeout(check, 30)` can't actually maintain a ~30ms
    cadence under heavy DOM churn -- tracking real elapsed time instead
    of iteration count means the answer is correct regardless of how
    fast or slow the polling actually managed to run.
    - Verified: `paste-python.cy.ts` (the file with the large 92-frame
      paste that triggered this) run twice, 59/59 both times, including
      the specific previously-failing test. Broader spot-check across
      other callers of this shared helper for regressions:
      `structured-expressions.cy.ts` (62/62), `autocomplete.cy.ts`
      (27/27), `param-prompts.cy.ts` (64/64). `eslint` and
      `vue-tsc --noEmit` both clean.
  - Neither fix has a fresh CI run to confirm yet (would need a push);
    local + throttled validation is the strongest evidence available
    before that.

- **2026-07-10/11**: Investigated and fixed the recurring flake noted above
  in `console-execution.spec.ts` → "Check console prints don't queue up
  after stopping" ("time" variant). This was **not** a wait/assertion
  problem -- it was a real app bug, so no wait→condition rewrite applied
  here; noting it in this log anyway since it's the same "Stop doesn't
  take effect promptly" family of bug and the fix touches app code that
  future test-flake investigations in this area should know about.
  - **Repro strengthened**: added a third test alongside the two existing
    "time"/"literal" print-flood variants -- `strype.graphics` with
    `Actor.move()` in a tight `while True` loop, checked via the existing
    `setupGraphicsRedrawObserver`/`__strypeGraphicsRedrawCount` proxy (no
    printed output to inspect for graphics, so redraw count stands in for
    "did it keep moving after Stop"). This is more reliable at provoking
    the underlying class of bug because sprite/graphics updates go out on
    their own dedicated `MessagePort` (`self.updatePort` in
    `python-execution.ts`), entirely bypassing the existing 50-request
    async throttle that only covered `makeRequest`/`makeRawRequest`.
  - **Root cause #1** (unbounded sprite queue): fixed by sharing the same
    "count to 50, then do a blocking dummy sync round-trip" throttle
    between `makeRequest`'s async branch and the sprite manager's
    `notify` callback (extracted into `catchUpWithMainThreadIfNeeded()` in
    `python-execution.ts`).
  - **Root cause #2** (the actual flake, WebKit-specific per the user):
    `terminateAndRestartPyodide()` (`main_thread_python_handler.ts`)
    always called `worker.terminate()` directly. Without cross-origin
    isolation (no `SharedArrayBuffer`; Strype deliberately avoids COOP/COEP
    since it'd break Google Drive), the periodic dummy catch-up blocks the
    worker in a *synchronous XHR* (`sync-message` library's
    `serviceWorker` channel type). Some browsers -- WebKit in particular --
    don't reliably abort an in-flight synchronous XHR just because
    `worker.terminate()` was called, so the worker (and its printing/sprite
    updates) can keep going for several seconds after Stop, until that
    poll naturally resolves. This never showed up before the 50-request
    throttle existed (e7b18d73) because before that fix the worker never
    blocked on anything during a tight print loop, so `terminate()` always
    hit it in a normal running state where it's reliable -- the throttle
    fix (needed to bound the backlog) is what introduced this narrower
    window.
  - First attempted fix used `pythonClient.interrupt()` (the
    comsync/pyodide-worker-runner library's built-in mechanism for exactly
    this: unblocking a pending synchronous read). This technically worked
    but was wrong: it makes the worker's blocked `readMessage()` throw a JS
    `InterruptError`, which propagates through Pyodide as a Python
    exception and gets displayed to the user as a genuine "Runtime error"
    (plus prints a traceback to the console) -- confirmed by a reproducible
    `NaN` failure in the "time" test once real. Reverted.
  - **Actual fix**: added `outstandingSyncRequestKind` (a ref in
    `main_thread_python_handler.ts`, set by `PythonExecutionArea.vue`'s
    request handler to the `request` field of whichever sync request is
    currently outstanding). When stopping, if the worker is blocked
    (`state === "awaitingMessage"`) *and* we can tell for certain it's
    blocked on our own internal "dummy" catch-up (not some other
    genuinely-pending request like `input()`, which is left alone exactly
    as before -- answering it with the wrong payload would itself surface
    as a spurious error), we answer that specific request ourselves
    directly via `pythonClient.writeMessage({request: "dummy", response:
    true})` -- the exact same non-error response the normal machinery
    would eventually send -- before calling `terminate()`. Capped with a
    500ms `Promise.race` so a stuck write can never block the actual
    terminate. `terminateAndRestartPyodide()` is now `async`; both call
    sites use `void` (ESLint `no-floating-promises`) since neither needs
    to await it.
  - Verified: all 9 tests in the "queue up after stopping" describe block
    (3 print + 3 literal + 3 new graphics, × runTime 3/10/30) pass on
    chromium and firefox, including the previously-failing "time" variant
    which had reproduced 100% of the time (even at runTime=3) once the
    `.interrupt()` mistake was in place -- confirming that was the actual
    bug, not pre-existing flakiness. Full `console-execution.spec.ts`
    (32/32 chromium) and `graphics.spec.ts` (32/32 chromium) also clean, in
    particular the two tests that click Stop while blocked on `input()`
    and `time.sleep()` respectively (both assert zero errors shown) --
    confirming the `outstandingSyncRequestKind` guard correctly leaves
    those paths untouched. Could not verify on WebKit: Windows+WebKit
    can't load the app at all in this environment (separate, pre-existing,
    already-`skip()`-ed issue -- see below), though a bare WebKit page load
    with no app works fine on Windows, so it's specific to this app.
    `eslint` and `vue-tsc --noEmit` both clean.
  - **Aside on Windows+WebKit** (`testInfo.skip(true, "Skipping on Windows
    + WebKit due to unknown problems")` in both `console-execution.spec.ts`
    and `graphics.spec.ts`): loading the real app under Playwright's
    WebKit on Windows throws `ReferenceError: Can't find variable:
    AudioBuffer` twice during startup and the app never mounts (0
    `.frame-div` elements). `AudioBuffer` is referenced eagerly by
    sound-related code (`sound_manager.ts`, `App.vue`); worth checking
    whether Playwright's WebKit-on-Windows build lacks a Web Audio backend
    entirely (a known-ish Playwright/WebKit-on-Windows gap) and, if so,
    feature-detecting/deferring that reference so app startup doesn't
    depend on it. Not investigated further -- out of scope here.
