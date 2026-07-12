import { Page, expect, Locator } from "@playwright/test";

export async function startRunning(page: Page, extraTimeout?: boolean) : Promise<Locator> {
    // It should not be running:
    const button = page.locator("#runButton");
    // It can take a while for Pyodide to load up:
    await expect(button).toHaveText("Run", {timeout: (extraTimeout ? 120000: 60000)});
    // Click it:
    await page.click("#runButton");
    return button;
}

export async function runButtonShowsRun(button: Locator, extraTimeout?: boolean) : Promise<void> {
    // Firefox is incredibly slow to reinitialise on CI, so we have a huge timeout:
    await expect(button).toHaveText("Run", {timeout: (extraTimeout ? 120000 : 60000)});
}


export async function runToFinish(page: Page, extraTimeout?: boolean) : Promise<void> {
    const button = await startRunning(page);
    // Then it should not be running again, because it has finished:
    await runButtonShowsRun(button, extraTimeout);
}

export async function checkConsoleContent(page: Page, expectedContent : string | RegExp, timeoutMs = 3000) : Promise<void> {
    const consoleLoc = page.locator("#peaConsole");
    await expect(consoleLoc).toHaveCount(1);
    await expect(consoleLoc).toHaveValue(expectedContent, {timeout: timeoutMs});
}

// There's no dedicated test hook for "the graphics canvas just redrew" (turtle/strype.graphics
// drawing happens inside a running Python program with no JS-side signal of its own -- see
// PythonExecutionArea.vue's requestAnimationFrame + isDirty() loop). But redrawCanvas() does one
// incidental, unconditional DOM write on every actual redraw: it sets #pythonGraphicsCanvas's
// data-scale attribute (to the same value, if the scale hasn't changed) -- and a MutationObserver
// fires an "attributes" record on every setAttribute call regardless of whether the value
// changed. Confirmed empirically: drawing a 4-sided turtle square produced exactly 8 matching
// mutation records (2 per side) that then stopped, and a single mouse click that adds one Actor
// produced exactly 1 more. Call this once (after the graphics tab/canvas exists, before
// triggering any drawing) and then waitForGraphicsSettled() after each action that should cause
// a redraw, instead of guessing how long the animation/response will take.
export async function setupGraphicsRedrawObserver(page: Page) : Promise<void> {
    await page.evaluate(() => {
        (window as any).__strypeGraphicsRedrawCount = 0;
        const canvas = document.querySelector("#pythonGraphicsCanvas");
        if (!canvas) {
            return;
        }
        const obs = new MutationObserver((records) => {
            (window as any).__strypeGraphicsRedrawCount += records.length;
        });
        obs.observe(canvas, {attributes: true, attributeFilter: ["data-scale"]});
    });
}

// Waits for the graphics canvas to stop redrawing (see setupGraphicsRedrawObserver above),
// rather than guessing how long an animation or a response to a click/keypress will take.
// Requires the redraw count to stay unchanged for a short quiet window before concluding the
// drawing has settled, since a drawing sequence (e.g. a turtle animating across the screen) can
// span several redraws over time.
//
// That "stability" signal is right for a program that draws once and then stops (a turtle
// animation, a single matplotlib render), but is structurally wrong for a program whose Python
// code is an ongoing `while True: ... pace(N)` loop: such a loop keeps redrawing forever, so the
// count never truly stabilises and "3 consecutive unchanged reads" would never trigger --
// confirmed via a real, deterministic CI failure (not just flakiness) where this silently fell
// through to the full timeout every time for a loop-driven test. For that case there's a second,
// fallback condition: once several redraws have landed AND a bit of real time has passed since
// the first one, that's good evidence the most recent action (e.g. a keypress) has had multiple
// loop iterations' worth of opportunity to render, even though "stable" will never fire on its
// own. The fallback only engages once real redraws are actually happening (not from the outset),
// and single-draw callers almost always hit the faster "stable" path first regardless.
export async function waitForGraphicsSettled(page: Page, timeoutMs = 15000) : Promise<void> {
    const start = Date.now();
    let last = await page.evaluate(() => (window as any).__strypeGraphicsRedrawCount ?? 0);
    let stableCount = 0;
    let firstRedrawAt : number | null = last > 0 ? Date.now() : null;
    let redrawsSinceFirst = 0;
    while (Date.now() - start < timeoutMs) {
        await page.waitForTimeout(100);
        const cur = await page.evaluate(() => (window as any).__strypeGraphicsRedrawCount ?? 0);
        if (cur > last) {
            if (firstRedrawAt === null) {
                firstRedrawAt = Date.now();
            }
            redrawsSinceFirst += cur - last;
        }
        if (cur === last) {
            stableCount++;
            // A redraw count that's stable at zero doesn't mean drawing has settled -- it just
            // as likely means drawing hasn't started yet (e.g. the action we're waiting on hasn't
            // reached the canvas yet). Only trust stability once at least one redraw has actually
            // been observed, so we don't return before anything has been drawn:
            if (stableCount >= 3 && cur > 0) {
                return;
            }
        }
        else {
            stableCount = 0;
        }
        last = cur;
        // Fallback for a continuously-redrawing scene (see comment above): several redraws over
        // a real-time window, regardless of whether the count has ever gone quiet:
        if (firstRedrawAt !== null && redrawsSinceFirst >= 5 && Date.now() - firstRedrawAt >= 500) {
            return;
        }
    }
}
