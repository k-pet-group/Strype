// ErrorDetails from Pyodide
export interface PyodideErrorDetails {
    error_type: string,
    error_message: string,
    text: string,
    traceback: {filename: string, lineno: number}[]
}

// Result of running the Testing section's code via pytest.
export interface TestRunResult {
    nodeId: string,
    outcome: "passed" | "failed" | "error",
    message: string,
    // Best-effort crash location (see pytest_runtest_logreport in python-execution.ts), used to
    // highlight the offending frame in the editor the same way a normal Run's error does. Any of
    // these can be null/undefined if pytest didn't report a reprcrash for this result (e.g. a
    // plain pytest.fail() reason) or the crash wasn't in either generated file we can map back to
    // frames (e.g. inside a library pytest itself loaded).
    crashMessage?: string | null,
    lineno?: number | null,
    crashFile?: "main" | "tests" | null,
}

export interface TestRunResults {
    // Set when pytest itself could not be run at all (e.g. a syntax error in the test/main code
    // that stopped collection) -- in that case `results` will be empty.
    collectionError: string | null,
    results: TestRunResult[],
}

export async function serviceWorkerReadyAndInControl() : Promise<void> {
    await navigator.serviceWorker.ready;

    // If already controlled, all is fine:
    if (navigator.serviceWorker.controller) {
        return;
    }
    // Wait until the service worker takes control:
    await new Promise((resolve) => {
        navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true });
    });
}

// Unlike serviceWorkerReadyAndInControl() above (which only checks that *some* controller is
// present), this actually round-trips through the sync-message channel to confirm the service
// worker is currently intercepting requests for it. A controller can be present yet not truly
// answering (e.g. Safari silently losing a backgrounded tab's service worker), in which case a
// Pyodide run that depends on the channel (input(), cloud file I/O, output catch-up) would only
// discover the problem ~5s in, via a ServiceWorkerError from deep inside the worker. Kept to a
// short timeout so a genuinely dead channel is detected fast rather than stalling the Run click.
// Also callable from inside a dedicated Worker (see reportControllerStatus() in
// python-execution.ts) -- `document` and `navigator.serviceWorker` aren't necessarily defined
// there (Chromium doesn't expose navigator.serviceWorker to Workers at all: crbug.com/40364838),
// so both are guarded rather than assumed:
export async function isServiceWorkerChannelResponsive(channelBaseUrl: string, timeoutMs = 800, onFailureDetail?: (detail: string) => void) : Promise<boolean> {
    // Logged (temporarily, while we're chasing down a report of the Run button getting stuck on
    // "Stop" with nothing happening, even though the page stayed foregrounded/visible throughout)
    // so a repro can confirm whether this pre-flight check is the thing catching (or failing to
    // catch) a dead channel -- and whether document.visibilityState really was "visible" the whole
    // time, ruling backgrounding out directly rather than just by the user's recollection:
    const hasDocument = typeof document !== "undefined";
    const hasController = ("serviceWorker" in navigator) && navigator.serviceWorker.controller != null;
    const logPrefix = `[SW channel check ${new Date().toISOString()}] visibilityState=${hasDocument ? document.visibilityState : "n/a"} hasFocus=${hasDocument ? document.hasFocus() : "n/a"} controller=${hasController}`;
    try {
        // /version is answered by the sync-message package's own service-worker fetch listener
        // (not anything Strype implements) -- it responds to any request whose URL ends in
        // /version with a 200, purely as a liveness signal, regardless of method.
        // Must be POST here, not the fetch() default of GET, though: if the service worker
        // *isn't* intercepting, a GET to an unmatched path is commonly rewritten to a 200 (e.g.
        // an SPA's own index.html fallback, in dev and in many production static hosts) -- so a
        // GET here could report "healthy" when the channel is actually dead. POST to the same
        // unmatched path correctly falls through to a real 404 instead:
        const response = await fetch(channelBaseUrl + "/version", {method: "POST", signal: AbortSignal.timeout(timeoutMs)});
        console.info(`${logPrefix} -> responsive=${response.ok} (status ${response.status})`);
        if (!response.ok) {
            // A fast 404 means the request reached the real server, i.e. we are not controlled:
            onFailureDetail?.(`status ${response.status}`);
        }
        return response.ok;
    }
    catch (err) {
        console.info(`${logPrefix} -> responsive=false (${err})`);
        onFailureDetail?.(`${err}`);
        return false;
    }
}

// Logged (temporarily, see isServiceWorkerChannelResponsive() above) so we can see if the
// controller is changing (e.g. being reclaimed after a termination) while the page is still
// visible, which would confirm this isn't a backgrounding-related issue. This file is loadable
// from inside a dedicated Worker (see isServiceWorkerChannelResponsive()'s own comment on that),
// and unlike Chromium, WebKit does expose navigator.serviceWorker to Workers -- so `document`
// must be guarded here the same way isServiceWorkerChannelResponsive() already guards it above,
// or this throws a ReferenceError inside the worker the moment a controllerchange event fires
// there (confirmed via a real CI failure on macOS/WebKit: tests/playwright/e2e/sound-wait-after-run.spec.ts,
// https://github.com/k-pet-group/Strype/actions/runs/31181917214):
if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("controllerchange", () => {
        const hasDocument = typeof document !== "undefined";
        console.info(`[SW controllerchange ${new Date().toISOString()}] visibilityState=${hasDocument ? document.visibilityState : "n/a"} hasFocus=${hasDocument ? document.hasFocus() : "n/a"}`);
    });
}

