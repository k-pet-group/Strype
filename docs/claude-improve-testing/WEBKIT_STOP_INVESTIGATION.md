# Investigation: WebKit is still slow to stop, even after the interrupt fix

**Status: open, needs a real macOS + Safari/WebKit environment to progress.**
This document is self-contained — read this first, you shouldn't need the
rest of this session's history to start.

## Why this needs a Mac

Windows cannot run Playwright's WebKit browser at all in this repo's dev
environment (separate, pre-existing, already-`skip()`-ed issue — see
`testInfo.skip(true, "Skipping on Windows + WebKit due to unknown problems")`
in `console-execution.spec.ts`/`graphics.spec.ts`). Every previous round of
this investigation had to work indirectly, via reading GitHub Actions CI logs
from a macOS+WebKit job rather than running WebKit locally. This document
exists so the *next* session — running directly on a Mac, with real Safari
and Playwright's real WebKit available — can pick this up and actually
reproduce/instrument it locally instead of round-tripping through CI.

## Background: what's already fixed, and what isn't

A prior session found and fixed a real bug: `terminateAndRestartPyodide()`
(`src/stryperuntime/main_thread_python_handler.ts`) used to call the raw DOM
`Worker.terminate()` directly. On WebKit specifically, `terminate()` doesn't
reliably abort a worker that's blocked in a synchronous XHR (comsync's
mechanism for cross-thread synchronous communication, since this app doesn't
use SharedArrayBuffer/cross-origin isolation) — the worker could keep running
until that blocking call returned naturally, and the code's own attempt to
help that along answered the blocked call with a normal "keep going" reply
instead of an interrupt, so the worker just kept running indefinitely instead
of stopping. The fix: use `pythonClient.interrupt()` (from the `comsync`
library) instead, which answers a blocked wait with `{interrupted: true}`,
causing comsync's worker-side `readMessage()` wrapper to throw a genuine
`InterruptError` inside the worker at the exact blocking point, regardless of
what it was blocked on. See git log on this branch (commit "Fix WebKit Stop
not actually stopping the Pyodide worker") and `PLAN.md`'s "Known suspected
app bugs" section for the full writeup of that fix, including a regression it
introduced and fixed (an error icon incorrectly shown after a deliberate
Stop) and an HMR-staleness debugging pitfall hit along the way (Vite doesn't
always hot-reload this module's top-level mutable state cleanly — restart the
dev server fully if a fix doesn't seem to take effect).

**That fix was verified against real CI (run 29255482751) and confirmed as a
real, but partial, improvement:**

| | Before the fix | After the fix |
|---|---|---|
| macOS+WebKit job total time | 2h04m (killed by the 125min workflow ceiling) | 1h48m (completes normally) |
| Tests actually run | 518/544 (killed mid-run) | 544/544 |
| "N errors were not a part of any test" | 3 (worker-teardown timeouts) | 0 |
| `console-execution.spec.ts`'s "don't queue up after stopping" tests | Failed all 3 retries, or hung for the full budget | Recover within 1-2 retries |
| Those same tests' first-attempt duration | Same as below | **Still 9-12 minutes** (vs 30-90s on Chromium, same run) |

So the catastrophic "worker never actually dies" failure mode is fixed. But
there's a **second, smaller, not-yet-understood WebKit-specific slowness**:
even now that the interrupt correctly reaches and stops the worker, it
appears to take 9-12 minutes to do so on the *first* attempt of each of these
tests (they then pass quickly on retry). That gap is this investigation's
target.

## The actual test file/mechanism under investigation

`tests/playwright/e2e/console-execution.spec.ts` → describe block "Check
console prints don't queue up after stopping" (currently around line
280-380, but line numbers shift — search for that describe block name). Each
test:
1. Runs a tight Python loop that prints continuously (or moves a graphics
   actor continuously) with no `pace()`/throttle.
2. Clicks Stop (`#runButton`) after N seconds.
3. Asserts the console (or actor position) *stops changing* within a few
   seconds of the click — i.e. it's specifically testing Stop's
   responsiveness, not just that Stop eventually works.

The mechanism it exercises: `PythonExecutionArea.vue`'s `runClicked()` (the
"Running" case) calls `terminateAndRestartPyodide()`
(`src/stryperuntime/main_thread_python_handler.ts`), which now:
```ts
if (pythonClient?.state === "awaitingMessage" || pythonClient?.state === "sleeping") {
    await Promise.race([
        pythonClient.interrupt(),
        new Promise((resolve) => setTimeout(resolve, 500)),
    ]);
}
pythonWorker?.terminate();
// ...then makes a brand new worker+client for the next run
```
`pythonClient.interrupt()` is from `node_modules/comsync` — read its
compiled source (`node_modules/comsync/dist/index.js`, it's short) if you
need the exact mechanics again; the prior session decoded it in detail (see
`PLAN.md`).

## What to actually do

1. **Reproduce locally first**, before touching any code. Start a local dev
   server (`npm run serve:python:testing`, or see the single-test-run
   convention in `CLAUDE.md`) and run just this describe block on WebKit:
   ```
   SPEC=tests/playwright/e2e/console-execution.spec.ts GREP="queue up after stopping" npx playwright test --project=webkit
   ```
   Confirm the first attempt of at least one test genuinely takes minutes
   locally on your Mac, not just on CI's (possibly more contended) runners.
   If it's fast locally and only slow on CI, that changes the theory
   considerably (points at CI runner resource contention rather than a
   genuine WebKit engine quirk) — check that possibility first, it's cheap
   to rule in/out and changes everything else about how to proceed.

2. **Instrument to find out where the time actually goes.** The CI logs only
   show the test's *total* duration, not a breakdown. Add temporary timing
   logs (`console.log` with `performance.now()` or `Date.now()` deltas — the
   existing test harness forwards page console output to the terminal, see
   `setupStrypeTest` in `tests/playwright/support/general.ts`) at each of
   these points and compare:
   - The moment `runClicked()`'s Stop case starts.
   - The moment `terminateAndRestartPyodide()` checks `pythonClient?.state`
     (log the actual state value here).
   - The moment `pythonClient.interrupt()` resolves (or hits the 500ms race
     timeout).
   - The moment `pythonWorker?.terminate()` returns.
   - The moment `makeNewPyodideWorker()`/`makePyodideClient()` finish and
     the new worker reports ready (`isPythonWorkerReady`).
   - On the worker side (`src/workers/python-execution.ts`): the moment the
     interrupted read is detected/thrown, if you can instrument that far
     (may need to temporarily patch `comsync`'s compiled JS in
     `node_modules`, or add a try/catch around the relevant call in
     `python-execution.ts` that logs before rethrowing).
   Remember the HMR-staleness pitfall from the previous session: if a
   change to `main_thread_python_handler.ts` doesn't seem to have any
   effect, fully restart the dev server (not just save the file) before
   concluding the change didn't work.

3. **Distinguish two very different failure shapes**, since the fix so far
   only addressed one of them:
   - **(a) The interrupt itself is slow to be noticed/relayed** — i.e. the
     time from `pythonClient.interrupt()` being called to the worker's
     blocked read actually seeing `{interrupted: true}` is itself minutes
     long. If so, this is likely inherent to how WebKit's synchronous-XHR +
     Service-Worker combination works (see `sync-message`'s implementation,
     `node_modules/sync-message/dist/index.js`) — possibly a WebKit-specific
     latency/backoff quirk in how it relays the message. Check
     `sync-message`'s own repo/issue tracker for known WebKit-specific
     slowness; it's a small, focused library and this may be a documented
     limitation.
   - **(b) The interrupt lands quickly, but something else afterwards is
     slow** — e.g. queued-up async messages (buffered `console_print`/sprite
     updates sent *before* the interrupt) still being drained/displayed one
     at a time, each requiring its own slow round trip, or the new worker's
     startup (`makeNewPyodideWorker`/Pyodide reinitialization) being what's
     actually slow, with the test's assertion just incidentally blocked
     behind it. If it's this, the existing "Firefox is incredibly slow to
     reinitialise Pyodide on CI" comment in
     `tests/playwright/support/execution.ts` may have a WebKit analogue
     worth documenting the same way, and the *test's* signal for "stopped"
     may need adjusting rather than the app's stop mechanism itself.
   These have very different fixes, so don't assume which one it is —
   the instrumentation in step 2 should make it obvious.

4. **If it's an app-level fix**: follow this repo's normal rigor — trace the
   root cause via live instrumentation before changing code (don't guess),
   check `lint`/`vue-tsc --noEmit`, verify locally against real WebKit
   (repeat the specific failing tests several times, not just once), and
   update `PLAN.md`/`PROGRESS.md` in `docs/claude-improve-testing/` with the
   finding either way (even "confirmed inherent WebKit limitation, no fix
   possible, here's why" is a valuable, worth-recording outcome — don't feel
   obliged to force a code change if the honest conclusion is that there
   isn't a safe one).

5. **If it turns out to be inherent/unfixable WebKit slowness**: the
   pragmatic fallback is likely to bump `console-execution.spec.ts`'s
   per-test timeout specifically for webkit (similar to the existing
   `extraTimeout` pattern already used for Firefox reinit slowness in
   `tests/playwright/support/execution.ts`), rather than continuing to
   chase a fix that may not exist. Check with Neil before committing to
   that as the final answer, though — it's a fallback, not the first
   thing to reach for.

## Useful context already gathered (don't re-derive this)

- CI runs already analyzed for this: `29232413370` (before the fix, showed
  the original 2-hour/killed-job problem) and `29255482751` (after the fix,
  showed the improvement-but-not-full-fix result in the table above). Use
  `gh api repos/neilccbrown/Strype/actions/jobs/<id>/logs` to re-pull these
  if useful for comparison — `gh` is at `C:\Program Files\GitHub CLI` on the
  Windows machine this was written on; on the Mac it should just be on
  `PATH` normally via `brew install gh`.
- `docs/claude-improve-testing/PLAN.md`'s "Known suspected app bugs and
  unresolved test-helper bugs" section has the full writeup of the fix
  already landed, including the comsync/sync-message architecture notes —
  read that before re-investigating the parts already understood.
- The de-flaking initiative this all sits inside is tracked in
  `docs/claude-improve-testing/PLAN.md`/`PROGRESS.md`/`RECIPES.md` — this
  file is a focused side-quest off that main effort, not a replacement for
  it.
