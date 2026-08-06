// ErrorDetails from Pyodide
export interface PyodideErrorDetails {
    error_type: string,
    error_message: string,
    text: string,
    traceback: {filename: string, lineno: number}[]
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
// short timeout so a genuinely dead channel is detected fast rather than stalling the Run click:
export async function isServiceWorkerChannelResponsive(channelBaseUrl: string, timeoutMs = 800) : Promise<boolean> {
    try {
        const response = await fetch(channelBaseUrl + "/version", {signal: AbortSignal.timeout(timeoutMs)});
        return response.ok;
    }
    catch {
        return false;
    }
}

