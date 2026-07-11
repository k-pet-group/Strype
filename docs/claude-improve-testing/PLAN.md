# Plan: remove hard-coded waits from the e2e suites

## Problem

The Cypress (`tests/cypress`) and Playwright (`tests/playwright`) suites
contain roughly **729 hard-coded waits** (`cy.wait(<ms>)`,
`page.waitForTimeout(<ms>)`) across 42 files, found with:

```
rg '\.wait\(\s*\d|waitForTimeout\(\s*\d' tests
```

(Re-run that periodically — the count below in PROGRESS.md is a snapshot
from 2026-07-09.)

These cause two problems:
1. **Flakiness** — if the underlying action occasionally takes longer than
   the chosen constant, the test fails, with no relation to a real product
   bug.
2. **Slowness** — most waits are longer than needed "just in case", so the
   suite pays the worst-case time on every run instead of the actual time.

Both Cypress and Playwright have built-in retry-ability (`cy.get`/`.should`
auto-retry; `expect(locator)....` auto-retries; `page.waitFor*` helpers) —
the goal is to wait on the thing that actually indicates completion instead
of a clock.

## Why this mostly shows up on CI, not locally

Observed symptom: these tests almost always pass on a dev machine and fail
intermittently on GitHub Actions. That's expected, not a coincidence — it's
the central difficulty this initiative has to work around, so it gets its
own section up front.

**Root cause.** A hard-coded wait is really a bet: "the real operation will
finish well within N ms". A modern dev laptop finishing the real work in,
say, 200ms leaves a wait of 1000–2000ms a huge, comfortable margin, so the
bet always looks safe locally. The GitHub-hosted runners this project uses
(`ubuntu-latest` / `macos-latest`, see
`.github/workflows/run-playwright-tests.yml` and `run-cypress-tests.yml`)
are shared, modestly-specced VMs, further contended by running 3-way
sharded, `fail-fast: false` matrix jobs — the real work can easily take
several times longer there. The margin that looked comfortable locally can
be thin or negative on CI. This is likely *the* main source of flakiness in
this suite, more than genuine app race conditions.

**Two ways this bites the conversion work specifically, not just the
existing waits:**
1. **A hard-coded wait can look like it needs no fix.** If you can't
   reproduce a failure locally even with the wait set to something silly
   like 0ms, you have no local signal that a race exists at all — you're
   working blind, and can't tell "this wait is genuinely unnecessary" from
   "this wait is necessary but only fails on a slower machine".
2. **A "fixed" wait can look correct while actually being wrong.** After
   replacing a wait with `cy.get(...).should(...)` / `expect(locator)...`,
   the assertion might happen to already be true the instant it's checked,
   purely because the local machine is fast — in which case the test would
   have passed even with a wrong or overly-narrow condition, and you'd have
   no way to tell the difference between "correctly waiting for the right
   thing" and "got lucky because the machine is fast". Both look identical
   locally: green.

**The fix: deliberately make the local machine slow enough to reproduce the
CI-like margin, for both halves of the job:**
1. **Before** converting a wait: temporarily set it to `0` (or delete it
   outright) and run the test repeatedly, ideally under artificial slowdown
   (see below), until you can reliably reproduce the failure it's meant to
   guard against. That failure is your reproduction case — keep it running
   in a second terminal/tab while you work.
2. **After** converting a wait: run the *converted* test under the same
   artificial slowdown, repeatedly, and confirm it now passes reliably. If
   it only passes at normal (fast, unthrottled) speed, that's not good
   enough evidence — the whole point is to check it survives conditions
   that would have exposed the old bug.

See RECIPES.md → "Provoking CI-like slowness locally" for concrete
mechanics (CPU/network throttling via Chrome DevTools Protocol, available
from both Cypress and Playwright for Chromium; fallback options for
Firefox/WebKit, which don't support CDP the same way).

## Goal

Replace each hard-coded wait with a wait on an observable, specific
condition: an element appearing/disappearing/changing text, a network
request resolving, a class toggling, a downloaded file existing, etc. Where
no such signal currently exists in the app, the fallback options are (in
order of preference):
1. Find/expose an existing DOM signal (a class, attribute, or element that
   already changes when the operation completes).
2. **Wait for Vue's reactivity to settle instead of a DOM change.** Not
   every completion condition has (or should need) a visible DOM signal —
   sometimes what the test is really waiting for is "Vue has finished
   processing the update(s) triggered by the last action". Vue exposes
   `nextTick()` for exactly this. This is a *different kind* of fallback
   from the others in this list — it's often preferable to inventing a
   throwaway DOM signal purely for a test's benefit, because it waits on
   the framework's actual unit of work rather than a proxy for it. See
   RECIPES.md for how to drive this from Cypress/Playwright and when one
   `nextTick()` isn't enough (chained updates need awaiting `nextTick()`
   more than once).
3. Add a minimal, test-only signal to the app if nothing suitable exists
   (e.g. a `data-*` attribute or CSS class flipped when an async operation
   settles) — only after discussing with the user, since it touches
   production code.
4. As a last resort, keep a short wait but document *why* in a comment, and
   keep the value as small as defensible.

Not every occurrence needs to disappear — some `cy.wait()` calls guard
against genuine, hard-to-observe async settling (e.g. animation/debounce
timers with no DOM signal). The point is to convert what's convertible, and
consciously decide about the rest.

## Non-goals

- Don't restructure the tests otherwise (no renaming, no re-organising
  files) beyond what's needed for the conversion.
- Don't change product code unless a wait genuinely cannot be expressed
  without a new test hook — and even then, check with the user first.
- Don't try to eliminate retries/`{force: true}` clicks etc. — out of scope,
  separate concern from timing waits.

## Strategy / ordering

1. **Shared support/helper files first** — these have the highest leverage:
   fixing a wait inside a helper used by many specs fixes many call sites at
   once, and is also where the trickiest "wait for what, exactly" judgement
   calls live. See `tests/*/support/*.ts` in PROGRESS.md.
2. **Then spec files, roughly biggest-count-first** — bigger files tend to
   have repeated patterns, so the first few conversions in a file establish
   a pattern the rest of the file can reuse quickly.
3. Within a file, group waits by *what they're waiting for* (paste to
   register, file to download, drag to settle, autocomplete popup to
   appear, etc.) rather than working strictly top-to-bottom — once you've
   worked out the right replacement for one instance of a pattern, apply it
   to all matching instances in the same pass.
4. Update `PROGRESS.md` after each file (or logical group of files) is
   converted, noting the pattern(s) used and any waits deliberately left in
   place with a reason.

## Working process for a single wait

0. Before touching the code, try to reproduce the race: set the wait to `0`
   (or delete it) and run the test repeatedly, ideally under artificial
   CPU/network throttling (see "Why this mostly shows up on CI, not
   locally" above and RECIPES.md). If you can make it fail reliably, keep
   that as your reproduction case for step 4. If you can't make it fail
   even throttled, that's still useful information — it's a candidate for
   simply deleting the wait rather than replacing it with a condition.
1. Read the surrounding test to understand what real-world event the wait
   is standing in for (open a popup? finish a save? settle a drag? let a
   debounce timer fire?).
2. Look for an existing DOM/state signal for that event:
   - An element that appears/disappears (`cy.get(...).should("exist")`,
     `await expect(locator).toBeVisible()`).
   - Text/attribute/class change (`.should("have.class", ...)`,
     `await expect(locator).toHaveClass(...)`).
   - A network response (`cy.intercept` + `cy.wait("@alias")` in Cypress;
     `page.waitForResponse(...)` in Playwright) — note `cy.wait("@alias")`
     is already the *correct* pattern and should not be "fixed" — this
     initiative targets numeric waits only.
   - File system effects (Cypress's `cy.readFile` already polls/retries
     until the file exists or its default timeout elapses — a `cy.wait()`
     placed right before it is usually redundant).
3. Replace the wait with the appropriate assertion/wait-for-condition call
   (see RECIPES.md for this codebase's established patterns).
4. Re-run the affected spec **multiple times, under artificial slowdown**
   (Cypress supports repeats via `cypress run --spec ...` looped manually,
   or just re-run a few times; Playwright: `npx playwright test <file>
   --repeat-each=5`) to confirm the new wait isn't itself flaky before
   moving on — this is the step that actually validates the fix, per the
   section above; running it once at normal local speed proves very little.
5. If no clean signal exists, leave the wait, add a one-line comment
   explaining why, and note it in PROGRESS.md so it can be revisited if the
   app later grows a better signal.

## Verification

- A converted file should pass `--repeat-each=5` (Playwright) or several
  manual re-runs (Cypress) locally **under artificial throttling** before
  being considered done — see "Why this mostly shows up on CI, not locally"
  above. A pass at normal local speed alone is weak evidence, since that's
  exactly the condition under which the old, wrong wait also always passed.
- Prefer running the specific file/spec rather than the whole suite while
  iterating — the full suite takes 2+ hours (see README.md).
- Once a batch of files is converted, do one full suite run to catch
  cross-file regressions before committing.
- Ultimately CI itself (across several pushes/re-runs) is the real test —
  local throttling is a proxy to catch problems before they cost a CI round
  trip, not a replacement for watching actual CI runs stay green.

## Verification retrospective: commit 0d927ab4's CI run (2026-07-10)

This is the first real end-to-end test of this plan's verification strategy
against actual CI, and it's worth recording honestly because the gap between
expectation and reality points at concrete gaps in the verification steps
above, not just one-off bugs.

**What was expected going into the push.** Commit 0d927ab4 converted
`tests/playwright/support/editor.ts` (5-6 waits) and
`tests/playwright/support/loading-saving.ts` (4 waits). Local verification
beforehand was substantial for `editor.ts` — 306 tests across 9 spec files,
plus a CPU-throttle stress run (rate=15, `--repeat-each=3`) — and moderate
for `loading-saving.ts` (`load-save-share.spec.ts` under throttle,
`load-save-random.spec.ts` on a couple of cases). Expectation: a clean or
near-clean run.

**What actually happened**, across all 6 CI jobs (`gh api
repos/<owner>/<repo>/actions/jobs/<id>/logs`, pulled after the run
completed):

| Job | Browser | Result |
|---|---|---|
| ubuntu, shard 1 | chromium | clean pass |
| macos, shard 1 | chromium | 454 passed, 7 flaky, **1 genuine failure** |
| ubuntu, shard 2 | firefox | **log stops mid-run at ~42min with no final summary, though the job ran 110min before reporting "failure"** — see below |
| macos, shard 2 | firefox | 15 failed, 28 flaky |
| ubuntu, shard 3 | webkit | 341 passed, 120 flaky, **1 genuine failure** |
| macos, shard 3 | webkit | 492 passed, 14 flaky, **2 failures** (both the same root cause as ubuntu/webkit's 1) |

**Root causes, sorted by how much they say about the verification process:**

1. **A real bug in the `save()` conversion, missed because the verification
   run never exercised that code path.** `storage-model.spec.ts` (webkit,
   both OSes) failed because `save(page, true, projectName)`'s custom name
   got silently overwritten by `Menu.vue`'s own `setTimeout(..., 500)` that
   populates the save-dialog's default filename. The bug is specifically in
   the `if (projectName)` branch — and no test in the local verification
   pass (`load-save-share.spec.ts`, `load-save-random.spec.ts`) ever calls
   `save()` with a custom name. **Lesson: verifying "the tests I happened to
   pick" is not the same as verifying "every parameter/branch of the
   function I changed."** When a converted helper has multiple call
   patterns (here: with/without a custom name), each pattern needs its own
   direct verification, not just whichever the convenient nearby test files
   happen to use. Confirmed reproducible on a fast local machine with *no*
   throttling at all (5/5) — this is a distinct failure class from the
   render/reactivity races the rest of this plan targets: a `.fill()`
   racing ahead of a fixed-real-time `setTimeout` in app code. CPU
   throttling (which slows script/render work) doesn't reliably surface it
   either way, so **"passes under CPU throttle" is not sufficient evidence
   for every wait — check whether the specific interaction being converted
   could race against a real timer in the app, not just against Vue's
   reactivity.**
2. **A pre-existing test bug, exposed (not caused) by the conversion
   removing accidental slack.** `structured-expressions-selection.spec.ts`
   had a bare `page.keyboard.press("ArrowLeft")` with no wait before the
   next action — its sibling test one `describe` block down has the
   identical pattern *with* an explicit wait, strongly suggesting a plain
   oversight in the original test that had enough incidental margin
   elsewhere to never fire before. **Lesson: when a conversion makes things
   faster/more precise, previously-masked pre-existing races can surface.
   This is a feature of the initiative working correctly, not a regression
   to be defensive about — but it does mean a "clean before, red after"
   diff needs a beat of investigation before assuming the new code is at
   fault.**
3. **Both of the above were found by treating the CI run itself as part of
   the discovery process**, not merely a pass/fail gate — reading actual
   error messages and tracing them to root cause in the app/test code,
   exactly as prescribed for local investigation elsewhere in this plan.
   Neither bug had a local repro *before* the CI run pointed at it. Worth
   stating plainly: **the verification steps above (throttled local runs)
   catch a specific known class of race (Vue-reactivity/render timing) very
   well, but are not a substitute for a real CI run** — add "run on CI and
   actually read the failures, don't just glance at red/green" as an
   explicit step, not an implicit hope.
4. **Most of the "flaky" (retry-recovered) failures look like pre-existing
   CI noise, not new regressions** — e.g. `console-execution.spec.ts`
   failing wholesale on macOS/Firefox with `Error: expect(locator).
   toHaveText(expected) failed ... Received: " Initialising..."`, timing
   out on the Python runtime never leaving its init state. The test
   helper's own comment (`tests/playwright/support/execution.ts:14`) says
   *"Firefox is incredibly slow to reinitialise on CI"* — this predates the
   conversion and is consistent with the CI findings in PROGRESS.md
   (Firefox/WebKit are the slow/flaky browsers generally). Not treated as a
   regression from this work, but **not independently confirmed as
   pre-existing either** — there's no baseline CI run of the *unconverted*
   code on this exact fork/runner pool to diff against. Worth getting one
   if flakiness accounting needs to be precise later (e.g. a run on `main`
   or the pre-initiative commit, same fork, same day, for a clean
   before/after).
5. **Open, unresolved: the ubuntu/firefox job's log stops abruptly at
   05:39:56 + ~42min, mid-way through loading page assets, with no further
   output — yet the job didn't report "failure" until 07:29:54, nearly 90
   minutes later.** Both `gh api .../logs` and `gh run view --log` show the
   identical truncation point, so this isn't a fetch artifact on this end.
   Two live hypotheses, not yet distinguished: (a) GitHub's log capture
   genuinely stopped streaming for a long-running job (a known GitHub
   Actions behavior under high log volume) while the tests kept running
   fine underneath, or (b) something actually hung for ~90 minutes and was
   eventually killed by a timeout that isn't obviously visible in the
   workflow config (`timeout-minutes: 125` = 7500s comfortably exceeds the
   observed 6598s runtime, so that's not it as configured). **Needs a
   fresh, isolated firefox-only CI run to resolve** — that would settle
   whether this is a logging quirk or a genuine hang worth its own
   investigation.

**Concrete additions to the Verification section above, based on this:**
- When converting a helper function, enumerate its call patterns
  (parameters/branches) across all current call sites *before* declaring it
  verified, and make sure local testing exercises each one at least once —
  not just "pick a couple of files that happen to call it."
- Treat the first CI run after pushing a conversion as a required discovery
  step, not an optional confirmation — read every failure's actual error
  message and stack trace, the same way local investigation is prescribed
  elsewhere in this plan, before deciding whether it's a regression, a
  newly-exposed pre-existing bug, or CI noise.
- A race against a fixed real-time `setTimeout` in application code (as
  opposed to Vue-reactivity timing) can be ~100%-reproducible locally with
  *zero* throttling, because the bug is about *ordering* (does my action
  race ahead of the app's own delayed logic), not about *speed*. Don't
  assume "passes fast locally, even repeatedly" rules this class out —
  specifically ask "does anything in the app touch this same element/state
  on a delay?" for any wait involving filling a value into a freshly-opened
  dialog.

## Risks / gotchas specific to this codebase

- Some waits follow drag/mouse operations (`tests/playwright/support/dividers.ts`)
  where the "signal" is a splitter's bounding box actually moving — polling
  for a position change (via `expect.poll` or a manual retry loop) rather
  than an element appearing may be the right replacement.
- Some waits follow paste/clipboard simulation
  (`tests/cypress/support/paste-test-support.ts`,
  `tests/playwright/support/editor.ts`) where the visible signal is the
  frame/editor DOM updating with the pasted content — assert on that DOM
  state rather than waiting a fixed time.
- Keypress-repeat helpers (`pressN` in `tests/playwright/support/editor.ts`)
  wait between individual key presses, seemingly to let a debounce/re-render
  settle — check whether the editor exposes any "idle"/"rendered" signal
  before falling back to a short wait there.
- Retries are already enabled (Cypress: `retries: 1`; Playwright: `retries: 3`
  on CI) which can mask flaky waits in CI — don't rely on CI green as proof
  a conversion is solid; use repeated local runs.
- CPU/network throttling via CDP (see RECIPES.md) only works for Chromium —
  this project also runs Firefox and WebKit projects in Playwright
  (`playwright.config.ts`). For those two, fall back to plain repeated runs,
  since there's no equivalent throttling knob; treat a Chromium pass under
  throttling as reasonably good (not perfect) evidence for the other two.
- GitHub Actions runs Playwright across `ubuntu-latest` and `macos-latest`
  with 3-way sharding (`run-playwright-tests.yml`); Cypress CI config is in
  `run-cypress-tests.yml` — check it for the same shared-runner contention
  reasoning if Cypress-specific flakiness patterns look different from
  Playwright's.
- **The 3 Playwright shards align with the 3 browser projects, not with
  file groupings — confirmed directly from CI logs (2026-07-10), not just
  inferred.** `playwright.config.ts` declares exactly 3 projects
  (chromium, firefox, webkit, in that order) all running the same
  `testDir`/`testMatch`, and the CI workflow runs `npx playwright test
  --shard=N/3` with no `--project` filter. Playwright builds one combined
  (project, file) list in project-declaration order before slicing it into
  N contiguous shards; with 3 equal-sized projects and 3 shards, the shard
  boundaries land exactly on project boundaries — shard 1 = all of
  chromium, shard 2 = all of firefox, shard 3 = all of webkit. Verified by
  pulling job logs via `gh api repos/k-pet-group/Strype/actions/jobs/<id>/logs`
  and grepping for `[chromium]`/`[firefox]`/`[webkit]` markers across two
  separate runs, both OSes: every shard-1 job logged only `[chromium]`
  lines, every shard-2 only `[firefox]`, every shard-3 only `[webkit]` —
  zero exceptions. (Corrected from an earlier, wrong assumption in
  PROGRESS.md that shards split by spec-file weight — see PROGRESS.md's
  CI findings section for what this changes about the flakiness picture.)

## Known suspected app bugs and unresolved test-helper bugs (deliberately deferred)

- **Project name sometimes doesn't update even though the file otherwise
  loaded correctly.** Recurring CI signature (seen across at least 3
  browser/OS combinations over two separate CI runs, 2026-07-10):
  `graphics.spec.ts` → "Test get_clicked_actor returns the right item"
  fails/flakes inside `loading-saving.ts`'s `load()`, stuck waiting up to
  30s for `.project-name` to read `"data-graph"` -- it stays on `"My
  project"` the whole time, even though (per the one retry that got
  further) the file's *content* clearly did load (the console showed
  actor-creation output from the loaded program). This suggests the
  project name label specifically is failing to update in some cases,
  independent of whether the load itself succeeded -- a real app-level
  bug, not (or not only) a test-timing issue. Confirmed recurring, not
  a one-off flake: same exact signature on macOS+Firefox (final failure,
  twice) and Linux+WebKit (flaky).
  - **Deliberately not fixing this now**: Neil wants this kept out of the
    PR for the wait-conversion/timeout work, to keep that PR focused.
    Revisit as a separate, dedicated investigation (likely needs to look
    at what actually updates `.project-name` in the app and whether
    there's a race between that update and the rest of the load
    completing, rather than just widening the 30s bound in the test).

- **`waitForGraphicsSettled` (`tests/playwright/support/execution.ts`)
  doesn't work for tests with an ongoing animation/game loop.** Found in
  CI run [29149105784](https://github.com/neilccbrown/Strype/actions/runs/29149105784)
  (commit `95d96483`, macOS+Chromium): `graphics.spec.ts` → "Check
  graphics example responds to keyboard" failed *deterministically* --
  identical 86.64% pixel diff on all 4 attempts (not random flakiness).
  Root cause: the function's completion signal is "3 consecutive checks
  with an *unchanged* redraw count" (see its definition and the
  2026-07-10 log entry below for how that signal was chosen). That works
  for single-draw tests (draw once, stop) but is fundamentally wrong for
  tests whose Python code is a `while True: ... pace(N)` loop (this test,
  plus "responds to mouse", the "in large view" variants, "monitors
  mouse", `get_clicked_actor`) -- the redraw count *never* stops changing
  while the loop keeps running, so the function always falls through to
  its full 15s timeout and gives up without ever confirming the content
  is actually ready. On a fast/lightly-loaded machine (e.g. local dev)
  15s is usually enough margin regardless, masking the bug; on a slower
  CI runner it isn't. This affects every test in the file using a
  `while True` loop, not just the one that happened to fail outright here
  -- the other loop-driven tests in this run's flaky list (turtle square,
  turtle keyboard input, graphics example shows -- though note some of
  those are actually single-draw, so may be unrelated CI noise) need
  re-checking against this specific mechanism, not assumed to be the same
  bug.
  - **Fixed 2026-07-11**: added a second, fallback completion condition
    to `waitForGraphicsSettled` alongside the existing stability check --
    once at least 5 redraws have landed *and* at least 500ms of
    wall-clock time has passed since the first one, that's accepted as
    settled even if the count is still changing. This engages only after
    real redraws are actually happening (not from the outset) and single-
    draw callers still hit the faster stability path first in practice,
    so it shouldn't regress the tests this mechanism already worked for.
    Validated: full `graphics.spec.ts` (32/32); the specific failing test
    plus its five "shared with turtle" siblings under CDP 4x CPU
    throttle (6/6); the failing test alone, throttled,
    `--repeat-each=3` (3/3). See PROGRESS.md for the full writeup.

- **The Cypress port of `waitForEditorSettled` (`tests/cypress/support/test-support.ts`)
  is still not reliable for large pastes, despite the 2026-07-10 fix.**
  Found in the same CI push, Cypress run
  [29149105785](https://github.com/neilccbrown/Strype/actions/runs/29149105785):
  `paste-python.cy.ts` → "Allows pasting fixture file with main code"
  failed again with the *same class* of error as before the fix, just
  different numbers: `editor state should stabilise: stuck at 8
  consecutive stable reads of ":-1:92" after 10000ms` (previously it was
  "18" against a threshold of 30; the threshold is now 15, and this run
  got stuck at 8 -- confirming the 2026-07-10 fix *is* live, and still
  insufficient). The error format confirms the fixed code (the
  self-driven `setTimeout(check, 30)` poll loop) is what's running, so
  this isn't a stale-fix problem -- the loop's assumption that it can
  reliably poll every ~30ms doesn't hold under real load: this fixture
  pastes a 92-frame file (`frameCount:92` in the state string), and
  heavy DOM re-rendering on Cypress's single-threaded, same-process
  browser automation can block the poll callback itself for far longer
  than 30ms per iteration, eating the entire 10s budget before 15
  consecutive *fast* reads can land. Playwright's port doesn't have this
  problem because it drives the poll from Node, out of the browser's
  main thread.
  - **Fixed 2026-07-11**: switched the stability check from counting
    discrete poll iterations ("N consecutive stable reads") to tracking
    actual wall-clock time the state has been unchanged (via `Date.now()`
    deltas). This directly targets the root cause -- how long the state
    has been stable is now answered correctly regardless of whether that
    took 3 slow polls or 15 fast ones, since poll cadence is unreliable
    under load but elapsed time isn't. Validated:
    `paste-python.cy.ts` run twice (59/59 each, including the previously-
    failing case), plus a broader spot-check across
    `structured-expressions.cy.ts` (62/62), `autocomplete.cy.ts` (27/27),
    `param-prompts.cy.ts` (64/64) for regressions in other callers of
    this shared helper. See PROGRESS.md for the full writeup.

## Handover notes (read this if resuming on a new machine)

- Start by reading `PROGRESS.md` for current status, then re-run the `rg`
  command above to check the file list/counts still match (specs may have
  changed since the snapshot).
- `RECIPES.md` has concrete before/after examples already validated against
  this codebase's actual test helpers — check there before inventing a new
  pattern.
