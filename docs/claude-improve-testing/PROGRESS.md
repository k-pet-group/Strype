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
| [ ] | `tests/cypress/support/expression-test-support.ts` | 3 | |
| [ ] | `tests/cypress/support/autocomplete-test-support.ts` | 3 | |
| [ ] | `tests/cypress/support/param-prompt-support.ts` | 3 | |
| [x] | `tests/cypress/support/load-save-support.ts` | 1 | Converted, see Log |

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
