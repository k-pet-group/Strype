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

## Handover notes (read this if resuming on a new machine)

- Start by reading `PROGRESS.md` for current status, then re-run the `rg`
  command above to check the file list/counts still match (specs may have
  changed since the snapshot).
- `RECIPES.md` has concrete before/after examples already validated against
  this codebase's actual test helpers — check there before inventing a new
  pattern.
