// The code in this file runs on the main thread, and handles starting,
// stopping and restarting the Pyodide worker.
//
// It also managers the graphics Renderer as that is tied up
// with the communication with Pyodide.
//
// On capable devices we also keep a second, pre-warmed "spare" Pyodide worker around.
// Restarting Pyodide after a run (see terminateAndRestartPyodide()) always throws away
// the worker that just ran code, for a clean state -- but re-initialising Pyodide from
// scratch is slow enough to cause a visible delay before the next run can start. If a
// spare is ready, we swap to it immediately and warm up a new spare in the background,
// so that delay is hidden behind however long the user spends editing before running
// again. See shouldKeepSpareWorker() below for the device criteria that gate this.

import {Renderer} from "@/stryperuntime/renderer";
import {PyodideClient} from "pyodide-worker-runner";
import * as Comlink from "comlink";
import {makeServiceWorkerChannel} from "sync-message";
import {ref} from "vue";
import {applyLiveChange, listEntriesForWorker, mergeSnapshot} from "@/helpers/localFsCache";

// Can be re-used. Exported so PythonExecutionArea can health-check it before a run (see
// isServiceWorkerChannelResponsive in shared_helpers.ts) -- Safari in particular is known to
// silently drop a page's service worker controller (e.g. after backgrounding the tab), which
// otherwise only surfaces ~5s into a run as a ServiceWorkerError from deep inside Pyodide:
export const serviceWorkerChannel = makeServiceWorkerChannel({scope: import.meta.env.BASE_URL});

export const renderer = new Renderer();
export const isPythonWorkerReady = ref(false);

// A slot bundles a Pyodide worker with its client and the message port it uses to send
// Sprite/graphics updates to the Renderer. Creating a slot does not affect the Renderer or
// isPythonWorkerReady -- that only happens once a slot is made the *active* one (see
// activateSlot below), which is what lets us prepare a spare slot in the background without
// disturbing whichever slot is currently running code. A slot is null instead of existing
// with null fields when Pyodide is skipped entirely (the "TestingNoPyodide" testing flag).
interface PyodideSlot {
    worker: Worker;
    client: PyodideClient<any>;
    updatePort: MessagePort;
    ready: boolean;
    // Whether this worker currently has a service worker controller of its own -- see
    // reportControllerStatus() in python-execution.ts. We've confirmed (via logging) a real case
    // where a freshly created worker -- specifically the spare pre-warmed at page load, promoted
    // for the *second* Run of a session -- ends up with no controller at all, despite the page
    // itself being controlled: every one of its sync-message requests then silently falls through
    // to a real 404 instead of being intercepted, which looks to the user like Run doing nothing.
    // Defaults to false (pessimistic) until the worker actively confirms otherwise:
    controlled: boolean;
}

// Only surfaces readiness once the slot has BOTH finished loading Pyodide AND confirmed it has a
// service worker controller -- see the PyodideSlot.controlled comment above. Without the latter
// half of this check, a worker could become clickable-via-Run while still uncontrolled:
function updateReadyFlag(slot: PyodideSlot) : void {
    if (slot === activeSlot) {
        isPythonWorkerReady.value = slot.ready && slot.controlled;
    }
}

// Asks the service worker to (re-)claim all clients under its scope, including any worker that
// isn't currently controlled (see PyodideSlot.controlled above). Harmless/idempotent to call for
// an already-controlled worker. Re-uses the same "claim" message the service worker already
// handles for the Firefox re-claim workaround (see service-worker.ts):
async function triggerServiceWorkerReclaim() : Promise<void> {
    if (!("serviceWorker" in navigator)) {
        return;
    }
    const registration = await navigator.serviceWorker.getRegistration();
    registration?.active?.postMessage("claim");
}

// How many times in a row we'll automatically replace an *active* slot whose worker failed to even
// load (see the "error" listener in createPyodideSlot() below) before giving up and leaving Run
// disabled rather than retrying forever. Reset to 0 whenever any slot successfully finishes loading.
// A handful of retries is enough to ride out a genuinely transient blip (a dropped request, a brief
// server hiccup); it will *not* help the confirmed real-world cause we chased this down from: the
// page's own already-loaded bundle references this worker's script by a content hash baked in at
// build time, and if a deploy has replaced the site's assets since this page loaded, that exact file
// is gone for good (GitHub Pages caps every asset -- hashed or not -- at a 10-minute Cache-Control,
// so any tab left open longer than that can easily outlive a deploy). No amount of local retrying
// fixes that; only reloading the page does, which is a separate piece of work:
const maxActiveSlotLoadRetries = 3;
// For logging only (see createPyodideSlot()): a running count of slots created, and how long after
// creation a still-unusable slot gets a warning:
let slotCounter = 0;
const slotWatchdogMs = 30000;
let activeSlotLoadRetriesUsed = 0;

function createPyodideSlot() : PyodideSlot | null {
    if (sessionStorage.getItem("TestingNoPyodide")) {
        console.info("Skipping Pyodide as in testing mode");
        return null;
    }

    // The channel used to send Sprite updates asynchronously, outside of the main requests:
    // (channels cannot be re-used/re-transferred so we need a new one for each Pyodide worker).
    // We deliberately don't wire this into the Renderer here -- only activateSlot() does that,
    // once this slot actually becomes the one running code:
    const updateChannel = new MessageChannel();
    // We initialise this out here to make it load earlier:
    const worker = new Worker(new URL("@/workers/python-execution.ts", import.meta.url), {type: "module"});
    // Must post it the update channel before wrapping in Pyodide:
    worker.postMessage({updatePort: updateChannel.port1}, [updateChannel.port1]);

    const client = new PyodideClient(() => worker, serviceWorkerChannel);
    const slot: PyodideSlot = {worker, client, updatePort: updateChannel.port2, ready: false, controlled: false};
    // Diagnostics for the Run button occasionally staying on "Initialising..." (seen in CI): log how
    // long each slot takes to become ready, and warn if one is still not usable after a while, with
    // which half (loaded vs controlled) is missing. Worker-side progress is relayed via "debugLog":
    const slotId = `#${++slotCounter}`;
    const slotCreatedAt = Date.now();
    console.info(`[Pyodide slot ${slotId} ${new Date().toISOString()}] created (${activeSlot == null ? "will be the active slot" : "spare"})`);
    setTimeout(() => {
        if ((slot === activeSlot || slot === spareSlot) && !(slot.ready && slot.controlled)) {
            console.warn(`[Pyodide slot ${slotId} ${new Date().toISOString()}] still not usable ${slotWatchdogMs / 1000}s after creation: ready=${slot.ready} controlled=${slot.controlled} isActive=${slot === activeSlot} activeSlotLoadRetriesUsed=${activeSlotLoadRetriesUsed}`);
        }
    }, slotWatchdogMs);

    // The worker reports its own navigator.serviceWorker.controller status (see
    // reportControllerStatus() in python-execution.ts), both once immediately on startup and
    // again on any controllerchange -- this is how we find out if/when the reclaim below actually
    // fixed things:
    worker.addEventListener("message", (e: MessageEvent) => {
        if (typeof e.data?.controllerStatus === "boolean") {
            const wasControlled = slot.controlled;
            slot.controlled = e.data.controllerStatus;
            if (slot.controlled !== wasControlled) {
                console.info(`[Pyodide slot controller ${new Date().toISOString()}] worker now reports controlled=${slot.controlled}`);
            }
            updateReadyFlag(slot);
        }
        else if (typeof e.data?.debugLog === "string") {
            console.info(`[Pyodide worker ${slotId} ${new Date().toISOString()}] ${e.data.debugLog}`);
        }
        else if (e.data?.localFsChange != null && slot === activeSlot) {
            applyLiveChange(e.data.localFsChange.path, e.data.localFsChange.data);
        }
    });
    // Proactively ask for a reclaim as soon as the worker exists, rather than waiting until it's
    // promoted to active and possibly needed immediately -- this gives it the most possible time
    // to resolve in the background before anyone tries to actually run code on it. It's a no-op
    // if the worker is already controlled:
    void triggerServiceWorkerReclaim();

    // Only fires for a worker that never gets going at all -- its script fails to load, or it
    // throws before ever calling onReady below. A worker that's already up and running has its own
    // error handling elsewhere (see the .catch() around client.call() in PythonExecutionArea.vue);
    // this is specifically for the case confirmed by the "error" listener's own comment above the
    // retry counter: a slot that's dead on arrival, which would otherwise sit with
    // ready=false/controlled=false forever, with nothing retrying it and nothing telling anyone why:
    worker.addEventListener("error", (e: ErrorEvent) => {
        if (slot.ready) {
            // Already up and running by the time this fired -- not the load-failure case this
            // handles, so leave it alone rather than tearing down a working worker:
            return;
        }
        console.error(`[Pyodide worker load failed ${new Date().toISOString()}] ${e.message || "unknown error"}`);
        slot.worker.terminate();
        if (slot === spareSlot) {
            // Just a background optimisation -- drop it and let the next maybeCreateSpareSlot()
            // call (made after every run stops, see terminateAndRestartPyodide() below) try again:
            spareSlot = null;
        }
        else if (slot === activeSlot) {
            // This one is actually blocking Run, so it's worth retrying -- bounded, with a short
            // backoff, so a persistently stale page doesn't hammer the server forever:
            if (activeSlotLoadRetriesUsed < maxActiveSlotLoadRetries) {
                activeSlotLoadRetriesUsed++;
                const attempt = activeSlotLoadRetriesUsed;
                console.info(`[Pyodide active slot retry ${new Date().toISOString()}] attempt ${attempt}/${maxActiveSlotLoadRetries}`);
                setTimeout(() => activateSlot(createPyodideSlot()), 500 * attempt);
            }
            else {
                console.error(`[Pyodide active slot retry ${new Date().toISOString()}] giving up after ${maxActiveSlotLoadRetries} failed attempts -- Run will stay disabled until the page is reloaded`);
                activateSlot(null);
            }
        }
    });

    client.call(
        client.workerProxy.onReady,
        Comlink.proxy(() => {
            slot.ready = true;
            console.info(`[Pyodide slot ${slotId} ${new Date().toISOString()}] Pyodide ready after ${Date.now() - slotCreatedAt}ms (controlled=${slot.controlled}, isActive=${slot === activeSlot})`);
            // A successful load is good evidence whatever was wrong (if anything) has cleared up:
            activeSlotLoadRetriesUsed = 0;
            // Only surface readiness if this slot is still the active one by the time it
            // finishes loading (it may instead be sitting in the background as the spare):
            updateReadyFlag(slot);
        })
    );
    return slot;
}

function activateSlot(slot: PyodideSlot | null) : void {
    activeSlot = slot;
    if (slot != null) {
        renderer.setMessageChannel(slot.updatePort);
        if (!slot.controlled) {
            // Belt-and-braces alongside the reclaim already triggered in createPyodideSlot(): if
            // this slot still isn't confirmed controlled by the time it's actually promoted to
            // active, ask again rather than assuming the earlier attempt will still land in time:
            void triggerServiceWorkerReclaim();
        }
    }
    isPythonWorkerReady.value = (slot != null) && slot.ready && slot.controlled;
}

// Whether this device looks capable of comfortably running two Pyodide workers at once (the
// active one plus a pre-warmed spare). We always require a decent core count. navigator.deviceMemory
// is only implemented in Chromium-based browsers -- it's undefined on Firefox and Safari/iPadOS
// (which covers a lot of the tablets used in schools) regardless of how much RAM the device
// actually has, so when it's unavailable we fall back to judging capability on core count alone
// rather than always saying no, which would silently disable the spare on every non-Chromium
// browser. When deviceMemory *is* available, we still require it to indicate plenty of RAM.
function shouldKeepSpareWorker() : boolean {
    const cores = navigator.hardwareConcurrency;
    const memoryGiB = (navigator as Navigator & {deviceMemory?: number}).deviceMemory;
    return typeof cores === "number" && cores >= 3 && (memoryGiB === undefined || memoryGiB >= 8);
}

function maybeCreateSpareSlot() : void {
    if (spareSlot == null && shouldKeepSpareWorker()) {
        spareSlot = createPyodideSlot();
    }
}

// These get replaced (activeSlot) or filled in/consumed (spareSlot) as we restart Pyodide:
let activeSlot : PyodideSlot | null = null;
let spareSlot : PyodideSlot | null = null;
activateSlot(createPyodideSlot());
maybeCreateSpareSlot();

// Pyodide does have built-in support for "interrupting" an execution,
// but to do that from another thread it requires SharedArrayBuffer, which needs
// cross-origin isolation which would break things like Google Drive.  So we must
// terminate the worker.  It does mean the stop is instant and "clean" (next
// execution won't carry over any state).
export async function terminateAndRestartPyodide() : Promise<void> {
    // The worker can be blocked waiting synchronously for a message from the main thread -- e.g.
    // our own internal "dummy" catch-up request (see python-execution.ts) used to stop async
    // requests/sprite updates queueing up in a tight loop, or a genuine input()/image query.
    // Without SharedArrayBuffer, that wait is implemented (in the sync-message library) as a
    // *synchronous* XMLHttpRequest inside the worker.  Some browsers -- WebKit/Safari in
    // particular -- do not reliably abort an in-progress synchronous XHR just because
    // worker.terminate() was called: the worker can keep running (and e.g. keep printing or
    // moving sprites) until that blocking call naturally returns.
    //
    // Critically, if we make that blocking call return by answering it with a normal, successful
    // reply (as we used to for the dummy case), the worker doesn't die -- it just resumes running
    // from where it was blocked, races on to its *next* blocking wait, and so on indefinitely,
    // since nothing is telling it to actually stop. comsync's own interrupt() avoids this: it
    // answers a currently-blocked wait with an {interrupted: true} marker, which comsync's worker-side
    // wrapper turns into a genuine InterruptError thrown *inside* the worker at that exact blocking
    // point, regardless of what kind of request it was waiting on -- so the worker actually stops
    // instead of continuing. We cap how long we wait for that (it should be near-instant) so a
    // slow/stuck write can never stop us from terminating below:
    // Mark the worker as not-ready immediately: activeSlot is about to be terminated and
    // swapped out below, and until activateSlot() runs again at the end of this function,
    // any Run click that slips through (isPythonWorkerReady was previously left stale/true
    // during this whole window) could pick up a client that's mid-termination or briefly
    // null, get no response, and leave the UI stuck showing "Stop" with nothing running:
    isPythonWorkerReady.value = false;
    const client = activeSlot?.client;
    if (client?.state === "awaitingMessage" || client?.state === "sleeping") {
        try {
            await Promise.race([
                client.interrupt(),
                new Promise((resolve) => setTimeout(resolve, 500)),
            ]);
        }
        catch (e) {
            // Best-effort only; we terminate the worker regardless just below:
            console.error("Error interrupting Pyodide worker before terminating it: ", e);
        }
    }
    // Snapshot "/local" from the outgoing worker before killing it, so its contents survive into
    // the next run -- see localFsCache.ts for why this main-thread cache is what actually persists
    // "/local" across runs, given the worker itself is fully discarded just below. Bounded the same
    // way as the interrupt above: this worker could in principle still be stuck/unresponsive even
    // after that, and we'd rather lose this one snapshot than hang the whole restart:
    if (client != null) {
        try {
            const snapshot = await Promise.race([
                client.workerProxy.snapshotLocalFs() as Promise<Record<string, Uint8Array> | null>,
                new Promise<null>((resolve) => setTimeout(() => resolve(null), 1000)),
            ]);
            if (snapshot != null) {
                mergeSnapshot(snapshot);
            }
        }
        catch (e) {
            console.error("Error snapshotting /local before restarting Pyodide: ", e);
        }
    }

    // This is apparently instant on most browsers, so we can immediately assume Pyodide has
    // stopped; the interrupt above is what makes that assumption hold on WebKit too:
    activeSlot?.worker.terminate();

    // If we already have a pre-warmed spare (ready or not -- even a still-loading spare is
    // further along than a brand new worker would be), swap straight to it so the next run
    // doesn't have to wait for a full Pyodide initialisation. Otherwise fall back to creating
    // a fresh slot synchronously, exactly as before:
    let nextSlot : PyodideSlot | null;
    if (spareSlot != null) {
        nextSlot = spareSlot;
        spareSlot = null;
        // Logged (temporarily -- see isServiceWorkerChannelResponsive() in shared_helpers.ts) to
        // correlate against the worker-side "[Worker first sync read]" log in python-execution.ts:
        // we're chasing a repeatable failure where the *second* Run after a restart has its
        // service-worker sync channel silently stop being intercepted (real 404s instead of the
        // expected 408 long-poll response), and want to know precisely how long this promoted
        // worker had existed before it made its first blocking request:
        console.info(`[Pyodide slot swap ${new Date().toISOString()}] promoted pre-warmed spare worker`);
    }
    else {
        console.info(`[Pyodide slot swap ${new Date().toISOString()}] no spare available -- creating a fresh worker synchronously`);
        nextSlot = createPyodideSlot();
    }
    // Push this cache's contents into the new worker's fresh "/local" -- restoreLocalFs() internally
    // awaits that worker's own Pyodide load via withPyodide(), so this doesn't need to wait for
    // onReady itself. Deliberately done here (at promotion time), not inside createPyodideSlot()'s
    // onReady: a spare slot is created well before it's promoted, so restoring at its own creation
    // time would miss any snapshot merged in after that (e.g. from the very run this function is
    // handling right now):
    if (nextSlot != null) {
        void nextSlot.client.workerProxy.restoreLocalFs(listEntriesForWorker());
    }
    activateSlot(nextSlot);
    // Line up the next spare in the background (a no-op if the device isn't deemed capable of one):
    maybeCreateSpareSlot();
}

// Note that the value of this function will change after you call terminateAndRestartPyodide()
export function getPythonClient() : PyodideClient | null {
    return activeSlot?.client ?? null;
}
