# Conversion recipes

Generic Cypress/Playwright "don't use waitForTimeout" advice is easy to find
online; this file is the codebase-specific part — concrete before/after
examples anchored to real helpers in this repo, plus the reasoning for each.
None of these have been run/verified yet (this file was written during
planning, before the conversion work started) — treat each as a starting
hypothesis to confirm with repeated local runs (see PLAN.md → Verification),
not a proven fix.

## Provoking CI-like slowness locally

See PLAN.md → "Why this mostly shows up on CI, not locally" for the
reasoning: a dev machine is usually fast enough that both the *broken*
version (fixed wait) and a *wrongly-converted* version (condition checked,
but happens to already be true) pass every time, giving no signal either
way. These are untested-as-yet techniques for artificially recreating a
CI-like margin locally, roughly in order of how targeted they are.

**1. CPU throttling via Chrome DevTools Protocol (Chromium only).** Both
tools can drive raw CDP, which is what a "slow shared CI runner" actually
manifests as — the browser's own script/layout/paint work taking longer,
not just the network being slow.

```ts
// Playwright — get a CDP session for the page and throttle CPU by e.g. 4x
const client = await page.context().newCDPSession(page);
await client.send("Emulation.setCPUThrottlingRate", { rate: 4 });
// ... run the test steps you're validating ...
await client.send("Emulation.setCPUThrottlingRate", { rate: 1 }); // reset
```

```ts
// Cypress — CDP access via Cypress.automation's "remote:debugger:protocol"
// (this needs a `before`/`beforeEach` in the spec, or wiring into
// `setupNodeEvents` in cypress.config.ts if it should apply broadly)
cy.wrap(
    Cypress.automation("remote:debugger:protocol", {
        command: "Emulation.setCPUThrottlingRate",
        params: { rate: 4 },
    })
);
```

Confirm this actually works in this repo's Cypress/Playwright setup before
relying on it — this is a known CDP capability, but hasn't been tried
against this project's own config yet, and Cypress's automation bridge in
particular can be version/browser-sensitive.

**2. Network throttling via CDP (Chromium only)**, for waits that are really
about a network response landing, not CPU-bound rendering:

```ts
await client.send("Network.emulateNetworkConditions", {
    offline: false,
    downloadThroughput: (500 * 1024) / 8, // ~500kbps
    uploadThroughput: (500 * 1024) / 8,
    latency: 400, // ms
});
```

**3. Firefox/WebKit fallback (no CDP available).** There's no equivalent
throttling knob through Playwright's Firefox/WebKit drivers. Options, in
rough order of effort:
- Just rely on many repeated runs (`--repeat-each=20`+) — lower confidence
  than throttled Chromium runs, but still catches some races.
- Run the browser inside a deliberately resource-constrained environment,
  e.g. a container with `docker run --cpus=1 ...`, or a low-spec VM — crude
  but browser-agnostic, and arguably closer to "shared CI runner" than any
  in-browser throttling knob.
- Create CPU contention on the host alongside the test run (e.g. a
  throwaway busy-loop process) — crude, but zero setup.

**4. `slowMo` (Playwright launch option).** `use: { launchOptions: { slowMo:
250 } }` adds a delay between each Playwright-driven action (click, type,
etc.). Worth knowing about, but it slows down *test-driven* actions, not
the app's own internal rendering/reactivity — so it's a weaker proxy for
"CI is slow" than CPU throttling, since the actual race is almost always in
the app's own async work, not in how fast Playwright issues commands.

**Practical loop:** pick the CPU-throttle rate empirically — start around
4x, increase if the reproduction case (wait set to 0) still passes too
reliably, decrease if even trivial actions start timing out. The goal is a
throttling level that reliably reproduces the CI-observed failure locally,
not a specific "correct" number.

## General substitutions

| Instead of | Use |
|---|---|
| `cy.wait(1000)` before asserting on DOM | `cy.get(selector).should(...)` — Cypress retries `.should()` automatically until it passes or times out. |
| `page.waitForTimeout(1000)` before asserting | `await expect(locator).toBeVisible()` / `.toHaveText(...)` / etc. — Playwright's `expect` retries automatically. |
| `cy.wait(1000)` before `cy.readFile(...)` | Usually nothing — `cy.readFile` already polls until the file exists (up to its timeout). Delete the wait and confirm the assertion still passes. |
| Wait after a click that opens a menu/popup | Assert the popup's container/first item is visible instead of waiting. |
| Wait after typing, before reading value | Assert on the resulting value/state (e.g. `.should("have.value", ...)`) instead of waiting. |
| Wait for a network call | Cypress: `cy.intercept(...).as("x")` + `cy.wait("@x")` (already correct — not in scope). Playwright: `await page.waitForResponse(...)`. |
| Wait for something with literally no DOM signal (e.g. a debounce timer with no visible effect) | Keep a short wait, but comment *why*, and record it in PROGRESS.md as "kept deliberately". |

## Case: waiting for Vue's reactivity to settle instead of a DOM change

Some waits aren't really waiting for something to become *visible* — they're
waiting for Vue to finish processing the reactive updates triggered by the
last action (a store mutation, a prop change cascading through child
components, etc.) before the test's next step relies on that having
happened. For these, waiting on `nextTick()` is more direct and more honest
than inventing a DOM signal purely so the test has something to assert on.

Neither Cypress nor Playwright can `await` a promise that lives inside the
page directly from test code — the app has to expose the hook. This
codebase already has a precedent for exposing test-only globals on
`window` (see `src/helpers/sharedIdCssWithTests.ts` and its use in
`src/main.ts`, which exposes `WINDOW_STRYPE_HTMLIDS_PROPNAME` /
`WINDOW_STRYPE_SCSSVARS_PROPNAME`). The same pattern extends naturally to
exposing Vue's `nextTick`:

```ts
// src/helpers/sharedIdCssWithTests.ts (candidate addition)
export const WINDOW_STRYPE_NEXTTICK_PROPNAME = "StrypeNextTickGlobal";
```

```ts
// src/main.ts (candidate addition, alongside the existing window assignments)
import { nextTick } from "vue";
(window as any)[WINDOW_STRYPE_NEXTTICK_PROPNAME] = nextTick;
```

Then from the tests:

```ts
// Playwright
await page.evaluate((prop) => (window as any)[prop](), WINDOW_STRYPE_NEXTTICK_PROPNAME);
// or twice, if the first tick's update schedules a further update:
await page.evaluate(async (prop) => {
    await (window as any)[prop]();
    await (window as any)[prop]();
}, WINDOW_STRYPE_NEXTTICK_PROPNAME);
```

```ts
// Cypress — cy.window().then() can return a promise and Cypress will await it
cy.window().then((win) => (win as any)[WINDOW_STRYPE_NEXTTICK_PROPNAME]());
```

**When one `nextTick()` isn't enough:** Vue's `nextTick()` resolves once the
current render/update job queue has been flushed. If that flush itself
schedules another update (e.g. a watcher that sets more reactive state in
response to the first change, which is common in a frame-based editor
re-numbering/re-rendering sibling frames), the effects of *that* update
won't be visible until a second `nextTick()` resolves. If a single await
proves flaky in practice, try chaining a second (or occasionally third)
`nextTick()` before falling back to a DOM assertion — but prefer asserting
on the actual end state (e.g. the frame count/content you expect) over
guessing a specific number of ticks, since the tick count is an
implementation detail that can silently change if the component's update
logic changes.

**When to prefer this over a DOM assertion:** when the action's real
completion signal genuinely is "Vue finished updating" rather than any one
particular element changing — e.g. multiple sibling elements update
together and no single one of them is the "right" thing to assert on. When
there *is* an obvious element to assert on instead (a popup appearing, a
value changing), prefer that — it also verifies the correct end state, not
just that some update happened.

## Case: paste-and-download round trip (Cypress)

`tests/cypress/support/paste-test-support.ts` waits a fixed time after
pasting, before triggering/checking a download:

```ts
// current
(cy.get("body") as any).paste(code);
...
cy.wait(1000); // "make sure our pasting has completed before saving"
checkDownloadedCodeEquals(...);
```

The comment says exactly what it's waiting for: the editor to finish
rendering the pasted frames. That's an observable DOM state — assert on it
instead, e.g. wait for the expected number/kind of frame elements to appear,
or for a specific frame's text content to match, before proceeding:

```ts
// candidate
(cy.get("body") as any).paste(code);
...
cy.get(".frame-div").should(($frames) => {
    // whatever condition indicates "the paste has been fully processed" —
    // e.g. expected frame count, or last frame's text no longer empty
});
checkDownloadedCodeEquals(...);
```

The exact condition needs picking by looking at what `.paste()` actually
produces in the DOM — this is a "read the app, find the signal" case per
PLAN.md step 2.

Similarly, the waits around save/load dialogs in the same file
(`cy.wait(1000)` after clicking "save", `cy.wait(2000)` after clicking
"discard changes" / after selecting a file to import) are standing in for
"the dialog has closed" / "the file has finished loading" — replace with
`cy.get(dialogSelector).should("not.exist")` or an assertion on the loaded
project's content, respectively.

## Case: divider drag (Playwright)

`tests/playwright/support/dividers.ts`:

```ts
// current
await page.mouse.move(currentX, currentY);
await page.mouse.down();
await page.waitForTimeout(2 * 1000);
await page.mouse.move(x, y, {steps: 1});
await page.waitForTimeout(2 * 1000);
await page.mouse.up();
await page.waitForTimeout(2 * 1000);
```

There's no obvious element to wait on here — the signal is the splitter's
own position. A poll-based approach (Playwright's `expect.poll`) replaces
"wait 2s and hope the drag registered" with "wait until the position
actually changed, however long that takes, up to a timeout":

```ts
// candidate
await page.mouse.move(currentX, currentY);
await page.mouse.down();
await expect.poll(async () => (await getSplitterPos(page, locator)).x)
    .not.toBe(currentX); // wait until the drag has actually started moving it
await page.mouse.move(x, y, {steps: 1});
await expect.poll(async () => (await getSplitterPos(page, locator)).x)
    .toBe(/* expected x, if deterministic */);
await page.mouse.up();
```

This needs checking against how the splitter component actually behaves
(does it move continuously during the drag, or snap at drag-end?) — worth
tracing the component's drag handler before finalizing.

## Case: keypress-repeat helper (Playwright)

`tests/playwright/support/editor.ts` `pressN()`:

```ts
await page.keyboard.press(key);
if (enforceWaitBetween) {
    await page.waitForTimeout(100);
}
```

and `doTextHomeEndKeyPress` / `enterCode` use similar fixed waits after
key presses or paste simulation, apparently to let the editor's frame
re-render before the next action. Check whether the editor exposes any
"idle" signal (e.g. a class on the frame container while a re-render is in
flight) — if so, wait on that; if genuinely nothing observable exists,
these may be legitimate cases to keep a short wait (see PLAN.md's "keep with
a comment" fallback), but confirm first by trying to shrink the constant and
see if a smaller value already works reliably, which suggests the "real"
wait is much shorter than currently coded.

## Recipe for the bulk of spec-file waits

Many of the largest counts (`rename-identifiers.spec.ts` 139,
`match-statement.spec.ts` 105, `graphics.spec.ts` 41, `structured-expressions*.spec.ts`)
are likely repeated instances of a handful of patterns local to those
files (e.g. "wait after selecting a frame", "wait after typing an
identifier"). For these:

1. Pick one occurrence, work out the real signal, write the replacement.
2. Search the same file for near-identical waits and check whether the same
   replacement (or a small variant of it) applies.
3. Do the whole file in one pass rather than one wait at a time — much
   faster than treating each of the 139 occurrences as a fresh puzzle.
