import { Disposable, Page, TestInfo, expect } from "@playwright/test";
import { addFakeClipboard } from "./clipboard";

// This stops Pyodide loading on the page.  Must be called before page.goto.
// Useful for tests which don't actually execute the code at all.
export function skipPyodideLoading(page: Page) : Promise<Disposable> {
    return page.addInitScript(() => {
        sessionStorage.setItem("TestingNoPyodide", "true");
    });
}

// The number of frames present in a brand new/default Strype project (currently the imports
// section and the definitions section). Centralised here so that when a future change adds more
// starting frames, call sites that need "the default project has loaded" only need updating once --
// and so that readiness checks use >= rather than an exact count that would then be wrong.
export const DEFAULT_STARTING_FRAME_COUNT = 2;

export interface StrypeTestSetupOptions {
    // Passed to testInfo.setTimeout(). Omit to keep Playwright's default (30s).
    timeoutMs?: number;
    // Adds the sessionStorage flag that stops Pyodide loading, for tests that don't execute code.
    skipPyodide?: boolean;
    // Installs the fake clipboard (avoids real browser clipboard permission prompts).
    fakeClipboard?: boolean;
    // waitUntil strategy for the initial page.goto(). Defaults to "load".
    gotoWaitUntil?: "load" | "domcontentloaded";
    // Minimum number of ".frame-div" elements to wait for as the "app is ready" signal.
    // Defaults to DEFAULT_STARTING_FRAME_COUNT.
    minFrameCount?: number;
    // Timeout for the above wait. Playwright's expect() default (5s) is fine for a fast local
    // dev server, but this waits for the whole app to bootstrap and mount, which can be much
    // slower on a loaded CI runner -- 20s matches the existing convention elsewhere in this
    // codebase for "wait for the app to finish mounting" (see loading-saving.ts/load-save-share.spec.ts).
    readyTimeoutMs?: number;
    // Whether to skip on Windows+WebKit (most suites can't load the app there at all).
    // Defaults to true; set false for suites that already handle this themselves differently.
    skipWindowsWebkit?: boolean;
    // Override the skip reason shown for the Windows+WebKit skip above.
    skipWindowsWebkitReason?: string;
}

// Shared beforeEach logic for the Playwright e2e suites: skip on Windows+WebKit (most suites can't
// load the app there), apply the requested timeout, forward browser console output to the test
// log, optionally skip Pyodide loading / install the fake clipboard, navigate to the app, and wait
// for the default project's frames to actually render (rather than just waiting for <body> to
// exist, which doesn't guarantee the app has mounted any content yet). Extra per-suite skip
// conditions (e.g. a specific browser/OS combination known to be flaky for that suite alone) should
// be applied by the caller before calling this, since they're suite-specific, not shared.
export async function setupStrypeTest(page: Page, browserName: string, testInfo: TestInfo, options: StrypeTestSetupOptions = {}) : Promise<void> {
    const {
        timeoutMs,
        skipPyodide = false,
        fakeClipboard = false,
        gotoWaitUntil = "load",
        minFrameCount = DEFAULT_STARTING_FRAME_COUNT,
        readyTimeoutMs = 30000,
        skipWindowsWebkit = true,
        skipWindowsWebkitReason = "Skipping on Windows + WebKit due to unknown problems",
    } = options;

    if (skipWindowsWebkit && browserName === "webkit" && process.platform === "win32") {
        testInfo.skip(true, skipWindowsWebkitReason);
    }

    if (timeoutMs !== undefined) {
        testInfo.setTimeout(timeoutMs);
    }

    // Make browser's console.log output visible in our logs (useful for debugging). Registered
    // before any navigation so we don't miss early messages (e.g. Vite/package-loading logs):
    page.on("console", (msg) => {
        console.log("Browser log:", msg.text());
    });

    if (skipPyodide) {
        await skipPyodideLoading(page);
    }
    if (fakeClipboard) {
        await addFakeClipboard(page);
    }

    await page.goto("./", {waitUntil: gotoWaitUntil});
    // Wait for the default project's content to actually render, not just for <body> to exist --
    // the latter is satisfied long before the app has mounted anything:
    await expect.poll(() => page.locator(".frame-div").count(), {timeout: readyTimeoutMs}).toBeGreaterThanOrEqual(minFrameCount);
    await page.evaluate(() => {
        (window as any).Playwright = true;
    });
}
